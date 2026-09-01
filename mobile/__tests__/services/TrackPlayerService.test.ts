import TrackPlayer, { Event, PlaybackState } from '@rntp/player';
import { PlaybackService } from '../../services/TrackPlayerService';
import { useStore } from '../../store';

jest.mock('../../services/MobilePlayerService', () => ({
    mobilePlayerService: {
        handleTrackEnd: jest.fn(),
        playQueueIndex: jest.fn(),
        isLoadingTrack: false,
        prefetchedQueueIndex: -1,
    }
}));

describe('TrackPlayerService (PlaybackService)', () => {
    let mockPlay: jest.Mock;
    let mockPause: jest.Mock;
    let mockNext: jest.Mock;
    let mockPrevious: jest.Mock;
    let mockSeek: jest.Mock;

    // Helper to trigger foreground events
    const triggerForegroundEvent = async (eventName: string, payload?: any) => {
        const calls = (TrackPlayer.addEventListener as jest.Mock).mock.calls;
        const call = calls.find(c => c[0] === eventName);
        if (call && call[1]) {
            await call[1](payload);
        }
    };

    beforeEach(() => {
        const { mobilePlayerService } = require('../../services/MobilePlayerService');
        if (mobilePlayerService.handleTrackEnd.mockClear) {
            mobilePlayerService.handleTrackEnd.mockClear();
        }
        mockPlay = jest.fn();
        mockPause = jest.fn();
        mockNext = jest.fn();
        mockPrevious = jest.fn();
        mockSeek = jest.fn();

        useStore.setState({
            mode: 'standalone',
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            play: mockPlay,
            pause: mockPause,
            next: mockNext,
            previous: mockPrevious,
            seek: mockSeek,
        } as any);
    });

    describe('Event listeners via PlaybackService (Background)', () => {


        it('updates isPlaying on IsPlayingChanged', async () => {
            useStore.setState({ userIntendedPause: false });
            await PlaybackService({ type: Event.IsPlayingChanged, playing: true });
            const state = useStore.getState();
            expect(state.isPlaying).toBe(true);
        });

        it('calls play on RemotePlay', async () => {
            await PlaybackService({ type: Event.RemotePlay });
            expect(mockPlay).toHaveBeenCalled();
        });

        it('calls pause on RemotePause', async () => {
            await PlaybackService({ type: Event.RemotePause });
            expect(mockPause).toHaveBeenCalled();
        });

        it('calls next on RemoteNext', async () => {
            await PlaybackService({ type: Event.RemoteNext });
            expect(mockNext).toHaveBeenCalled();
        });

        it('calls previous on RemotePrevious', async () => {
            await PlaybackService({ type: Event.RemotePrevious });
            expect(mockPrevious).toHaveBeenCalled();
        });

        it('calls seek on RemoteSeek', async () => {
            await PlaybackService({ type: Event.RemoteSeek, position: 50 });
            expect(mockSeek).toHaveBeenCalledWith(50);
        });

        it('calls seek on RemoteSkipForward', async () => {
            (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 30, duration: 100 });
            await PlaybackService({ type: Event.RemoteSkipForward, interval: 10 });
            expect(mockSeek).toHaveBeenCalledWith(40);
        });

        it('calls seek on RemoteSkipBackward', async () => {
            (TrackPlayer.getProgress as jest.Mock).mockReturnValue({ position: 30, duration: 100 });
            await PlaybackService({ type: Event.RemoteSkipBackward, interval: 10 });
            expect(mockSeek).toHaveBeenCalledWith(20);
        });

        it('clears TrackPlayer on RemoteStop', async () => {
            const { mobilePlayerService } = require('../../services/MobilePlayerService');
            mobilePlayerService.stop = jest.fn();
            await PlaybackService({ type: Event.RemoteStop });
            expect(mobilePlayerService.stop).toHaveBeenCalled();
        });

        it('calls handleTrackEnd on PlaybackStateChanged Ended in standalone mode', async () => {
            useStore.setState({ queue: { items: [{ id: '1' }], currentIndex: 0 } } as any);
            const { mobilePlayerService } = require('../../services/MobilePlayerService');
            await PlaybackService({ type: Event.PlaybackStateChanged, state: PlaybackState.Ended });
            expect(mobilePlayerService.handleTrackEnd).toHaveBeenCalled();
        });

        it('ignores PlaybackStateChanged Ended in remote mode', async () => {
            useStore.setState({ mode: 'remote' } as any);
            const { mobilePlayerService } = require('../../services/MobilePlayerService');
            await PlaybackService({ type: Event.PlaybackStateChanged, state: PlaybackState.Ended });
            expect(mobilePlayerService.handleTrackEnd).not.toHaveBeenCalled();
        });

        describe('MediaItemTransition', () => {
            let syncNativeTransitionMock: jest.Mock;

            beforeEach(() => {
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                mobilePlayerService.playQueueIndex.mockClear();
                mobilePlayerService.isLoadingTrack = false;
                mobilePlayerService.prefetchedQueueIndex = -1;

                syncNativeTransitionMock = jest.fn();
                useStore.setState({
                    mode: 'standalone',
                    isPlaying: true,
                    userIntendedPause: false,
                    currentTrack: { id: '1' } as any,
                    queue: { items: [{ id: '1' }, { id: '2' }], currentIndex: 0 },
                    syncNativeTransition: syncNativeTransitionMock,
                } as any);
            });

            it('ignores transition if isLoadingTrack is true', async () => {
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                mobilePlayerService.isLoadingTrack = true;
                await PlaybackService({ type: Event.MediaItemTransition, index: 1 });
                expect(mobilePlayerService.playQueueIndex).not.toHaveBeenCalled();
            });

            it('ignores transition if currentTrack is null', async () => {
                useStore.setState({ currentTrack: null } as any);
                await PlaybackService({ type: Event.MediaItemTransition, index: 1 });
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                expect(mobilePlayerService.playQueueIndex).not.toHaveBeenCalled();
            });

            it('syncs transition if it matches prefetchedQueueIndex', async () => {
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                mobilePlayerService.prefetchedQueueIndex = 1;
                await PlaybackService({ type: Event.MediaItemTransition, index: 1 });
                expect(syncNativeTransitionMock).toHaveBeenCalledWith(1);
                expect(mobilePlayerService.playQueueIndex).not.toHaveBeenCalled();
            });

            it('calls playQueueIndex if not prefetched, index changed, and playing with no userIntendedPause', async () => {
                useStore.setState({ isPlaying: true, userIntendedPause: false });
                jest.useFakeTimers();
                await PlaybackService({ type: Event.MediaItemTransition, index: 1 });
                jest.runAllTimers();
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                expect(mobilePlayerService.playQueueIndex).toHaveBeenCalledWith(1);
                jest.useRealTimers();
            });

            it('does not call playQueueIndex if userIntendedPause is true during MediaItemTransition', async () => {
                useStore.setState({ isPlaying: false, userIntendedPause: true });
                jest.useFakeTimers();
                await PlaybackService({ type: Event.MediaItemTransition, index: 1 });
                jest.runAllTimers();
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                expect(mobilePlayerService.playQueueIndex).not.toHaveBeenCalled();
                expect(useStore.getState().queue.currentIndex).toBe(1);
                expect(useStore.getState().isPlaying).toBe(false);
                jest.useRealTimers();
            });
        });

        describe('PlaybackError handling', () => {
            beforeEach(() => {
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                mobilePlayerService.loadTrack = jest.fn().mockResolvedValue(true);
                mobilePlayerService.next = jest.fn().mockResolvedValue(undefined);
                mobilePlayerService.stop = jest.fn().mockResolvedValue(undefined);
            });

            it('ignores PlaybackError when isPlaying is false or userIntendedPause is true', async () => {
                useStore.setState({ isPlaying: false, userIntendedPause: true, currentTrack: { id: 't1', title: 'Test' } as any });
                const { mobilePlayerService } = require('../../services/MobilePlayerService');

                await PlaybackService({ type: Event.PlaybackError, index: 0 });

                expect(mobilePlayerService.loadTrack).not.toHaveBeenCalled();
                expect(mobilePlayerService.next).not.toHaveBeenCalled();
            });

            it('attempts loadTrack and plays when playing and error occurs', async () => {
                useStore.setState({ isPlaying: true, userIntendedPause: false, currentTrack: { id: 't1', title: 'Test' } as any });
                const { mobilePlayerService } = require('../../services/MobilePlayerService');

                await PlaybackService({ type: Event.PlaybackError, index: 0 });

                expect(mobilePlayerService.loadTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 0, true);
                expect(TrackPlayer.play).toHaveBeenCalled();
            });

            it('halts playback if 3 consecutive errors occur rapidly', async () => {
                useStore.setState({ isPlaying: true, userIntendedPause: false, currentTrack: { id: 't1', title: 'Test' } as any });
                const { mobilePlayerService } = require('../../services/MobilePlayerService');
                mobilePlayerService.loadTrack = jest.fn().mockResolvedValue(false);

                await PlaybackService({ type: Event.PlaybackError, index: 0 });
                await PlaybackService({ type: Event.PlaybackError, index: 0 });
                await PlaybackService({ type: Event.PlaybackError, index: 0 });

                expect(mobilePlayerService.stop).toHaveBeenCalled();
                expect(useStore.getState().collectionError).toContain('Playback stopped');
            });
        });
    });

    describe('Event listeners via Foreground AddEventListener', () => {
        it('calls seek on RemoteSeek', async () => {
            await triggerForegroundEvent(Event.RemoteSeek, { position: 50 });
            expect(mockSeek).toHaveBeenCalledWith(50);
        });

        it('updates isPlaying on IsPlayingChanged', async () => {
            useStore.setState({ userIntendedPause: false });
            await triggerForegroundEvent(Event.IsPlayingChanged, { playing: true });
            const state = useStore.getState();
            expect(state.isPlaying).toBe(true);
        });
    });
});
