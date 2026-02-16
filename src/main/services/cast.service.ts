import { EventEmitter } from 'events';
import Client from 'chromecast-api';
import { CastDevice, Track } from '../../shared/types';

export class CastService extends EventEmitter {
    private client: any;
    private devices: Map<string, any> = new Map();
    private connectedDevice: any = null;
    private isScanning: boolean = false;
    private hasActiveSession: boolean = false;

    private handleDeviceError = (err: any) => {
        console.error('[CastService] Device error:', err);
        this.emit('error', err);
    };

    private handleDeviceStatus = (status: any) => {
        this.emit('device-status', status);

        if (status.playerState === 'IDLE' && status.idleReason === 'FINISHED') {
            this.emit('finished');
        }

        // Update session state based on player state
        if (status.playerState && status.playerState !== 'IDLE') {
            this.hasActiveSession = true;
        } else if (status.playerState === 'IDLE') {
            // Any IDLE state means the session is effectively gone or finished
            this.hasActiveSession = false;
        }
    };

    private setupDeviceListeners(device: any) {
        // Remove existing listeners if any to avoid duplicates
        this.cleanupDeviceListeners(device);

        device.on('error', this.handleDeviceError);
        device.on('status', this.handleDeviceStatus);
    }

    private cleanupDeviceListeners(device: any) {
        if (!device) return;
        device.removeListener('error', this.handleDeviceError);
        device.removeListener('status', this.handleDeviceStatus);
    }

    constructor() {
        super();
        // Client initialized on demand
    }

    startDiscovery() {
        if (this.isScanning) return;

        if (!this.client) {
            try {
                this.client = new Client();
                this.client.on('device', (device: any) => {
                    const existing = this.devices.get(device.friendlyName);
                    const isIP = (h: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(h);

                    if (existing) {
                        // If we already have a numeric IP, and the new discovery is a .local hostname, ignore the update
                        // because numeric IPs are generally more stable and don't rely on MDNS resolution.
                        if (isIP(existing.host) && !isIP(device.host)) {
                            return;
                        }
                    }

                    console.log(`[CastService] Discovered/Updated device: ${device.friendlyName} at ${device.host}`);
                    // Use friendlyName as unique identifier to avoid duplicates from IP vs MDNS
                    this.devices.set(device.friendlyName, device);
                    this.emit('devices-updated', this.getDevices());
                });

                // Forward errors from the client if possible (chromecast-api might not emit error on client itself, but on devices)
            } catch (err) {
                console.error('[CastService] Failed to initialize Chromecast client:', err);
                this.emit('error', err);
                return;
            }
        }

        this.isScanning = true;
        console.log('[CastService] Starting discovery...');
        this.client?.update(); // trigger search
    }

    stopDiscovery() {
        if (!this.isScanning) return;
        this.isScanning = false;
        console.log('[CastService] Stopping discovery...');

        // If we are not connected to any device, we can destroy the client to save resources
        if (!this.connectedDevice && this.client) {
            try {
                this.client.destroy();
                this.client = null;
                this.devices.clear();
                this.emit('devices-updated', []);
            } catch (error) {
                console.error('[CastService] Error destroying client:', error);
            }
        }
    }

    getDevices(): CastDevice[] {
        return Array.from(this.devices.values()).map(device => ({
            id: device.friendlyName,
            name: device.friendlyName,
            host: device.host,
            friendlyName: device.friendlyName,
            type: 'chromecast',
            status: this.connectedDevice?.friendlyName === device.friendlyName ? 'connected' : 'disconnected'
        }));
    }

    async connect(id: string): Promise<void> {
        const device = this.devices.get(id);
        if (!device) throw new Error('Device not found');

        console.log(`[CastService] Connecting to ${device.friendlyName}...`);

        // Cleanup old device if different
        if (this.connectedDevice && this.connectedDevice !== device) {
            this.cleanupDeviceListeners(this.connectedDevice);
        }

        this.connectedDevice = device;
        this.hasActiveSession = false;
        this.setupDeviceListeners(this.connectedDevice);

        // The library connects on play, but we want to track status
        this.emit('status-changed', {
            status: 'connected',
            device: this.getDevices().find(d => d.id === id)
        });
    }

    disconnect() {
        if (this.connectedDevice) {
            console.log(`[CastService] Disconnecting from ${this.connectedDevice.friendlyName}...`);
            try {
                this.cleanupDeviceListeners(this.connectedDevice);
                this.connectedDevice.stop();
            } catch (e) {
                // Ignore stop errors on disconnect
            }
            this.connectedDevice = null;
            this.hasActiveSession = false;
            this.emit('status-changed', { status: 'disconnected' });
        }
    }

    play(track: Track, startTime: number = 0) {
        if (!this.connectedDevice) {
            console.warn('[CastService] Play called but no device connected');
            return;
        }

        console.log(`[CastService] Playing ${track.title} on ${this.connectedDevice.friendlyName}`);
        const media = {
            url: track.streamUrl,
            contentType: 'audio/mpeg',
            metadata: {
                title: track.title,
                artist: track.artist,
                albumName: track.album,
                images: track.artworkUrl ? [{ url: track.artworkUrl }] : []
            }
        };

        this.hasActiveSession = false; // Reset until confirmed
        this.connectedDevice.play(media, { startTime }, (err: any) => {
            if (err) {
                console.error('[CastService] Play error:', err);
                this.emit('error', err);
            } else {
                this.hasActiveSession = true;
            }
        });
    }

    pause() {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.pause((err: any) => {
            if (err) {
                console.error('[CastService] Pause error:', err);
                if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) {
                    this.hasActiveSession = false;
                }
            }
        });
    }

    resume() {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.resume((err: any) => {
            if (err) {
                console.error('[CastService] Resume error:', err);
                if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) {
                    this.hasActiveSession = false;
                }
            }
        });
    }

    stop() {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.stop((err: any) => {
            if (err) {
                console.error('[CastService] Stop error:', err);
                if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) {
                    this.hasActiveSession = false;
                }
            }
            this.hasActiveSession = false;
        });
    }

    seek(time: number) {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.seekTo(time, (err: any) => {
            if (err) console.error('[CastService] Seek error:', err);
        });
    }

    setVolume(volume: number) {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.setVolume(volume, (err: any) => {
            if (err) console.error('[CastService] Set volume error:', err);
        });
    }

    setMuted(muted: boolean) {
        if (!this.connectedDevice || !this.hasActiveSession) return;
        this.connectedDevice.setVolumeMuted(muted, (err: any) => {
            if (err) console.error('[CastService] Set muted error:', err);
        });
    }

    getConnectedDevice(): CastDevice | null {
        if (!this.connectedDevice) return null;
        return this.getDevices().find(d => d.id === this.connectedDevice.friendlyName) || null;
    }
}
