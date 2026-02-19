
type MessageHandler = (...args: any[]) => void;

class WebSocketService {

    private ws: WebSocket | null = null;
    private url: string | null = null;
    private listeners: Record<string, MessageHandler[]> = {};
    private reconnectInterval: NodeJS.Timeout | null = null;
    private isExplicitlyClosed = false;

    connect(host: string, port: number = 9999) {
        this.url = `ws://${host}:${port}`;
        this.isExplicitlyClosed = false;
        this.initWebSocket();
    }

    private initWebSocket() {
        if (!this.url) return;

        // Stop any pending reconnect attempts when starting a fresh connection
        this.stopReconnect();

        if (this.ws) {
            // We don't null this.ws here because onclose will fire asynchronously
            // and we need to know NOT to reconnect for this specific instance.
            this.ws.close();
        }

        console.log(`Connecting to ${this.url}`);
        const socket = new WebSocket(this.url);
        this.ws = socket;
        let isThisSocketClosed = false;

        socket.onopen = () => {
            if (this.ws !== socket) return;
            console.log('Connected to desktop app');
            this.stopReconnect();
            this.emit('connection-status', 'connected');
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

            // Only proceed if this is still the active socket
            if (this.ws === socket) {
                console.log('Disconnected');
                this.emit('connection-status', 'disconnected', this.isExplicitlyClosed);
                if (!this.isExplicitlyClosed) {
                    this.startReconnect();
                }
            }
        };

        socket.onerror = (e) => {
            if (isThisSocketClosed || this.isExplicitlyClosed) return;
            if (this.ws === socket) {
                console.error('WebSocket error', e);
            }
        };
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

    private startReconnect() {
        if (this.reconnectInterval) return;
        console.log('Starting reconnect loop...');
        this.reconnectInterval = setInterval(() => {
            console.log('Attempting reconnect...');
            this.initWebSocket();
        }, 5000);
    }

    private stopReconnect() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
    }

    disconnect() {
        this.isExplicitlyClosed = true;
        this.stopReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // Also emit status here if needed, but on-close usually handles it.
        // If we close manually, onclose fires.
        // onclose calls emit('disconnected').
        // We should ensure onclose emits explicit flag if isExplicitlyClosed is true.
    }
}

export const webSocketService = new WebSocketService();
