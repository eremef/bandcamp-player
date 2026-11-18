/// <reference types="jest" />
import { PlayerQueue, TrackPlayer } from 'react-native-nitro-player';
import { setupPlayer, addTrack } from '../../services/player';
import { useStore } from '../../store';

describe('player.ts and Nitro adapter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('sets up the native player successfully', async () => {
        await expect(setupPlayer()).resolves.toBe(true);
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

        it('mirrors the queue with native-only boundary sentinels', async () => {
            const appQueueBefore = useStore.getState().queue;
            await addTrack(mockTrack);

            const calls = (PlayerQueue.addTracksToPlaylist as jest.Mock).mock.calls;
            const addCall = calls[calls.length - 1];
            expect(addCall[1]).toEqual([
                expect.objectContaining({
                    id: '__beta_remote_previous__track-1',
                    extraPayload: expect.objectContaining({ remoteCommand: 'previous', queueIndex: 0 }),
                }),
                expect.objectContaining({
                    id: mockTrack.id,
                    url: mockTrack.streamUrl,
                    title: mockTrack.title,
                    artist: mockTrack.artist,
                    album: mockTrack.album,
                    artwork: mockTrack.artworkUrl,
                    duration: mockTrack.duration,
                    extraPayload: expect.objectContaining({ queueItemId: mockTrack.id }),
                }),
                expect.objectContaining({
                    id: '__beta_remote_next__track-1',
                    extraPayload: expect.objectContaining({ remoteCommand: 'next', queueIndex: 0 }),
                }),
            ]);
            expect(PlayerQueue.loadPlaylist).toHaveBeenLastCalledWith(addCall[0], 1);
            expect(useStore.getState().queue).toBe(appQueueBefore);
        });

        it('preserves queue-item identity and selected index around native-only sentinels', async () => {
            const secondTrack = { ...mockTrack, title: 'Repeated Track' };
            const queueItems = [
                { id: 'queue-1', track: mockTrack },
                { id: 'queue-2', track: secondTrack },
            ];

            await addTrack(secondTrack, undefined, queueItems, 1);

            const calls = (PlayerQueue.addTracksToPlaylist as jest.Mock).mock.calls;
            const addCall = calls[calls.length - 1];
            expect(addCall[1]).toEqual([
                expect.objectContaining({ id: '__beta_remote_previous__queue-1', extraPayload: expect.objectContaining({ queueIndex: 0 }) }),
                expect.objectContaining({ id: 'queue-1', extraPayload: expect.objectContaining({ queueItemId: 'queue-1' }) }),
                expect.objectContaining({ id: 'queue-2', extraPayload: expect.objectContaining({ queueItemId: 'queue-2' }) }),
                expect.objectContaining({ id: '__beta_remote_next__queue-2', extraPayload: expect.objectContaining({ queueIndex: 1 }) }),
            ]);
            expect(PlayerQueue.loadPlaylist).toHaveBeenLastCalledWith(addCall[0], 2);
        });

        it('mutes the handset when it mirrors remote playback', async () => {
            await addTrack(mockTrack);

            expect(TrackPlayer.setVolume).toHaveBeenLastCalledWith(0);
        });

        it('replaces localhost with host IP', async () => {
            const localhostTrack = {
                ...mockTrack,
                streamUrl: 'http://localhost:3000/stream.mp3',
            };

            await addTrack(localhostTrack, '192.168.1.100');

            const calls = (PlayerQueue.addTracksToPlaylist as jest.Mock).mock.calls;
            const addCall = calls[calls.length - 1];
            expect(addCall[1][1]).toEqual(expect.objectContaining({
                url: 'http://192.168.1.100:3000/stream.mp3',
            }));
        });

        it('replaces 127.0.0.1 with host IP', async () => {
            const localhostTrack = {
                ...mockTrack,
                streamUrl: 'http://127.0.0.1:3000/stream.mp3',
            };

            await addTrack(localhostTrack, '192.168.1.100');

            const calls = (PlayerQueue.addTracksToPlaylist as jest.Mock).mock.calls;
            const addCall = calls[calls.length - 1];
            expect(addCall[1][1]).toEqual(expect.objectContaining({
                url: 'http://192.168.1.100:3000/stream.mp3',
            }));
        });
    });
});
