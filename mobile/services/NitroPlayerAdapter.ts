import { PlayerQueue, TrackPlayer } from 'react-native-nitro-player';
import type {
    PlayerConfig as NitroPlayerConfig,
    RepeatMode as NitroRepeatMode,
    TrackItem,
    TrackPlayerState as NitroPlaybackState,
} from 'react-native-nitro-player';

export const PlaybackState = {
    Idle: 'idle',
    Ready: 'ready',
    Buffering: 'buffering',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Ended: 'ended',
    Error: 'error',
    None: 'none',
} as const;

export const Event = {
    PlaybackStateChanged: 'playback-state-changed',
    IsPlayingChanged: 'is-playing-changed',
    MediaItemTransition: 'media-item-transition',
    PlaybackError: 'playback-error',
    PlaybackProgressUpdated: 'playback-progress-updated',
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
    RemoteSeek: 'remote-seek',
    RemoteSkipForward: 'remote-skip-forward',
    RemoteSkipBackward: 'remote-skip-backward',
    TracksNeedUpdate: 'tracks-need-update',
} as const;

export type PlaybackStateValue = typeof PlaybackState[keyof typeof PlaybackState];
export type PlaybackState = PlaybackStateValue;
export type EventValue = typeof Event[keyof typeof Event];

export interface NativeMediaItem {
    mediaId?: string;
    id?: string;
    url: string;
    title?: string;
    artist?: string;
    albumTitle?: string;
    album?: string;
    artworkUrl?: string;
    artwork?: string | null;
    duration?: number;
    extraPayload?: TrackItem['extraPayload'];
}

export interface NormalizedPlaybackEvent {
    type: string;
    [key: string]: unknown;
}

type EventListener = (event: NormalizedPlaybackEvent) => void;
type PlaybackServiceHandler = (event: NormalizedPlaybackEvent) => void | Promise<void>;
type EventSubscription = { remove: () => void };
type RepeatInput = 'off' | 'one' | 'all' | 'track' | 'Playlist';
type ExpectedCallback = {
    kind: 'state' | 'track' | 'seek';
    value: string | number;
    expiresAt: number;
};

const ACTIVE_PLAYLIST_NAME = 'Beta Player Active Queue';
const SUPPRESSION_TTL_MS = 2000;

function toNitroTrack(item: NativeMediaItem): TrackItem {
    const id = item.mediaId || item.id;
    if (!id) throw new Error('Nitro queue items require a stable mediaId.');

    return {
        id,
        title: item.title || 'Untitled',
        artist: item.artist || 'Unknown Artist',
        album: item.albumTitle || item.album || '',
        duration: Number.isFinite(item.duration) ? Math.max(0, item.duration || 0) : 0,
        url: item.url || '',
        artwork: item.artworkUrl || item.artwork || undefined,
        extraPayload: {
            ...(item.extraPayload || {}),
            queueItemId: id,
        },
    };
}

function toNativeMediaItem(track: TrackItem): NativeMediaItem {
    return {
        mediaId: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        artworkUrl: track.artwork || undefined,
        duration: track.duration,
        extraPayload: track.extraPayload,
    };
}

function normalizeRepeatMode(mode: RepeatInput): NitroRepeatMode {
    if (mode === 'one') return 'track';
    if (mode === 'all') return 'Playlist';
    if (mode === 'track' || mode === 'Playlist' || mode === 'off') return mode;
    return 'off';
}

function normalizeState(state: NitroPlaybackState, hasTrack: boolean): PlaybackStateValue {
    if (state === 'playing') return PlaybackState.Playing;
    if (state === 'buffering') return PlaybackState.Buffering;
    if (state === 'paused') return PlaybackState.Paused;
    return hasTrack ? PlaybackState.Stopped : PlaybackState.Idle;
}

class NitroPlayerAdapter {
    private configured = false;
    private configurePromise: Promise<boolean> | null = null;
    private callbacksRegistered = false;
    private activePlaylistId: string | null = null;
    private playlistGeneration = 0;
    private queueItems: NativeMediaItem[] = [];
    private activeIndex = -1;
    private position = 0;
    private duration = 0;
    private isCurrentlyPlaying = false;
    private playbackState: PlaybackStateValue = PlaybackState.Idle;
    private repeatMode: NitroRepeatMode = 'off';
    private volume = 1;
    private playbackServiceHandler: PlaybackServiceHandler | null = null;
    private readonly listeners = new Map<string, Set<EventListener>>();
    private readonly expectedCallbacks: ExpectedCallback[] = [];
    private mutationTail: Promise<void> = Promise.resolve();
    private callbackSuppressionDepth = 0;
    private readonly recentPlaybackErrors = new Map<string, number>();

    public async setupPlayer(_options?: Record<string, unknown>): Promise<boolean> {
        if (this.configured) return true;
        if (this.configurePromise) return this.configurePromise;

        this.configurePromise = this.configurePlayer();
        try {
            return await this.configurePromise;
        } finally {
            this.configurePromise = null;
        }
    }

    private async configurePlayer(): Promise<boolean> {
        const config: NitroPlayerConfig = {
            showInNotification: true,
            remoteSkipForwardInterval: 15,
            remoteSkipBackwardInterval: 15,
            lookaheadCount: 5,
            androidAudioFocus: 'ignore',
            notificationButtons: {
                android: [{ id: 'remote-stop', title: 'Stop', icon: 'stop' }],
            },
        };

        try {
            await TrackPlayer.configure(config);
            this.registerNativeCallbacks();
            this.configured = true;
            await this.refreshSnapshot();
            return true;
        } catch (error) {
            console.error('[NitroPlayerAdapter] Player setup failed:', error);
            return false;
        }
    }

    private registerNativeCallbacks() {
        if (this.callbacksRegistered) return;
        this.callbacksRegistered = true;

        TrackPlayer.onChangeTrack((track, reason) => this.handleTrackChange(track, reason));
        TrackPlayer.onPlaybackStateChange((state, reason) => this.handleStateChange(state, reason));
        TrackPlayer.onSeek((position, totalDuration) => this.handleSeek(position, totalDuration));
        TrackPlayer.onPlaybackProgressChange((position, totalDuration) => {
            this.position = this.nonNegative(position);
            this.duration = this.nonNegative(totalDuration);
            this.emit({
                type: Event.PlaybackProgressUpdated,
                position: this.position,
                duration: this.duration,
                mediaId: this.queueItems[this.activeIndex]?.mediaId,
            });
        });
        TrackPlayer.onTracksNeedUpdate((tracks, lookahead) => {
            this.emit({ type: Event.TracksNeedUpdate, tracks, lookahead });
        });
        TrackPlayer.onNotificationButtonPress((buttonId, track) => {
            if (buttonId !== 'remote-stop') return;
            this.emit({
                type: Event.RemoteStop,
                item: track ? toNativeMediaItem(track) : undefined,
                nativeCommand: true,
                inferred: false,
            });
        });
    }

    public registerPlaybackService(handler: PlaybackServiceHandler) {
        this.playbackServiceHandler = handler;
    }

    public addEventListener(type: EventValue | string, listener: EventListener): EventSubscription {
        const current = this.listeners.get(type) || new Set<EventListener>();
        current.add(listener);
        this.listeners.set(type, current);

        return {
            remove: () => {
                const registered = this.listeners.get(type);
                registered?.delete(listener);
                if (registered?.size === 0) this.listeners.delete(type);
            },
        };
    }

    public async setMediaItems(items: NativeMediaItem[], activeIndex = 0): Promise<void> {
        const ready = await this.setupPlayer();
        if (!ready) throw new Error('Nitro Player could not be configured.');

        await this.enqueueMutation(async () => {
            if (items.length === 0) {
                await this.clearInternal();
                return;
            }

            const safeIndex = Math.min(Math.max(0, activeIndex), items.length - 1);
            const tracks = items.map(toNitroTrack);
            const previousPlaylistId = this.activePlaylistId;
            const playlistName = previousPlaylistId
                ? `${ACTIVE_PLAYLIST_NAME} ${Date.now()}-${++this.playlistGeneration}`
                : ACTIVE_PLAYLIST_NAME;
            const playlistId = await PlayerQueue.createPlaylist(playlistName, 'Ephemeral Beta Player playback queue');
            const wasPlaying = this.isCurrentlyPlaying;

            try {
                await this.withCallbackSuppression(async () => {
                    this.markExpectedCallback('state', 'paused');
                    await TrackPlayer.pause();
                    await PlayerQueue.addTracksToPlaylist(playlistId, tracks);
                    this.repeatMode = normalizeRepeatMode(this.repeatMode);
                    await TrackPlayer.setRepeatMode(this.repeatMode);
                    this.markExpectedCallback('track', tracks[safeIndex].id);
                    await PlayerQueue.loadPlaylist(playlistId, safeIndex);
                });
            } catch (error) {
                try {
                    await PlayerQueue.deletePlaylist(playlistId);
                } catch {
                    // Keep the original playlist mutation error.
                }
                if (wasPlaying) {
                    try {
                        this.markExpectedCallback('state', 'playing');
                        await TrackPlayer.play();
                    } catch {
                        // Preserve the mutation error; callers can recover playback state.
                    }
                }
                throw error;
            }

            this.activePlaylistId = playlistId;
            this.queueItems = tracks.map(toNativeMediaItem);
            this.activeIndex = safeIndex;
            this.position = 0;
            this.duration = tracks[safeIndex].duration;
            this.isCurrentlyPlaying = false;
            this.playbackState = PlaybackState.Ready;
            if (previousPlaylistId && previousPlaylistId !== playlistId) {
                try {
                    await PlayerQueue.deletePlaylist(previousPlaylistId);
                } catch (error) {
                    console.warn('[NitroPlayerAdapter] Could not delete the replaced playlist:', error);
                }
            }
            this.emit({ type: Event.PlaybackStateChanged, state: PlaybackState.Ready });
        });
    }

    public getQueue(): NativeMediaItem[] {
        return this.queueItems.map((item) => ({ ...item }));
    }

    public getActiveMediaItemIndex(): number {
        return this.activeIndex;
    }

    public getProgress(): { position: number; duration: number; buffered: number } {
        return { position: this.position, duration: this.duration, buffered: 0 };
    }

    public getPlaybackState(): PlaybackStateValue {
        return this.playbackState;
    }

    public isPlaying(): boolean {
        return this.isCurrentlyPlaying;
    }

    public async play(): Promise<void> {
        await this.ensureReady();
        this.markExpectedCallback('state', 'playing');
        await TrackPlayer.play();
        this.isCurrentlyPlaying = true;
        this.playbackState = PlaybackState.Playing;
    }

    public async pause(): Promise<void> {
        await this.ensureReady();
        this.markExpectedCallback('state', 'paused');
        await TrackPlayer.pause();
        this.isCurrentlyPlaying = false;
        if (this.queueItems.length > 0) this.playbackState = PlaybackState.Paused;
    }

    public async seekTo(position: number): Promise<void> {
        await this.ensureReady();
        const safePosition = this.nonNegative(position);
        this.markExpectedCallback('seek', safePosition);
        await TrackPlayer.seek(safePosition);
        this.position = safePosition;
    }

    public async setVolume(volume: number): Promise<void> {
        await this.ensureReady();
        const normalized = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
        await TrackPlayer.setVolume(normalized * 100);
        this.volume = normalized;
    }

    public async setRepeatMode(mode: RepeatInput): Promise<void> {
        await this.ensureReady();
        this.repeatMode = normalizeRepeatMode(mode);
        await TrackPlayer.setRepeatMode(this.repeatMode);
    }

    public async stop(): Promise<void> {
        await this.ensureReady();
        await this.enqueueMutation(() => this.stopInternal());
    }

    private async stopInternal(): Promise<void> {
        await this.withCallbackSuppression(async () => {
            this.markExpectedCallback('state', 'paused');
            await TrackPlayer.pause();
            this.markExpectedCallback('seek', 0);
            await TrackPlayer.seek(0);
        });
        this.position = 0;
        this.isCurrentlyPlaying = false;
        this.playbackState = this.queueItems.length > 0 ? PlaybackState.Stopped : PlaybackState.Idle;
        this.emit({ type: Event.PlaybackStateChanged, state: this.playbackState });
    }

    public async clear(): Promise<void> {
        await this.ensureReady();
        await this.enqueueMutation(() => this.clearInternal());
    }

    private async clearInternal(): Promise<void> {
        await this.withCallbackSuppression(async () => {
            this.markExpectedCallback('state', 'paused');
            await TrackPlayer.pause();
            if (this.activePlaylistId) {
                const existing = PlayerQueue.getPlaylist(this.activePlaylistId)?.tracks || this.queueItems.map((item) => toNitroTrack(item));
                if (existing.length > 0) {
                    await PlayerQueue.removeTracksFromPlaylist(this.activePlaylistId, existing.map((track) => track.id));
                }
            }
        });
        this.queueItems = [];
        this.activeIndex = -1;
        this.position = 0;
        this.duration = 0;
        this.isCurrentlyPlaying = false;
        this.playbackState = PlaybackState.Idle;
        this.emit({ type: Event.PlaybackStateChanged, state: PlaybackState.Idle });
    }

    public async destroy(): Promise<void> {
        await this.ensureReady();
        await this.enqueueMutation(async () => {
            await this.stopInternal();
            await this.clearInternal();
            if (this.activePlaylistId) {
                await PlayerQueue.deletePlaylist(this.activePlaylistId);
                this.activePlaylistId = null;
            }
        });
    }

    public async replaceMediaItem(index: number, item: NativeMediaItem): Promise<void> {
        await this.ensureReady();
        await this.enqueueMutation(async () => {
            const existing = this.queueItems[index];
            if (!existing) return;
            const normalized = toNitroTrack({ ...existing, ...item, mediaId: existing.mediaId });
            const nextQueue = [...this.queueItems];
            nextQueue[index] = toNativeMediaItem(normalized);
            await TrackPlayer.updateTracks([normalized]);
            this.queueItems = nextQueue;
            if (index === this.activeIndex) this.duration = normalized.duration;
        });
    }

    public async updateMetadata(index: number, item: NativeMediaItem): Promise<void> {
        await this.replaceMediaItem(index, item);
    }

    private handleTrackChange(track: TrackItem, reason?: string) {
        const previousIndex = this.activeIndex;
        let nextIndex = this.queueItems.findIndex((item) => item.mediaId === track.id);
        if (nextIndex < 0) {
            void this.refreshNativeIndex(track.id);
            nextIndex = previousIndex;
        } else {
            this.activeIndex = nextIndex;
        }

        const suppressed = this.consumeExpectedCallback('track', track.id);
        if (suppressed && reason !== 'error') {
            this.position = 0;
            this.duration = this.nonNegative(track.duration);
            if (reason === 'skip' || reason === 'end') this.markExpectedCallback('seek', 0);
            return;
        }
        const remoteCommand = track.extraPayload?.remoteCommand;
        const wrapsToStart = this.repeatMode === 'Playlist' && previousIndex === this.queueItems.length - 1 && nextIndex === 0;
        const wrapsToEnd = this.repeatMode === 'Playlist' && previousIndex === 0 && nextIndex === this.queueItems.length - 1;
        const indexedDirection = wrapsToStart
            ? 'next'
            : wrapsToEnd
                ? 'previous'
                : nextIndex > previousIndex
                    ? 'next'
                    : nextIndex < previousIndex
                        ? 'previous'
                        : undefined;
        const direction = remoteCommand === 'next' || remoteCommand === 'previous'
            ? remoteCommand
            : indexedDirection;
        const isCommandTransition = remoteCommand === 'next' || remoteCommand === 'previous'
            ? reason === 'skip' || reason === 'end'
            : reason === 'skip';
        const nativeCommand = isCommandTransition && direction !== undefined &&
            !suppressed && !this.isSuppressingNativeCommands();
        const mediaItem = toNativeMediaItem(track);
        this.position = 0;
        this.duration = this.nonNegative(track.duration);
        if (reason === 'skip' || reason === 'end') this.markExpectedCallback('seek', 0);
        this.emit({
            type: Event.MediaItemTransition,
            index: nextIndex,
            queueIndex: track.extraPayload?.queueIndex,
            previousIndex,
            item: mediaItem,
            reason,
            nativeCommand,
            inferred: nativeCommand,
            direction: nativeCommand ? direction : undefined,
        });

        if (reason === 'error') this.emitPlaybackError(nextIndex, mediaItem);
    }

    private handleStateChange(state: NitroPlaybackState, reason?: string) {
        const previousPlaying = this.isCurrentlyPlaying;
        const nextPlaying = state === 'playing';
        const suppressed = this.consumeExpectedCallback('state', state);
        this.isCurrentlyPlaying = nextPlaying;

        if (reason === 'end' && state === 'stopped') {
            this.playbackState = PlaybackState.Ended;
        } else if (reason === 'error' && state === 'stopped') {
            this.playbackState = PlaybackState.Error;
        } else {
            this.playbackState = normalizeState(state, this.queueItems.length > 0);
        }

        if (previousPlaying !== nextPlaying) {
            this.emit({ type: Event.IsPlayingChanged, playing: nextPlaying });
        }
        this.emit({ type: Event.PlaybackStateChanged, state: this.playbackState, reason });

        if (reason === 'error' && state === 'stopped') {
            this.emitPlaybackError(this.activeIndex, this.queueItems[this.activeIndex]);
        }

        if (!suppressed && !this.isSuppressingNativeCommands() && reason === 'user_action') {
            const inferredEvent = state === 'playing'
                ? Event.RemotePlay
                : state === 'paused'
                    ? Event.RemotePause
                    : state === 'stopped'
                        ? Event.RemoteStop
                        : null;
            if (inferredEvent) {
                this.emit({ type: inferredEvent, nativeCommand: true, inferred: true });
            }
        }

    }

    private handleSeek(position: number, totalDuration: number) {
        const nextPosition = this.nonNegative(position);
        this.position = nextPosition;
        this.duration = this.nonNegative(totalDuration);
        const suppressed = this.consumeExpectedCallback('seek', nextPosition);
        if (!suppressed && !this.isSuppressingNativeCommands()) {
            this.emit({
                type: Event.RemoteSeek,
                position: nextPosition,
                duration: this.duration,
                nativeCommand: true,
                inferred: true,
            });
        }
    }

    private async refreshSnapshot() {
        const [state, nativeQueue, nativeIndex] = await Promise.all([
            TrackPlayer.getState(),
            TrackPlayer.getActualQueue(),
            TrackPlayer.getCurrentTrackIndex(),
        ]);
        if (nativeQueue.length > 0) this.queueItems = nativeQueue.map(toNativeMediaItem);
        this.activeIndex = nativeIndex >= 0 ? nativeIndex : state.currentIndex;
        this.position = this.nonNegative(state.currentPosition);
        this.duration = this.nonNegative(state.totalDuration);
        this.isCurrentlyPlaying = state.currentState === 'playing';
        this.playbackState = normalizeState(state.currentState, Boolean(state.currentTrack));
        this.repeatMode = TrackPlayer.getRepeatMode();
        const currentPlaylistId = state.currentPlaylistId || PlayerQueue.getCurrentPlaylistId();
        this.activePlaylistId = currentPlaylistId &&
            PlayerQueue.getPlaylist(currentPlaylistId)?.name.startsWith(ACTIVE_PLAYLIST_NAME)
            ? currentPlaylistId
            : null;
        if (!this.activePlaylistId) {
            this.activePlaylistId = PlayerQueue.getAllPlaylists().find((playlist) => playlist.name.startsWith(ACTIVE_PLAYLIST_NAME))?.id || null;
        }
    }

    private async refreshNativeIndex(trackId: string) {
        try {
            const index = await TrackPlayer.getCurrentTrackIndex();
            if (this.queueItems[index]?.mediaId === trackId) this.activeIndex = index;
        } catch {
            this.activeIndex = -1;
        }
    }

    private async ensureReady(): Promise<void> {
        if (!await this.setupPlayer()) throw new Error('Nitro Player could not be configured.');
    }

    private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
        const pending = this.mutationTail.then(operation, operation);
        this.mutationTail = pending.then(() => undefined, () => undefined);
        return pending;
    }

    private async withCallbackSuppression<T>(operation: () => Promise<T>): Promise<T> {
        this.callbackSuppressionDepth++;
        try {
            return await operation();
        } finally {
            this.callbackSuppressionDepth--;
        }
    }

    private isSuppressingNativeCommands(): boolean {
        return this.callbackSuppressionDepth > 0;
    }

    private markExpectedCallback(kind: ExpectedCallback['kind'], value: string | number) {
        this.expectedCallbacks.push({ kind, value, expiresAt: Date.now() + SUPPRESSION_TTL_MS });
    }

    private consumeExpectedCallback(kind: ExpectedCallback['kind'], value: string | number): boolean {
        const now = Date.now();
        for (let index = this.expectedCallbacks.length - 1; index >= 0; index--) {
            const expected = this.expectedCallbacks[index];
            if (expected.expiresAt < now) {
                this.expectedCallbacks.splice(index, 1);
                continue;
            }
            if (expected.kind !== kind) continue;
            const matched = kind === 'seek'
                ? Math.abs(Number(expected.value) - Number(value)) < 0.5
                : expected.value === value;
            if (matched) {
                this.expectedCallbacks.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    private emit(event: NormalizedPlaybackEvent) {
        const serviceHandler = this.playbackServiceHandler;
        if (serviceHandler) {
            try {
                void Promise.resolve(serviceHandler(event)).catch((error: unknown) => {
                    console.error('[NitroPlayerAdapter] Playback service handler failed:', error);
                });
            } catch (error) {
                console.error('[NitroPlayerAdapter] Playback service handler failed:', error);
            }
        }

        for (const listener of this.listeners.get(event.type) || []) {
            try {
                listener(event);
            } catch (error) {
                console.error('[NitroPlayerAdapter] Playback event listener failed:', error);
            }
        }
    }

    private emitPlaybackError(index: number, item?: NativeMediaItem) {
        const mediaId = item?.mediaId || this.queueItems[index]?.mediaId;
        const now = Date.now();
        const previousError = mediaId ? this.recentPlaybackErrors.get(mediaId) : undefined;
        if (previousError !== undefined && now - previousError < 100) return;
        if (mediaId) this.recentPlaybackErrors.set(mediaId, now);
        this.emit({
            type: Event.PlaybackError,
            code: 'track-error',
            index,
            queueIndex: item?.extraPayload?.queueIndex,
            item,
            mediaId,
            reason: 'error',
            nativeError: null,
        });
    }

    private nonNegative(value: number): number {
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    }
}

type AdapterGlobal = typeof globalThis & {
    __betaPlayerNitroAdapterV1?: NitroPlayerAdapter;
};

const adapterGlobal = globalThis as AdapterGlobal;
export const nativePlayerAdapter = adapterGlobal.__betaPlayerNitroAdapterV1 || new NitroPlayerAdapter();
adapterGlobal.__betaPlayerNitroAdapterV1 = nativePlayerAdapter;

export default nativePlayerAdapter;
