// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock React Native Track Player
jest.mock('react-native-track-player', () => {
    const TrackPlayerMock = {
        setupPlayer: jest.fn().mockResolvedValue(undefined),
        updateOptions: jest.fn().mockResolvedValue(undefined),
        add: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
        skip: jest.fn().mockResolvedValue(undefined),
        skipToNext: jest.fn().mockResolvedValue(undefined),
        skipToPrevious: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn().mockResolvedValue(undefined),
        seekTo: jest.fn().mockResolvedValue(undefined),
        setVolume: jest.fn().mockResolvedValue(undefined),
        getVolume: jest.fn().mockResolvedValue(1),
        getQueue: jest.fn().mockResolvedValue([]),
        getCurrentTrack: jest.fn().mockResolvedValue(0),
        getDuration: jest.fn().mockResolvedValue(0),
        getPosition: jest.fn().mockResolvedValue(0),
        getProgress: jest.fn().mockResolvedValue({ position: 0, duration: 0 }),
        getState: jest.fn().mockResolvedValue('paused'),
        addEventListener: jest.fn(),
        getPlaybackState: jest.fn().mockResolvedValue({ state: 'paused' }),
        useTrackPlayerEvents: jest.fn(),
        useProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
    };

    return {
        __esModule: true,
        default: TrackPlayerMock,
        ...TrackPlayerMock,
        Event: {
            PlaybackState: 'playback-state',
            PlaybackError: 'playback-error',
            PlaybackQueueEnded: 'playback-queue-ended',
            PlaybackTrackChanged: 'playback-track-changed',
            PlaybackProgressUpdated: 'playback-progress-updated',
            RemotePlay: 'remote-play',
            RemotePause: 'remote-pause',
            RemoteStop: 'remote-stop',
            RemoteNext: 'remote-next',
            RemotePrevious: 'remote-previous',
            RemoteSeek: 'remote-seek',
            RemoteDuck: 'remote-duck',
            RemotePlayPause: 'remote-play-pause',
            RemoteJumpForward: 'remote-jump-forward',
            RemoteJumpBackward: 'remote-jump-backward',
        },
        State: {
            None: 'none',
            Ready: 'ready',
            Playing: 'playing',
            Paused: 'paused',
            Stopped: 'stopped',
            Buffering: 'buffering',
            Connecting: 'connecting',
        },
        Capability: {
            Play: 0,
            Pause: 1,
            Stop: 2,
            SkipToNext: 3,
            SkipToPrevious: 4,
            SeekTo: 5,
            JumpForward: 6,
            JumpBackward: 7,
        },
        AppKilledPlaybackBehavior: {
            StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
            ContinuePlayback: 'continue-playback',
        },
        RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    };
});

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
    useFocusEffect: (callback) => {
        callback();
    },

}));

jest.mock('expo-network', () => ({
    getIpAddressAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
    WHEN_UNLOCKED: 1,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 2,
    ALWAYS: 3,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 4,
    ALWAYS_THIS_DEVICE_ONLY: 5,
}));

jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(() => ({
        execAsync: jest.fn(),
        runAsync: jest.fn(),
        getFirstAsync: jest.fn(),
        getAllAsync: jest.fn(),
        withTransactionAsync: jest.fn((callback) => callback()),
    })),
}));

jest.mock('expo-file-system', () => ({
    documentDirectory: 'file:///mock/',
    cacheDirectory: 'file:///mock-cache/',
    makeDirectoryAsync: jest.fn(),
    readDirectoryAsync: jest.fn(),
    deleteAsync: jest.fn(),
    downloadAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
    expoConfig: {
        extra: {
            // Add any extra config if needed
        }
    }
}));

jest.mock('expo-web-browser', () => ({
    openBrowserAsync: jest.fn(),
    dismissBrowser: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    MaterialIcons: 'MaterialIcons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
    SafeAreaProvider: ({ children }) => <>{children}</>,
    SafeAreaView: ({ children }) => <>{children}</>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
