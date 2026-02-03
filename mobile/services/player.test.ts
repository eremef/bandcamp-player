/// <reference types="jest" />
import TrackPlayer from 'react-native-track-player';
import { setupPlayer, addTrack } from './player';

// Mock react-native-track-player
jest.mock('react-native-track-player', () => ({
    __esModule: true,
    default: {
        getActiveTrackIndex: jest.fn(),
        setupPlayer: jest.fn(),
        updateOptions: jest.fn(),
        reset: jest.fn(),
        add: jest.fn(),
        setVolume: jest.fn(),
    },
    Capability: {
        Play: 0,
        Pause: 1,
        SkipToNext: 2,
        SkipToPrevious: 3,
        SeekTo: 4,
    },
    AppKilledPlaybackBehavior: {
        StopPlaybackAndRemoveNotification: 0,
    },
}));

describe('player.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('setupPlayer', () => {
        it('should setup player if not already set up', async () => {
            (TrackPlayer.getActiveTrackIndex as any).mockRejectedValue(new Error('Not setup'));

            const result = await setupPlayer();

            expect(TrackPlayer.setupPlayer).toHaveBeenCalled();
            expect(TrackPlayer.updateOptions).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should skip setup if already set up', async () => {
            (TrackPlayer.getActiveTrackIndex as any).mockResolvedValue(0);

            const result = await setupPlayer();

            expect(TrackPlayer.setupPlayer).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should configure capabilities correctly', async () => {
            (TrackPlayer.getActiveTrackIndex as any).mockRejectedValue(new Error('Not setup'));

            await setupPlayer();

            expect(TrackPlayer.updateOptions).toHaveBeenCalledWith(
                expect.objectContaining({
                    capabilities: expect.any(Array),
                    progressUpdateEventInterval: 2,
                })
            );
        });
    });

    describe('addTrack', () => {
        const mockTrack = {
            id: 'track-1',
            title: 'Test Track',
            artist: 'Test Artist',
            artworkUrl: 'https://example.com/art.jpg',
            streamUrl: 'https://example.com/stream.mp3',
            duration: 180,
            album: 'Test Album',
            bandcampUrl: 'https://test.bandcamp.com/track',
            isCached: false,
        };

        it('should reset and add track', async () => {
            await addTrack(mockTrack);

            expect(TrackPlayer.reset).toHaveBeenCalled();
            expect(TrackPlayer.add).toHaveBeenCalledWith({
                id: mockTrack.id,
                url: mockTrack.streamUrl,
                title: mockTrack.title,
                artist: mockTrack.artist,
                artwork: mockTrack.artworkUrl,
                duration: mockTrack.duration,
            });
        });

        it('should set volume to 0 (muted on mobile)', async () => {
            await addTrack(mockTrack);

            expect(TrackPlayer.setVolume).toHaveBeenCalledWith(0);
        });

        it('should replace localhost with host IP', async () => {
            const localhostTrack = {
                ...mockTrack,
                streamUrl: 'http://localhost:3000/stream.mp3',
            };

            await addTrack(localhostTrack, '192.168.1.100');

            expect(TrackPlayer.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'http://192.168.1.100:3000/stream.mp3',
                })
            );
        });

        it('should replace 127.0.0.1 with host IP', async () => {
            const localhostTrack = {
                ...mockTrack,
                streamUrl: 'http://127.0.0.1:3000/stream.mp3',
            };

            await addTrack(localhostTrack, '192.168.1.100');

            expect(TrackPlayer.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'http://192.168.1.100:3000/stream.mp3',
                })
            );
        });
    });
});
