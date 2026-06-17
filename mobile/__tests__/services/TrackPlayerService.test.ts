import TrackPlayer, { Event, PlaybackState } from '@rntp/player';
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
            (TrackPlayer.getProgress as jest.Mock).mockReturnValueOnce({ position: 30, duration: 100 });
            await PlaybackService({ type: Event.RemoteSkipForward, interval: 10 });
            expect(mockSeek).toHaveBeenCalledWith(40);
        });

        it('calls seek on RemoteSkipBackward', async () => {
            (TrackPlayer.getProgress as jest.Mock).mockReturnValueOnce({ position: 30, duration: 100 });
            await PlaybackService({ type: Event.RemoteSkipBackward, interval: 10 });
            expect(mockSeek).toHaveBeenCalledWith(20);
        });

        it('clears TrackPlayer on RemoteStop', async () => {
            await PlaybackService({ type: Event.RemoteStop });
            expect(TrackPlayer.clear).toHaveBeenCalled();
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
    });

    describe('Event listeners via Foreground AddEventListener', () => {
        // Just spot check one to ensure it was registered since it points to the same logic
        it('calls seek on RemoteSeek', async () => {
            await triggerForegroundEvent(Event.RemoteSeek, { position: 50 });
            expect(mockSeek).toHaveBeenCalledWith(50);
        });
        
        it('updates isPlaying on IsPlayingChanged', async () => {
            await triggerForegroundEvent(Event.IsPlayingChanged, { playing: true });
            const state = useStore.getState();
            expect(state.isPlaying).toBe(true);
        });
    });
});
