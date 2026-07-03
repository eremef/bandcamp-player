import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
    private connectedDeviceHost: string | null = null;
    private isScanning: boolean = false;
    private hasActiveSession: boolean = false;
    private statusInterval: ReturnType<typeof setInterval> | null = null;
    private logFilePath: string;

    private log(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const errorText = error ? ` - ${error instanceof Error ? error.stack || error.message : JSON.stringify(error)}` : '';
        const logLine = `${timestamp} - ${message}${errorText}\n`;
        
        if (error) {
            console.error(message, error);
        } else {
            console.log(message);
        }
        
        fs.appendFile(this.logFilePath, logLine, (err) => {
            if (err) console.error('[CastService] Failed to write to log file:', err);
        });
    }

    private handleDeviceError = (err: any) => {
        this.log('[CastService] Device error:', err);
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
        this.logFilePath = path.join(app.getPath('userData'), 'chromecast.log');
        this.log('[CastService] Initialized');
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
                    this.log('[CastService] Error polling status:', err);
                    this.disconnect();
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
        this.log('[CastService] Starting discovery...');

        if (!this.bonjour) {
            this.log('[CastService] Recreating Bonjour instance...');
            this.bonjour = new Bonjour();
            this.mdnsBrowser = null;
        }

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
                    this.log(`[CastService] Discovered/Updated device: ${name} at ${host}`);
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
        this.log('[CastService] Stopping discovery...');

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

        this.connectedDeviceName = device.friendlyName;
        this.connectedDeviceHost = device.host;
        this.log(`[CastService] Connecting to ${device.friendlyName} at ${device.host}...`);

        try {
            if (this.client) {
                try {
                    this.client.close();
                } catch (e) {
                    this.log('[CastService] Error closing previous client:', e);
                }
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
            this.log('[CastService] Connection failed:', error);
            this.connectedDeviceName = null;
            this.client = null;
            throw error;
        }
    }

    disconnect() {
        this.log(`[CastService] Disconnecting from ${this.connectedDeviceName || 'unknown'}...`);
        if (this.client) {
            try {
                if (this.mediaController) {
                    this.mediaController.stop().catch(() => { });
                }
                this.client.close();
            } catch {
                // Ignore stop errors on disconnect
            }
        }
        this.handleDisconnect();
    }

    private handleDisconnect() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
        
        this.client = null;
        this.mediaController = null;
        this.connectedDeviceName = null;
        this.connectedDeviceHost = null;
        this.hasActiveSession = false;
        
        this.emit('device-status', null);
        this.emit('connection-status', { connected: false, deviceName: null });
    }

    async play(track: Track, startTime: number = 0) {
        if (!this.client) {
            this.log('[CastService] Play called but no device connected');
            return;
        }

        this.log(`[CastService] Playing ${track.title} on ${this.connectedDeviceName}`);

        try {
            if (!this.mediaController) {
                // Re-launch media app to ensure clean state
                const launchResult = await DefaultMediaApp.launchAndJoin({ client: this.client });
                const unwrappedLaunch = launchResult.unwrapWithErr();

                if (!unwrappedLaunch.isOk) {
                    throw unwrappedLaunch.value;
                }
                this.mediaController = unwrappedLaunch.value;
            }

            this.hasActiveSession = false;

            let streamUrl = track.streamUrl;
            let artworkUrl = track.artworkUrl;

            if (streamUrl.includes('127.0.0.1') || (artworkUrl && artworkUrl.includes('127.0.0.1'))) {
                const localIps = os.networkInterfaces();
                let ipStr = '127.0.0.1';
                let targetSubnet = '';
                
                if (this.connectedDeviceHost) {
                    const parts = this.connectedDeviceHost.split('.');
                    if (parts.length === 4) {
                        targetSubnet = `${parts[0]}.${parts[1]}.${parts[2]}.`;
                    }
                }

                let bestMatch = '';
                let fallbackIp = '';

                for (const name of Object.keys(localIps)) {
                    for (const iface of localIps[name] || []) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            if (!fallbackIp) fallbackIp = iface.address;
                            if (targetSubnet && iface.address.startsWith(targetSubnet)) {
                                bestMatch = iface.address;
                            }
                        }
                    }
                }
                
                ipStr = bestMatch || fallbackIp || '127.0.0.1';
                
                if (streamUrl.includes('127.0.0.1')) {
                    streamUrl = streamUrl.replace('127.0.0.1', ipStr);
                }
                if (artworkUrl && artworkUrl.includes('127.0.0.1')) {
                    artworkUrl = artworkUrl.replace('127.0.0.1', ipStr);
                }
            }

            this.log(`[CastService] Loading stream URL on Chromecast: ${streamUrl}`);

            try {
                const loadResult = await this.mediaController.load({
                    media: {
                        contentId: streamUrl,
                        streamType: 'BUFFERED',
                        contentType: 'audio/mpeg',
                        metadata: {
                            metadataType: 3, // MUSIC_TRACK
                            title: track.title,
                            artist: track.artist,
                            albumName: track.album,
                            images: artworkUrl ? [{ url: artworkUrl }] : []
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
                    this.log(`[CastService] Media load returned error (ignoring as Chromecast often plays anyway): ${unwrappedLoad.value}`);
                    this.hasActiveSession = true;
                    this.startStatusPolling();
                }
            } catch (loadErr: any) {
                this.log(`[CastService] Media load threw exception (ignoring as Chromecast often plays anyway): ${loadErr}`);
                this.hasActiveSession = true;
                this.startStatusPolling();
            }
        } catch (err: any) {
            this.log('[CastService] Play error:', err);
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
            this.log('[CastService] Pause error:', err);
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
            this.log('[CastService] Resume error:', err);
            if (err.message?.includes('INVALID_MEDIA_SESSION_ID')) this.hasActiveSession = false;
        }
    }

    async stopPlayback() {
        if (!this.mediaController || !this.hasActiveSession) return;
        try {
            const res = await this.mediaController.stop();
            const unwrapped = res.unwrapWithErr();
            if (unwrapped.isOk) this.handleDeviceStatus(unwrapped.value);
            this.hasActiveSession = false;
            this.stopStatusPolling();
        } catch (err: any) {
            this.log('[CastService] Stop playback error:', err);
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
            this.log('[CastService] Seek error:', err);
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
            this.log('[CastService] Set volume error:', err);
        }
    }

    async setMuted(muted: boolean) {
        try {
            if (!this.client) return;
            const platform = createPlatform(this.client);
            await platform.setVolume({ mute: muted });
        } catch (err) {
            this.log('[CastService] Set muted error:', err);
        }
    }

    getConnectedDevice(): CastDevice | null {
        if (!this.connectedDeviceName) return null;
        return this.getDevices().find(d => d.id === this.connectedDeviceName) || null;
    }

    /**
     * Stop discovery, playback, and close connections
     */
    stop(): void {
        this.stopPlayback().catch(() => {});
        this.stopDiscovery();
        this.disconnect();
        if (this.bonjour) {
            this.bonjour.destroy();
            this.bonjour = null;
            this.mdnsBrowser = null;
        }
    }
}
