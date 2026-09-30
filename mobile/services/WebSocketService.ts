import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { PinnedWebSocket, pinnedWebSocketEmitter } from '../modules/pinned-websocket';

type MessageHandler = (...args: any[]) => void;
type SecurityMode = 'safe' | 'unsafe';

interface PairingCredentials {
    deviceId: string;
    token: string;
    caFingerprint: string;
}

export interface RemoteConnectionOptions {
    mode?: SecurityMode;
    pairingCode?: string;
    caFingerprint?: string;
    port?: number;
}

const getModeKey = (host: string) => `remote_security_mode_${host.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
const getCredentialKey = (host: string) => `remote_pairing_${host.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

class WebSocketService {
    private ws: WebSocket | null = null;
    private url: string | null = null;
    private host: string | null = null;
    private mode: SecurityMode = 'safe';
    private pairingCode: string | null = null;
    private caFingerprint: string | null = null;
    private credentials: PairingCredentials | null = null;
    private listeners: Record<string, MessageHandler[]> = {};
    private isExplicitlyClosed = false;
    private socketOpen = false;
    private isAuthenticated = false;
    private nativeSubscriptions: Array<{ remove: () => void }> = [];

    constructor() {
        if (pinnedWebSocketEmitter) {
            this.nativeSubscriptions = [
                pinnedWebSocketEmitter.addListener('onOpen', () => this.handleOpen()),
                pinnedWebSocketEmitter.addListener('onMessage', (event) => this.handleRawMessage(event.data)),
                pinnedWebSocketEmitter.addListener('onClose', (event) => this.handleClose(event.code, event.reason)),
                pinnedWebSocketEmitter.addListener('onError', (event) => this.handleError(event.message)),
            ];
        }
    }

    async connect(host: string, optionsOrPort: RemoteConnectionOptions | number = {}): Promise<void> {
        this.isExplicitlyClosed = true;
        this.stopReconnect();
        this.closeSocket();
        const normalizedHost = host.replace(/^https?:\/\//i, '').replace(/\/$/, '').trim();
        if (!isLanRemoteHost(normalizedHost)) {
            this.failClosed('Enter the desktop IPv4 address on your local network.');
            return;
        }
        const options = typeof optionsOrPort === 'number' ? { port: optionsOrPort } : optionsOrPort;
        this.host = normalizedHost;
        const savedMode = await AsyncStorage.getItem(getModeKey(normalizedHost));
        this.mode = options.mode ?? (savedMode === 'unsafe' ? 'unsafe' : 'safe');
        await AsyncStorage.setItem(getModeKey(normalizedHost), this.mode);
        this.pairingCode = options.pairingCode?.trim() || null;
        this.caFingerprint = options.caFingerprint?.replace(/:/g, '').toLowerCase() || null;
        this.reconnectAttempts = 0;
        this.isAuthenticated = false;
        this.socketOpen = false;

        try {
            const serializedCredentials = await SecureStore.getItemAsync(getCredentialKey(normalizedHost));
            this.credentials = serializedCredentials ? JSON.parse(serializedCredentials) as PairingCredentials : null;
        } catch {
            this.credentials = null;
        }

        if (!this.caFingerprint && this.credentials) {
            this.caFingerprint = this.credentials.caFingerprint;
        }
        if (this.mode === 'safe' && !this.caFingerprint) {
            this.failClosed('Scan the desktop pairing QR code or enter its certificate fingerprint first.');
            return;
        }

        const port = options.port ?? 9999;
        const protocol = this.mode === 'safe' ? 'wss' : 'ws';
        this.url = `${protocol}://${normalizedHost}:${port}`;
        this.isExplicitlyClosed = false;
        this.openSocket();
    }

    private openSocket(): void {
        if (!this.url) return;
        this.stopReconnect();
        this.closeSocket();

        if (Platform.OS !== 'web') {
            if (!PinnedWebSocket || !pinnedWebSocketEmitter) {
                this.failClosed('The secure mobile transport is missing. Update or reinstall the mobile app.');
                return;
            }
            void PinnedWebSocket.connect(this.url, this.mode === 'safe' ? this.caFingerprint : null)
                .catch((error) => this.failClosed(error instanceof Error ? error.message : 'Could not connect securely.'));
            return;
        }

        if (this.mode === 'safe' && !this.caFingerprint) {
            this.failClosed('Pair this browser with the desktop before connecting.');
            return;
        }
        const socket = new WebSocket(this.url);
        this.ws = socket;
        socket.onopen = () => {
            if (this.ws !== socket) return;
            this.handleOpen();
        };
        socket.onmessage = (event) => {
            if (this.ws === socket) this.handleRawMessage(String(event.data));
        };
        socket.onclose = (event) => {
            if (this.ws === socket) this.handleClose(event.code, event.reason);
        };
        socket.onerror = () => {
            if (this.ws === socket) this.handleError('Connection failed. Check the address and certificate trust.');
        };
    }

    private handleOpen(): void {
        this.socketOpen = true;
        this.stopReconnect();
        if (this.mode === 'unsafe') {
            this.isAuthenticated = true;
            this.emit('connection-status', 'connected');
            this.sendIdentify();
        } else {
            this.emit('connection-status', 'connecting');
        }
    }

    private handleRawMessage(raw: string): void {
        try {
            const message = JSON.parse(raw);
            if (message.type === 'authentication-required') {
                if (this.credentials) {
                    this.send('authenticate', {
                        deviceId: this.credentials.deviceId,
                        token: this.credentials.token,
                    });
                } else if (this.pairingCode && this.caFingerprint) {
                    this.send('pair', {
                        code: this.pairingCode,
                        deviceInfo: this.getDeviceInfo(),
                    });
                } else {
                    this.failClosed('This device is not paired with the desktop yet.');
                }
                return;
            }
            if (message.type === 'authenticated') {
                this.isAuthenticated = true;
                this.emit('connection-status', 'connected');
                this.sendIdentify();
                return;
            }
            if (message.type === 'paired') {
                void this.savePairing(message.payload as PairingCredentials);
                return;
            }
            if (message.type === 'authentication-failed') {
                if (this.mode === 'safe' && this.pairingCode && this.socketOpen) {
                    this.credentials = null;
                    if (this.host) {
                        void SecureStore.deleteItemAsync(getCredentialKey(this.host)).catch(() => undefined);
                    }
                    this.send('pair', {
                        code: this.pairingCode,
                        deviceInfo: this.getDeviceInfo(),
                    });
                    return;
                }
                void this.clearCredentials();
                this.failClosed('This pairing was revoked. Pair the device again from the desktop.');
                return;
            }
            if (message.type === 'pairing-failed' || message.type === 'pairing-rejected') {
                this.failClosed(message.payload?.message || 'The desktop rejected this pairing request.');
                return;
            }
            if (message.type === 'disconnect') {
                this.isExplicitlyClosed = true;
                this.closeSocket();
                this.emit('connection-status', 'disconnected', true);
                return;
            }
            this.emit(message.type, message.payload);
        } catch (error) {
            console.error('Failed to parse remote message', error);
        }
    }

    private async savePairing(payload: PairingCredentials): Promise<void> {
        if (!this.host || !payload?.deviceId || !payload.token || !payload.caFingerprint) {
            this.failClosed('The desktop returned an incomplete pairing response.');
            return;
        }
        this.credentials = payload;
        this.caFingerprint = payload.caFingerprint.replace(/:/g, '').toLowerCase();
        try {
            await SecureStore.setItemAsync(getCredentialKey(this.host), JSON.stringify(this.credentials));
            this.isAuthenticated = true;
            this.emit('connection-status', 'connected');
            this.sendIdentify();
            this.emit('paired-device', { host: this.host });
        } catch {
            this.failClosed('The pairing token could not be saved in secure storage.');
        }
    }

    private async clearCredentials(): Promise<void> {
        if (this.host) await SecureStore.deleteItemAsync(getCredentialKey(this.host)).catch(() => undefined);
        this.credentials = null;
    }

    private handleError(message: string): void {
        this.emit('connection-error', message);
        if (this.mode === 'safe' && !this.isAuthenticated) {
            this.failClosed(message);
        }
    }

    private handleClose(_code: number, _reason: string): void {
        this.socketOpen = false;
        if (this.isExplicitlyClosed) return;
        this.emit('connection-status', 'disconnected', false);
        if (this.mode === 'unsafe' || this.isAuthenticated) {
            this.isAuthenticated = false;
            this.startReconnect();
        } else {
            this.isExplicitlyClosed = true;
        }
    }

    private failClosed(message: string): void {
        this.isExplicitlyClosed = true;
        this.stopReconnect();
        this.closeSocket();
        this.emit('connection-error', message);
        this.emit('connection-status', 'disconnected', true);
    }

    private getDeviceInfo() {
        return {
            platform: Platform.OS,
            appVersion: Constants.expoConfig?.version || 'unknown',
            device: Platform.OS === 'android' ? 'Android device' : Platform.OS === 'ios' ? 'iPhone or iPad' : 'Web browser',
        };
    }

    private sendIdentify(): void {
        this.send('identify', this.getDeviceInfo());
    }

    send(type: string, payload?: any): void {
        const data = JSON.stringify({ type, payload });
        if (Platform.OS !== 'web') {
            if (this.socketOpen) PinnedWebSocket?.send(data);
            return;
        }
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    }

    isConnected(): boolean {
        return this.mode === 'safe' ? this.isAuthenticated : this.socketOpen;
    }

    on(type: string, handler: MessageHandler) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(handler);
        return () => this.off(type, handler);
    }

    off(type: string, handler: MessageHandler): void {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter((listener) => listener !== handler);
    }

    private emit(type: string, ...args: any[]): void {
        this.listeners[type]?.forEach((handler) => handler(...args));
    }

    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_DELAY = 120000;

    private startReconnect(): void {
        if (this.reconnectTimeout || this.isExplicitlyClosed) return;
        const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, this.MAX_RECONNECT_DELAY);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.reconnectAttempts++;
            this.openSocket();
        }, delay);
    }

    private stopReconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.isConnected()) this.reconnectAttempts = 0;
    }

    private closeSocket(): void {
        if (Platform.OS !== 'web') {
            PinnedWebSocket?.close();
        } else if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.socketOpen = false;
    }

    disconnect(): void {
        this.isExplicitlyClosed = true;
        this.isAuthenticated = false;
        this.stopReconnect();
        this.closeSocket();
        this.emit('connection-status', 'disconnected', true);
    }
}

function isLanRemoteHost(host: string): boolean {
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    return octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 169 && octets[1] === 254);
}

export const webSocketService = new WebSocketService();
