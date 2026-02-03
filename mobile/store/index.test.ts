import { useStore } from './index';
import { webSocketService } from '../services/WebSocketService';
import { DiscoveryService } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import TrackPlayer from 'react-native-track-player';
import { addTrack } from '../services/player';

// Mock TrackPlayer
jest.mock('react-native-track-player', () => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    getProgress: jest.fn(),
    State: {
        Playing: 'playing',
        Paused: 'paused',
    }
}));

// Mock WebSocketService
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socketListeners: Record<string, (payload?: any) => void> = {};

jest.mock('../services/WebSocketService', () => ({
    webSocketService: {
        connect: jest.fn(),
        disconnect: jest.fn(),
        send: jest.fn(),
        on: jest.fn((event, callback) => {
            socketListeners[event] = callback;
        }),
        off: jest.fn(),
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

describe('Mobile useStore', () => {
    beforeEach(() => {
        useStore.setState({
            hostIp: '',
            connectionStatus: 'disconnected',
            recentIps: [],
            isScanning: false,
            isPlaying: false,
            currentTrack: null,
            collection: null,
            playlists: [],
            radioStations: [],
        });
        jest.clearAllMocks();
        AsyncStorage.clear();
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

    it('should disconnect', () => {
        act(() => {
            useStore.getState().disconnect();
        });

        expect(useStore.getState().connectionStatus).toBe('disconnected');
        expect(useStore.getState().hostIp).toBe('');
        expect(webSocketService.disconnect).toHaveBeenCalled();
    });

    it('should autoConnect with saved IP', async () => {
        (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
            if (key === 'last_ip') return Promise.resolve('192.168.1.20');
            if (key === 'recent_ips') return Promise.resolve('["192.168.1.20"]');
            return Promise.resolve(null);
        });

        await act(async () => {
            await useStore.getState().autoConnect();
        });

        expect(useStore.getState().hostIp).toBe('192.168.1.20');
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

             const mockCollection = { albums: [] };
             
             act(() => callback(mockCollection));
             expect(useStore.getState().collection).toBe(mockCollection);
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
             expect(webSocketService.send).toHaveBeenCalledWith('get-collection');
             expect(webSocketService.send).toHaveBeenCalledWith('get-playlists');
             expect(webSocketService.send).toHaveBeenCalledWith('get-radio-stations');

             jest.clearAllMocks();

             // Test disconnected
             act(() => callback('disconnected'));
             expect(useStore.getState().connectionStatus).toBe('disconnected');
             expect(webSocketService.send).not.toHaveBeenCalled();
        });

        it('should handle errors in state-changed sync', async () => {
             const callback = socketListeners['state-changed'];
             expect(callback).toBeDefined();

             // Make TrackPlayer.play throw
             (TrackPlayer.play as jest.Mock).mockRejectedValue(new Error('Player error'));
             const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

             await act(async () => {
                 await callback({ isPlaying: true });
             });

             expect(consoleSpy).toHaveBeenCalledWith('Failed to sync TrackPlayer state', expect.any(Error));
             consoleSpy.mockRestore();
        });
    });
});