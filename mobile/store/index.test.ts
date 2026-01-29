import { useStore } from './index';
import { webSocketService } from '../services/WebSocketService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';

// Mock WebSocketService
jest.mock('../services/WebSocketService', () => ({
    webSocketService: {
        connect: jest.fn(),
        disconnect: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    },
}));

// Mock DiscoveryService
jest.mock('../services/discovery.service', () => ({
    DiscoveryService: {
        scanNetwork: jest.fn(),
    }
}));

// Mock player service
jest.mock('../services/player', () => ({
    addTrack: jest.fn(),
}));

describe('Mobile useStore', () => {
    beforeEach(() => {
        useStore.setState({
            hostIp: '',
            connectionStatus: 'disconnected',
            recentIps: [],
            isScanning: false,
        });
        jest.clearAllMocks();
        AsyncStorage.clear();
    });

    it('should connect to a host', async () => {
        const ip = '192.168.1.10';
        await act(async () => {
            await useStore.getState().connect(ip);
        });

        expect(useStore.getState().hostIp).toBe(ip);
        expect(useStore.getState().connectionStatus).toBe('connecting');
        expect(webSocketService.connect).toHaveBeenCalledWith(ip);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('recent_ips', expect.any(String));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('last_ip', ip);
    });

    it('should disconnect', () => {
        act(() => {
            useStore.getState().disconnect();
        });

        expect(useStore.getState().connectionStatus).toBe('disconnected');
        expect(useStore.getState().hostIp).toBe('');
        expect(webSocketService.disconnect).toHaveBeenCalled();
    });

    it('should send play command', () => {
        act(() => {
            useStore.getState().play();
        });
        expect(webSocketService.send).toHaveBeenCalledWith('play');
    });

    it('should send pause command', () => {
        act(() => {
            useStore.getState().pause();
        });
        expect(webSocketService.send).toHaveBeenCalledWith('pause');
    });
});
