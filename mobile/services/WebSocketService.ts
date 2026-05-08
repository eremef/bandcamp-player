
import { Platform } from 'react-native';
import Constants from 'expo-constants';

type MessageHandler = (...args: any[]) => void;

class WebSocketService {

    private ws: WebSocket | null = null;
    private url: string | null = null;
    private listeners: Record<string, MessageHandler[]> = {};
    private isExplicitlyClosed = false;

    connect(host: string, port: number = 9999) {
        this.url = `ws://${host}:${port}`;
        this.isExplicitlyClosed = false;
        this.reconnectAttempts = 0;
        this.initWebSocket();
    }

    private initWebSocket() {
        if (!this.url) return;

        this.stopReconnect();

        if (this.ws) {
            this.ws.close();
        }

        if (this.reconnectAttempts === 0) {
            console.log(`Connecting to ${this.url}`);
        }
        const socket = new WebSocket(this.url);
        this.ws = socket;
        let isThisSocketClosed = false;

        socket.onopen = () => {
            if (this.ws !== socket) return;
            console.log('Connected to desktop app');
            this.stopReconnect();
            this.emit('connection-status', 'connected');
            this.sendIdentify();
        };

        socket.onmessage = (event) => {
            if (this.ws !== socket) return;
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'disconnect') {
                    console.log('Received disconnect from host');
                    this.isExplicitlyClosed = true;
                    isThisSocketClosed = true;
                    this.stopReconnect();
                    socket.close();
                    this.emit('connection-status', 'disconnected', true);
                    return;
                }
                this.emit(message.type, message.payload);
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        };

        socket.onclose = () => {
            if (isThisSocketClosed) return;
            isThisSocketClosed = true;

            if (this.ws === socket) {
                this.emit('connection-status', 'disconnected', this.isExplicitlyClosed);
                if (!this.isExplicitlyClosed) {
                    this.startReconnect();
                }
            }
        };

        socket.onerror = (_e) => {
            if (isThisSocketClosed || this.isExplicitlyClosed) return;
            // Silent error during connection attempts to avoid spamming logs
        };
    }

    private sendIdentify() {
        const platform = Platform.OS;
        const version = Constants.expoConfig?.version || 'unknown';

        this.send('identify', {
            platform,
            appVersion: version,
            device: 'mobile'
        });
    }

    send(type: string, payload?: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        } else {
            console.warn('WebSocket not connected, cannot send', type);
        }
    }

    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    on(type: string, handler: MessageHandler) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(handler);
        return () => this.off(type, handler);
    }

    off(type: string, handler: MessageHandler) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(h => h !== handler);
    }

    private emit(type: string, ...args: any[]) {
        if (this.listeners[type]) {
            this.listeners[type].forEach(h => h(...args));
        }
    }

    private reconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_DELAY = 120000; // 2 minutes

    private startReconnect() {
        if (this.reconnectTimeout || this.isExplicitlyClosed) return;

        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s, 120s...
        const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, this.MAX_RECONNECT_DELAY);
        
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.reconnectAttempts++;
            // Log first 3 attempts, then every 10th
            if (this.reconnectAttempts <= 3 || this.reconnectAttempts % 10 === 0) {
                console.log(`[WebSocket] Reconnect attempt #${this.reconnectAttempts} (delay ${delay}ms)`);
            }
            this.initWebSocket();
        }, delay);
    }

    private stopReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.isConnected()) {
            this.reconnectAttempts = 0;
        }
    }

    disconnect() {
        this.isExplicitlyClosed = true;
        this.stopReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export const webSocketService = new WebSocketService();
