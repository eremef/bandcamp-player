import AsyncStorage from '@react-native-async-storage/async-storage';
import { Playlist } from '@shared/types';
import { mobileDatabase } from './MobileDatabase';
import { webSocketService } from './WebSocketService';

/**
 * Two-way sync of the user's own playlists between this device and the desktop.
 *
 * The desktop stays authoritative and its ids are the shared identity; the phone's SQLite
 * is a mirror keyed on those ids. Edits made while the desktop is unreachable (standalone,
 * or remote with the socket down) are appended to the `playlist_ops` outbox and replayed
 * FIFO on the next connect, then the mirror is re-pulled.
 *
 * Conflict resolution is last-op-wins: no tombstones, no timestamps, no vector clocks.
 * A phone-side delete that flushes after a desktop-side edit destroys that edit. This is
 * a single-user, single-account feature and that trade is deliberate.
 *
 * An outbox row *is* the wire message — `{type, payload}` is sent verbatim — so adding a
 * syncable operation means enqueuing the same message the connected path already sends.
 */

const BOOTSTRAP_KEY = 'playlist_sync_bootstrapped';
const RPC_TIMEOUT_MS = 5000;
/** The outbox is re-checked after each cycle; cap the loop so constant editing can't spin. */
const MAX_CYCLES = 3;

type Summary = { id: string; updatedAt: string; trackCount: number };

class PlaylistSyncService {
    private syncing = false;
    /** Playlists whose ops were flushed but that the desktop did not end up having. */
    private lastDroppedCount = 0;

    /** Number of offline changes dropped by the most recent sync (see `sync`). */
    getDroppedCount(): number {
        return this.lastDroppedCount;
    }

    /**
     * Flush the outbox, then pull the desktop's playlists into the mirror.
     *
     * Single-flight: a concurrent call is dropped rather than queued. Callers that need
     * fresh data should read the mirror after awaiting — an inbound `playlists-data`
     * broadcast is only a pull *hint*, and dropping it while a cycle runs is correct
     * because that cycle ends with a pull anyway.
     */
    async sync(): Promise<void> {
        if (this.syncing || !webSocketService.isConnected()) return;

        this.syncing = true;
        this.lastDroppedCount = 0;
        try {
            // Captured *before* bootstrapping: the cycle that seeds the outbox must never
            // delete, because its own creates have not been confirmed by a pull yet.
            const allowDeletes = await this.hasBootstrapped();
            await this.bootstrapIfNeeded();

            for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
                const flushed = await this.flush();

                // A flush that ran out of socket leaves the rest of the outbox queued; the
                // pull would only serve a snapshot we cannot reconcile against.
                if (!webSocketService.isConnected()) break;

                const snapshot = await this.pull(allowDeletes);
                if (snapshot) this.countDropped(flushed, snapshot);

                // An op appended while the flush was in flight was deliberately not deleted;
                // run another cycle so it is not left sitting behind an already-applied pull.
                if ((await mobileDatabase.countPlaylistOps()) === 0) break;
            }
        } catch (e) {
            console.error('[PlaylistSync] Sync failed:', e);
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Send every queued op in id order and delete the ops up to the id captured at start.
     *
     * There are no acks, so an op that the desktop rejects (its playlist was deleted there)
     * is dropped rather than retried; `countDropped` reports how many. Ops appended during
     * the flush have a higher id and survive the delete.
     */
    private async flush(): Promise<Array<{ type: string; payload: any }>> {
        const ops = await mobileDatabase.getPlaylistOps();
        if (ops.length === 0) return [];

        // Delete only what actually went out: if the socket drops mid-flush the remaining
        // ops must stay queued for the next connect.
        const sent: Array<{ type: string; payload: any }> = [];
        let lastSentId: number | null = null;
        for (const op of ops) {
            if (!webSocketService.isConnected()) break;
            webSocketService.send(op.type, op.payload);
            sent.push({ type: op.type, payload: op.payload });
            lastSentId = op.id;
        }
        if (lastSentId !== null) await mobileDatabase.deletePlaylistOpsUpTo(lastSentId);

        return sent;
    }

    /**
     * Pull the desktop's playlists into the mirror, hydrating only what changed.
     *
     * The cheap `playlists-data` snapshot carries the change key for free: a playlist is
     * re-fetched only when `(updatedAt, trackCount)` differs from the mirror. `trackCount`
     * guards against two edits landing in the same ISO millisecond.
     */
    private async pull(allowDeletes: boolean): Promise<Playlist[] | null> {
        const snapshot = await this.request<Playlist[]>('get-playlists', undefined, 'playlists-data');
        if (!Array.isArray(snapshot)) return null;

        const local = new Map<string, Summary>(
            (await mobileDatabase.getPlaylistSummaries()).map(s => [s.id, s])
        );

        for (const remote of snapshot) {
            const mirrored = local.get(remote.id);
            const unchanged =
                mirrored &&
                mirrored.updatedAt === remote.updatedAt &&
                mirrored.trackCount === (remote.trackCount ?? 0);
            if (unchanged) continue;

            const full = await this.request<Playlist>(
                'get-playlist-for-export',
                remote.id,
                'export-playlist-data',
                (data) => data?.id === remote.id
            );
            if (full) await mobileDatabase.importPlaylist(full, true);
        }

        // Deleting on "absent from the snapshot" is only sound once every local playlist is
        // either known to the desktop or has a pending create op — i.e. after the bootstrap
        // and with an empty outbox. Otherwise a phone-only playlist would be destroyed.
        if (allowDeletes && (await mobileDatabase.countPlaylistOps()) === 0) {
            const remoteIds = new Set(snapshot.map(p => p.id));
            for (const id of local.keys()) {
                if (!remoteIds.has(id)) await mobileDatabase.deletePlaylist(id);
            }
        }

        return snapshot;
    }

    /**
     * Report ops whose target playlist is missing from the desktop after the flush — the
     * offline edit was for a playlist the desktop had already deleted, so it is lost.
     * Deletes are excluded: a delete of something already gone had the intended outcome.
     */
    private countDropped(flushed: Array<{ type: string; payload: any }>, snapshot: Playlist[]): void {
        if (flushed.length === 0) return;
        const remoteIds = new Set(snapshot.map(p => p.id));

        this.lastDroppedCount += flushed.filter(op => {
            if (op.type === 'delete-playlist') return false;
            const playlistId = op.payload?.playlistId ?? op.payload?.id;
            return typeof playlistId === 'string' && !remoteIds.has(playlistId);
        }).length;
    }

    /**
     * Seed the outbox from the existing local DB, once ever, so playlists that were created
     * on the phone before this feature existed are pushed up rather than deleted by the
     * first pull (H4). Never destructive: the worst case is a duplicate of something the
     * user had already recreated by hand on the desktop.
     */
    private async bootstrapIfNeeded(): Promise<void> {
        if (await this.hasBootstrapped()) return;

        const playlists = await mobileDatabase.getAllPlaylists();
        for (const playlist of playlists) {
            await mobileDatabase.enqueuePlaylistOp('create-playlist', {
                id: playlist.id,
                name: playlist.name,
            });
            if (playlist.tracks?.length) {
                await mobileDatabase.enqueuePlaylistOp('add-track-to-playlist', {
                    playlistId: playlist.id,
                    tracks: playlist.tracks.map(t => ({ entryId: t.playlistEntryId, track: t })),
                });
            }
        }

        await AsyncStorage.setItem(BOOTSTRAP_KEY, '1');
        this.bootstrapped = true;
    }

    private bootstrapped: boolean | null = null;

    private async hasBootstrapped(): Promise<boolean> {
        if (this.bootstrapped === null) {
            this.bootstrapped = (await AsyncStorage.getItem(BOOTSTRAP_KEY)) === '1';
        }
        return this.bootstrapped;
    }

    /**
     * One-shot request/reply over a protocol that has no correlation ids: send, then take
     * the first matching reply. Resolves `null` on timeout rather than throwing so one
     * unanswered playlist does not abort the whole cycle.
     */
    private request<T>(
        type: string,
        payload: any,
        replyType: string,
        matches?: (data: any) => boolean
    ): Promise<T | null> {
        return new Promise<T | null>((resolve) => {
            const timeout = setTimeout(() => {
                cleanup();
                resolve(null);
            }, RPC_TIMEOUT_MS);

            const cleanup = webSocketService.on(replyType, (data: any) => {
                if (matches && !matches(data)) return;
                clearTimeout(timeout);
                cleanup();
                resolve(data as T);
            });

            webSocketService.send(type, payload);
        });
    }
}

export const playlistSyncService = new PlaylistSyncService();
