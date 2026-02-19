/// <reference types="jest" />
import TrackPlayer from 'react-native-track-player';
import { setupPlayer, addTrack } from './player';

describe('player.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default behavior for getQueue to avoid errors
        (TrackPlayer.getQueue as jest.Mock).mockResolvedValue([]);
    });

    describe('setupPlayer', () => {
        it('should setup player if not already set up', async () => {
            const result = await setupPlayer();

            expect(TrackPlayer.setupPlayer).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it('should handle player already setup error', async () => {
            (TrackPlayer.setupPlayer as jest.Mock).mockRejectedValue(new Error('The player has already been initialized via setupPlayer.'));

            const result = await setupPlayer();

            expect(TrackPlayer.setupPlayer).toHaveBeenCalled();
            expect(result).toBe(true);
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

        it('should add track without resetting (seamlessly)', async () => {
            await addTrack(mockTrack);

            expect(TrackPlayer.add).toHaveBeenCalledWith({
                id: mockTrack.id,
                url: mockTrack.streamUrl,
                title: mockTrack.title,
                artist: mockTrack.artist,
                album: mockTrack.album,
                artwork: mockTrack.artworkUrl,
                duration: mockTrack.duration,
            });
            // Should NOT call reset() for seamless transitions
            expect(TrackPlayer.reset).not.toHaveBeenCalled();
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
