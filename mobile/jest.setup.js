// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock React Native Track Player
jest.mock('react-native-track-player', () => ({
    setupPlayer: jest.fn(),
    updateOptions: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    skip: jest.fn(),
    skipToNext: jest.fn(),
    skipToPrevious: jest.fn(),
    reset: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    setVolume: jest.fn(),
    getVolume: jest.fn(),
    setRate: jest.fn(),
    getRate: jest.fn(),
    getTrack: jest.fn(),
    getQueue: jest.fn(),
    getCurrentTrack: jest.fn(),
    getDuration: jest.fn(),
    getPosition: jest.fn(),
    getBufferedPosition: jest.fn(),
    getState: jest.fn(),
    useTrackPlayerEvents: jest.fn(),
    useProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
    Event: {
        PlaybackState: 'playback-state',
        PlaybackError: 'playback-error',
        PlaybackQueueEnded: 'playback-queue-ended',
        PlaybackTrackChanged: 'playback-track-changed',
        PlaybackProgressUpdated: 'playback-progress-updated',
    },
    State: {
        None: 'none',
        Ready: 'ready',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        Buffering: 'buffering',
        Connecting: 'connecting',
    }
}));

// Mock Expo modules if necessary
jest.mock('expo-linking', () => ({
    createURL: jest.fn(),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
}));

jest.mock('expo-network', () => ({
    getIpAddressAsync: jest.fn(),
}));

// Mock WebSocket
global.WebSocket = class WebSocket {
    constructor() {
        this.onopen = () => { };
        this.onmessage = () => { };
        this.onclose = () => { };
        this.onerror = () => { };
    }
    send() { }
    close() { }
};
