import { mobilePlayerService } from '../services/MobilePlayerService';
import TrackPlayer from 'react-native-track-player';
import { useStore } from '../store';

// Mock dependencies
// Mock dependencies
jest.mock('react-native-track-player', () => ({
    setupPlayer: jest.fn(),
    updateOptions: jest.fn(),
    addEventListener: jest.fn(),
    add: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
    seekTo: jest.fn(),
    setVolume: jest.fn(),
    AppKilledPlaybackBehavior: { StopPlaybackAndRemoveNotification: 'StopPlaybackAndRemoveNotification' },
    Capability: { Play: 'Play', Pause: 'Pause', SkipToNext: 'SkipToNext', SkipToPrevious: 'SkipToPrevious', SeekTo: 'SeekTo' },
    Event: { PlaybackProgressUpdated: 'PlaybackProgressUpdated', PlaybackState: 'PlaybackState' },
    State: { Playing: 'Playing', Paused: 'Paused', Ready: 'Ready' }
}));
jest.mock('../store');
jest.mock('../services/MobileScraperService', () => ({
    mobileScraperService: {
        getAlbumDetails: jest.fn(),
    },
}));
jest.mock('../services/MobileDatabase', () => ({
    mobileDatabase: {
        setSetting: jest.fn(),
    },
}));

describe('MobilePlayerService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset store mock implementation
        (useStore.getState as jest.Mock).mockReturnValue({
            queue: { items: [], currentIndex: -1 },
            repeatMode: 'off',
            isShuffled: false,
            currentTrack: null,
            isPlaying: false,
        });
        (useStore.setState as jest.Mock).mockImplementation(() => { });
    });

    it('should setup player successfully', async () => {
        await mobilePlayerService.setupPlayer();
        expect(TrackPlayer.setupPlayer).toHaveBeenCalled();
        expect(TrackPlayer.updateOptions).toHaveBeenCalled();
    });

    it('should play a track provided directly', async () => {
        const track = { id: '1', title: 'Test Track', streamUrl: 'http://test.com/stream.mp3', duration: 100 } as any;

        await mobilePlayerService.playTrack(track);

        expect(TrackPlayer.reset).toHaveBeenCalled();
        expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({
            id: '1',
            url: 'http://test.com/stream.mp3',
        }));
        expect(TrackPlayer.play).toHaveBeenCalled();
        expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({
            currentTrack: expect.objectContaining({ id: '1' }),
        }));
        expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({
            isPlaying: true
        }));
    });

    it('should handle track end with repeat mode "one"', async () => {
        // Setup state
        (useStore.getState as jest.Mock).mockReturnValue({
            repeatMode: 'one',
            currentTrack: { id: '1' },
            queue: { items: [], currentIndex: 0 }
        });

        await mobilePlayerService.handleTrackEnd();

        expect(TrackPlayer.seekTo).toHaveBeenCalledWith(0);
        expect(TrackPlayer.play).toHaveBeenCalled();
    });

    it('should handle track end by playing next track', async () => {
        // Setup state
        const items = [{ track: { id: '1' } }, { track: { id: '2', streamUrl: 'url2' } }];
        (useStore.getState as jest.Mock).mockReturnValue({
            repeatMode: 'off',
            currentTrack: { id: '1' },
            queue: { items, currentIndex: 0 }
        });

        await mobilePlayerService.handleTrackEnd();

        // Should play index 1
        expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({
            queue: expect.objectContaining({ currentIndex: 1 })
        }));
        // Since playTrack is called, TrackPlayer.add/play should be called
        expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
    });

    it('should load a track without playing', async () => {
        const track = { id: '3', title: 'Load Track', streamUrl: 'http://test.com/load.mp3', duration: 150 } as any;

        await mobilePlayerService.loadTrack(track);

        expect(TrackPlayer.reset).toHaveBeenCalled();
        expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({
            id: '3',
            url: 'http://test.com/load.mp3',
        }));
        expect(TrackPlayer.play).not.toHaveBeenCalled();
        // Verify store update (should NOT set isPlaying)
        expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({
            currentTrack: expect.objectContaining({ id: '3' }),
            duration: 150
        }));
    });
});
