import { mobilePlayerService } from '../services/MobilePlayerService';
import TrackPlayer, { State } from 'react-native-track-player';
import { useStore } from '../store';
import { mobileScraperService } from '../services/MobileScraperService';
import { mobileDatabase } from '../services/MobileDatabase';
import { setupPlayer } from '../services/player';

jest.mock('react-native-track-player', () => ({
    __esModule: true,
    default: {
        setVolume: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn().mockResolvedValue(undefined),
        seekTo: jest.fn().mockResolvedValue(undefined),
        getPlaybackState: jest.fn().mockResolvedValue({ state: 'stopped' }),
        getQueue: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue(undefined),
        skip: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
    },
    State: {
        Ready: 'ready',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        Buffering: 'buffering',
        None: 'none',
    },
    Event: {
        PlaybackState: 'playback-state',
        PlaybackError: 'playback-error',
        PlaybackQueueEnded: 'playback-queue-ended',
        PlaybackTrackChanged: 'playback-track-changed',
    },
    AppKilledPlaybackBehavior: {
        ContinuePlayback: 'continue-playback',
        StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification'
    },
    Capability: {
        Play: 0,
        PlayFromId: 1,
        PlayFromSearch: 2,
        Pause: 3,
        Stop: 4,
        SeekTo: 5,
        Skip: 6,
        SkipToNext: 7,
        SkipToPrevious: 8,
        JumpForward: 9,
        JumpBackward: 10,
        SetRating: 11,
        Like: 12,
        Dislike: 13,
        Bookmark: 14
    }
}));
jest.mock('../store');
jest.mock('../services/MobileScraperService');
jest.mock('../services/MobileDatabase');
jest.mock('../services/player');

describe('MobilePlayerService', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();

        // Reset MobilePlayerService state (private property workaround)
        (mobilePlayerService as any).isInitialized = false;

        // Default store mock
        (useStore.getState as jest.Mock).mockReturnValue({
            volume: 0.8,
            isPlaying: false,
            currentTrack: null,
            currentTime: 0,
            repeatMode: 'off',
            isShuffled: false,
            queue: { items: [], currentIndex: 0 },
        });

        (setupPlayer as jest.Mock).mockResolvedValue(true);
    });

    describe('setupPlayer', () => {
        it('should initialize and set volume', async () => {
            await mobilePlayerService.setupPlayer();
            expect(setupPlayer).toHaveBeenCalled();
            expect(TrackPlayer.setVolume).toHaveBeenCalledWith(0.8);
        });

        it('should skip if already initialized', async () => {
            (mobilePlayerService as any).isInitialized = true;
            await mobilePlayerService.setupPlayer();
            expect(setupPlayer).not.toHaveBeenCalled();
        });

        it('should skip setting volume if setup fails', async () => {
            (setupPlayer as jest.Mock).mockResolvedValueOnce(false);
            await mobilePlayerService.setupPlayer();
            expect(TrackPlayer.setVolume).not.toHaveBeenCalled();
        });
    });

    describe('playback controls', () => {
        it('should pause playback', async () => {
            await mobilePlayerService.pause();
            expect(TrackPlayer.pause).toHaveBeenCalled();
            expect(useStore.setState).toHaveBeenCalledWith({ isPlaying: false });
        });

        it('should stop playback', async () => {
            await mobilePlayerService.stop();
            expect(TrackPlayer.reset).toHaveBeenCalled();
            expect(useStore.setState).toHaveBeenCalledWith({ isPlaying: false, currentTrack: null, currentTime: 0, duration: 0 });
        });

        it('should seek to position', async () => {
            await mobilePlayerService.seek(45);
            expect(TrackPlayer.seekTo).toHaveBeenCalledWith(45);
            expect(useStore.setState).toHaveBeenCalledWith({ currentTime: 45 });
        });

        it('should set volume and persist it', async () => {
            await mobilePlayerService.setVolume(0.5);
            expect(TrackPlayer.setVolume).toHaveBeenCalledWith(0.5);
            expect(useStore.setState).toHaveBeenCalledWith({ volume: 0.5 });
            expect(mobileDatabase.setSetting).toHaveBeenCalledWith('standalone_volume', 0.5);
        });

        it('should toggle shuffle', async () => {
            await mobilePlayerService.toggleShuffle();
            expect(useStore.setState).toHaveBeenCalledWith({ isShuffled: true });
        });

        it('should set repeat mode', async () => {
            await mobilePlayerService.setRepeat('all');
            expect(useStore.setState).toHaveBeenCalledWith({ repeatMode: 'all' });
        });
    });

    describe('play() logic', () => {
        it('should resume if paused', async () => {
            (TrackPlayer.getPlaybackState as jest.Mock).mockResolvedValueOnce({ state: State.Paused });
            await mobilePlayerService.play();
            expect(TrackPlayer.play).toHaveBeenCalled();
            expect(useStore.setState).toHaveBeenCalledWith({ isPlaying: true });
        });

        it('should replay current track if stopped', async () => {
            (TrackPlayer.getPlaybackState as jest.Mock).mockResolvedValue({ state: State.Stopped });
            const mockTrack = { id: 't1', title: 'T', streamUrl: 'url' };
            (useStore.getState as jest.Mock).mockReturnValue({
                volume: 0.5,
                currentTrack: mockTrack,
                queue: { items: [], currentIndex: 0 }
            });
            // mock queue empty because playTrack loads it
            (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([]);

            await mobilePlayerService.play();
            expect(TrackPlayer.add).toHaveBeenCalled(); // via loadTrack
            expect(TrackPlayer.play).toHaveBeenCalled();
        });

        it('should play from queue if no current track', async () => {
            (TrackPlayer.getPlaybackState as jest.Mock).mockResolvedValue({ state: State.Stopped });
            const mockTrack = { id: 't1', title: 'T', streamUrl: 'url' };
            (useStore.getState as jest.Mock).mockReturnValue({
                volume: 0.5,
                currentTrack: null,
                queue: { items: [{ track: mockTrack }], currentIndex: 0 }
            });
            (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([]);

            await mobilePlayerService.play();

            expect(TrackPlayer.add).toHaveBeenCalled();
            expect(TrackPlayer.play).toHaveBeenCalled();
            expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({ queue: { items: [{ track: mockTrack }], currentIndex: 0 } }));
        });
    });

    describe('next / previous navigation', () => {
        beforeEach(() => {
            const queueItems = [
                { track: { id: '1' } },
                { track: { id: '2' } },
                { track: { id: '3' } }
            ];
            (useStore.getState as jest.Mock).mockReturnValue({
                volume: 1,
                queue: { items: queueItems, currentIndex: 1 },
                repeatMode: 'off',
                isShuffled: false,
                currentTime: 0
            });
            (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([]);
        });

        it('should go to next track', async () => {
            // Mock loadTrack return true so it proceeds to play
            jest.spyOn(mobilePlayerService, 'loadTrack').mockResolvedValue(true);

            await mobilePlayerService.next();

            expect(mobilePlayerService.loadTrack).toHaveBeenCalledWith({ id: '3' }); // next is index 2
        });

        it('should pick random next if shuffled', async () => {
            (useStore.getState as jest.Mock).mockReturnValue({
                volume: 1,
                queue: { items: [{ track: { id: '1' } }, { track: { id: '2' } }, { track: { id: '3' } }], currentIndex: 1 },
                repeatMode: 'off',
                isShuffled: true,
                currentTime: 0
            });
            jest.spyOn(mobilePlayerService, 'loadTrack').mockResolvedValue(true);
            jest.spyOn(Math, 'random').mockReturnValue(0.99); // index 2

            await mobilePlayerService.next();

            expect(mobilePlayerService.loadTrack).toHaveBeenCalled();
        });

        it('should stop if at end of queue', async () => {
            (useStore.getState as jest.Mock).mockReturnValue({
                volume: 1,
                queue: { items: [{ track: { id: '1' } }, { track: { id: '2' } }], currentIndex: 1 },
                repeatMode: 'off',
                isShuffled: false,
                currentTime: 0
            });
            const stopSpy = jest.spyOn(mobilePlayerService, 'stop').mockResolvedValue();

            await mobilePlayerService.next();

            expect(stopSpy).toHaveBeenCalled();
        });

        it('should loop to start if at end and repeat all', async () => {
            (useStore.getState as jest.Mock).mockReturnValue({
                queue: { items: [{ track: { id: '1' } }, { track: { id: '2' } }], currentIndex: 1 },
                repeatMode: 'all',
                isShuffled: false,
            });
            jest.spyOn(mobilePlayerService, 'playQueueIndex').mockResolvedValue();

            await mobilePlayerService.next();

            expect(mobilePlayerService.playQueueIndex).toHaveBeenCalledWith(0);
        });

        it('should go to previous track or beginning if current time > 3', async () => {
            (useStore.getState as jest.Mock).mockReturnValue({
                currentTime: 5,
                queue: { items: [{ track: { id: '1' } }, { track: { id: '2' } }], currentIndex: 1 }
            });
            const seekSpy = jest.spyOn(mobilePlayerService, 'seek').mockResolvedValue();

            await mobilePlayerService.previous();

            expect(seekSpy).toHaveBeenCalledWith(0);
        });

        it('should go to actual previous track if time <= 3', async () => {
            jest.spyOn(mobilePlayerService, 'playQueueIndex').mockResolvedValue();
            await mobilePlayerService.previous();
            expect(mobilePlayerService.playQueueIndex).toHaveBeenCalledWith(0);
        });

        it('should loop back to end if at start and repeat all', async () => {
            (useStore.getState as jest.Mock).mockReturnValue({
                currentTime: 0,
                queue: { items: [{ track: { id: '1' } }, { track: { id: '2' } }], currentIndex: 0 },
                repeatMode: 'all'
            });
            jest.spyOn(mobilePlayerService, 'playQueueIndex').mockResolvedValue();

            await mobilePlayerService.previous();

            expect(mobilePlayerService.playQueueIndex).toHaveBeenCalledWith(1);
        });
    });

    describe('handleTrackEnd', () => {
        it('should seek to 0 and play if repeat mode is one', async () => {
            (useStore.getState as jest.Mock).mockReturnValueOnce({
                repeatMode: 'one',
                currentTrack: { id: 't1' }
            });

            await mobilePlayerService.handleTrackEnd();

            expect(TrackPlayer.seekTo).toHaveBeenCalledWith(0);
            expect(TrackPlayer.play).toHaveBeenCalled();
        });

        it('should call next if repeat mode is off', async () => {
            (useStore.getState as jest.Mock).mockReturnValueOnce({
                repeatMode: 'off',
                currentTrack: { id: 't1' }
            });
            const nextSpy = jest.spyOn(mobilePlayerService, 'next').mockResolvedValue();

            await mobilePlayerService.handleTrackEnd();

            expect(nextSpy).toHaveBeenCalled();
        });
    });

    describe('loadTrack', () => {
        beforeEach(() => {
            (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([]);
        });

        it('should load track if streamUrl exists', async () => {
            const track = { id: '1', title: 'T', streamUrl: 'url', duration: 100 };
            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(true);
            expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({ url: 'url', duration: 100 }));
            expect(useStore.setState).toHaveBeenCalledWith(expect.objectContaining({
                currentTrack: expect.objectContaining({ streamUrl: 'url' })
            }));
        });

        it('should seek to initialPosition if provided', async () => {
            const track = { id: '1', streamUrl: 'url' };
            await mobilePlayerService.loadTrack(track as any, 50);

            expect(TrackPlayer.seekTo).toHaveBeenCalledWith(50);
        });

        it('should fetch stream url for radio show', async () => {
            const track = { id: 'r1', title: 'Radio', bandcampUrl: 'https://bandcamp.com?show=50' };
            (mobileScraperService.getStationStreamUrl as jest.Mock).mockResolvedValueOnce({ streamUrl: 'radio_url', duration: 7200 });

            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(true);
            expect(mobileScraperService.getStationStreamUrl).toHaveBeenCalledWith('50');
            expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({ url: 'radio_url' }));
        });

        it('should fetch album details to find stream url', async () => {
            const track = { id: 't1', title: 'Song 1', bandcampUrl: 'https://album' };
            (mobileScraperService.getAlbumDetails as jest.Mock).mockResolvedValueOnce({
                tracks: [{ title: 'Song 1', streamUrl: 'album_stream' }]
            });

            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(true);
            expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({ url: 'album_stream' }));
        });

        it('should fall back to single track if name mismatch but only 1 track', async () => {
            const track = { id: 't1', title: 'Unknown', bandcampUrl: 'https://album' };
            (mobileScraperService.getAlbumDetails as jest.Mock).mockResolvedValueOnce({
                tracks: [{ title: 'Actual Name', streamUrl: 'fallback_stream' }]
            });

            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(true);
            expect(TrackPlayer.add).toHaveBeenCalledWith(expect.objectContaining({ url: 'fallback_stream' }));
        });

        it('should fail and set error if stream not found', async () => {
            const track = { id: 't1', title: 'Broken' };

            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(false);
            expect(useStore.setState).toHaveBeenCalledWith({ collectionError: 'Could not find stream URL for this track.' });
        });

        it('should fail and set error on exception', async () => {
            const track = { id: 't1', title: 'Fail', streamUrl: 'url' };
            (TrackPlayer.add as jest.Mock).mockRejectedValueOnce(new Error('Crash'));

            const success = await mobilePlayerService.loadTrack(track as any);

            expect(success).toBe(false);
            expect(useStore.setState).toHaveBeenCalledWith({ collectionError: 'Failed to load track.' });
        });

        it('should clean up old queue if pushing to non-empty player queue', async () => {
            const track = { id: '1', title: 'T', streamUrl: 'url' };
            (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([{}, {}]); // index 2 next

            await mobilePlayerService.loadTrack(track as any);

            expect(TrackPlayer.skip).toHaveBeenCalledWith(2);
            expect(TrackPlayer.remove).toHaveBeenCalledWith([0, 1]);
        });
    });
});
