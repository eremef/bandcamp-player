import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, initializeStoreSubscriptions } from './store';
import { act } from '@testing-library/react';

// Mock the window.electron object since the store calls it directly
const mockElectron = {
    auth: {
        login: vi.fn(),
        logout: vi.fn(),
        checkSession: vi.fn(),
        onAuthChanged: vi.fn(),
    },
    player: {
        play: vi.fn(),
        pause: vi.fn(),
        togglePlay: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        toggleMute: vi.fn(),
        toggleShuffle: vi.fn(),
        setRepeat: vi.fn(),
        getState: vi.fn(),
        onStateChanged: vi.fn(),
        onTrackChanged: vi.fn(),
        onTimeUpdate: vi.fn(),
    },
    queue: {
        addTrack: vi.fn(),
        addAlbum: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        reorder: vi.fn(),
        playIndex: vi.fn(),
        addTracks: vi.fn(),
        onUpdated: vi.fn(),
    },
    collection: {
        fetch: vi.fn(),
        refresh: vi.fn(),
        search: vi.fn(),
        getAlbum: vi.fn(),
        onUpdated: vi.fn(),
        onRefreshStarted: vi.fn(),
    },
    playlist: {
        getAll: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        addTrack: vi.fn(),
        addTracks: vi.fn(),
        removeTrack: vi.fn(),
        onUpdated: vi.fn(),
    },
    settings: {
        get: vi.fn(),
        set: vi.fn(),
        onChanged: vi.fn(),
    },
    cache: {
        downloadTrack: vi.fn(),
        deleteTrack: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn(),
        onStatsUpdated: vi.fn(),
    },
    scrobbler: {
        connect: vi.fn(),
        disconnect: vi.fn(),
        getState: vi.fn(),
        onStateChanged: vi.fn(),
    },
    radio: {
        getStations: vi.fn(),
        playStation: vi.fn(),
        stop: vi.fn(),
        addToQueue: vi.fn(),
        addToPlaylist: vi.fn(),
        onStateChanged: vi.fn(),
        onStationsUpdated: vi.fn(),
    },
    remote: {
        getStatus: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        getConnectedDevices: vi.fn(),
        disconnectDevice: vi.fn(),
        onStatusChanged: vi.fn(),
        onConnectionsChanged: vi.fn(),
    },
    window: {
        toggleMiniPlayer: vi.fn(),
    },
    update: {
        check: vi.fn(),
        install: vi.fn(),
        onChecking: vi.fn(),
        onAvailable: vi.fn(),
        onNotAvailable: vi.fn(),
        onError: vi.fn(),
        onProgress: vi.fn(),
        onDownloaded: vi.fn(),
    },
    cast: {
        startDiscovery: vi.fn(),
        stopDiscovery: vi.fn(),
        getDevices: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        onDevicesUpdated: vi.fn(),
        onStatusChanged: vi.fn(),
    },
};

// Assign to window
// Assign to window
Object.defineProperty(window, 'electron', {
    value: mockElectron,
    writable: true,
    configurable: true // Allow re-mocking
});

describe('useStore', () => {
    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Ensure mock functions are fresh
        mockElectron.collection.onUpdated.mockReset();
        mockElectron.collection.onRefreshStarted.mockReset();

        useStore.setState({
            auth: { isAuthenticated: false, user: null },
            player: {
                isPlaying: false,
                currentTrack: null,
                currentTime: 0,
                duration: 0,
                volume: 0.8,
                isMuted: false,
                repeatMode: 'off',
                isShuffled: false,
                isCasting: false,
                castDevice: undefined,
                queue: { items: [], currentIndex: -1 },
            },
            queue: { items: [], currentIndex: -1 },
            castDevices: [],
            castStatus: { status: 'disconnected' },
            playlists: [],
            selectedPlaylist: null,
            selectedAlbum: null,
            settings: null,
            radioStations: [],
            collection: null,
            isLoadingCollection: false,
            collectionError: null,
            cacheStats: null,
            downloadingTracks: new Set(),
            remoteStatus: null,
            currentView: 'collection',
            isQueueVisible: false,
            isMiniPlayer: false,
            isSettingsOpen: false,
            toast: null,
        });
        mockElectron.scrobbler.getState.mockResolvedValue({ isConnected: false, user: null });
        mockElectron.player.getState.mockResolvedValue({
            isPlaying: false,
            currentTrack: null,
            currentTime: 0,
            duration: 0,
            volume: 0.8,
            isMuted: false,
            repeatMode: 'off',
            isShuffled: false,
            queue: { items: [], currentIndex: -1 },
        });
        vi.clearAllMocks();
    });

    // --- Auth Slice Tests ---
    it('should set auth state', () => {
        const authData = {
            isAuthenticated: true,
            user: {
                id: '1',
                username: 'test',
                profileUrl: 'http://test.com'
            }
        };

        act(() => {
            useStore.getState().setAuth(authData);
        });

        expect(useStore.getState().auth).toEqual(authData);
    });

    it('should call electron.auth.login on login', async () => {
        const mockAuthResult = {
            isAuthenticated: true,
            user: { id: '1', username: 'test', profileUrl: '' }
        };
        mockElectron.auth.login.mockResolvedValue(mockAuthResult);
        mockElectron.collection.fetch.mockResolvedValue({ items: [], totalCount: 0 });
        mockElectron.playlist.getAll.mockResolvedValue([]);

        await act(async () => {
            await useStore.getState().login();
        });

        expect(mockElectron.auth.login).toHaveBeenCalled();
        expect(useStore.getState().auth).toEqual(mockAuthResult);
        expect(mockElectron.collection.fetch).toHaveBeenCalled();
        expect(mockElectron.playlist.getAll).toHaveBeenCalled();
    });

    it('should handle logout', async () => {
        await act(async () => {
            await useStore.getState().logout();
        });
        expect(mockElectron.auth.logout).toHaveBeenCalled();
        expect(useStore.getState().auth.isAuthenticated).toBe(false);
        expect(useStore.getState().collection).toBeNull();
    });

    it('should check session', async () => {
        const mockAuthResult = {
            isAuthenticated: true,
            user: { id: '1', username: 'test', profileUrl: '' }
        };
        mockElectron.auth.checkSession.mockResolvedValue(mockAuthResult);

        await act(async () => {
            await useStore.getState().checkSession();
        });
        expect(mockElectron.auth.checkSession).toHaveBeenCalled();
        expect(useStore.getState().auth).toEqual(mockAuthResult);
    });

    // --- Player Slice Tests ---
    it('should update player state', () => {
        act(() => {
            useStore.getState().setPlayerState({ isPlaying: true });
        });

        expect(useStore.getState().player.isPlaying).toBe(true);
    });

    it('should call electron.player methods', async () => {
        await act(async () => {
            await useStore.getState().play();
            await useStore.getState().pause();
            await useStore.getState().togglePlay();
            await useStore.getState().next();
            await useStore.getState().previous();
            await useStore.getState().seek(10);
            await useStore.getState().setVolume(0.5);
            await useStore.getState().toggleMute();
            await useStore.getState().toggleShuffle();
            await useStore.getState().setRepeat('one');
        });

        expect(mockElectron.player.play).toHaveBeenCalled();
        expect(mockElectron.player.pause).toHaveBeenCalled();
        expect(mockElectron.player.togglePlay).toHaveBeenCalled();
        expect(mockElectron.player.next).toHaveBeenCalled();
        expect(mockElectron.player.previous).toHaveBeenCalled();
        expect(mockElectron.player.seek).toHaveBeenCalledWith(10);
        expect(mockElectron.player.setVolume).toHaveBeenCalledWith(0.5);
        expect(mockElectron.player.toggleMute).toHaveBeenCalled();
        expect(mockElectron.player.toggleShuffle).toHaveBeenCalled();
        expect(mockElectron.player.setRepeat).toHaveBeenCalledWith('one');
    });

    // --- Queue Slice Tests ---
    it('should call electron.queue methods', async () => {
        const mockTrack = { id: '1', title: 'Test Track' } as any;
        const mockAlbum = { id: 1, title: 'Test Album' } as any;

        await act(async () => {
            await useStore.getState().addToQueue(mockTrack, true);
            await useStore.getState().addAlbumToQueue(mockAlbum);
            await useStore.getState().removeFromQueue('1');
            await useStore.getState().clearQueue(true);
            await useStore.getState().reorderQueue(0, 1);
            await useStore.getState().playQueueIndex(2);
            await useStore.getState().addTracksToQueue([mockTrack]);
        });

        expect(mockElectron.queue.addTrack).toHaveBeenCalledWith(mockTrack, true);
        expect(mockElectron.queue.addAlbum).toHaveBeenCalledWith(mockAlbum, undefined);
        expect(mockElectron.queue.remove).toHaveBeenCalledWith('1');
        expect(mockElectron.queue.clear).toHaveBeenCalledWith(true);
        expect(mockElectron.queue.reorder).toHaveBeenCalledWith(0, 1);
        expect(mockElectron.queue.playIndex).toHaveBeenCalledWith(2);
        expect(mockElectron.queue.addTracks).toHaveBeenCalledWith([mockTrack], undefined);
    });

    // --- Collection Slice Tests ---
    it('should fetch collection', async () => {
        const mockCollection = { items: [{ id: '1', title: 'Album' }] } as any;
        mockElectron.collection.fetch.mockResolvedValue(mockCollection);

        await act(async () => {
            await useStore.getState().fetchCollection();
        });

        expect(useStore.getState().isLoadingCollection).toBe(false);
        expect(useStore.getState().collection).toEqual(mockCollection);
    });

    it('should handle collection fetch error', async () => {
        mockElectron.collection.fetch.mockRejectedValue(new Error('Fetch failed'));

        await act(async () => {
            await useStore.getState().fetchCollection();
        });

        expect(useStore.getState().isLoadingCollection).toBe(false);
        expect(useStore.getState().collectionError).toBe('Fetch failed');
    });

    it('should force refresh collection', async () => {
        const mockCollection = { items: [] } as any;
        mockElectron.collection.refresh.mockResolvedValue(mockCollection);

        await act(async () => {
            await useStore.getState().fetchCollection(true);
        });

        expect(mockElectron.collection.refresh).toHaveBeenCalled();
        expect(useStore.getState().collection).toEqual(mockCollection);
    });

    it('should search collection', async () => {
        await useStore.getState().searchCollection('query');
        expect(mockElectron.collection.search).toHaveBeenCalledWith('query');
    });

    it('should get album details', async () => {
        await useStore.getState().getAlbumDetails('url');
        expect(mockElectron.collection.getAlbum).toHaveBeenCalledWith('url');
    });

    it('should select album and change view', () => {
        const mockAlbum = { id: 'a1', title: 'Album 1' } as any;
        act(() => {
            useStore.getState().selectAlbum(mockAlbum);
        });
        expect(useStore.getState().selectedAlbum).toEqual(mockAlbum);
        expect(useStore.getState().currentView).toBe('album-detail');
    });

    it('should capture source view when selecting an album', () => {
        const mockAlbum = { id: 'a1', title: 'Album 1' } as any;

        // From collection
        act(() => {
            useStore.getState().setView('collection');
            useStore.getState().selectAlbum(mockAlbum);
        });
        expect(useStore.getState().albumDetailSourceView).toBe('collection');

        // From artists
        act(() => {
            useStore.getState().setView('artists');
            useStore.getState().selectAlbum(mockAlbum);
        });
        expect(useStore.getState().albumDetailSourceView).toBe('artists');

        // Stay on album detail (should not overwrite with 'album-detail')
        act(() => {
            useStore.getState().selectAlbum(mockAlbum);
        });
        expect(useStore.getState().albumDetailSourceView).toBe('artists');
    });

    // --- Playlist Slice Tests ---
    it('should manage playlists', async () => {
        const mockPlaylists = [{ id: '1', name: 'My Playlist' }];
        const mockNewPlaylist = { id: '2', name: 'New Playlist' };

        let playlistListener: any;
        mockElectron.playlist.onUpdated.mockImplementation(cb => playlistListener = cb);
        await initializeStoreSubscriptions();

        mockElectron.playlist.getAll.mockResolvedValue(mockPlaylists);
        mockElectron.playlist.create.mockResolvedValue(mockNewPlaylist);
        mockElectron.playlist.getById.mockResolvedValue(mockPlaylists[0]);

        await act(async () => {
            await useStore.getState().fetchPlaylists();
        });
        expect(useStore.getState().playlists).toEqual(mockPlaylists);

        await act(async () => {
            await useStore.getState().createPlaylist('New Playlist', 'Desc');
            // Simulate broadcast
            playlistListener([...mockPlaylists, mockNewPlaylist]);
        });
        expect(useStore.getState().playlists).toContainEqual(mockNewPlaylist);
        expect(mockElectron.playlist.create).toHaveBeenCalledWith({ name: 'New Playlist', description: 'Desc' });

        await act(async () => {
            await useStore.getState().selectPlaylist('1');
        });
        expect(useStore.getState().selectedPlaylist).toEqual(mockPlaylists[0]);
        expect(useStore.getState().currentView).toBe('playlist-detail');
    });

    it('should update and delete playlist', async () => {
        let playlistListener: any;
        mockElectron.playlist.onUpdated.mockImplementation(cb => playlistListener = cb);
        await initializeStoreSubscriptions();

        useStore.setState({ selectedPlaylist: { id: '1', name: 'Old' } as any, selectedPlaylistId: '1' });

        await act(async () => {
            await useStore.getState().updatePlaylist('1', 'New Name');
            // Simulate broadcast
            playlistListener([{ id: '1', name: 'New Name' }]);
        });
        expect(mockElectron.playlist.update).toHaveBeenCalledWith({ id: '1', name: 'New Name', description: undefined });

        await act(async () => {
            await useStore.getState().deletePlaylist('1');
            // Simulate broadcast
            playlistListener([]);
        });
        expect(mockElectron.playlist.delete).toHaveBeenCalledWith('1');
        expect(useStore.getState().selectedPlaylist).toBeNull();
        expect(useStore.getState().currentView).toBe('playlists');
    });

    it('should add/remove tracks from playlist', async () => {
        let playlistListener: any;
        mockElectron.playlist.onUpdated.mockImplementation(cb => playlistListener = cb);
        await initializeStoreSubscriptions();

        const mockTrack = { id: 't1', title: 'Track' } as any;
        const mockPlaylist = { id: 'p1', name: 'P1' } as any;
        useStore.setState({ playlists: [mockPlaylist] });

        await act(async () => {
            await useStore.getState().addTrackToPlaylist('p1', mockTrack);
            // Simulate broadcast for count update if needed (though not verified in this test)
            playlistListener([{ ...mockPlaylist, trackCount: 1 }]);
        });
        expect(mockElectron.playlist.addTrack).toHaveBeenCalledWith('p1', mockTrack);
        expect(useStore.getState().toast?.message).toContain('added');

        await act(async () => {
            await useStore.getState().addTracksToPlaylist('p1', [mockTrack]);
            playlistListener([{ ...mockPlaylist, trackCount: 2 }]);
        });
        expect(mockElectron.playlist.addTracks).toHaveBeenCalledWith('p1', [mockTrack]);

        await act(async () => {
            await useStore.getState().removeTrackFromPlaylist('p1', 't1');
            playlistListener([{ ...mockPlaylist, trackCount: 1 }]);
        });
        expect(mockElectron.playlist.removeTrack).toHaveBeenCalledWith('p1', 't1');
    });

    // --- Settings Slice Tests ---
    it('should fetch and update settings', async () => {
        const mockSettings = { startMinimized: false, remoteEnabled: false };
        mockElectron.settings.get.mockResolvedValue(mockSettings);
        mockElectron.settings.set.mockResolvedValue({ ...mockSettings, startMinimized: true });

        await act(async () => {
            await useStore.getState().fetchSettings();
        });
        expect(useStore.getState().settings).toEqual(mockSettings);

        await act(async () => {
            await useStore.getState().updateSettings({ startMinimized: true });
        });
        expect(mockElectron.settings.set).toHaveBeenCalledWith({ startMinimized: true });
        expect(useStore.getState().settings?.startMinimized).toBe(true);
    });

    it('should toggle remote based on settings', async () => {
        await act(async () => {
            await useStore.getState().updateSettings({ remoteEnabled: true });
        });
        expect(mockElectron.remote.start).toHaveBeenCalled();

        await act(async () => {
            await useStore.getState().updateSettings({ remoteEnabled: false });
        });
        expect(mockElectron.remote.stop).toHaveBeenCalled();
    });

    // --- Radio Slice Tests ---
    it('should fetch and control radio', async () => {
        const mockStations = [{ id: '1', name: 'Radio 1' }];
        const mockStation = mockStations[0] as any;
        mockElectron.radio.getStations.mockResolvedValue(mockStations);

        await act(async () => {
            await useStore.getState().fetchRadioStations();
            await useStore.getState().playRadioStation(mockStation);
            await useStore.getState().stopRadio();
            await useStore.getState().addRadioToQueue(mockStation, true);
        });

        expect(useStore.getState().radioStations).toEqual(mockStations);
        expect(mockElectron.radio.playStation).toHaveBeenCalledWith(mockStation);
        expect(mockElectron.radio.stop).toHaveBeenCalled();
        expect(mockElectron.radio.addToQueue).toHaveBeenCalledWith(mockStation, true);
    });

    it('should add radio to playlist', async () => {
        const mockPlaylist = { id: 'p1', name: 'P1' } as any;
        useStore.setState({ playlists: [mockPlaylist] });
        const mockStation = { id: '1', name: 'Radio' } as any;

        await act(async () => {
            await useStore.getState().addRadioToPlaylist('p1', mockStation);
        });
        expect(mockElectron.radio.addToPlaylist).toHaveBeenCalledWith('p1', mockStation);
        expect(useStore.getState().toast?.message).toContain('added');
    });

    // --- Cache Slice Tests ---
    it('should manage cache', async () => {
        const mockTrack = { id: 't1' } as any;
        const mockStats = { size: 100 } as any;
        mockElectron.cache.getStats.mockResolvedValue(mockStats);

        // Download
        const downloadPromise = useStore.getState().downloadTrack(mockTrack);
        expect(useStore.getState().downloadingTracks.has('t1')).toBe(true);
        await act(async () => downloadPromise);
        expect(mockElectron.cache.downloadTrack).toHaveBeenCalledWith(mockTrack);
        expect(useStore.getState().downloadingTracks.has('t1')).toBe(false);

        await act(async () => {
            await useStore.getState().deleteFromCache('t1');
            await useStore.getState().clearCache();
            await useStore.getState().fetchCacheStats();
        });

        expect(mockElectron.cache.deleteTrack).toHaveBeenCalledWith('t1');
        expect(mockElectron.cache.clear).toHaveBeenCalled();
        expect(useStore.getState().cacheStats).toEqual(mockStats);
    });

    // --- Scrobbler Slice Tests ---
    it('should manage scrobbler connection', async () => {
        const mockState = { isConnected: true, user: 'test' };
        mockElectron.scrobbler.connect.mockResolvedValue(mockState);

        await act(async () => {
            await useStore.getState().connectLastfm();
        });
        expect(useStore.getState().lastfm).toEqual(mockState);

        await act(async () => {
            await useStore.getState().disconnectLastfm();
        });
        expect(useStore.getState().lastfm.isConnected).toBe(false);
    });

    // --- Remote Slice Tests ---
    it('should manage remote server', async () => {
        const mockStatus = { isRunning: true };
        mockElectron.remote.getStatus.mockResolvedValue(mockStatus);

        await act(async () => {
            await useStore.getState().startRemote();
            await useStore.getState().stopRemote();
            await useStore.getState().fetchRemoteStatus();
        });

        expect(mockElectron.remote.start).toHaveBeenCalled();
        expect(mockElectron.remote.stop).toHaveBeenCalled();
        expect(useStore.getState().remoteStatus).toEqual(mockStatus);
    });

    it('should manage connected devices', async () => {
        const mockDevices = [{ id: 'd1', ip: '127.0.0.1' }];
        mockElectron.remote.getConnectedDevices.mockResolvedValue(mockDevices);
        mockElectron.remote.disconnectDevice.mockResolvedValue(true);

        await act(async () => {
            await useStore.getState().fetchConnectedDevices();
        });
        expect(useStore.getState().connectedDevices).toEqual(mockDevices);

        await act(async () => {
            await useStore.getState().disconnectDevice('d1');
        });
        expect(mockElectron.remote.disconnectDevice).toHaveBeenCalledWith('d1');
        expect(mockElectron.remote.getConnectedDevices).toHaveBeenCalledTimes(2); // Initial fetch + refresh after disconnect
    });

    // --- UI Slice Tests ---
    it('should manage UI state', async () => {
        act(() => {
            useStore.getState().setView('settings');
            useStore.getState().setSelectedPlaylistId('p1');
            useStore.getState().toggleQueue();
            useStore.getState().toggleSettings();
            useStore.getState().setSearchQuery('query');
            useStore.getState().showToast('Test', 'error');
        });

        expect(useStore.getState().currentView).toBe('settings');
        expect(useStore.getState().selectedPlaylistId).toBe('p1');
        expect(useStore.getState().isQueueVisible).toBe(true);
        expect(useStore.getState().isSettingsOpen).toBe(true);
        expect(useStore.getState().searchQuery).toBe('query');
        expect(useStore.getState().toast).toEqual({ message: 'Test', type: 'error' });

        act(() => {
            useStore.getState().hideToast();
        });
        expect(useStore.getState().toast).toBeNull();
    });

    it('should toggle mini player', async () => {
        await act(async () => {
            await useStore.getState().toggleMiniPlayer();
        });
        expect(mockElectron.window.toggleMiniPlayer).toHaveBeenCalled();
        expect(useStore.getState().isMiniPlayer).toBe(true);
    });

    // --- Subscriptions Tests ---
    it('should initialize subscriptions and handle events', async () => {
        const listeners: Record<string, (...args: any[]) => void> = {};

        // Mock sub methods to capture listeners
        mockElectron.player.onStateChanged.mockImplementation(cb => listeners['playerState'] = cb);
        mockElectron.player.onTrackChanged.mockImplementation(cb => listeners['track'] = cb);
        mockElectron.queue.onUpdated.mockImplementation(cb => listeners['queue'] = cb);
        mockElectron.auth.onAuthChanged.mockImplementation(cb => listeners['auth'] = cb);
        mockElectron.cache.onStatsUpdated.mockImplementation(cb => listeners['cache'] = cb);
        mockElectron.scrobbler.onStateChanged.mockImplementation(cb => listeners['scrobbler'] = cb);
        mockElectron.settings.onChanged.mockImplementation(cb => listeners['settings'] = cb);
        mockElectron.radio.onStateChanged.mockImplementation(cb => listeners['radio'] = cb);
        mockElectron.radio.onStationsUpdated.mockImplementation(cb => listeners['radioStations'] = cb);
        mockElectron.playlist.onUpdated.mockImplementation(cb => listeners['playlist'] = cb);
        mockElectron.collection.onUpdated.mockImplementation(cb => listeners['collection'] = cb);
        mockElectron.collection.onRefreshStarted.mockImplementation(cb => listeners['collectionRefreshStarted'] = cb);
        mockElectron.remote.onConnectionsChanged.mockImplementation(cb => listeners['remoteConn'] = cb);
        mockElectron.cast.onDevicesUpdated.mockImplementation(cb => listeners['castDevices'] = cb);
        mockElectron.cast.onStatusChanged.mockImplementation(cb => listeners['castStatus'] = cb);

        mockElectron.player.getState.mockResolvedValue({ isPlaying: false });

        await act(async () => {
            await initializeStoreSubscriptions();
        });

        // Test Player State Update
        act(() => listeners['playerState']({ isPlaying: true }));
        expect(useStore.getState().player.isPlaying).toBe(true);

        // Test Track Update
        const mockTrack = { id: 't2' };
        act(() => listeners['track'](mockTrack));
        expect(useStore.getState().player.currentTrack).toEqual(mockTrack);

        // Test Queue Update
        const mockQueue = { items: [{ id: 'q1' }] };
        act(() => listeners['queue'](mockQueue));
        expect(useStore.getState().queue).toEqual(mockQueue);

        // Test Auth Update
        const mockAuth = { isAuthenticated: true };
        act(() => listeners['auth'](mockAuth));
        expect(useStore.getState().auth).toEqual(mockAuth);

        // Test Cache Update
        const mockCache = { size: 500 };
        act(() => listeners['cache'](mockCache));
        expect(useStore.getState().cacheStats).toEqual(mockCache);

        // Test Remote Connections Update
        useStore.setState({ remoteStatus: { connections: 0 } as any });
        act(() => listeners['remoteConn'](5));
        expect(useStore.getState().remoteStatus?.connections).toBe(5);

        // Test Cast Updates
        const mockDevices = [{ id: 'c1', name: 'Cast 1', host: '1.2.3.4' }];
        act(() => listeners['castDevices'](mockDevices));
        expect(useStore.getState().castDevices).toEqual(mockDevices);

        const mockStatus = { status: 'connected', device: mockDevices[0] };
        act(() => listeners['castStatus'](mockStatus));
        expect(useStore.getState().castStatus).toEqual(mockStatus);
        expect(useStore.getState().player.isCasting).toBe(true);
        expect(useStore.getState().player.castDevice).toEqual(mockDevices[0]);

        // --- Synchronization Tests ---
        // Test sync from player state
        const syncMockQueue1 = { items: [{ id: 'sq1' }], currentIndex: 0 };
        act(() => listeners['playerState']({ isPlaying: true, queue: syncMockQueue1 }));
        expect(useStore.getState().queue).toEqual(syncMockQueue1);
        expect(useStore.getState().player.queue).toEqual(syncMockQueue1);

        // Test sync from queue update
        const syncMockQueue2 = { items: [{ id: 'sq2' }], currentIndex: 0 };
        act(() => listeners['queue'](syncMockQueue2));
        expect(useStore.getState().queue).toEqual(syncMockQueue2);
        expect(useStore.getState().player.queue).toEqual(syncMockQueue2);
    });
});

