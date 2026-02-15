import { EventEmitter } from 'events';
import Client from 'chromecast-api';
import { CastDevice, Track } from '../../shared/types';

export class CastService extends EventEmitter {
    private client: any;
    private devices: Map<string, any> = new Map();
    private connectedDevice: any = null;
    private isScanning: boolean = false;

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
                    console.log(`[CastService] Discovered device: ${device.friendlyName} at ${device.host}`);
                    this.devices.set(device.host, device);
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
            id: device.host,
            name: device.friendlyName,
            host: device.host,
            friendlyName: device.friendlyName,
            type: 'chromecast',
            status: this.connectedDevice?.host === device.host ? 'connected' : 'disconnected'
        }));
    }

    async connect(host: string): Promise<void> {
        const device = this.devices.get(host);
        if (!device) throw new Error('Device not found');

        console.log(`[CastService] Connecting to ${device.friendlyName}...`);
        this.connectedDevice = device;

        // The library connects on play, but we want to track status
        this.emit('status-changed', {
            status: 'connected',
            device: this.getDevices().find(d => d.host === host)
        });
    }

    disconnect() {
        if (this.connectedDevice) {
            console.log(`[CastService] Disconnecting from ${this.connectedDevice.friendlyName}...`);
            try {
                this.connectedDevice.stop();
            } catch (e) {
                // Ignore stop errors on disconnect
            }
            this.connectedDevice = null;
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

        this.connectedDevice.play(media, { startTime }, (err: any) => {
            if (err) {
                console.error('[CastService] Play error:', err);
                this.emit('error', err);
            }
        });

        // Listen for errors on the device itself
        this.connectedDevice.on('error', (err: any) => {
            console.error('[CastService] Device error:', err);
            this.emit('error', err);
        });

        // Listen for status updates from the device
        this.connectedDevice.on('status', (status: any) => {
            this.emit('device-status', status);

            if (status.playerState === 'IDLE' && status.idleReason === 'FINISHED') {
                this.emit('finished');
            }
        });
    }

    pause() {
        if (!this.connectedDevice) return;
        this.connectedDevice.pause((err: any) => {
            if (err) console.error('[CastService] Pause error:', err);
        });
    }

    resume() {
        if (!this.connectedDevice) return;
        this.connectedDevice.resume((err: any) => {
            if (err) console.error('[CastService] Resume error:', err);
        });
    }

    stop() {
        if (!this.connectedDevice) return;
        this.connectedDevice.stop((err: any) => {
            if (err) console.error('[CastService] Stop error:', err);
        });
    }

    seek(time: number) {
        if (!this.connectedDevice) return;
        this.connectedDevice.seekTo(time, (err: any) => {
            if (err) console.error('[CastService] Seek error:', err);
        });
    }

    setVolume(volume: number) {
        if (!this.connectedDevice) return;
        this.connectedDevice.setVolume(volume, (err: any) => {
            if (err) console.error('[CastService] Set volume error:', err);
        });
    }

    setMuted(muted: boolean) {
        if (!this.connectedDevice) return;
        this.connectedDevice.setVolumeMuted(muted, (err: any) => {
            if (err) console.error('[CastService] Set muted error:', err);
        });
    }

    getConnectedDevice(): CastDevice | null {
        if (!this.connectedDevice) return null;
        return this.getDevices().find(d => d.host === this.connectedDevice.host) || null;
    }
}
