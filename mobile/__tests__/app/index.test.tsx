import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ConnectScreen from '../../app/index';

const mockStore = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    setHostIp: jest.fn(),
    hostIp: '',
    connectionStatus: 'disconnected',
    recentIps: [] as string[],
    autoConnect: jest.fn().mockResolvedValue(undefined),
    removeRecentIp: jest.fn(),
    startScan: jest.fn(),
    isScanning: false,
    mode: 'remote',
    setMode: jest.fn(),
    auth: { isAuthenticated: false, user: null },
    currentTrack: null,
};

jest.mock('../../store', () => ({
    useStore: Object.assign(jest.fn(() => mockStore), { getState: () => mockStore }),
}));

jest.mock('../../services/WebSocketService', () => ({
    webSocketService: {
        on: jest.fn(() => jest.fn()),
        isConnected: jest.fn(() => false),
    },
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('../../theme', () => ({
    useTheme: () => ({
        accent: '#0896af',
        background: '#121212',
        card: '#222222',
        border: '#333333',
        input: '#1e1e1e',
        text: '#ffffff',
        textSecondary: '#aaaaaa',
    }),
}));

describe('ConnectScreen Secure Mode', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await AsyncStorage.clear();
    });

    it('restores a saved unsafe choice after remount', async () => {
        await AsyncStorage.setItem('remote_security_mode', 'unsafe');
        const first = render(<ConnectScreen />);
        await waitFor(() => expect(first.getByLabelText('Secure Mode').props.value).toBe(false));
        first.unmount();

        const second = render(<ConnectScreen />);
        await waitFor(() => expect(second.getByLabelText('Secure Mode').props.value).toBe(false));
    });

    it('persists only a confirmed change and passes it to manual connection', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = render(<ConnectScreen />);
        const toggle = await screen.findByLabelText('Secure Mode');

        fireEvent(toggle, 'valueChange', false);
        expect(await AsyncStorage.getItem('remote_security_mode')).toBeNull();
        expect(toggle.props.value).toBe(true);

        const buttons = alert.mock.calls[0][2];
        act(() => buttons?.find((button) => button.text === 'Cancel')?.onPress?.());
        expect(await AsyncStorage.getItem('remote_security_mode')).toBeNull();

        fireEvent(toggle, 'valueChange', false);
        await act(async () => {
            alert.mock.calls[1][2]?.find((button) => button.text === 'Disable')?.onPress?.();
        });
        await waitFor(() => expect(screen.getByLabelText('Secure Mode').props.value).toBe(false));
        expect(await AsyncStorage.getItem('remote_security_mode')).toBe('unsafe');

        fireEvent.changeText(screen.getByPlaceholderText('Desktop IP address (e.g. 192.168.1.x)'), '192.168.1.10');
        fireEvent.press(screen.getByText('Connect'));
        expect(mockStore.connect).toHaveBeenCalledWith('192.168.1.10', expect.objectContaining({ mode: 'unsafe' }));
        alert.mockRestore();
    });

    it('persists re-enabling Secure Mode', async () => {
        await AsyncStorage.setItem('remote_security_mode', 'unsafe');
        const screen = render(<ConnectScreen />);
        await waitFor(() => expect(screen.getByLabelText('Secure Mode').props.value).toBe(false));

        await act(async () => {
            fireEvent(screen.getByLabelText('Secure Mode'), 'valueChange', true);
        });
        expect(screen.getByLabelText('Secure Mode').props.value).toBe(true);
        expect(await AsyncStorage.getItem('remote_security_mode')).toBe('safe');
    });
});