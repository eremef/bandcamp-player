import { webSocketService } from '../../services/WebSocketService';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock WebSocket class
// Mock WebSocket class
class MockWebSocket {
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static CONNECTING = 0;
    static onCreated: () => void = () => { };

    url: string;
    readyState: number = MockWebSocket.CONNECTING;
    onopen: () => void = () => { };
    onmessage: (event: any) => void = () => { };
    onclose: () => void = () => { };
    onerror: (err: any) => void = () => { };
    send: (data: string) => void = jest.fn();
    close: () => void = jest.fn();

    constructor(url: string) {
        this.url = url;
        MockWebSocket.onCreated();
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen();
        }, 10);
    }
}

describe('WebSocketService', () => {
    let originalWebSocket: any;
    let originalPlatform: string;

    const connectUnsafe = async (port = 8080) => {
        await webSocketService.connect('192.168.1.10', { mode: 'unsafe', port });
        jest.advanceTimersByTime(20);
    };

    beforeEach(async () => {
        await AsyncStorage.clear();
        jest.clearAllMocks();
        originalWebSocket = global.WebSocket;
        originalPlatform = Platform.OS;
        Platform.OS = 'web';
        (global as any).WebSocket = MockWebSocket;
        MockWebSocket.onCreated = () => { };
        (webSocketService as any).listeners = {};
        jest.useFakeTimers();
    });

    afterEach(() => {
        webSocketService.disconnect();
        (global as any).WebSocket = originalWebSocket;
        Platform.OS = originalPlatform as any;
        jest.useRealTimers();
    });

    it('should connect to the correct URL in explicitly selected unsafe mode', async () => {
        const statusSpy = jest.fn();
        webSocketService.on('connection-status', statusSpy);

        await connectUnsafe();

        expect((webSocketService as any).ws.url).toBe('ws://192.168.1.10:8080');
        expect(statusSpy).toHaveBeenCalledWith('connected');
    });

    it('uses the restored in-app mode when connecting without options', async () => {
        await AsyncStorage.setItem('remote_security_mode', 'unsafe');

        await webSocketService.connect('192.168.1.10');
        jest.advanceTimersByTime(20);

        expect((webSocketService as any).ws.url).toBe('ws://192.168.1.10:9999');
    });
    it('should send messages when connected', async () => {
        await connectUnsafe();

        // We need to get the instance of the mock websocket to inspect 'send' calls
        // Since it's private in the service, we can't get it directly without casting to any
        const wsInstance = (webSocketService as any).ws;
        expect(wsInstance).toBeDefined();

        webSocketService.send('test-event', { foo: 'bar' });
        expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test-event', payload: { foo: 'bar' } }));
    });

    it('should handle incoming messages', async () => {
        await connectUnsafe();

        const handler = jest.fn();
        webSocketService.on('my-event', handler);

        const wsInstance = (webSocketService as any).ws;
        wsInstance.onmessage({ data: JSON.stringify({ type: 'my-event', payload: 'data' }) });

        expect(handler).toHaveBeenCalledWith('data');
    });

    it('should remove listeners correctly', () => {
        const handler = jest.fn();
        const unsubscribe = webSocketService.on('test', handler);

        // Should receive
        (webSocketService as any).emit('test', '1');
        expect(handler).toHaveBeenCalledWith('1');

        unsubscribe();

        // Should not receive
        (webSocketService as any).emit('test', '2');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should attempt reconnect on close', async () => {
        await connectUnsafe();

        const wsInstance = (webSocketService as any).ws;

        // Simulate close
        wsInstance.onclose({ code: 1006, reason: 'network failure' });

        // Spy via static hook
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(5000);
        expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should stop reconnect on explicit disconnect', async () => {
        await connectUnsafe();

        const wsInstance = (webSocketService as any).ws;
        // Simulate close
        wsInstance.onclose({ code: 1006, reason: 'network failure' });

        // Should trigger reconnect loop
        // We disconnect explicitly
        webSocketService.disconnect();

        // Create Spy
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(10000);
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('should handle disconnect message from server', async () => {
        await connectUnsafe();

        const wsInstance = (webSocketService as any).ws;
        const closeSpy = jest.spyOn(wsInstance, 'close');

        const statusSpy = jest.fn();
        webSocketService.on('connection-status', statusSpy);

        // Simulate receiving disconnect message
        wsInstance.onmessage({ data: JSON.stringify({ type: 'disconnect' }) });

        // Verify socket closed
        expect(closeSpy).toHaveBeenCalled();

        // Verify reconnection is stopped
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(10000);
        expect(createSpy).not.toHaveBeenCalled();

        expect(statusSpy).toHaveBeenCalledWith('disconnected', true);
    });

    it('rejects remote hosts outside the LAN range', async () => {
        const errorSpy = jest.fn();
        webSocketService.on('connection-error', errorSpy);

        await webSocketService.connect('8.8.8.8', { mode: 'unsafe' });

        expect(errorSpy).toHaveBeenCalledWith('Enter the desktop IPv4 address on your local network.');
        expect((webSocketService as any).ws).toBeNull();
    });

    it('requires a certificate fingerprint before starting a safe connection', async () => {
        const errorSpy = jest.fn();
        webSocketService.on('connection-error', errorSpy);

        await webSocketService.connect('192.168.1.10', { mode: 'safe' });

        expect(errorSpy).toHaveBeenCalledWith('Scan the desktop pairing QR code or enter its certificate fingerprint first.');
        expect((webSocketService as any).ws).toBeNull();
    });

    it('uses WSS and sends a pairing request after the secure handshake begins', async () => {
        await webSocketService.connect('192.168.1.10', {
            mode: 'safe',
            pairingCode: 'A'.repeat(24),
            caFingerprint: 'ab'.repeat(32),
        });
        jest.advanceTimersByTime(20);

        const wsInstance = (webSocketService as any).ws;
        expect(wsInstance.url).toBe(`wss://192.168.1.10:9999`);
        wsInstance.onmessage({ data: JSON.stringify({ type: 'authentication-required' }) });

        expect(wsInstance.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pair"'));
        expect(webSocketService.isConnected()).toBe(false);
    });

    it('stores approved pairing credentials and authenticates the connection', async () => {
        const statusSpy = jest.fn();
        webSocketService.on('connection-status', statusSpy);
        await webSocketService.connect('192.168.1.10', {
            mode: 'safe',
            pairingCode: 'A'.repeat(24),
            caFingerprint: 'ab'.repeat(32),
        });
        jest.advanceTimersByTime(20);

        const wsInstance = (webSocketService as any).ws;
        wsInstance.onmessage({ data: JSON.stringify({ type: 'authentication-required' }) });
        const credentials = {
            deviceId: 'paired-device',
            token: 'pairing-token',
            caFingerprint: 'CD:'.repeat(31) + 'CD',
        };
        wsInstance.onmessage({ data: JSON.stringify({ type: 'paired', payload: credentials }) });
        await Promise.resolve();

        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            expect.stringContaining('remote_pairing_192_168_1_10'),
            JSON.stringify(credentials),
        );
        expect(statusSpy).toHaveBeenCalledWith('connected');
        expect(webSocketService.isConnected()).toBe(true);
        expect(wsInstance.send).toHaveBeenCalledWith(expect.stringContaining('"type":"identify"'));
    });

    it('authenticates with credentials saved from a previous pairing', async () => {
        const credentials = {
            deviceId: 'paired-device',
            token: 'pairing-token',
            caFingerprint: 'ab'.repeat(32),
        };
        (SecureStore.getItemAsync as any).mockResolvedValue(JSON.stringify(credentials));

        await webSocketService.connect('192.168.1.10', { mode: 'safe' });
        jest.advanceTimersByTime(20);
        const wsInstance = (webSocketService as any).ws;
        wsInstance.onmessage({ data: JSON.stringify({ type: 'authentication-required' }) });

        expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'authenticate',
            payload: { deviceId: credentials.deviceId, token: credentials.token },
        }));
        expect(wsInstance.url).toBe('wss://192.168.1.10:9999');
    });
});
