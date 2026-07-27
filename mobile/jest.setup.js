// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// React Native Track Player is mocked via __mocks__/@rntp/player.ts

// Mock Expo modules if necessary
jest.mock('expo-linking', () => ({
    createURL: jest.fn(),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
        back: mockBack,
    }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback) => {
        callback();
    },
    mockPush,
    mockReplace,
    mockBack,
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
