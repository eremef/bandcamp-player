/// <reference types="jest" />
import TrackPlayer, { Event } from 'react-native-track-player';
import { PlaybackService } from './TrackPlayerService';
import { useStore } from '../store';

// Mock dependencies
jest.mock('react-native-track-player', () => ({
    __esModule: true,
    default: {
        addEventListener: jest.fn(),
        getProgress: jest.fn().mockResolvedValue({ position: 30 }),
        reset: jest.fn(),
    },
    Event: {
        RemotePlay: 'remote-play',
        RemotePause: 'remote-pause',
        RemoteNext: 'remote-next',
        RemotePrevious: 'remote-previous',
        RemoteSeek: 'remote-seek',
        RemoteJumpForward: 'remote-jump-forward',
        RemoteJumpBackward: 'remote-jump-backward',
        RemoteStop: 'remote-stop',
    },
}));

jest.mock('../store', () => ({
    useStore: {
        getState: jest.fn(() => ({
            play: jest.fn(),
            pause: jest.fn(),
            next: jest.fn(),
            previous: jest.fn(),
            seek: jest.fn(),
        })),
    },
}));

describe('TrackPlayerService', () => {
    let eventHandlers: Record<string, (payload?: any) => void>;
    let mockStoreActions: any;

    beforeEach(() => {
        eventHandlers = {};
        mockStoreActions = {
            play: jest.fn(),
            pause: jest.fn(),
            next: jest.fn(),
            previous: jest.fn(),
            seek: jest.fn(),
        };

        (useStore.getState as jest.Mock).mockReturnValue(mockStoreActions);

        (TrackPlayer.addEventListener as any).mockImplementation((event: string, handler: (payload?: any) => void) => {
            eventHandlers[event] = handler;
            return { remove: jest.fn() };
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should register all event listeners', async () => {
        await PlaybackService();

        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemotePlay, expect.any(Function));
        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemotePause, expect.any(Function));
        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemoteNext, expect.any(Function));
        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemotePrevious, expect.any(Function));
        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemoteSeek, expect.any(Function));
        expect(TrackPlayer.addEventListener).toHaveBeenCalledWith(Event.RemoteStop, expect.any(Function));
    });

    it('should call store.play on RemotePlay', async () => {
        await PlaybackService();
        eventHandlers[Event.RemotePlay]();

        expect(mockStoreActions.play).toHaveBeenCalled();
    });

    it('should call store.pause on RemotePause', async () => {
        await PlaybackService();
        eventHandlers[Event.RemotePause]();

        expect(mockStoreActions.pause).toHaveBeenCalled();
    });

    it('should call store.next on RemoteNext', async () => {
        await PlaybackService();
        eventHandlers[Event.RemoteNext]();

        expect(mockStoreActions.next).toHaveBeenCalled();
    });

    it('should call store.previous on RemotePrevious', async () => {
        await PlaybackService();
        eventHandlers[Event.RemotePrevious]();

        expect(mockStoreActions.previous).toHaveBeenCalled();
    });

    it('should call store.seek with position on RemoteSeek', async () => {
        await PlaybackService();
        eventHandlers[Event.RemoteSeek]({ position: 60 });

        expect(mockStoreActions.seek).toHaveBeenCalledWith(60);
    });

    it('should call store.seek with calculated position on RemoteJumpForward', async () => {
        await PlaybackService();
        await eventHandlers[Event.RemoteJumpForward]({ interval: 10 });

        // Position is 30, interval is 10, so seek to 40
        expect(mockStoreActions.seek).toHaveBeenCalledWith(40);
    });

    it('should call store.seek with calculated position on RemoteJumpBackward', async () => {
        await PlaybackService();
        await eventHandlers[Event.RemoteJumpBackward]({ interval: 10 });

        // Position is 30, interval is 10, so seek to 20
        expect(mockStoreActions.seek).toHaveBeenCalledWith(20);
    });

    it('should reset player on RemoteStop', async () => {
        await PlaybackService();
        eventHandlers[Event.RemoteStop]();

        expect(TrackPlayer.reset).toHaveBeenCalled();
    });
});
