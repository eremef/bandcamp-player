import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory stand-in for the parts of MobileDatabase the sync touches. The outbox is a
// real array so op ids, ordering and the "delete only what was flushed" rule are exercised.
const mockOps: Array<{ id: number; type: string; payload: any }> = [];
const mockMirror = new Map<string, any>();
let mockNextOpId = 1;
/** Appended to the outbox the first time a flush sends anything (simulates H3). */
let mockOpDuringFlush: { type: string; payload: any } | null = null;

const mockDefaultDeleteOps = async (maxId: number) => {
    for (let i = mockOps.length - 1; i >= 0; i--) {
        if (mockOps[i].id <= maxId) mockOps.splice(i, 1);
    }
};

const mockDb = {
    enqueuePlaylistOp: jest.fn(async (type: string, payload: any) => {
        mockOps.push({ id: mockNextOpId++, type, payload });
    }),
    getPlaylistOps: jest.fn(async () => mockOps.map(o => ({ ...o }))),
    deletePlaylistOpsUpTo: jest.fn((maxId: number) => mockDefaultDeleteOps(maxId)),
    countPlaylistOps: jest.fn(async () => mockOps.length),
    getPlaylistSummaries: jest.fn(async () =>
        [...mockMirror.values()].map(p => ({
            id: p.id,
            updatedAt: p.updatedAt,
            trackCount: p.tracks?.length ?? 0,
        }))
    ),
    getAllPlaylists: jest.fn(async () => [...mockMirror.values()]),
    importPlaylist: jest.fn(async (playlist: any, keepIds = false) => {
        const id = keepIds ? playlist.id : 'generated';
        mockMirror.set(id, { ...playlist, id });
        return id;
    }),
    deletePlaylist: jest.fn(async (id: string) => {
        mockMirror.delete(id);
    }),
};

// A getter, not a plain property: jest hoists the factory above `mockDb`'s initialization,
// so reading it eagerly here yields undefined.
jest.mock('../services/MobileDatabase', () => ({
    get mobileDatabase() { return mockDb; },
}));

// Fake desktop. It applies the playlist messages it receives, so a flush is observable in
// the pull that follows — the point of the round-trip test. Replies are synchronous, which
// is enough because PlaylistSyncService registers its one-shot listener before sending.
type MockHandler = (payload: any) => void;
const mockListeners: Record<string, MockHandler[]> = {};
const mockSent: Array<{ type: string; payload: any }> = [];
const mockHost = new Map<string, any>();
let mockConnected = true;
let mockHostRev = 0;

const mockEmit = (type: string, payload: any) => {
    [...(mockListeners[type] || [])].forEach(h => h(payload));
};

const mockHostApply = (type: string, payload: any) => {
    const touch = (p: any) => { p.updatedAt = `h${++mockHostRev}`; };
    switch (type) {
        case 'create-playlist':
            if (!mockHost.has(payload.id)) {
                mockHost.set(payload.id, { id: payload.id, name: payload.name, tracks: [], updatedAt: `h${++mockHostRev}` });
            }
            break;
        case 'update-playlist': {
            const p = mockHost.get(payload.id);
            if (p) { p.name = payload.name; touch(p); }
            break;
        }
        case 'delete-playlist':
            mockHost.delete(payload);
            break;
        case 'add-track-to-playlist': {
            const p = mockHost.get(payload.playlistId);
            if (p) {
                for (const e of payload.tracks) p.tracks.push({ ...e.track, playlistEntryId: e.entryId });
                touch(p);
            }
            break;
        }
        case 'remove-track-from-playlist': {
            const p = mockHost.get(payload.playlistId);
            if (p) {
                p.tracks = p.tracks.filter((t: any) => t.playlistEntryId !== payload.trackId);
                touch(p);
            }
            break;
        }
        case 'reorder-playlist-tracks': {
            const p = mockHost.get(payload.playlistId);
            if (p) {
                const named = payload.orderedEntryIds
                    .map((id: string) => p.tracks.find((t: any) => t.playlistEntryId === id))
                    .filter(Boolean);
                const rest = p.tracks.filter((t: any) => !payload.orderedEntryIds.includes(t.playlistEntryId));
                p.tracks = [...named, ...rest];
                touch(p);
            }
            break;
        }
    }
};

const mockDefaultSend = (type: string, payload?: any) => {
    mockSent.push({ type, payload });
    if (mockOpDuringFlush) {
        const op = mockOpDuringFlush;
        mockOpDuringFlush = null;
        mockOps.push({ id: mockNextOpId++, ...op });
    }
    mockHostApply(type, payload);

    if (type === 'get-playlists') {
        mockEmit('playlists-data', [...mockHost.values()].map(p => ({
            id: p.id, name: p.name, updatedAt: p.updatedAt, trackCount: p.tracks.length, tracks: [],
        })));
    }
    if (type === 'get-playlist-for-export') {
        mockEmit('export-playlist-data', mockHost.get(payload));
    }
};

jest.mock('../services/WebSocketService', () => ({
    webSocketService: {
        isConnected: () => mockConnected,
        send: jest.fn((type: string, payload?: any) => mockDefaultSend(type, payload)),
        on: (type: string, handler: MockHandler) => {
            (mockListeners[type] = mockListeners[type] || []).push(handler);
            return () => {
                mockListeners[type] = (mockListeners[type] || []).filter(h => h !== handler);
            };
        },
    },
}));

import { playlistSyncService } from '../services/PlaylistSyncService';

const resetSyncState = async () => {
    await AsyncStorage.clear();
    (playlistSyncService as any).bootstrapped = null;
    (playlistSyncService as any).syncing = false;
    (playlistSyncService as any).lastDroppedCount = 0;
};

/** Marks the bootstrap as already done, so deletes are enabled. */
const markBootstrapped = async () => {
    await AsyncStorage.setItem('playlist_sync_bootstrapped', '1');
    (playlistSyncService as any).bootstrapped = null;
};

describe('PlaylistSyncService', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockOps.length = 0;
        mockSent.length = 0;
        mockMirror.clear();
        mockNextOpId = 1;
        mockOpDuringFlush = null;
        mockConnected = true;
        mockHost.clear();
        mockHostRev = 0;
        Object.keys(mockListeners).forEach(k => delete mockListeners[k]);
        // clearAllMocks does not undo a mockImplementation, so a test that swaps one of
        // these leaks into every later test in the file unless they are re-applied here.
        mockDb.deletePlaylistOpsUpTo.mockImplementation((maxId: number) => mockDefaultDeleteOps(maxId));
        (require('../services/WebSocketService').webSocketService.send as jest.Mock)
            .mockImplementation((type: string, payload?: any) => mockDefaultSend(type, payload));
        await resetSyncState();
    });

    // The feature: edits made with the desktop unreachable are replayed, in order, with the
    // ids they were given locally — so both devices end up keyed on the same identity.
    it('replays queued offline edits in order on the next connect', async () => {
        await markBootstrapped();

        mockConnected = false;
        await mockDb.enqueuePlaylistOp('create-playlist', { id: 'p1', name: 'Train mix' });
        await mockDb.enqueuePlaylistOp('add-track-to-playlist', {
            playlistId: 'p1',
            tracks: [{ entryId: 'e1', track: { id: 't1' } }],
        });
        await mockDb.enqueuePlaylistOp('add-track-to-playlist', {
            playlistId: 'p1',
            tracks: [{ entryId: 'e2', track: { id: 't2' } }],
        });
        await mockDb.enqueuePlaylistOp('reorder-playlist-tracks', {
            playlistId: 'p1',
            orderedEntryIds: ['e2', 'e1'],
        });
        expect(mockOps).toHaveLength(4);

        mockConnected = true;
        await playlistSyncService.sync();

        expect(mockSent.map(m => m.type)).toEqual([
            'create-playlist',
            'add-track-to-playlist',
            'add-track-to-playlist',
            'reorder-playlist-tracks',
            'get-playlists',
            'get-playlist-for-export',
        ]);
        expect(mockSent[0].payload).toEqual({ id: 'p1', name: 'Train mix' });
        expect(mockSent[3].payload).toEqual({ playlistId: 'p1', orderedEntryIds: ['e2', 'e1'] });
        expect(mockOps).toHaveLength(0);

        // The desktop ends up with the playlist under the phone's id, in the reordered
        // order, and that is what gets mirrored back.
        expect(mockDb.importPlaylist).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p1', name: 'Train mix' }),
            true
        );
        expect(mockMirror.get('p1').tracks.map((t: any) => t.playlistEntryId)).toEqual(['e2', 'e1']);
    });

    // H3: the mirror overwrite must not swallow an op appended while the flush was in flight.
    it('keeps ops appended during a flush and runs another cycle', async () => {
        await markBootstrapped();
        await mockDb.enqueuePlaylistOp('delete-playlist', 'p1');
        mockOpDuringFlush = { type: 'update-playlist', payload: { id: 'p2', name: 'Later' } };

        await playlistSyncService.sync();

        // Only the op captured at flush start was deleted...
        expect(mockDb.deletePlaylistOpsUpTo).toHaveBeenNthCalledWith(1, 1);
        // ...and the late one went out on a second cycle rather than being dropped.
        expect(mockSent.filter(m => m.type === 'update-playlist')).toHaveLength(1);
        expect(mockSent.filter(m => m.type === 'get-playlists')).toHaveLength(2);
        expect(mockOps).toHaveLength(0);
    });

    // H4: the very first sync must push phone-only playlists up, never delete them.
    it('bootstraps pre-existing local playlists into the outbox instead of deleting them', async () => {
        mockMirror.set('local-1', {
            id: 'local-1',
            name: 'Phone only',
            updatedAt: 't1',
            tracks: [{ id: 't1', playlistEntryId: 'e1' }],
        });

        await playlistSyncService.sync();

        expect(mockDb.enqueuePlaylistOp).toHaveBeenCalledWith('create-playlist', { id: 'local-1', name: 'Phone only' });
        expect(mockDb.enqueuePlaylistOp).toHaveBeenCalledWith('add-track-to-playlist', {
            playlistId: 'local-1',
            tracks: [{ entryId: 'e1', track: { id: 't1', playlistEntryId: 'e1' } }],
        });
        expect(mockDb.deletePlaylist).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem('playlist_sync_bootstrapped')).toBe('1');
    });

    // The bootstrap's own creates are fire-and-forget. If one does not land — the desktop
    // dropped it, or the socket died right after — the pull that follows must still not
    // treat the playlist as "deleted on the desktop".
    it('never deletes on the cycle that seeded the outbox, even if the create is lost', async () => {
        mockMirror.set('local-1', { id: 'local-1', name: 'Phone only', updatedAt: 't1', tracks: [] });
        (require('../services/WebSocketService').webSocketService.send as jest.Mock)
            .mockImplementation((type: string, payload?: any) => {
                if (type === 'create-playlist') { mockSent.push({ type, payload }); return; }
                mockDefaultSend(type, payload);
            });

        await playlistSyncService.sync();

        expect(mockSent.map(m => m.type)).toContain('create-playlist');
        expect(mockDb.deletePlaylist).not.toHaveBeenCalled();
        expect(mockMirror.has('local-1')).toBe(true);
    });

    it('bootstraps only once', async () => {
        mockMirror.set('local-1', { id: 'local-1', name: 'Phone only', updatedAt: 't1', tracks: [] });
        await playlistSyncService.sync();
        const afterFirst = mockDb.enqueuePlaylistOp.mock.calls.length;

        await playlistSyncService.sync();

        expect(mockDb.enqueuePlaylistOp.mock.calls.length).toBe(afterFirst);
    });

    it('deletes local playlists the desktop no longer has, once bootstrapped', async () => {
        await markBootstrapped();
        mockMirror.set('gone', { id: 'gone', name: 'Deleted on PC', updatedAt: 't1', tracks: [] });

        await playlistSyncService.sync();

        expect(mockDb.deletePlaylist).toHaveBeenCalledWith('gone');
    });

    // Without this guard, a local playlist whose create op has not flushed yet would be
    // destroyed by the pull that follows.
    it('does not delete anything while the outbox is non-empty', async () => {
        await markBootstrapped();
        mockConnected = false;
        await mockDb.enqueuePlaylistOp('create-playlist', { id: 'p1', name: 'Pending' });
        mockMirror.set('p1', { id: 'p1', name: 'Pending', updatedAt: 't1', tracks: [] });
        mockConnected = true;
        // The op never leaves the outbox, so the host never learns about p1.
        mockDb.deletePlaylistOpsUpTo.mockImplementation(async () => { /* op stays queued */ });
        (require('../services/WebSocketService').webSocketService.send as jest.Mock)
            .mockImplementation((type: string, payload: any) => {
                mockSent.push({ type, payload });
                if (type === 'get-playlists') mockEmit('playlists-data', []);
            });

        await playlistSyncService.sync();

        expect(mockDb.deletePlaylist).not.toHaveBeenCalled();
    });

    it('re-fetches a playlist only when updatedAt or trackCount differ', async () => {
        await markBootstrapped();
        mockHost.set('same', { id: 'same', name: 'Same', updatedAt: 'h1', tracks: [{ id: 'x', playlistEntryId: 'e1' }] });
        mockHost.set('changed', { id: 'changed', name: 'Changed', updatedAt: 'h2', tracks: [{ id: 'y', playlistEntryId: 'e2' }] });
        mockMirror.set('same', { id: 'same', updatedAt: 'h1', tracks: [{ id: 'x' }] });
        mockMirror.set('changed', { id: 'changed', updatedAt: 'h1', tracks: [{ id: 'y' }] });

        await playlistSyncService.sync();

        const fetched = mockSent.filter(m => m.type === 'get-playlist-for-export').map(m => m.payload);
        expect(fetched).toEqual(['changed']);
    });

    // Same ISO millisecond, different content: trackCount is what catches it.
    it('re-fetches when only trackCount differs', async () => {
        await markBootstrapped();
        mockHost.set('p1', {
            id: 'p1', name: 'P', updatedAt: 'h1',
            tracks: [{ id: 'x', playlistEntryId: 'e1' }, { id: 'z', playlistEntryId: 'e2' }],
        });
        mockMirror.set('p1', { id: 'p1', updatedAt: 'h1', tracks: [{ id: 'x' }] });

        await playlistSyncService.sync();

        expect(mockSent.filter(m => m.type === 'get-playlist-for-export')).toHaveLength(1);
    });

    it('leaves unsent ops queued when the socket drops mid-flush', async () => {
        await markBootstrapped();
        mockConnected = false;
        await mockDb.enqueuePlaylistOp('update-playlist', { id: 'p1', name: 'A' });
        await mockDb.enqueuePlaylistOp('update-playlist', { id: 'p2', name: 'B' });

        mockConnected = true;
        const { webSocketService } = require('../services/WebSocketService');
        (webSocketService.send as jest.Mock).mockImplementationOnce((type: string, payload: any) => {
            mockSent.push({ type, payload });
            mockConnected = false; // socket dies after the first op goes out
        });

        await playlistSyncService.sync();

        expect(mockSent.map(m => m.type)).toEqual(['update-playlist']);
        expect(mockOps.map(o => o.payload.id)).toEqual(['p2']);
    });

    it('reports offline edits for a playlist the desktop no longer has', async () => {
        await markBootstrapped();
        mockConnected = false;
        await mockDb.enqueuePlaylistOp('add-track-to-playlist', { playlistId: 'ghost', tracks: [] });
        mockConnected = true;
        // The host has no such playlist, so the add is silently lost.
        await playlistSyncService.sync();

        expect(playlistSyncService.getDroppedCount()).toBe(1);
    });

    it('does not report a delete of a playlist that is already gone', async () => {
        await markBootstrapped();
        mockConnected = false;
        await mockDb.enqueuePlaylistOp('delete-playlist', 'ghost');
        mockConnected = true;

        await playlistSyncService.sync();

        expect(playlistSyncService.getDroppedCount()).toBe(0);
    });

    it('is single-flight: a concurrent call is dropped, not queued', async () => {
        await markBootstrapped();
        (playlistSyncService as any).syncing = true;

        await playlistSyncService.sync();

        expect(mockSent).toHaveLength(0);
    });

    it('does nothing while disconnected', async () => {
        mockConnected = false;
        await mockDb.enqueuePlaylistOp('delete-playlist', 'p1');

        await playlistSyncService.sync();

        expect(mockSent).toHaveLength(0);
        expect(mockOps).toHaveLength(1);
    });
});
