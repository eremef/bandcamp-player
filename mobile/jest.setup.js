// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock React Native Track Player
jest.mock('@rntp/player', () => {
    const TrackPlayerMock = {
        setupPlayer: jest.fn().mockResolvedValue(undefined),
        updateOptions: jest.fn().mockResolvedValue(undefined),
        setCommands: jest.fn().mockResolvedValue(undefined),
        addMediaItem: jest.fn().mockResolvedValue(undefined),
        setMediaItem: jest.fn().mockResolvedValue(undefined),
        setMediaItems: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
        skip: jest.fn().mockResolvedValue(undefined),
        skipToNext: jest.fn().mockResolvedValue(undefined),
        skipToPrevious: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn().mockResolvedValue(undefined),
        seekTo: jest.fn().mockResolvedValue(undefined),
        setVolume: jest.fn().mockResolvedValue(undefined),
        getVolume: jest.fn().mockReturnValue(1),
        getQueue: jest.fn().mockResolvedValue([]),
        getActiveMediaItemIndex: jest.fn().mockReturnValue(0),
        getProgress: jest.fn().mockReturnValue({ position: 0, duration: 0 }),
        isPlaying: jest.fn().mockReturnValue(false),
        addEventListener: jest.fn(),
        getPlaybackState: jest.fn().mockReturnValue('ready'),
    };

    return {
        __esModule: true,
        default: TrackPlayerMock,
        ...TrackPlayerMock,
        Event: {
            PlaybackStateChanged: 'event.playback-state-changed',
            PlaybackError: 'event.playback-error',
            QueueChanged: 'event.queue-changed',
            IsPlayingChanged: 'event.is-playing-changed',
            PlaybackProgressUpdated: 'event.playback-progress-updated',
            RemotePlay: 'event.remote-play',
            RemotePause: 'event.remote-pause',
            RemoteStop: 'event.remote-stop',
            RemoteNext: 'event.remote-next',
            RemotePrevious: 'event.remote-previous',
            RemoteSeek: 'event.remote-seek',
            RemoteSkipForward: 'event.remote-skip-forward',
            RemoteSkipBackward: 'event.remote-skip-backward',
        },
        PlaybackState: {
            Idle: 'idle',
            Ready: 'ready',
            Buffering: 'buffering',
            Ended: 'ended',
            Error: 'error',
        },
        PlayerCommand: {
            PlayPause: 0,
            Play: 1,
            Pause: 2,
            Stop: 3,
            Next: 4,
            Previous: 5,
            Seek: 6,
            SkipForward: 7,
            SkipBackward: 8,
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
    useLocalSearchParams: () => ({}),
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
