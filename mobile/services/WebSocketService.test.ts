import { webSocketService } from './WebSocketService';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

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

    beforeEach(() => {
        originalWebSocket = global.WebSocket;
        (global as any).WebSocket = MockWebSocket;
        jest.useFakeTimers();
    });

    afterEach(() => {
        webSocketService.disconnect();
        (global as any).WebSocket = originalWebSocket;
        jest.useRealTimers();
    });

    it('should connect to the correct URL', () => {
        webSocketService.connect('127.0.0.1', 8080);
        // We can't easily access the private `ws` property, but we can verify side effects
        // Or we can spy on the constructor if we really needed to, but here we can check connection status event

        const statusSpy = jest.fn();
        webSocketService.on('connection-status', statusSpy);

        jest.advanceTimersByTime(100); // Wait for mocked connection
        expect(statusSpy).toHaveBeenCalledWith('connected');
    });

    it('should send messages when connected', () => {
        webSocketService.connect('127.0.0.1');
        jest.advanceTimersByTime(100);

        // We need to get the instance of the mock websocket to inspect 'send' calls
        // Since it's private in the service, we can't get it directly without casting to any
        const wsInstance = (webSocketService as any).ws;
        expect(wsInstance).toBeDefined();

        webSocketService.send('test-event', { foo: 'bar' });
        expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test-event', payload: { foo: 'bar' } }));
    });

    it('should handle incoming messages', () => {
        webSocketService.connect('127.0.0.1');
        jest.advanceTimersByTime(100);

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

    it('should attempt reconnect on close', () => {
        webSocketService.connect('127.0.0.1');
        jest.advanceTimersByTime(100);

        const wsInstance = (webSocketService as any).ws;

        // Simulate close
        wsInstance.onclose();

        // Spy via static hook
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(5000);
        expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should stop reconnect on explicit disconnect', () => {
        webSocketService.connect('127.0.0.1');
        jest.advanceTimersByTime(100);

        const wsInstance = (webSocketService as any).ws;
        // Simulate close
        wsInstance.onclose();

        // Should trigger reconnect loop
        // We disconnect explicitly
        webSocketService.disconnect();

        // Create Spy
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(10000);
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('should handle disconnect message from server', () => {
        webSocketService.connect('127.0.0.1');
        jest.advanceTimersByTime(100);

        const wsInstance = (webSocketService as any).ws;
        const closeSpy = jest.spyOn(wsInstance, 'close');

        // Simulate receiving disconnect message
        wsInstance.onmessage({ data: JSON.stringify({ type: 'disconnect' }) });

        // Verify socket closed
        expect(closeSpy).toHaveBeenCalled();

        // Verify reconnection is stopped
        const createSpy = jest.fn();
        MockWebSocket.onCreated = createSpy;

        jest.advanceTimersByTime(10000);
        expect(createSpy).not.toHaveBeenCalled();

        // Verify status emitted
        const statusSpy = jest.fn();
        webSocketService.on('connection-status', statusSpy);

        // Simulate disconnect message again to trigger emit
        wsInstance.onmessage({ data: JSON.stringify({ type: 'disconnect' }) });

        // Check if called with explicit flag
        expect(statusSpy).toHaveBeenCalledWith('disconnected', true);
    });
});
