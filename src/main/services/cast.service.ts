import { EventEmitter } from 'events';
import { connect, PersistentClient, DefaultMediaApp, MediaController, createPlatform } from '@foxxmd/chromecast-client';
import { Bonjour, Browser } from 'bonjour-service';
import { CastDevice, Track } from '../../shared/types';

export class CastService extends EventEmitter {
    private bonjour: Bonjour | null = null;
    private mdnsBrowser: Browser | null = null;
    private devices: Map<string, any> = new Map();

    private client: PersistentClient | null = null;
    private mediaController: MediaController.MediaController | null = null;
    private connectedDeviceName: string | null = null;
    private isScanning: boolean = false;
    private hasActiveSession: boolean = false;
    private statusInterval: NodeJS.Timeout | null = null;

    private handleDeviceError = (err: any) => {
        console.error('[CastService] Device error:', err);
        this.emit('error', err);
    };

    private handleDeviceStatus = (status: any) => {
        // The new library wraps media status in Result objects, but if we wire up event listeners...
        // We'll manage state internally via polling or relying on the library's heartbeat.
        this.emit('device-status', status);

        if (status?.playerState === 'IDLE' && status?.idleReason === 'FINISHED') {
            this.emit('finished');
        }

        if (status?.playerState && status.playerState !== 'IDLE') {
            this.hasActiveSession = true;
        } else if (status?.playerState === 'IDLE') {
            this.hasActiveSession = false;
        }
    };

    constructor() {
        super();
        this.bonjour = new Bonjour();
    }

    private startStatusPolling() {
        this.stopStatusPolling();
        this.statusInterval = setInterval(async () => {
            if (this.mediaController && this.hasActiveSession) {
                try {
                    const statusResult = await this.mediaController.getStatus();
                    const unwrapped = statusResult.unwrapWithErr();
                    if (unwrapped.isOk) {
                        this.handleDeviceStatus(unwrapped.value);
                    }
                } catch (err) {
                    console.error('[CastService] Error polling status:', err);
                }
            }
        }, 1000);
    }

    private stopStatusPolling() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    startDiscovery() {
        if (this.isScanning) return;

        this.isScanning = true;
        console.log('[CastService] Starting discovery...');

        if (!this.mdnsBrowser && this.bonjour) {
            this.mdnsBrowser = this.bonjour.find({ type: 'googlecast' });

            this.mdnsBrowser.on('up', (service) => {
                const name = service.txt?.fn || service.name;
                const existing = this.devices.get(name);

                // IPv4 addresses are preferred.
                const ipv4 = service.addresses?.find((ip: string) => ip.includes('.'));
                const host = ipv4 || service.addresses?.[0] || service.host;

                // Only update if it's new or we found a better IP.
                if (!existing || (ipv4 && !existing.host.includes('.'))) {
                    console.log(`[CastService] Discovered/Updated device: ${name} at ${host}`);
                    this.devices.set(name, {
                        friendlyName: name,
                        host: host,
                        port: service.port,
                    });
                    this.emit('devices-updated', this.getDevices());
                }
            });

            this.mdnsBrowser.on('down', (service) => {
                const name = service.txt?.fn || service.name;
                if (this.devices.has(name) && name !== this.connectedDeviceName) {
                    this.devices.delete(name);
                    this.emit('devices-updated', this.getDevices());
                }
            });
        }

        this.mdnsBrowser?.start();
    }

    stopDiscovery() {
        if (!this.isScanning) return;
        this.isScanning = false;
        console.log('[CastService] Stopping discovery...');

        if (this.mdnsBrowser) {
            this.mdnsBrowser.stop();
        }

        if (!this.client) {
            this.devices.clear();
            this.emit('devices-updated', []);
        }
    }

    getDevices(): CastDevice[] {
        return Array.from(this.devices.values()).map(device => ({
            id: device.friendlyName,
            name: device.friendlyName,
            host: device.host,
            friendlyName: device.friendlyName,
            type: 'chromecast',
            status: this.connectedDeviceName === device.friendlyName ? 'connected' : 'disconnected'
        }));
    }

    async connect(id: string): Promise<void> {
        const device = this.devices.get(id);
        if (!device) throw new Error('Device not found');

        console.log(`[CastService] Connecting to ${device.friendlyName} at ${device.host}...`);

        try {
            if (this.client) {
                this.client.close();
                this.client = null;
                this.mediaController = null;
            }

            this.client = await connect({ host: device.host });

            this.client.on('error', this.handleDeviceError);

            this.connectedDeviceName = device.friendlyName;
            this.hasActiveSession = false;

            this.emit('status-changed', {
                status: 'connected',
                device: this.getDevices().find(d => d.id === id)
            });
        } catch (error) {
            console.error('[CastService] Connection failed:', error);
            this.connectedDeviceName = null;
            this.client = null;
            throw error;
        }
    }

    disconnect() {
        if (this.client) {
            console.log(`[CastService] Disconnecting from ${this.connectedDeviceName}...`);
            try {
                if (this.mediaController) {
                    this.mediaController.stop().catch(() => { });
                    this.mediaController.dispose();
                }
                this.client.close();
            } catch {
                // Ignore stop errors on disconnect
            }
            this.client = null;
            this.mediaController = null;
            this.connectedDeviceName = null;
            this.hasActiveSession = false;
            this.stopStatusPolling();
            this.emit('status-changed', { status: 'disconnected' });
        }
    }

    async play(track: Track, startTime: number = 0) {
        if (!this.client) {
            console.warn('[CastService] Play called but no device connected');
            return;
        }

        console.log(`[CastService] Playing ${track.title} on ${this.connectedDeviceName}`);

        try {
            // Re-launch media app to ensure clean state
            const launchResult = await DefaultMediaApp.launchAndJoin({ client: this.client });
            const unwrappedLaunch = launchResult.unwrapWithErr();

            if (!unwrappedLaunch.isOk) {
                throw unwrappedLaunch.value;
            }

            if (this.mediaController) {
                this.mediaController.dispose();
            }
            this.mediaController = unwrappedLaunch.value;

            this.hasActiveSession = false;

            const loadResult = await this.mediaController.load({
                media: {
                    contentId: track.streamUrl,
                    streamType: 'BUFFERED',
                    contentType: 'audio/mpeg',
                    metadata: {
                        metadataType: 3, // MUSIC_TRACK
                        title: track.title,
                        artist: track.artist,
                        albumName: track.album,
                        images: track.artworkUrl ? [{ url: track.artworkUrl }] : []
                    }
                },
                currentTime: startTime,
                autoplay: true
            });

            const unwrappedLoad = loadResult.unwrapWithErr();

            if (unwrappedLoad.isOk) {
                this.hasActiveSession = true;
                this.handleDeviceStatus(unwrappedLoad.value);
                this.startStatusPolling();
            } else {
                throw unwrappedLoad.value;
            }
        } catch (err: any) {
            console.error('[CastService] Play error:', err);
            this.emit('error', err);
        }
    }

    async pause() {
        if (!this.mediaController || !this.hasActiveSession) return;
        try {
            const res = await this.mediaController.pause();
            const unwrapped = res.unwrapWithErr();
            if (unwrapped.isOk) this.handleDeviceStatus(unwrapped.value);
        } catch (err: any) {
            console.error('[CastService] Pause error:', err);
            if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) this.hasActiveSession = false;
        }
    }

    async resume() {
        if (!this.mediaController || !this.hasActiveSession) return;
        try {
            const res = await this.mediaController.play();
            const unwrapped = res.unwrapWithErr();
            if (unwrapped.isOk) this.handleDeviceStatus(unwrapped.value);
        } catch (err: any) {
            console.error('[CastService] Resume error:', err);
            if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) this.hasActiveSession = false;
        }
    }

    async stop() {
        if (!this.mediaController || !this.hasActiveSession) return;
        try {
            const res = await this.mediaController.stop();
            const unwrapped = res.unwrapWithErr();
            if (unwrapped.isOk) this.handleDeviceStatus(unwrapped.value);
            this.hasActiveSession = false;
            this.stopStatusPolling();
        } catch (err: any) {
            console.error('[CastService] Stop error:', err);
            if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) this.hasActiveSession = false;
            this.hasActiveSession = false;
            this.stopStatusPolling();
        }
    }

    async seek(time: number) {
        if (!this.mediaController || !this.hasActiveSession) return;
        try {
            const res = await this.mediaController.seek({ currentTime: time });
            const unwrapped = res.unwrapWithErr();
            if (unwrapped.isOk) this.handleDeviceStatus(unwrapped.value);
        } catch (err: any) {
            console.error('[CastService] Seek error:', err);
        }
    }

    async setVolume(volume: number) {
        // volume parameter is traditionally 0-1 or 0-100? chromecast usually uses 0-1.
        // I will assume it is passed correctly without needing translation, per original method.
        try {
            if (!this.client) return;
            const platform = createPlatform(this.client);
            await platform.setVolume({ level: volume });
        } catch (err) {
            console.error('[CastService] Set volume error:', err);
        }
    }

    async setMuted(muted: boolean) {
        try {
            if (!this.client) return;
            const platform = createPlatform(this.client);
            await platform.setVolume({ mute: muted });
        } catch (err) {
            console.error('[CastService] Set muted error:', err);
        }
    }

    getConnectedDevice(): CastDevice | null {
        if (!this.connectedDeviceName) return null;
        return this.getDevices().find(d => d.id === this.connectedDeviceName) || null;
    }
}
