import { useStore } from './index';
import { webSocketService } from '../services/WebSocketService';
import { DiscoveryService } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';
import TrackPlayer from '@rntp/player';
import { addTrack } from '../services/player';

// Mock TrackPlayer
jest.mock('@rntp/player', () => ({
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    setMediaItems: jest.fn().mockResolvedValue(undefined),
    isPlaying: jest.fn().mockReturnValue(false),
    setMediaItem: jest.fn().mockResolvedValue(undefined),
    getProgress: jest.fn().mockReturnValue({ position: 0, duration: 0 }),
    getPlaybackState: jest.fn().mockReturnValue('ready'),
    addEventListener: jest.fn(),
    State: {
        None: 'none',
        Ready: 'ready',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        Buffering: 'buffering',
        Connecting: 'connecting',
    },
    PlaybackState: {
        Idle: 'idle',
        Ready: 'ready',
        Buffering: 'buffering',
        Ended: 'ended',
        Error: 'error',
    },
    Capability: {},
    Event: {},
    RepeatMode: {},
    AppKilledPlaybackBehavior: {},
}));


// Mock WebSocketService
const socketListeners: Record<string, (...args: any[]) => void> = {};

jest.mock('../services/WebSocketService', () => ({
    webSocketService: {
        connect: jest.fn(),
        disconnect: jest.fn(),
        send: jest.fn(),
        on: jest.fn((event, callback) => {
            socketListeners[event] = callback;
        }),
        off: jest.fn(),
        isConnected: jest.fn().mockReturnValue(false),
    },
}));

// Mock DiscoveryService
jest.mock('../services/discovery.service', () => ({
    DiscoveryService: {
        scanNetwork: jest.fn(),
    }
}));

// Mock player service
jest.mock('../services/player', () => ({
    addTrack: jest.fn(),
}));

jest.mock('../services/MobilePlayerService', () => ({
    mobilePlayerService: {
        setVolume: jest.fn().mockImplementation(async (vol) => {
            const { useStore } = require('./index');
            useStore.setState({ volume: vol });
        }),
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn().mockResolvedValue(undefined),
        next: jest.fn().mockResolvedValue(undefined),
        previous: jest.fn().mockResolvedValue(undefined),
        seek: jest.fn().mockResolvedValue(undefined),
        toggleShuffle: jest.fn().mockImplementation(async () => {
            const { useStore } = require('./index');
            const isShuffled = !useStore.getState().isShuffled;
            useStore.setState({ isShuffled });
        }),
        setRepeat: jest.fn().mockImplementation(async (mode) => {
            const { useStore } = require('./index');
            useStore.setState({ repeatMode: mode });
        }),
        playQueueIndex: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        loadTrack: jest.fn().mockResolvedValue(true),
        waitForTrackReady: jest.fn().mockResolvedValue(true),
        waitForResumeReady: jest.fn().mockResolvedValue(true),
        playPreparedTrack: jest.fn().mockResolvedValue(true),
        getPositionForSnapshot: jest.fn((position: number) => position),
        getPlaybackActionRevision: jest.fn().mockReturnValue(0),
        isNativeQueueItemActive: jest.fn().mockReturnValue(true),
        pauseForQueueHandoff: jest.fn().mockResolvedValue(null),
        restoreQueueHandoffPlayback: jest.fn().mockResolvedValue(true),
        prepareForModeChange: jest.fn(),
    },
}));

jest.mock('../services/MobileDatabase', () => ({
    mobileDatabase: {
        getSettings: jest.fn().mockResolvedValue({ standalone_volume: 0.8 }),
        setSetting: jest.fn().mockResolvedValue(undefined),
        getArtists: jest.fn().mockResolvedValue([]),
        getAllPlaylists: jest.fn().mockResolvedValue([]),
        addTrackToPlaylist: jest.fn().mockResolvedValue('e1'),
        createPlaylist: jest.fn().mockResolvedValue({ id: 'p-new', name: 'New', tracks: [] }),
        renamePlaylist: jest.fn().mockResolvedValue(undefined),
        deletePlaylist: jest.fn().mockResolvedValue(undefined),
        removeTrackFromPlaylist: jest.fn().mockResolvedValue(undefined),
        reorderPlaylistTracks: jest.fn().mockResolvedValue(undefined),
        importPlaylist: jest.fn().mockResolvedValue('p-new'),
        getPlaylistEntryIds: jest.fn().mockResolvedValue([]),
        getPlaylistSummaries: jest.fn().mockResolvedValue([]),
        enqueuePlaylistOp: jest.fn().mockResolvedValue(undefined),
        getPlaylistOps: jest.fn().mockResolvedValue([]),
        deletePlaylistOpsUpTo: jest.fn().mockResolvedValue(undefined),
        countPlaylistOps: jest.fn().mockResolvedValue(0),
        getCollectionGranular: jest.fn().mockResolvedValue([]),
        getCollectionTotalCount: jest.fn().mockResolvedValue(0),
        getCacheTotalSize: jest.fn().mockResolvedValue(0),
        getAllCacheEntries: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('../services/PlaylistSyncService', () => ({
    playlistSyncService: {
        sync: jest.fn().mockResolvedValue(undefined),
        getDroppedCount: jest.fn().mockReturnValue(0),
        getMode: jest.fn().mockReturnValue('two-way'),
    },
}));

jest.mock('../services/MobileAuthService', () => ({
    mobileAuthService: {
        checkSession: jest.fn().mockResolvedValue({ isAuthenticated: false, user: null }),
        logout: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../services/MobileScraperService', () => ({
    mobileScraperService: {
        fetchCollection: jest.fn().mockResolvedValue({ items: [], totalCount: 0 }),
        searchCollection: jest.fn().mockReturnValue({ items: [], totalCount: 0 }),
        getAlbumDetails: jest.fn().mockResolvedValue({ id: 'a1', tracks: [] }),
        getRadioStations: jest.fn().mockResolvedValue([]),
        getStationStreamUrl: jest.fn().mockResolvedValue({ streamUrl: 'url', duration: 100 }),
    },
}));

describe('Mobile useStore', () => {
    const makeDesktopQueueSnapshot = (position = 12) => ({
        queue: {
            items: [{
                id: 'desktop-q',
                source: 'collection',
                track: {
                    id: 'desktop-track',
                    title: 'Desktop track',
                    artist: 'Desktop artist',
                    album: 'Album',
                    artworkUrl: '',
                    streamUrl: 'file:///desktop/cache/track.mp3',
                    bandcampUrl: 'https://artist.bandcamp.com/track/song',
                    duration: 100,
                },
            }],
            currentIndex: 0,
        },
        currentTrack: { id: 'desktop-track', title: 'Desktop track' },
        currentIndex: 0,
        position,
        duration: 100,
        queueVersion: 1,
        actionVersion: 2,
        isPlaying: true,
        isCasting: false,
    });

    const makeEmptyDesktopQueueSnapshot = (queueVersion = 1, actionVersion = 2) => ({
        queue: { items: [], currentIndex: -1 },
        currentTrack: null,
        currentIndex: -1,
        position: 0,
        duration: 0,
        queueVersion,
        actionVersion,
        isPlaying: false,
        isCasting: false,
    });

    const activateQueueHandoff = (send: (type: string, payload: any) => void) => {
        (webSocketService.isConnected as jest.Mock).mockReturnValue(true);
        (webSocketService.send as jest.Mock).mockReset().mockImplementation(send);
        useStore.setState({
            mode: 'standalone',
            desktopSocketConnected: true,
            desktopQueueHandoffAvailable: true,
            desktopQueueHandoffCapabilityChecked: true,
            desktopQueueCurrentTrackAvailable: true,
            queueHandoff: { status: 'idle', direction: null, message: null },
        });
    };

    const respondToHandoffSnapshot = (requestId: string, snapshot: any) => {
        socketListeners['desktop-queue-snapshot']({ requestId, snapshot });
    };

    beforeEach(() => {
        jest.useFakeTimers();
        (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
        socketListeners['connection-status']('disconnected', false);
        useStore.getState().cancelQueueHandoff();
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        mobilePlayerService.getPositionForSnapshot.mockReset().mockImplementation((position: number) => position);
        useStore.setState({
            hostIp: '',
            connectionStatus: 'connected', // Set to connected by default for WebSocket tests
            recentIps: [],
            isScanning: false,
            isPlaying: false,
            currentTrack: null,
            collection: null,
            playlists: [],
            radioStations: [],
            searchQuery: '',
            collectionOffset: 0,
            hasMoreCollection: true,
            isCollectionLoading: false,
            mode: 'remote',
            skipAutoLogin: false,
            queue: { items: [], currentIndex: -1 },
            auth: { isAuthenticated: false, user: null },
            collectionError: null,
            playlistSyncEnabled: true,
            playlistSyncMode: 'two-way',
            desktopSocketConnected: false,
            desktopQueueAvailability: 'unknown',
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
            desktopQueueCurrentTrackAvailable: false,
            queueHandoff: { status: 'idle', direction: null, message: null },
        });

        jest.clearAllMocks();
        mobilePlayerService.loadTrack.mockReset().mockResolvedValue(true);
        mobilePlayerService.waitForTrackReady.mockReset().mockResolvedValue(true);
        mobilePlayerService.waitForResumeReady.mockReset().mockResolvedValue(true);
        mobilePlayerService.playPreparedTrack.mockReset().mockResolvedValue(true);
        mobilePlayerService.getPlaybackActionRevision.mockReset().mockReturnValue(0);
        mobilePlayerService.isNativeQueueItemActive.mockReset().mockReturnValue(true);
        mobilePlayerService.pauseForQueueHandoff.mockReset().mockResolvedValue(null);
        mobilePlayerService.restoreQueueHandoffPlayback.mockReset().mockResolvedValue(true);
        AsyncStorage.clear();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('tracks desktop queue availability without replacing the standalone queue', () => {
        const phoneQueue = { items: [{ id: 'phone-q', track: { id: 'phone-track' } as any, source: 'collection' as const }], currentIndex: 0 };
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({ mode: 'standalone', queue: phoneQueue, currentTrack: phoneTrack });

        socketListeners['state-changed']({
            queue: { items: [{ id: 'desktop-q', track: { id: 'desktop-track' } }], currentIndex: 0 },
            currentTrack: { id: 'desktop-track' },
            currentTime: 50,
        });

        expect(useStore.getState().desktopQueueAvailability).toBe('nonempty');
        expect(useStore.getState().queue).toBe(phoneQueue);
        expect(useStore.getState().currentTrack).toBe(phoneTrack);
        expect(useStore.getState().currentTime).toBe(0);
    });

    it('imports on tap after phone preparation, then pauses desktop and uses the pause position', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const snapshot = makeDesktopQueueSnapshot(10);
        const order: string[] = [];
        activateQueueHandoff((type, payload) => {
            order.push(type);
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, snapshot);
            } else if (type === 'request-desktop-queue-pause') {
                socketListeners['desktop-queue-paused']({
                    requestId: payload.requestId,
                    success: true,
                    trackId: 'desktop-track',
                    position: 29,
                    queueVersion: 1,
                    actionVersion: 3,
                    wasPlaying: true,
                });
            } else if (type === 'complete-desktop-queue-pause') {
                socketListeners['desktop-queue-handoff-completed']({ requestId: payload.requestId, success: true });
            }
        });
        mobilePlayerService.loadTrack.mockImplementation(async () => {
            order.push('phone-ready');
            return true;
        });
        mobilePlayerService.playPreparedTrack.mockImplementation(async () => {
            order.push('phone-start');
            return true;
        });
        useStore.setState({ repeatMode: 'one', isShuffled: true, volume: 0.6, isMuted: true });

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().importDesktopQueue(true);
        });

        expect(result).toBe('completed');
        expect(order.indexOf('phone-ready')).toBeLessThan(order.indexOf('request-desktop-queue-pause'));
        expect(order.indexOf('request-desktop-queue-pause')).toBeLessThan(order.indexOf('phone-start'));
        expect(mobilePlayerService.playPreparedTrack).toHaveBeenCalledWith('desktop-track', 29);
        expect(webSocketService.send).toHaveBeenCalledWith('complete-desktop-queue-pause', expect.objectContaining({
            expectedActionVersion: 3,
        }));
        expect(useStore.getState().isPlaying).toBe(true);
        expect(useStore.getState().repeatMode).toBe('one');
        expect(useStore.getState().isShuffled).toBe(true);
        expect(useStore.getState().volume).toBe(0.6);
        expect(useStore.getState().isMuted).toBe(true);
    });

    it('imports on long press without pausing desktop and uses its freshest position', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const initial = makeDesktopQueueSnapshot(10);
        const latest = { ...initial, position: 24 };
        const snapshots = [initial, latest];
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, snapshots.shift() || latest);
            }
        });

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().importDesktopQueue(false);
        });

        expect(result).toBe('completed');
        expect(webSocketService.send).not.toHaveBeenCalledWith('request-desktop-queue-pause', expect.anything());
        expect(webSocketService.send).not.toHaveBeenCalledWith('request-desktop-queue-resume', expect.anything());
        expect(mobilePlayerService.playPreparedTrack).toHaveBeenCalledWith('desktop-track', 24);
    });

    it('exports on tap only after desktop preparation and strips phone-local media paths', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const order: string[] = [];
        const chunkData: string[] = [];
        const phoneTrack = {
            id: 'phone-track', title: 'Zażółć 🎵 東京', artist: 'Phone artist', album: 'Album',
            streamUrl: 'file:///mobile/cache/track.mp3', cachedPath: '/private/cache/track.mp3', isCached: true,
            bandcampUrl: 'https://artist.bandcamp.com/track/song', duration: 120,
        } as any;
        const queue = {
            items: Array.from({ length: 3000 }, (_, index) => ({
                id: index === 0 ? 'phone-q' : `phone-q-${index}`,
                track: { ...phoneTrack }, source: 'collection' as const,
            })),
            currentIndex: 0,
        };
        useStore.setState({ queue, currentTrack: phoneTrack, currentTime: 12, isPlaying: true, userIntendedPause: false });
        mobilePlayerService.pauseForQueueHandoff.mockImplementation(async () => {
            order.push('phone-pause');
            return { trackId: 'phone-track', queueItemId: 'phone-q', position: 31, wasPlaying: true, actionRevision: 0 };
        });
        activateQueueHandoff((type, payload) => {
            order.push(type);
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeEmptyDesktopQueueSnapshot());
            } else if (type === 'begin-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-ready']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'desktop-queue-transfer-chunk') {
                chunkData.push(payload.data);
                socketListeners['desktop-queue-transfer-chunk-ack']({
                    requestId: payload.requestId, transferId: payload.transferId, index: payload.index, success: true,
                });
            } else if (type === 'prepare-desktop-queue-transfer') {
                order.push('desktop-prepared');
                socketListeners['desktop-queue-transfer-prepared']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'commit-desktop-queue-transfer') {
                expect(payload.position).toBe(31);
                socketListeners['desktop-queue-transfer-result']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            }
        });

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().exportQueueToDesktop(true);
        });

        const transferred = JSON.parse(Buffer.concat(chunkData.map(chunk => Buffer.from(chunk, 'base64'))).toString('utf8'));
        expect(result).toBe('completed');
        expect(chunkData.length).toBeGreaterThan(1);
        expect(transferred.items[0].track.title).toBe(phoneTrack.title);
        expect(transferred.items[0].track.streamUrl).toBe('');
        expect(transferred.items[0].track.isCached).toBe(false);
        expect(transferred.items[0].track.cachedPath).toBeUndefined();
        expect(JSON.stringify(transferred)).not.toContain('/mobile/cache');
        expect(order.indexOf('desktop-prepared')).toBeLessThan(order.indexOf('phone-pause'));
        expect(order.indexOf('phone-pause')).toBeLessThan(order.indexOf('commit-desktop-queue-transfer'));
        expect(useStore.getState().queue).toBe(queue);
    });

    it('exports on long press without pausing phone and sends the latest position', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const phoneTrack = { id: 'phone-track', title: 'Phone track', streamUrl: 'https://example.com/track.mp3' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
            isPlaying: false,
        });
        (TrackPlayer.getProgress as jest.Mock).mockReturnValueOnce({ position: 12 }).mockReturnValueOnce({ position: 44 });
        let commitPosition = -1;
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeEmptyDesktopQueueSnapshot());
            } else if (type === 'begin-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-ready']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'desktop-queue-transfer-chunk') {
                socketListeners['desktop-queue-transfer-chunk-ack']({ requestId: payload.requestId, transferId: payload.transferId, index: payload.index, success: true });
            } else if (type === 'prepare-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-prepared']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'commit-desktop-queue-transfer') {
                commitPosition = payload.position;
                socketListeners['desktop-queue-transfer-result']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            }
        });

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().exportQueueToDesktop(false);
        });

        expect(result).toBe('completed');
        expect(mobilePlayerService.pauseForQueueHandoff).not.toHaveBeenCalled();
        expect(commitPosition).toBe(44);
        expect(useStore.getState().isPlaying).toBe(false);
    });

    it('leaves desktop playing if the phone cannot prepare an import on tap', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeDesktopQueueSnapshot());
            }
        });
        mobilePlayerService.loadTrack.mockResolvedValueOnce(false);

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().importDesktopQueue(true);
        });

        expect(result).toBe('failed');
        expect(webSocketService.send).not.toHaveBeenCalledWith('request-desktop-queue-pause', expect.anything());
        expect(useStore.getState().queue.items).toHaveLength(0);
    });

    it('restores desktop playback if the prepared phone track cannot start', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const snapshot = makeDesktopQueueSnapshot(10);
        const pauseRequestIds: string[] = [];
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, snapshot);
            } else if (type === 'request-desktop-queue-pause') {
                pauseRequestIds.push(payload.requestId);
                socketListeners['desktop-queue-paused']({
                    requestId: payload.requestId,
                    success: true,
                    trackId: 'desktop-track',
                    position: 29,
                    queueVersion: 1,
                    actionVersion: 3,
                    wasPlaying: true,
                });
            } else if (type === 'request-desktop-queue-resume') {
                socketListeners['desktop-queue-resume-result']({ requestId: payload.requestId, success: true });
            }
        });
        mobilePlayerService.playPreparedTrack.mockResolvedValue(false);

        let result: string | undefined;
        await act(async () => { result = await useStore.getState().importDesktopQueue(true); });

        expect(result).toBe('failed');
        expect(pauseRequestIds).toHaveLength(1);
        expect(webSocketService.send).toHaveBeenCalledWith('request-desktop-queue-resume', expect.objectContaining({
            requestId: pauseRequestIds[0],
            expectedActionVersion: 3,
            expectedTrackId: 'desktop-track',
            position: 29,
            wasPlaying: true,
        }));
        expect(useStore.getState().queue.items).toHaveLength(0);
    });

    it('does not pause phone when desktop rejects queue preparation', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
        });
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeEmptyDesktopQueueSnapshot());
            } else if (type === 'begin-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-ready']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'desktop-queue-transfer-chunk') {
                socketListeners['desktop-queue-transfer-chunk-ack']({ requestId: payload.requestId, transferId: payload.transferId, index: payload.index, success: true });
            } else if (type === 'prepare-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-prepared']({ requestId: payload.requestId, transferId: payload.transferId, success: false, reason: 'prepare failed' });
            }
        });

        let result: string | undefined;
        await act(async () => {
            result = await useStore.getState().exportQueueToDesktop(true);
        });

        expect(result).toBe('failed');
        expect(mobilePlayerService.pauseForQueueHandoff).not.toHaveBeenCalled();
        expect(webSocketService.send).toHaveBeenCalledWith('abort-desktop-queue-transfer', expect.anything());
    });

    it('restores phone playback if the desktop rejects export commit', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
            isPlaying: true,
        });
        mobilePlayerService.pauseForQueueHandoff.mockResolvedValue({
            trackId: 'phone-track', queueItemId: 'phone-q', position: 31, wasPlaying: true, actionRevision: 0,
        });
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeEmptyDesktopQueueSnapshot());
            } else if (type === 'begin-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-ready']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'desktop-queue-transfer-chunk') {
                socketListeners['desktop-queue-transfer-chunk-ack']({ requestId: payload.requestId, transferId: payload.transferId, index: payload.index, success: true });
            } else if (type === 'prepare-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-prepared']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'commit-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-result']({
                    requestId: payload.requestId, transferId: payload.transferId, success: false, reason: 'start failed',
                });
            }
        });

        let result: string | undefined;
        await act(async () => { result = await useStore.getState().exportQueueToDesktop(true); });

        expect(result).toBe('failed');
        expect(mobilePlayerService.restoreQueueHandoffPlayback).toHaveBeenCalledWith(expect.objectContaining({ position: 31 }));
    });

    it('keeps the phone paused until a lost export commit can be verified', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
            isPlaying: true,
        });
        mobilePlayerService.pauseForQueueHandoff.mockResolvedValue({
            trackId: 'phone-track', queueItemId: 'phone-q', position: 31, wasPlaying: true, actionRevision: 0,
        });
        let operation!: Promise<string>;
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeEmptyDesktopQueueSnapshot());
            } else if (type === 'begin-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-ready']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'desktop-queue-transfer-chunk') {
                socketListeners['desktop-queue-transfer-chunk-ack']({ requestId: payload.requestId, transferId: payload.transferId, index: payload.index, success: true });
            } else if (type === 'prepare-desktop-queue-transfer') {
                socketListeners['desktop-queue-transfer-prepared']({ requestId: payload.requestId, transferId: payload.transferId, success: true });
            } else if (type === 'request-desktop-queue-transfer-status') {
                socketListeners['desktop-queue-transfer-status']({
                    requestId: payload.requestId, transferId: payload.transferId,
                    status: 'completed', result: { success: true },
                });
            }
        });

        await act(async () => {
            operation = useStore.getState().exportQueueToDesktop(true);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(webSocketService.send).toHaveBeenCalledWith('commit-desktop-queue-transfer', expect.anything());
        (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
        socketListeners['connection-status']('disconnected', false);

        let result: string | undefined;
        await act(async () => { result = await operation; });

        expect(result).toBe('failed');
        expect(mobilePlayerService.restoreQueueHandoffPlayback).not.toHaveBeenCalled();
        expect(useStore.getState().queueHandoff.message).toContain('could not be confirmed');

        (webSocketService.isConnected as jest.Mock).mockReturnValue(true);
        await act(async () => { socketListeners['connection-status']('connected', false); });
        expect(useStore.getState().queueHandoff.status).toBe('idle');
        expect(mobilePlayerService.restoreQueueHandoffPlayback).not.toHaveBeenCalled();
    });

    it('requires the same confirmation token and desktop destination revision before export overwrite', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
        });
        const snapshots = [
            { ...makeDesktopQueueSnapshot(), queueVersion: 10 },
            { ...makeDesktopQueueSnapshot(), queueVersion: 11 },
        ];
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, snapshots.shift());
            }
        });

        let first: string | undefined;
        let second: string | undefined;
        await act(async () => { first = await useStore.getState().exportQueueToDesktop(false); });
        expect(useStore.getState().queueHandoff.status).toBe('awaiting-confirmation');
        await act(async () => { second = await useStore.getState().exportQueueToDesktop(false, true); });

        expect(first).toBe('confirmation-required');
        expect(second).toBe('confirmation-required');
        expect(mobilePlayerService.pauseForQueueHandoff).not.toHaveBeenCalled();
    });

    it('invalidates overwrite confirmation from compact desktop revisions', async () => {
        const phoneTrack = { id: 'phone-track', title: 'Phone track' } as any;
        useStore.setState({
            queue: { items: [{ id: 'phone-q', track: phoneTrack, source: 'collection' as const }], currentIndex: 0 },
            currentTrack: phoneTrack,
        });
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, makeDesktopQueueSnapshot());
            }
        });
        socketListeners['capabilities']({
            capabilities: ['queue-handoff-v1', 'queue-handoff-status-v1'],
            queueHandoffStatus: { queueNonempty: true, hasActiveTrack: true, queueVersion: 1, actionVersion: 2 },
        });
        expect(await useStore.getState().exportQueueToDesktop(false)).toBe('confirmation-required');
        socketListeners['queue-handoff-status']({ queueNonempty: true, hasActiveTrack: true, queueVersion: 2, actionVersion: 2 });
        expect(useStore.getState().queueHandoff.status).toBe('idle');
        expect(await useStore.getState().exportQueueToDesktop(false, true)).toBe('confirmation-required');
    });

    it('does not turn a queued track into an active desktop track while normalizing a snapshot', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, { ...makeDesktopQueueSnapshot(), currentTrack: null });
            }
        });
        expect(await useStore.getState().importDesktopQueue(true)).toBe('failed');
        expect(useStore.getState().queueHandoff.message).toContain('no active queue track');
        expect(mobilePlayerService.loadTrack).not.toHaveBeenCalled();
    });

    it('rejects malformed handoff snapshots before touching phone playback', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        activateQueueHandoff((type, payload) => {
            if (type === 'request-desktop-queue-handoff-snapshot') {
                respondToHandoffSnapshot(payload.requestId, { ...makeDesktopQueueSnapshot(), currentTrack: { id: 'missing-track', title: 'Missing' } });
            }
        });
        expect(await useStore.getState().importDesktopQueue(true)).toBe('failed');
        expect(useStore.getState().queueHandoff.message).toContain('invalid queue snapshot');
        expect(mobilePlayerService.loadTrack).not.toHaveBeenCalled();
    });

    it('should restore volume when switching to standalone mode', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');

        await act(async () => {
            await useStore.getState().setMode('standalone');
        });

        expect(useStore.getState().mode).toBe('standalone');
        expect(useStore.getState().volume).toBe(0.8);
        expect(mobilePlayerService.setVolume).toHaveBeenCalledWith(0.8);

        // Fast-forward timers for refresh actions
        await act(() => {
            jest.advanceTimersByTime(200);
        });
    });

    it('should set connectionStatus to disconnected when switching to remote mode if not connected', async () => {
        (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
        useStore.setState({ mode: 'standalone', connectionStatus: 'connected' });

        await act(async () => {
            await useStore.getState().setMode('remote');
        });

        expect(useStore.getState().mode).toBe('remote');
        expect(useStore.getState().connectionStatus).toBe('disconnected');
        expect(useStore.getState().skipAutoLogin).toBe(true);
    });

    it('should save the native playback position when switching away from standalone mode', async () => {
        (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
        (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 45, duration: 100 });
        useStore.setState({
            mode: 'standalone',
            connectionStatus: 'connected',
            currentTime: 0,
            queue: { items: [{ id: 'q1', track: { id: 't1' } as any, source: 'collection' }], currentIndex: 0 },
        });

        await act(async () => {
            await useStore.getState().setMode('remote');
        });

        const savedQueueCall = (AsyncStorage.setItem as jest.Mock).mock.calls.find(([key]) => key === 'standalone_queue');
        expect(savedQueueCall).toBeDefined();
        expect(JSON.parse(savedQueueCall[1]).currentTime).toBe(45);
    });

    it('should keep the pending standalone resume position when switching modes before native progress catches up', async () => {
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
        (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 0, duration: 100 });
        mobilePlayerService.getPositionForSnapshot.mockReturnValue(45);
        useStore.setState({
            mode: 'standalone',
            currentTime: 45,
            queue: { items: [{ id: 'q1', track: { id: 't1' } as any, source: 'collection' }], currentIndex: 0 },
        });

        await act(async () => {
            await useStore.getState().setMode('remote');
        });

        const savedQueueCall = (AsyncStorage.setItem as jest.Mock).mock.calls.find(([key]) => key === 'standalone_queue');
        expect(JSON.parse(savedQueueCall[1]).currentTime).toBe(45);
        expect(mobilePlayerService.prepareForModeChange).toHaveBeenCalled();
    });

    it('should not apply a stale standalone restore after switching to remote mode', async () => {
        let resolveQueue!: (value: string) => void;
        const delayedQueue = new Promise<string>(resolve => {
            resolveQueue = resolve;
        });
        const getItemMock = AsyncStorage.getItem as jest.Mock;
        getItemMock.mockImplementation((key: string) => key === 'standalone_queue' ? delayedQueue : Promise.resolve(null));

        useStore.setState({ mode: 'standalone', currentTrack: { id: 'standalone-track' } as any, isPlaying: true });
        const restorePromise = useStore.getState().restoreStandaloneState();

        useStore.setState({ mode: 'remote', currentTrack: { id: 'remote-track' } as any, isPlaying: true });
        resolveQueue(JSON.stringify({
            items: [{ id: 'q1', track: { id: 'standalone-track' } }],
            currentIndex: 0,
            currentTime: 30,
        }));

        await act(async () => {
            await restorePromise;
        });

        expect(useStore.getState().mode).toBe('remote');
        expect(useStore.getState().currentTrack?.id).toBe('remote-track');
        getItemMock.mockImplementation(() => Promise.resolve(null));
    });

    it('should connect to a host', async () => {
        const ip = '192.168.1.10';
        const options = {
            mode: 'safe' as const,
            pairingCode: 'A'.repeat(24),
            caFingerprint: 'ab'.repeat(32),
        };
        await act(async () => {
            await useStore.getState().connect(ip, options);
        });

        expect(useStore.getState().hostIp).toBe(ip);
        expect(useStore.getState().connectionStatus).toBe('connecting');
        expect(webSocketService.connect).toHaveBeenCalledWith(ip, options);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('recent_ips', expect.any(String));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('last_ip', ip);
    });

    it('should disconnect', async () => {
        useStore.setState({ mode: 'remote' }); // Ensure we are in remote mode for full disconnect
        await act(async () => {
            await useStore.getState().disconnect();
        });

        expect(useStore.getState().connectionStatus).toBe('disconnected');
        expect(useStore.getState().hostIp).toBe('');
        expect(webSocketService.disconnect).toHaveBeenCalled();
    });

    it('should autoConnect with saved IP', async () => {
        useStore.setState({ connectionStatus: 'disconnected', hostIp: '', skipAutoLogin: false });

        (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
            if (key === 'last_ip') return Promise.resolve('192.168.1.20');
            if (key === 'recent_ips') return Promise.resolve('["192.168.1.20"]');
            if (key === 'app_mode') return Promise.resolve('remote');
            return Promise.resolve(null);
        });

        await act(async () => {

            await useStore.getState().autoConnect();
        });

        // hostIp should be set by connect()
        await waitFor(() => {
            expect(useStore.getState().hostIp).toBe('192.168.1.20');
        }, { timeout: 2000 });

        expect(webSocketService.connect).toHaveBeenCalledWith('192.168.1.20', undefined);
        expect(useStore.getState().recentIps).toEqual(['192.168.1.20']);

    });

    it('should remove recent IP', async () => {
        useStore.setState({ recentIps: ['1.1.1.1', '2.2.2.2'] });

        await act(async () => {
            await useStore.getState().removeRecentIp('1.1.1.1');
        });

        expect(useStore.getState().recentIps).toEqual(['2.2.2.2']);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('recent_ips', '["2.2.2.2"]');
    });

    it('should start scan and connect if found', async () => {
        (DiscoveryService.scanNetwork as jest.Mock).mockResolvedValue('192.168.1.30');
        const options = { mode: 'unsafe' as const };

        await act(async () => {
            await useStore.getState().startScan(options);
        });

        expect(DiscoveryService.scanNetwork).toHaveBeenCalled();
        expect(webSocketService.connect).toHaveBeenCalledWith('192.168.1.30', options);
    });

    describe('Playback Controls', () => {
        it('should send play command', async () => {
            await act(() => useStore.getState().play());
            expect(webSocketService.send).toHaveBeenCalledWith('play');
        });

        it('should send pause command', async () => {
            await act(() => useStore.getState().pause());
            expect(webSocketService.send).toHaveBeenCalledWith('pause');
        });

        it('should send next command', async () => {
            await act(() => useStore.getState().next());
            expect(webSocketService.send).toHaveBeenCalledWith('next');
        });

        it('should send previous command', async () => {
            await act(() => useStore.getState().previous());
            expect(webSocketService.send).toHaveBeenCalledWith('previous');
        });

        it('should send seek command', async () => {
            await act(() => useStore.getState().seek(30));
            expect(webSocketService.send).toHaveBeenCalledWith('seek', 30);
        });

        it('should send setVolume command', async () => {
            await act(() => useStore.getState().setVolume(0.5));
            expect(webSocketService.send).toHaveBeenCalledWith('set-volume', 0.5);
        });

        it('should send toggleShuffle command', async () => {
            await act(() => useStore.getState().toggleShuffle());
            expect(webSocketService.send).toHaveBeenCalledWith('toggle-shuffle');
        });

        it('should send setRepeat command', async () => {
            await act(() => useStore.getState().setRepeat('one'));
            expect(webSocketService.send).toHaveBeenCalledWith('set-repeat', 'one');
        });
    });

    describe('Content Actions', () => {
        const mockTrack = { id: 't1' } as any;
        const mockStation = { name: 'Radio' } as any;

        it('should play track', async () => {
            await act(() => useStore.getState().playTrack(mockTrack));
            expect(webSocketService.send).toHaveBeenCalledWith('play-track', mockTrack);
        });

        it('should play album', async () => {
            await act(() => useStore.getState().playAlbum('url'));
            expect(webSocketService.send).toHaveBeenCalledWith('play-album', 'url');
        });

        it('should play playlist', async () => {
            await act(() => useStore.getState().playPlaylist('p1'));
            expect(webSocketService.send).toHaveBeenCalledWith('play-playlist', 'p1');
        });

        it('should play station', async () => {
            await act(() => useStore.getState().playStation(mockStation));
            expect(webSocketService.send).toHaveBeenCalledWith('play-station', mockStation);
        });

        it('should add station to queue', async () => {
            await act(() => useStore.getState().addStationToQueue(mockStation, true));
            expect(webSocketService.send).toHaveBeenCalledWith('add-station-to-queue', { station: mockStation, playNext: true });
        });

        it('should add track to queue', async () => {
            await act(() => useStore.getState().addTrackToQueue(mockTrack, false));
            expect(webSocketService.send).toHaveBeenCalledWith('add-track-to-queue', { track: mockTrack, playNext: false });
        });

        it('should add album to queue', async () => {
            await act(() => useStore.getState().addAlbumToQueue('url', true));
            expect(webSocketService.send).toHaveBeenCalledWith('add-album-to-queue', { albumUrl: 'url', playNext: true });
        });

        it('should add track to playlist', async () => {
            await act(() => useStore.getState().addTrackToPlaylist('p1', mockTrack));
            expect(webSocketService.send).toHaveBeenCalledWith('add-track-to-playlist', { playlistId: 'p1', track: mockTrack });
        });

        it('should add album to playlist', async () => {
            await act(() => useStore.getState().addAlbumToPlaylist('p1', 'url'));
            expect(webSocketService.send).toHaveBeenCalledWith('add-album-to-playlist', { playlistId: 'p1', albumUrl: 'url' });
        });

        it('should add station to playlist', async () => {
            await act(() => useStore.getState().addStationToPlaylist('p1', mockStation));
            expect(webSocketService.send).toHaveBeenCalledWith('add-station-to-playlist', { playlistId: 'p1', station: mockStation });
        });

        it('should play queue index', async () => {
            await act(() => useStore.getState().playQueueIndex(5));
            expect(webSocketService.send).toHaveBeenCalledWith('play-queue-index', 5);
        });

        it('should remove from queue', async () => {
            // Setup initial queue
            useStore.setState({
                queue: {
                    items: [{ id: 'q1', track: mockTrack, source: 'collection' }],
                    currentIndex: 0
                }
            });

            await act(() => useStore.getState().removeFromQueue('q1'));

            expect(webSocketService.send).toHaveBeenCalledWith('remove-from-queue', 'q1');
            expect(useStore.getState().queue.items).toHaveLength(0);
        });

        it('should clear queue', async () => {
            // Setup initial queue
            useStore.setState({
                queue: {
                    items: [{ id: 'q1', track: mockTrack, source: 'collection' }],
                    currentIndex: 0
                }
            });

            await act(() => useStore.getState().clearQueue(true));

            // clearQueue keeps current item if playing
            expect(useStore.getState().queue.items).toHaveLength(1);
            expect(webSocketService.send).toHaveBeenCalledWith('clear-queue', { keepTrack: true });
        });
    });

    describe('WebSocket Events', () => {
        it('should handle state-changed event and sync TrackPlayer', async () => {
            const stateChangedCallback = socketListeners['state-changed'];
            expect(stateChangedCallback).toBeDefined();

            const newState = { isPlaying: true, currentTrack: { id: 't1', title: 'Test' } as any };

            await act(async () => {
                await stateChangedCallback(newState);
            });

            expect(useStore.getState().isPlaying).toBe(true);
            expect(useStore.getState().currentTrack?.id).toBe('t1');
            expect(TrackPlayer.play).toHaveBeenCalled();
            expect(addTrack).toHaveBeenCalled();
        });

        it('should handle collection-data event', async () => {
            const callback = socketListeners['collection-data'];
            expect(callback).toBeDefined();

            const mockCollection = { items: [], totalCount: 0, lastUpdated: new Date().toISOString() };

            await act(() => callback(mockCollection));
            expect(useStore.getState().collection).toEqual(mockCollection);
        });

        // The broadcast is a pull hint, not data: its payload carries no tracks, and the
        // host sends it to every client on every mutation.
        it('should treat playlists-data as a sync hint', async () => {
            const callback = socketListeners['playlists-data'];
            expect(callback).toBeDefined();

            const { mobileDatabase } = require('../services/MobileDatabase');
            const { playlistSyncService } = require('../services/PlaylistSyncService');
            mobileDatabase.getAllPlaylists.mockResolvedValue([{ id: 'p1' }]);

            await act(async () => { callback([{ id: 'p1', trackCount: 3 }]); });

            expect(playlistSyncService.sync).toHaveBeenCalled();
            expect(useStore.getState().playlists).toEqual([{ id: 'p1' }]);
        });

        // The pull half of sync used to be gated on `mode === 'remote'` at all three
        // trigger sites, so a phone in Standalone — which keeps a background socket —
        // never saw a desktop-side playlist change. Sync is keyed on the socket only.
        it('syncs in standalone mode on socket open and on the pull hint', async () => {
            const { playlistSyncService } = require('../services/PlaylistSyncService');
            (webSocketService.isConnected as jest.Mock).mockReturnValue(true);
            useStore.setState({ mode: 'standalone' });

            await act(async () => { socketListeners['connection-status']('connected'); });
            expect(playlistSyncService.sync).toHaveBeenCalled();

            playlistSyncService.sync.mockClear();
            await act(async () => { socketListeners['playlists-data']([]); });
            expect(playlistSyncService.sync).toHaveBeenCalled();
        });

        it('should handle radio-data event', async () => {
            const callback = socketListeners['radio-data'];
            expect(callback).toBeDefined();

            const mockStations = [{ name: 'Radio' }];

            await act(() => callback(mockStations));
            expect(useStore.getState().radioStations).toBe(mockStations);
        });


        it('should handle time-update and sync TrackPlayer', async () => {
            const callback = socketListeners['time-update'];
            expect(callback).toBeDefined();

            (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 10 });

            // Diff > 2s (15 - 10 = 5)
            await act(async () => {
                await callback({ currentTime: 15 });
            });

            expect(useStore.getState().currentTime).toBe(15);
            expect(TrackPlayer.seekTo).toHaveBeenCalledWith(15);

            jest.clearAllMocks();

            // Diff < 2s (11 - 10 = 1)
            (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 10 });
            await act(async () => {
                await callback({ currentTime: 11 });
            });
            expect(TrackPlayer.seekTo).not.toHaveBeenCalled();
        });

        it('should handle connection-status event', async () => {
            const callback = socketListeners['connection-status'];
            expect(callback).toBeDefined();

            // Test connected
            await act(() => callback('connected'));
            expect(useStore.getState().connectionStatus).toBe('connected');
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', expect.anything());
            expect(webSocketService.send).toHaveBeenCalledWith('get-bandcamp-playlists');
            expect(webSocketService.send).toHaveBeenCalledWith('get-radio-stations');

            jest.clearAllMocks();

            // Test disconnected (implicit/network error)
            await act(() => callback('disconnected'));
            expect(useStore.getState().connectionStatus).toBe('disconnected');
            expect(webSocketService.send).not.toHaveBeenCalled();
            // Checking if removeItem was NOT called with 'last_ip'
            // We need to spy on ensure AsyncStorage.removeItem is mocked or spied.
            // It is imported from @react-native-async-storage/async-storage which is likely mocked globally or in setups.
            // But here it imports default AsyncStorage.
            // The file imports: import AsyncStorage from '@react-native-async-storage/async-storage';
            // And useStore calls AsyncStorage.removeItem.
            // We should expect it NOT to be called for implicit.
            expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('last_ip');

            // Test disconnected (explicit)
            await act(() => callback('disconnected', true));
            expect(useStore.getState().connectionStatus).toBe('disconnected');
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith('last_ip');
        });

        it('should handle errors in state-changed sync', async () => {
            const callback = socketListeners['state-changed'];
            expect(callback).toBeDefined();

            // Make TrackPlayer.play throw
            (TrackPlayer.play as jest.Mock).mockImplementation(() => { throw new Error('Player error'); });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await act(async () => {
                await callback({ isPlaying: true });
            });

            expect(consoleSpy).toHaveBeenCalledWith('Failed to sync TrackPlayer state', expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('refresh collection with force server refresh', async () => {
            // Default refresh (reset=false)
            await act(() => useStore.getState().refreshCollection());
            expect(useStore.getState().isCollectionLoading).toBe(true);
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: false,
                query: '',
                offset: 0,
                limit: 50,
                sortKey: 'default',
                sortDirection: 'asc',
                includeWishlist: false,
                dedupeEnabled: true,
                filterAlbums: true,
                filterTracks: true,
                filterWishlist: true
            });

            jest.clearAllMocks();

            // Force refresh (pull-to-refresh, reset=true)
            await act(() => useStore.getState().refreshCollection(true, '', true));
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: true,
                offset: 0,
                limit: 50,
                query: '',
                sortKey: 'default',
                sortDirection: 'asc',
                includeWishlist: false,
                dedupeEnabled: true,
                filterAlbums: true,
                filterTracks: true,
                filterWishlist: true
            });

            jest.clearAllMocks();

            // Search refresh (use cache, reset=true)
            await act(() => useStore.getState().refreshCollection(true, 'test', false));
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: false,
                offset: 0,
                limit: 50,
                query: 'test',
                sortKey: 'default',
                sortDirection: 'asc',
                includeWishlist: false,
                dedupeEnabled: true,
                filterAlbums: true,
                filterTracks: true,
                filterWishlist: true
            });
        });

        it('should fetch from scraper on fresh start (standalone)', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { mobileScraperService } = require('../services/MobileScraperService');

            useStore.setState({
                mode: 'standalone',
                auth: { isAuthenticated: true, user: { id: 'u1', profileUrl: 'url' } as any },
                connectionStatus: 'connected'
            });

            // Mock DB to return empty (both filtered and unfiltered)
            (mobileDatabase.getCollectionGranular as jest.Mock).mockResolvedValueOnce([]);
            (mobileDatabase.getCollectionTotalCount as jest.Mock).mockResolvedValueOnce(0); // filtered totalCount
            (mobileDatabase.getCollectionTotalCount as jest.Mock).mockResolvedValueOnce(0); // unfilteredCount

            // After fetch, return items
            (mobileDatabase.getCollectionGranular as jest.Mock).mockResolvedValueOnce([{ id: 'item1' } as any]);
            (mobileDatabase.getCollectionTotalCount as jest.Mock).mockResolvedValueOnce(1);

            await act(async () => {
                await useStore.getState().refreshCollection(true);
            });

            expect(mobileScraperService.fetchCollection).toHaveBeenCalledWith(false, false, expect.any(Function));
            expect(useStore.getState().collection?.items).toHaveLength(1);
            expect(mobileDatabase.getArtists).toHaveBeenCalled(); // via refreshArtists
        });

        it('should NOT fetch collection if not authenticated (standalone)', async () => {
            const { mobileScraperService } = require('../services/MobileScraperService');

            useStore.setState({
                mode: 'standalone',
                auth: { isAuthenticated: false, user: null }
            });

            await act(async () => {
                await useStore.getState().refreshCollection(true);
            });

            expect(mobileScraperService.fetchCollection).not.toHaveBeenCalled();
            expect(useStore.getState().isCollectionLoading).toBe(false);
            expect(useStore.getState().collectionError).toBeNull();
        });
    });

    describe('Additional Actions & State Management', () => {
        it('should handle toggleSimulationMode', async () => {
            useStore.setState({ isSimulationMode: false });
            // Mock refreshCollection explicitly
            const originalRefresh = useStore.getState().refreshCollection;
            useStore.setState({ refreshCollection: jest.fn() });

            await act(async () => {
                await useStore.getState().toggleSimulationMode();
            });

            expect(useStore.getState().isSimulationMode).toBe(true);
            expect(AsyncStorage.setItem).toHaveBeenCalledWith('is_simulation_mode', 'true');
            expect(useStore.getState().refreshCollection).toHaveBeenCalledWith(true, '', true);

            // Restore
            useStore.setState({ refreshCollection: originalRefresh });
        });

        it('should handle logoutBandcamp', async () => {
            const { mobileAuthService } = require('../services/MobileAuthService');
            const { mobilePlayerService } = require('../services/MobilePlayerService');

            useStore.setState({
                auth: { isAuthenticated: true, user: { id: 'u1', profileUrl: 'url' } as any },
                connectionStatus: 'connected',
                queue: { items: [{ id: '1', track: {} as any, source: 'collection' }], currentIndex: 0 }
            });

            await act(async () => {
                await useStore.getState().logoutBandcamp();
            });

            expect(mobileAuthService.logout).toHaveBeenCalled();
            expect(mobilePlayerService.stop).toHaveBeenCalled();
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith('standalone_queue');

            const state = useStore.getState();
            expect(state.auth.isAuthenticated).toBe(false);
            expect(state.connectionStatus).toBe('disconnected');
            expect(state.queue.items.length).toBe(0);
        });

        it('should saveQueue in standalone mode', async () => {
            const mockQueue = { items: [{ id: 'q1', track: { id: 't1' } as any, source: 'radio' as const }], currentIndex: 0 };
            useStore.setState({ mode: 'standalone', queue: mockQueue, currentTime: 45 });

            await act(async () => {
                await useStore.getState().saveQueue();
            });

            expect(AsyncStorage.setItem).toHaveBeenCalledWith('standalone_queue', JSON.stringify({ ...mockQueue, currentTime: 45, userIntendedPause: true }));
        });

        it('should NOT saveQueue in remote mode', async () => {
            useStore.setState({ mode: 'remote' });
            (AsyncStorage.setItem as jest.Mock).mockClear();

            await act(async () => {
                await useStore.getState().saveQueue();
            });

            expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('standalone_queue', expect.any(String));
        });
    });

    describe('Standalone Error Handlers for Play Actions', () => {
        it('playAlbum standalone logs error if fetch fails', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockRejectedValueOnce(new Error('Network error'));

            await act(async () => {
                await useStore.getState().playAlbum('bad-url');
            });

            expect(useStore.getState().isCollectionLoading).toBe(false);
            expect(useStore.getState().collectionError).toBe('Failed to load album details.');
        });

        it('playAlbum standalone errors when no tracks returned', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockResolvedValueOnce({ id: 'a1', tracks: [] });

            await act(async () => {
                await useStore.getState().playAlbum('empty-url');
            });

            expect(useStore.getState().collectionError).toBe('No tracks found in this album.');
        });

        it('playStation standalone logs error if stream fetch fails', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getStationStreamUrl.mockRejectedValueOnce(new Error('Network error'));

            const station = { id: 10, name: 'Err Radio' } as any;

            await act(() => {
                useStore.getState().playStation(station);
            });

            await waitFor(() => {
                expect(useStore.getState().collectionError).toBe('Failed to load station stream.');
            });
            expect(useStore.getState().isCollectionLoading).toBe(false);
        });
    });

    describe('Local Refresh Actions', () => {
        it('should call loadMoreCollection', async () => {
            useStore.setState({ mode: 'remote' });
            await act(() => useStore.getState().loadMoreCollection());
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: false,
                offset: 0,
                limit: 50,
                query: '',
                sortKey: 'default',
                sortDirection: 'asc',
                includeWishlist: false,
                dedupeEnabled: true,
                filterAlbums: true,
                filterTracks: true,
                filterWishlist: true
            });
        });

        it('should refreshPlaylists from the mirror in both modes', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { playlistSyncService } = require('../services/PlaylistSyncService');
            (webSocketService.isConnected as jest.Mock).mockReturnValue(true);

            // Remote: the mirror is still the read source, and the desktop is synced into it
            // rather than queried for a list to display.
            useStore.setState({ mode: 'remote' });
            await act(() => useStore.getState().refreshPlaylists());
            expect(mobileDatabase.getAllPlaylists).toHaveBeenCalled();
            expect(playlistSyncService.sync).toHaveBeenCalled();

            jest.clearAllMocks();

            // Standalone with the background socket up: still synced. Gating this on the
            // mode is what made desktop-side changes invisible on a standalone phone.
            useStore.setState({ mode: 'standalone' });
            (webSocketService.isConnected as jest.Mock).mockReturnValue(true);
            mobileDatabase.getAllPlaylists.mockResolvedValueOnce([{ id: 'p1' }]);
            await act(() => useStore.getState().refreshPlaylists());
            expect(mobileDatabase.getAllPlaylists).toHaveBeenCalled();
            expect(playlistSyncService.sync).toHaveBeenCalled();

            jest.clearAllMocks();

            // Socket down: the mirror still reads, nothing tries to sync.
            (webSocketService.isConnected as jest.Mock).mockReturnValue(false);
            await act(() => useStore.getState().refreshPlaylists());
            expect(mobileDatabase.getAllPlaylists).toHaveBeenCalled();
            expect(playlistSyncService.sync).not.toHaveBeenCalled();
        });

        it('should refreshRadio remotely and locally', async () => {
            useStore.setState({ mode: 'remote' });
            await act(() => useStore.getState().refreshRadio());
            expect(webSocketService.send).toHaveBeenCalledWith('get-radio-stations');

            jest.clearAllMocks();

            useStore.setState({ mode: 'standalone' });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getRadioStations.mockResolvedValueOnce([{ id: 1 }]);
            await act(() => useStore.getState().refreshRadio());
            expect(mobileScraperService.getRadioStations).toHaveBeenCalled();
        });

        it('should refreshArtists remotely and locally', async () => {
            useStore.setState({ mode: 'remote' });
            await act(() => useStore.getState().refreshArtists());
            expect(webSocketService.send).toHaveBeenCalledWith('get-artists');

            jest.clearAllMocks();

            useStore.setState({ mode: 'standalone', auth: { isAuthenticated: true, user: { id: 'u1' } as any } });
            const { mobileDatabase } = require('../services/MobileDatabase');
            await act(() => useStore.getState().refreshArtists());
            expect(mobileDatabase.getArtists).toHaveBeenCalled();
        });

        it('should handle setDedupeEnabled', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            
            await act(async () => {
                await useStore.getState().setDedupeEnabled(true);
            });
            expect(useStore.getState().dedupeEnabled).toBe(true);
            expect(mobileDatabase.setSetting).toHaveBeenCalledWith('dedupe_enabled', true);

            await act(async () => {
                await useStore.getState().setDedupeEnabled(false);
            });
            expect(useStore.getState().dedupeEnabled).toBe(false);
            expect(mobileDatabase.setSetting).toHaveBeenCalledWith('dedupe_enabled', false);
        });

        it('should handle setCollectionSortKey', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            
            await act(async () => {
                await useStore.getState().setCollectionSortKey('artist');
            });
            expect(useStore.getState().collectionSortKey).toBe('artist');
            expect(mobileDatabase.setSetting).toHaveBeenCalledWith('collection_sort_key', 'artist');
        });

        it('should handle setCollectionSortDirection', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            
            await act(async () => {
                await useStore.getState().setCollectionSortDirection('desc');
            });
            expect(useStore.getState().collectionSortDirection).toBe('desc');
            expect(mobileDatabase.setSetting).toHaveBeenCalledWith('collection_sort_direction', 'desc');
        });
    });

    describe('Enhanced Queue & Playlist Logic (Standalone)', () => {
        it('addTrackToQueue should fetch details for Unknown Artist', async () => {
            useStore.setState({ mode: 'standalone', auth: { isAuthenticated: true, user: { id: 'u1' } as any } });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockResolvedValueOnce({
                id: 'a1',
                artist: 'Real Artist',
                tracks: [{ id: 't1', title: 'Track 1', artist: 'Real Artist', bandcampUrl: 'url' }]
            });

            const track = { id: 't1', title: 'Track 1', artist: 'Unknown Artist', bandcampUrl: 'url' } as any;

            await act(async () => {
                await useStore.getState().addTrackToQueue(track, false);
            });

            expect(mobileScraperService.getAlbumDetails).toHaveBeenCalledWith('url');
            const queue = useStore.getState().queue;
            // The added item will be at index 0 because we reset the queue in beforeEach
            expect(queue.items[0].track.artist).toBe('Real Artist');
        });

        it('addAlbumToQueue should fetch if tracks not provided', async () => {
            useStore.setState({ mode: 'standalone', queue: { items: [], currentIndex: -1 } });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockResolvedValueOnce({
                id: 'a1',
                tracks: [{ id: 't1', title: 'T1' }, { id: 't2', title: 'T2' }]
            });

            await act(() => {
                useStore.getState().addAlbumToQueue('album-url', false);
            });

            await waitFor(() => {
                expect(useStore.getState().queue.items.length).toBe(2);
            });
            expect(mobileScraperService.getAlbumDetails).toHaveBeenCalledWith('album-url');
        });

        it('removeFromQueue should adjust currentIndex', async () => {
            useStore.setState({
                queue: {
                    items: [
                        { id: '1', track: {} as any, source: 'collection' },
                        { id: '2', track: {} as any, source: 'collection' },
                        { id: '3', track: {} as any, source: 'collection' }
                    ],
                    currentIndex: 2
                }
            });

            await act(() => useStore.getState().removeFromQueue('1'));
            expect(useStore.getState().queue.currentIndex).toBe(1);
            expect(useStore.getState().queue.items.length).toBe(2);

            await act(() => useStore.getState().removeFromQueue('3'));
            expect(useStore.getState().queue.currentIndex).toBe(0);
        });

        it('addTrackToPlaylist with details fetch', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockResolvedValueOnce({
                tracks: [{ id: 't1', title: 'T1', artist: 'Real Artist', duration: 120 }]
            });

            const track = { id: 't1', title: 'T1', artist: 'Unknown Artist', duration: 0, bandcampUrl: 'u' } as any;
            await act(async () => {
                await useStore.getState().addTrackToPlaylist('p1', track);
            });

            expect(mobileDatabase.addTrackToPlaylist).toHaveBeenCalledWith('p1', expect.objectContaining({
                artist: 'Real Artist',
                duration: 120
            }));
            // The entry id the mirror assigned travels with the op so the desktop reuses it.
            expect(mobileDatabase.enqueuePlaylistOp).toHaveBeenCalledWith('add-track-to-playlist', {
                playlistId: 'p1',
                tracks: [{ entryId: 'e1', track: expect.objectContaining({ artist: 'Real Artist' }) }]
            });
        });

        it('addAlbumToPlaylist should fetch and loop add tracks', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getAlbumDetails.mockResolvedValueOnce({
                artist: 'The Band',
                tracks: [{ id: 't1' }, { id: 't2' }]
            });

            await act(async () => {
                await useStore.getState().addAlbumToPlaylist('p1', 'url');
            });

            expect(mobileDatabase.addTrackToPlaylist).toHaveBeenCalledTimes(2);
        });

        it('handle local create/rename/delete playlist', async () => {
            useStore.setState({ mode: 'standalone' });
            const { mobileDatabase } = require('../services/MobileDatabase');

            await act(async () => {
                useStore.getState().createPlaylist('New', 'Desc');
            });
            expect(mobileDatabase.createPlaylist).toHaveBeenCalledWith('New');

            await act(async () => {
                useStore.getState().renamePlaylist('p1', 'Renamed');
            });
            expect(mobileDatabase.renamePlaylist).toHaveBeenCalledWith('p1', 'Renamed');

            await act(async () => {
                useStore.getState().deletePlaylist('p1');
            });
            expect(mobileDatabase.deletePlaylist).toHaveBeenCalledWith('p1');

            // Every offline edit is also queued for replay on the desktop.
            expect(mobileDatabase.enqueuePlaylistOp).toHaveBeenCalledWith('create-playlist', { id: 'p-new', name: 'New' });
            expect(mobileDatabase.enqueuePlaylistOp).toHaveBeenCalledWith('update-playlist', { id: 'p1', name: 'Renamed' });
            expect(mobileDatabase.enqueuePlaylistOp).toHaveBeenCalledWith('delete-playlist', 'p1');
        });

        it('loadMoreCollection standalone', async () => {
            useStore.setState({
                mode: 'standalone',
                auth: { isAuthenticated: true, user: { id: 'u1' } as any },
                collection: { items: [{ id: '1' }], totalCount: 2 } as any,
                collectionOffset: 1,
                hasMoreCollection: true
            });
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.getCollectionGranular.mockResolvedValueOnce([{ id: '2' }]);

            await act(async () => {
                await useStore.getState().loadMoreCollection();
            });

            const state = useStore.getState();
            expect(state.collection!.items.length).toBe(2);
            expect(state.collectionOffset).toBe(2);
            expect(state.hasMoreCollection).toBe(false);
        });

        it('refreshArtistCollection standalone', async () => {
            useStore.setState({ mode: 'standalone', auth: { isAuthenticated: true } as any });
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.fetchCollection.mockResolvedValueOnce({
                items: [
                    { id: '1', type: 'album', album: { artistId: 'a1', artist: 'A1' } },
                    { id: '2', type: 'album', album: { artistId: 'a2', artist: 'A2' } }
                ]
            });

            await act(async () => {
                await useStore.getState().refreshArtistCollection('a1');
            });

            expect(useStore.getState().artistCollection!.items.length).toBe(1);
            expect(useStore.getState().isArtistCollectionLoading).toBe(false);
        });

        it('additional coverage cases: themes, simulation, search query', async () => {
            await act(async () => {
                await useStore.getState().setTheme('light');
            });
            expect(useStore.getState().theme).toBe('light');

            useStore.setState({ isSimulationMode: false });
            await act(async () => {
                await useStore.getState().toggleSimulationMode();
            });
            expect(useStore.getState().isSimulationMode).toBe(true);

            useStore.setState({ mode: 'standalone', isShuffled: false, repeatMode: 'off' });
            await act(async () => {
                useStore.getState().setRadioSearchQuery('test');
                await useStore.getState().toggleShuffle();
                await useStore.getState().setRepeat('one');
            });
            expect(useStore.getState().radioSearchQuery).toBe('test');
            expect(useStore.getState().isShuffled).toBe(true);
            expect(useStore.getState().repeatMode).toBe('one');
        });
    });
});

// The desktop owns the sync mode; the phone mirrors it and gates its own writes on it.
describe('Playlist sync modes', () => {
    const { mobileDatabase } = require('../services/MobileDatabase');
    const { Alert } = require('react-native');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Alert, 'alert').mockImplementation(() => { });
        useStore.setState({
            mode: 'remote',
            connectionStatus: 'connected',
            playlistSyncEnabled: true,
            playlistSyncMode: 'two-way',
        });
        (webSocketService.isConnected as jest.Mock).mockReturnValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('pushes edits straight to the desktop in two-way mode', async () => {
        await act(async () => { useStore.getState().createPlaylist('P'); });

        expect(webSocketService.send).toHaveBeenCalledWith('create-playlist', { name: 'P', description: undefined });
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('blocks every playlist mutation in desktop-to-mobile', async () => {
        useStore.setState({ playlistSyncMode: 'desktop-to-mobile' });
        const s = useStore.getState();

        await act(async () => {
            s.createPlaylist('P');
            s.renamePlaylist('p1', 'P2');
            s.deletePlaylist('p1');
            await s.addTrackToPlaylist('p1', { id: 't1' } as any);
            s.removeTrackFromPlaylist('p1', 'e1');
            s.reorderPlaylistTracks('p1', 0, 1);
            await s.addAlbumToPlaylist('p1', 'url');
            await s.addStationToPlaylist('p1', { id: 'st1' } as any);
            await s.extractRadioToPlaylist('p1', { id: 'st1' } as any);
            await s.importPlaylist();
        });

        expect(Alert.alert).toHaveBeenCalledTimes(10);
        expect(webSocketService.send).not.toHaveBeenCalled();
        expect(mobileDatabase.createPlaylist).not.toHaveBeenCalled();
        expect(mobileDatabase.addTrackToPlaylist).not.toHaveBeenCalled();
    });

    /** `refreshPlaylists` legitimately sends `get-bandcamp-playlists`; ignore reads. */
    const mutatingSends = () => (webSocketService.send as jest.Mock).mock.calls
        .filter(([type]) => String(type).includes('playlist') && !String(type).startsWith('get-'));

    it('stays editable but silent when sync is disabled', async () => {
        useStore.setState({ playlistSyncMode: 'disabled' });

        await act(async () => { useStore.getState().createPlaylist('Local only'); });

        // Editable, written locally, but nothing is sent or queued for replay.
        expect(mobileDatabase.createPlaylist).toHaveBeenCalledWith('Local only');
        expect(mutatingSends()).toHaveLength(0);
        expect(mobileDatabase.enqueuePlaylistOp).not.toHaveBeenCalled();
    });

    it('queuePlaylistOp is inert when pushes are not allowed', async () => {
        useStore.setState({ playlistSyncMode: 'desktop-to-mobile' });

        await act(async () => { useStore.getState().queuePlaylistOp('delete-playlist', 'p1'); });

        expect(mobileDatabase.enqueuePlaylistOp).not.toHaveBeenCalled();
    });

    it('the phone switch alone stops pushes but keeps editing', async () => {
        useStore.setState({ playlistSyncEnabled: false });

        await act(async () => { useStore.getState().createPlaylist('P'); });

        expect(mutatingSends()).toHaveLength(0);
        expect(mobileDatabase.createPlaylist).toHaveBeenCalledWith('P');
        expect(mobileDatabase.enqueuePlaylistOp).not.toHaveBeenCalled();
    });

    it('persists the switch and mirrors the desktop mode after a sync', async () => {
        const { playlistSyncService } = require('../services/PlaylistSyncService');
        playlistSyncService.getMode.mockReturnValue('mobile-to-desktop');

        await act(async () => { await useStore.getState().togglePlaylistSync(); });
        await act(async () => { await useStore.getState().syncPlaylists(); });

        expect(mobileDatabase.setSetting).toHaveBeenCalledWith('playlistSyncEnabled', false);
        expect(useStore.getState().playlistSyncEnabled).toBe(false);
        expect(useStore.getState().playlistSyncMode).toBe('mobile-to-desktop');
    });
});
