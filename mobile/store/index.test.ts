import { useStore } from './index';
import { webSocketService } from '../services/WebSocketService';
import { DiscoveryService } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';
import TrackPlayer from 'react-native-track-player';
import { addTrack } from '../services/player';

// Mock TrackPlayer
jest.mock('react-native-track-player', () => ({
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    getProgress: jest.fn().mockResolvedValue({ position: 0, duration: 0 }),
    getPlaybackState: jest.fn().mockResolvedValue({ state: 'none' }),
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
        setVolume: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn().mockResolvedValue(undefined),
        next: jest.fn().mockResolvedValue(undefined),
        previous: jest.fn().mockResolvedValue(undefined),
        seek: jest.fn().mockResolvedValue(undefined),
        toggleShuffle: jest.fn().mockResolvedValue(undefined),
        setRepeat: jest.fn().mockResolvedValue(undefined),
        playQueueIndex: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        loadTrack: jest.fn().mockResolvedValue(true),
    },
}));

jest.mock('../services/MobileDatabase', () => ({
    mobileDatabase: {
        getSettings: jest.fn().mockResolvedValue({ standalone_volume: 0.8 }),
        setSetting: jest.fn().mockResolvedValue(undefined),
        getArtists: jest.fn().mockResolvedValue([]),
        getAllPlaylists: jest.fn().mockResolvedValue([]),
        addTrackToPlaylist: jest.fn().mockResolvedValue(undefined),
        createPlaylist: jest.fn().mockResolvedValue(undefined),
        renamePlaylist: jest.fn().mockResolvedValue(undefined),
        deletePlaylist: jest.fn().mockResolvedValue(undefined),
        getCollectionGranular: jest.fn().mockResolvedValue([]),
        getCollectionTotalCount: jest.fn().mockResolvedValue(0),
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
    beforeEach(() => {
        jest.useFakeTimers();
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
        });

        jest.clearAllMocks();
        AsyncStorage.clear();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
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
        act(() => {
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

    it('should connect to a host', async () => {
        const ip = '192.168.1.10';
        await act(async () => {
            await useStore.getState().connect(ip);
        });

        expect(useStore.getState().hostIp).toBe(ip);
        expect(useStore.getState().connectionStatus).toBe('connecting');
        expect(webSocketService.connect).toHaveBeenCalledWith(ip);
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

        expect(webSocketService.connect).toHaveBeenCalledWith('192.168.1.20');
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

        await act(async () => {
            await useStore.getState().startScan();
        });

        expect(DiscoveryService.scanNetwork).toHaveBeenCalled();
        expect(webSocketService.connect).toHaveBeenCalledWith('192.168.1.30');
    });

    describe('Playback Controls', () => {
        it('should send play command', () => {
            act(() => useStore.getState().play());
            expect(webSocketService.send).toHaveBeenCalledWith('play');
        });

        it('should send pause command', () => {
            act(() => useStore.getState().pause());
            expect(webSocketService.send).toHaveBeenCalledWith('pause');
        });

        it('should send next command', () => {
            act(() => useStore.getState().next());
            expect(webSocketService.send).toHaveBeenCalledWith('next');
        });

        it('should send previous command', () => {
            act(() => useStore.getState().previous());
            expect(webSocketService.send).toHaveBeenCalledWith('previous');
        });

        it('should send seek command', () => {
            act(() => useStore.getState().seek(30));
            expect(webSocketService.send).toHaveBeenCalledWith('seek', 30);
        });

        it('should send setVolume command', () => {
            act(() => useStore.getState().setVolume(0.5));
            expect(webSocketService.send).toHaveBeenCalledWith('set-volume', 0.5);
        });

        it('should send toggleShuffle command', () => {
            act(() => useStore.getState().toggleShuffle());
            expect(webSocketService.send).toHaveBeenCalledWith('toggle-shuffle');
        });

        it('should send setRepeat command', () => {
            act(() => useStore.getState().setRepeat('one'));
            expect(webSocketService.send).toHaveBeenCalledWith('set-repeat', 'one');
        });
    });

    describe('Content Actions', () => {
        const mockTrack = { id: 't1' } as any;
        const mockStation = { name: 'Radio' } as any;

        it('should play track', () => {
            act(() => useStore.getState().playTrack(mockTrack));
            expect(webSocketService.send).toHaveBeenCalledWith('play-track', mockTrack);
        });

        it('should play album', () => {
            act(() => useStore.getState().playAlbum('url'));
            expect(webSocketService.send).toHaveBeenCalledWith('play-album', 'url');
        });

        it('should play playlist', () => {
            act(() => useStore.getState().playPlaylist('p1'));
            expect(webSocketService.send).toHaveBeenCalledWith('play-playlist', 'p1');
        });

        it('should play station', () => {
            act(() => useStore.getState().playStation(mockStation));
            expect(webSocketService.send).toHaveBeenCalledWith('play-station', mockStation);
        });

        it('should add station to queue', () => {
            act(() => useStore.getState().addStationToQueue(mockStation, true));
            expect(webSocketService.send).toHaveBeenCalledWith('add-station-to-queue', { station: mockStation, playNext: true });
        });

        it('should add track to queue', () => {
            act(() => useStore.getState().addTrackToQueue(mockTrack, false));
            expect(webSocketService.send).toHaveBeenCalledWith('add-track-to-queue', { track: mockTrack, playNext: false });
        });

        it('should add album to queue', () => {
            act(() => useStore.getState().addAlbumToQueue('url', true));
            expect(webSocketService.send).toHaveBeenCalledWith('add-album-to-queue', { albumUrl: 'url', playNext: true });
        });

        it('should add track to playlist', () => {
            act(() => useStore.getState().addTrackToPlaylist('p1', mockTrack));
            expect(webSocketService.send).toHaveBeenCalledWith('add-track-to-playlist', { playlistId: 'p1', track: mockTrack });
        });

        it('should add album to playlist', () => {
            act(() => useStore.getState().addAlbumToPlaylist('p1', 'url'));
            expect(webSocketService.send).toHaveBeenCalledWith('add-album-to-playlist', { playlistId: 'p1', albumUrl: 'url' });
        });

        it('should add station to playlist', () => {
            act(() => useStore.getState().addStationToPlaylist('p1', mockStation));
            expect(webSocketService.send).toHaveBeenCalledWith('add-station-to-playlist', { playlistId: 'p1', station: mockStation });
        });

        it('should play queue index', () => {
            act(() => useStore.getState().playQueueIndex(5));
            expect(webSocketService.send).toHaveBeenCalledWith('play-queue-index', 5);
        });

        it('should remove from queue', () => {
            // Setup initial queue
            useStore.setState({
                queue: {
                    items: [{ id: 'q1', track: mockTrack, source: 'collection' }],
                    currentIndex: 0
                }
            });

            act(() => useStore.getState().removeFromQueue('q1'));

            expect(webSocketService.send).toHaveBeenCalledWith('remove-from-queue', 'q1');
            expect(useStore.getState().queue.items).toHaveLength(0);
        });

        it('should clear queue', () => {
            // Setup initial queue
            useStore.setState({
                queue: {
                    items: [{ id: 'q1', track: mockTrack, source: 'collection' }],
                    currentIndex: 0
                }
            });

            act(() => useStore.getState().clearQueue());

            // clearQueue keeps current item if playing
            expect(useStore.getState().queue.items).toHaveLength(1);
            expect(webSocketService.send).toHaveBeenCalledWith('clear-queue');
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

        it('should handle collection-data event', () => {
            const callback = socketListeners['collection-data'];
            expect(callback).toBeDefined();

            const mockCollection = { items: [], totalCount: 0, lastUpdated: new Date().toISOString() };

            act(() => callback(mockCollection));
            expect(useStore.getState().collection).toEqual(mockCollection);
        });

        it('should handle playlists-data event', () => {
            const callback = socketListeners['playlists-data'];
            expect(callback).toBeDefined();

            const mockPlaylists = [{ id: 'p1' }];

            act(() => callback(mockPlaylists));
            expect(useStore.getState().playlists).toBe(mockPlaylists);
        });

        it('should handle radio-data event', () => {
            const callback = socketListeners['radio-data'];
            expect(callback).toBeDefined();

            const mockStations = [{ name: 'Radio' }];

            act(() => callback(mockStations));
            expect(useStore.getState().radioStations).toBe(mockStations);
        });


        it('should handle time-update and sync TrackPlayer', async () => {
            const callback = socketListeners['time-update'];
            expect(callback).toBeDefined();

            (TrackPlayer.getProgress as jest.Mock).mockResolvedValue({ position: 10 });

            // Diff > 2s (15 - 10 = 5)
            await act(async () => {
                await callback({ currentTime: 15 });
            });

            expect(useStore.getState().currentTime).toBe(15);
            expect(TrackPlayer.seekTo).toHaveBeenCalledWith(15);

            jest.clearAllMocks();

            // Diff < 2s (11 - 10 = 1)
            (TrackPlayer.getProgress as jest.Mock).mockResolvedValue({ position: 10 });
            await act(async () => {
                await callback({ currentTime: 11 });
            });
            expect(TrackPlayer.seekTo).not.toHaveBeenCalled();
        });

        it('should handle connection-status event', () => {
            const callback = socketListeners['connection-status'];
            expect(callback).toBeDefined();

            // Test connected
            act(() => callback('connected'));
            expect(useStore.getState().connectionStatus).toBe('connected');
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', expect.anything());
            expect(webSocketService.send).toHaveBeenCalledWith('get-playlists');
            expect(webSocketService.send).toHaveBeenCalledWith('get-radio-stations');

            jest.clearAllMocks();

            // Test disconnected (implicit/network error)
            act(() => callback('disconnected'));
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
            act(() => callback('disconnected', true));
            expect(useStore.getState().connectionStatus).toBe('disconnected');
            expect(AsyncStorage.removeItem).toHaveBeenCalledWith('last_ip');
        });

        it('should handle errors in state-changed sync', async () => {
            const callback = socketListeners['state-changed'];
            expect(callback).toBeDefined();

            // Make TrackPlayer.play throw
            (TrackPlayer.play as jest.Mock).mockRejectedValue(new Error('Player error'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            await act(async () => {
                await callback({ isPlaying: true });
            });

            expect(consoleSpy).toHaveBeenCalledWith('Failed to sync TrackPlayer state', expect.any(Error));
            consoleSpy.mockRestore();
        });

        it('refresh collection with force server refresh', () => {
            // Default refresh (reset=false)
            act(() => useStore.getState().refreshCollection());
            expect(useStore.getState().isCollectionLoading).toBe(true);
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: false,
                query: '',
                offset: 0,
                limit: 50
            });

            jest.clearAllMocks();

            // Force refresh (pull-to-refresh, reset=true)
            act(() => useStore.getState().refreshCollection(true, '', true));
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: true,
                offset: 0,
                limit: 50,
                query: ''
            });

            jest.clearAllMocks();

            // Search refresh (use cache, reset=true)
            act(() => useStore.getState().refreshCollection(true, 'test', false));
            expect(webSocketService.send).toHaveBeenCalledWith('get-collection', {
                forceRefresh: false,
                offset: 0,
                limit: 50,
                query: 'test'
            });
        });

        it('should fetch from scraper on fresh start (standalone)', async () => {
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { mobileScraperService } = require('../services/MobileScraperService');

            useStore.setState({
                mode: 'standalone',
                auth: { isAuthenticated: true, user: { id: 'u1', profileUrl: 'url' } as any }
            });

            // Mock DB to return empty
            (mobileDatabase.getCollectionGranular as jest.Mock).mockResolvedValueOnce([]);
            (mobileDatabase.getCollectionTotalCount as jest.Mock).mockResolvedValueOnce(0);

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
    });
});