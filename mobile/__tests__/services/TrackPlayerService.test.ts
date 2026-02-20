import TrackPlayer, { Event, Capability, AppKilledPlaybackBehavior, State } from 'react-native-track-player';
import { PlaybackService } from '../../services/TrackPlayerService';
import { useStore } from '../../store';

jest.mock('../../services/MobilePlayerService', () => ({
    mobilePlayerService: {
        handleTrackEnd: jest.fn(),
    }
}));

describe('TrackPlayerService (PlaybackService)', () => {
    let mockPlay: jest.Mock;
    let mockPause: jest.Mock;
    let mockNext: jest.Mock;
    let mockPrevious: jest.Mock;
    let mockSeek: jest.Mock;

    // Helper to trigger events
    const triggerEvent = (eventName: string, payload?: any) => {
        const calls = (TrackPlayer.addEventListener as jest.Mock).mock.calls;
        const call = calls.find(c => c[0] === eventName);
        if (call && call[1]) {
            call[1](payload);
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

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

    it('initializes TrackPlayer with correct options', async () => {
        await PlaybackService();

        expect(TrackPlayer.updateOptions).toHaveBeenCalledWith(expect.objectContaining({
            android: {
                appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
            },
            capabilities: expect.arrayContaining([Capability.Play, Capability.Pause]),
        }));
    });

    describe('Standalone mode event listeners', () => {
        beforeEach(async () => {
            await PlaybackService();
        });

        it('updates time on PlaybackProgressUpdated', () => {
            triggerEvent(Event.PlaybackProgressUpdated, { position: 10, duration: 100 });
            const state = useStore.getState();
            expect(state.currentTime).toBe(10);
            expect(state.duration).toBe(100);
        });

        it('ignores PlaybackProgressUpdated in remote mode', () => {
            useStore.setState({ mode: 'remote' } as any);
            triggerEvent(Event.PlaybackProgressUpdated, { position: 10, duration: 100 });
            const state = useStore.getState();
            expect(state.currentTime).toBe(0); // unaltered
        });

        it('updates isPlaying on PlaybackState playing', () => {
            triggerEvent(Event.PlaybackState, { state: State.Playing });
            const state = useStore.getState();
            expect(state.isPlaying).toBe(true);
        });

        it('calls play on RemotePlay', () => {
            triggerEvent(Event.RemotePlay);
            expect(mockPlay).toHaveBeenCalled();
        });

        it('calls pause on RemotePause', () => {
            triggerEvent(Event.RemotePause);
            expect(mockPause).toHaveBeenCalled();
        });

        it('calls play or pause on RemotePlayPause', () => {
            useStore.setState({ isPlaying: false } as any);
            triggerEvent(Event.RemotePlayPause);
            expect(mockPlay).toHaveBeenCalled();

            mockPlay.mockClear();
            mockPause.mockClear();
            useStore.setState({ isPlaying: true } as any);
            triggerEvent(Event.RemotePlayPause);
            expect(mockPause).toHaveBeenCalled();
        });

        it('calls next on RemoteNext', () => {
            triggerEvent(Event.RemoteNext);
            expect(mockNext).toHaveBeenCalled();
        });

        it('calls previous on RemotePrevious', () => {
            triggerEvent(Event.RemotePrevious);
            expect(mockPrevious).toHaveBeenCalled();
        });

        it('calls seek on RemoteSeek', () => {
            triggerEvent(Event.RemoteSeek, { position: 50 });
            expect(mockSeek).toHaveBeenCalledWith(50);
        });

        it('calls seek on RemoteJumpForward', async () => {
            (TrackPlayer.getProgress as jest.Mock).mockResolvedValueOnce({ position: 30, duration: 100 });
            await triggerEvent(Event.RemoteJumpForward, { interval: 10 });

            // Allow async progress fetch to resolve
            await new Promise(setImmediate);
            expect(mockSeek).toHaveBeenCalledWith(40);
        });

        it('calls seek on RemoteJumpBackward', async () => {
            (TrackPlayer.getProgress as jest.Mock).mockResolvedValueOnce({ position: 30, duration: 100 });
            await triggerEvent(Event.RemoteJumpBackward, { interval: 10 });

            await new Promise(setImmediate);
            expect(mockSeek).toHaveBeenCalledWith(20);
        });

        it('resets TrackPlayer on RemoteStop', () => {
            triggerEvent(Event.RemoteStop);
            expect(TrackPlayer.reset).toHaveBeenCalled();
        });

        it('calls handleTrackEnd on PlaybackQueueEnded in standalone mode', async () => {
            const { mobilePlayerService } = require('../../services/MobilePlayerService');
            await triggerEvent(Event.PlaybackQueueEnded);
            expect(mobilePlayerService.handleTrackEnd).toHaveBeenCalled();
        });

        it('ignores PlaybackQueueEnded in remote mode', async () => {
            useStore.setState({ mode: 'remote' } as any);
            const { mobilePlayerService } = require('../../services/MobilePlayerService');
            await triggerEvent(Event.PlaybackQueueEnded);
            expect(mobilePlayerService.handleTrackEnd).not.toHaveBeenCalled();
        });
    });
});
