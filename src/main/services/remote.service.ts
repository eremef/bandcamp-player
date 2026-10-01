import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { createSocket } from 'dgram';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { AuthService } from './auth.service';
import type {
    AppSettings,
    Track,
    RemoteClient,
    RemotePairingRecord,
    RemotePairedDevice,
    RemotePairingRequest,
    RemoteListenMode,
    RemoteNetworkInterface,
    RemoteControlStatus,
    RemoteSecurityMode,
} from '../../shared/types';
import { Database } from '../database/database';
import {
    Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
    VolumeX, Volume1, Volume2, List, Library, ListMusic, Radio, Search,
    MoreVertical, ListOrdered,
    IconNode
} from 'lucide';
import { sortCollectionItems } from '../../shared/utils/collection-utils';
import { RemoteTlsMaterial, RemoteTlsService } from './remote-tls.service';

/** Message types processed strictly in send order, per connection (see ws.on('message')). */
const SERIALIZED_MESSAGE_TYPES = new Set([
    'create-playlist',
    'update-playlist',
    'delete-playlist',
    'import-playlist',
    'add-track-to-playlist',
    'add-album-to-playlist',
    'remove-track-from-playlist',
    'reorder-playlist-tracks',
    'add-station-to-playlist',
    'extract-radio-to-playlist',
    'get-playlists',
    'get-playlist-for-export',
]);

/** The mutating subset of the above — gated by the desktop's playlist sync mode. */
const PLAYLIST_MUTATING_TYPES = new Set([...SERIALIZED_MESSAGE_TYPES].filter(
    t => t !== 'get-playlists' && t !== 'get-playlist-for-export'
));

export class RemoteControlService extends EventEmitter {
    private server: any;
    private wss: WebSocketServer | null = null;
    private port: number = 9999;
    private isRunning: boolean = false;
    private generation = 0;
    private playerService: PlayerService;
    private scraperService: ScraperService;
    private playlistService: PlaylistService;
    private authService: AuthService;
    private database: Database;
    private clients: Map<string, { ws: WebSocket; authenticated: boolean; pairingId?: string; failedAuthAttempts: number } & RemoteClient> = new Map();
    private readonly tlsService = new RemoteTlsService();
    private tlsMaterial: RemoteTlsMaterial | null = null;
    private securityMode: RemoteSecurityMode = 'safe';
    private listenAddress = '127.0.0.1';
    private advertisedAddress: string | null = null;
    private recommendedInterface: RemoteNetworkInterface | null = null;
    private activeInterfaces: RemoteNetworkInterface[] = [];
    private allowedHostAddresses = new Set<string>();
    private pairingInvite: { codeHash: Buffer; expiresAt: number } | null = null;
    private pairingRequests = new Map<string, { ws: WebSocket; request: RemotePairingRequest; timeout: ReturnType<typeof setTimeout> }>();
    private startError: string | null = null;
    private messageWindows = new Map<string, { startedAt: number; count: number }>();
    private handshakeWindows = new Map<string, { startedAt: number; count: number }>();
    private startingPromise: Promise<void> | null = null;
    private stoppingPromise: Promise<void> | null = null;

    constructor(playerService: PlayerService, scraperService: ScraperService, playlistService: PlaylistService, authService: AuthService, database: Database, port: number = 9999) {
        super();
        this.playerService = playerService;
        this.scraperService = scraperService;
        this.playlistService = playlistService;
        this.authService = authService;
        this.database = database;
        this.port = port;
    }

    private async resolveTrack(payload: any): Promise<Track | null> {
        let trackToPlay = payload;

        // Handle simplified collection item structure
        if (payload.item_url && !payload.streamUrl) {
            trackToPlay = {
                ...payload,
                bandcampUrl: payload.item_url
            };
        }

        // If no stream URL, try to resolve it
        if (!trackToPlay.streamUrl && trackToPlay.bandcampUrl) {
            if (!this.isAllowedBandcampUrl(trackToPlay.bandcampUrl)) return null;
            try {
                // console.log(`[RemoteService] Resolving stream URL for track: ${trackToPlay.title}`);
                const albumDetails = await this.scraperService.getAlbumDetails(trackToPlay.bandcampUrl);
                if (albumDetails && albumDetails.tracks.length > 0) {
                    // Use the first track if it's a track page, or try to match by title/ID
                    const resolvedTrack = albumDetails.tracks[0];
                    // Merge with original payload to preserve IDs/metadata if needed, but prefer resolved data
                    trackToPlay = {
                        ...trackToPlay,
                        ...resolvedTrack,
                        id: trackToPlay.id || resolvedTrack.id
                    };
                }
            } catch (e) {
                console.error('[RemoteService] Failed to resolve track stream:', e);
                return null;
            }
        }

        return trackToPlay;
    }

    // Event handlers
    private handleStateChanged = (state: any) => this.broadcast('state-changed', state);
    private handleTrackChanged = (track: any) => this.broadcast('track-changed', track);
    private handleTimeUpdate = (data: any) => this.broadcast('time-update', data);
    private playlistsBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * Trailing-debounced: every playlist mutation emits 'playlists-changed', so a 20-track
     * album add would otherwise spray 20 full-snapshot broadcasts at every connected client.
     */
    private handlePlaylistsChanged = () => {
        if (this.playlistsBroadcastTimer) return;
        this.playlistsBroadcastTimer = setTimeout(() => {
            this.playlistsBroadcastTimer = null;
            this.broadcast('playlists-data', this.playlistService.getAll());
        }, 150);
    };
    private handleQueueUpdated = () => {
        this.broadcast('state-changed', this.playerService.getState());
    };

    start(): Promise<void> {
        if (this.stoppingPromise) return this.stoppingPromise.then(() => this.start());
        if (this.isRunning) return Promise.resolve();
        if (this.startingPromise) return this.startingPromise;

        const startup = this.startInternal();
        this.startingPromise = startup;
        void startup.finally(() => {
            if (this.startingPromise === startup) this.startingPromise = null;
        }).catch(() => undefined);
        return startup;
    }

    private async startInternal(): Promise<void> {
        if (this.isRunning) return;

        this.startError = null;
        const settings = this.database.getSettings();
        this.securityMode = settings?.remoteSecurityMode ?? 'safe';
        this.tlsMaterial = null;
        try {
            const networkConfig = await this.resolveListenConfiguration(settings);
            this.listenAddress = networkConfig.listenAddress;
            this.advertisedAddress = networkConfig.advertisedAddress;
            this.activeInterfaces = networkConfig.interfaces;
            this.allowedHostAddresses = new Set(networkConfig.allowedHostAddresses);
        } catch (error) {
            this.startError = error instanceof Error ? error.message : 'Could not choose a network interface for remote control.';
            throw error;
        }

        try {
            this.tlsMaterial = this.securityMode === 'safe' ? await this.tlsService.getMaterial() : null;
        } catch (error) {
            this.startError = error instanceof Error ? error.message : 'Could not initialize safe remote security.';
            throw error;
        }

        const requestHandler = (req: IncomingMessage, res: ServerResponse) =>
            this.handleHttpRequest(req, res);
        this.server = this.securityMode === 'safe'
            ? createHttpsServer({
                key: this.tlsMaterial!.key,
                cert: this.tlsMaterial!.cert,
                minVersion: 'TLSv1.2',
            }, requestHandler)
            : createHttpServer(requestHandler);

        this.wss = new WebSocketServer({
            server: this.server,
            path: '/',
            maxPayload: 1024 * 1024,
            perMessageDeflate: false,
            verifyClient: (info, callback) => {
                if (this.clients.size >= 20) {
                    callback(false, 503, 'Too many remote connections');
                    return;
                }
                const origin = info.origin;
                const remoteAddress = info.req.socket.remoteAddress || '';
                if (
                    !this.isAllowedHost(info.req.headers.host || '') ||
                    !this.isAllowedRemoteClient(remoteAddress)
                ) {
                    callback(false, 403, 'Remote access is limited to this LAN host');
                    return;
                }
                if (origin) {
                    try {
                        const parsedOrigin = new URL(origin);
                        const expectedProtocol = this.securityMode === 'safe' ? 'https:' : 'http:';
                        if (
                            parsedOrigin.protocol !== expectedProtocol ||
                            parsedOrigin.host !== info.req.headers.host
                        ) {
                            callback(false, 403, 'Origin is not allowed');
                            return;
                        }
                    } catch {
                        callback(false, 403, 'Origin is not allowed');
                        return;
                    }
                }
                const remoteIp = remoteAddress.replace('::ffff:', '') || 'unknown';
                const unauthenticatedFromIp = Array.from(this.clients.values()).filter(
                    client => client.ip === remoteIp && !client.authenticated,
                ).length;
                if (this.securityMode === 'safe' && unauthenticatedFromIp >= 3) {
                    callback(false, 429, 'Too many unpaired connections');
                    return;
                }
                callback(true);
            },
        });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            console.log('[RemoteService] New connection');

            const clientId = crypto.randomUUID();
            const ip = req.socket.remoteAddress || 'unknown';
            const userAgent = req.headers['user-agent'] || 'unknown';
            const client: { ws: WebSocket; authenticated: boolean; pairingId?: string; failedAuthAttempts: number } & RemoteClient = {
                ws,
                id: clientId,
                ip: ip.replace('::ffff:', ''), // normalize ipv4-mapped-ipv6
                userAgent,
                connectedAt: new Date().toISOString(),
                lastActiveAt: new Date().toISOString(),
                authenticated: this.securityMode === 'unsafe',
                failedAuthAttempts: 0,
            };
            this.clients.set(clientId, client);

            if (this.securityMode === 'unsafe') {
                this.sendToClient(ws, 'state-changed', this.playerService.getState());
            } else {
                const cookie = this.getCookieValue(req.headers.cookie, 'remote_session');
                const cookieMatch = cookie?.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/i);
                if (cookieMatch && this.authenticateClient(client, cookieMatch[1], cookieMatch[2])) {
                    this.sendToClient(ws, 'authenticated', { deviceId: cookieMatch[1] });
                    this.sendToClient(ws, 'state-changed', this.playerService.getState());
                } else {
                    this.sendToClient(ws, 'authentication-required', null);
                }
            }

            // Playlist messages must be processed in send order: handleMessage is an
            // un-awaited async handler, so without this a batch flushed by the mobile
            // client interleaves at every await (e.g. a track resolve hitting the network)
            // and lands out of order. Scoped to playlist traffic only — transport commands
            // like `pause` must never queue behind a slow scrape.
            let playlistChain: Promise<void> = Promise.resolve();

            ws.on('message', async (data: string) => {
                try {
                    // Update activity
                    const client = this.clients.get(clientId);
                    if (client) {
                        client.lastActiveAt = new Date().toISOString();
                    }
                    if (!client) return;
                    if (!this.consumeMessageQuota(clientId)) {
                        ws.close(1008, 'Message rate exceeded');
                        return;
                    }

                    const message = JSON.parse(data.toString());
                    if (this.securityMode === 'safe' && !client.authenticated) {
                        await this.handleSecureHandshake(clientId, ws, message);
                        return;
                    }
                    if (SERIALIZED_MESSAGE_TYPES.has(message.type)) {
                        playlistChain = playlistChain.then(() =>
                            this.handleMessage(ws, message, clientId).catch((err) =>
                                console.error('[RemoteService] Error handling message:', err)
                            )
                        );
                        await playlistChain;
                    } else {
                        await this.handleMessage(ws, message, clientId);
                    }
                } catch (err) {
                    console.error('[RemoteService] Error handling message:', err);
                }
            });

            ws.on('close', () => {
                console.log('[RemoteService] Connection closed');
                this.clients.delete(clientId);
                this.messageWindows.delete(clientId);
                const pending = this.pairingRequests.get(clientId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pairingRequests.delete(clientId);
                    this.emit('pairing-requests-changed', this.getPairingRequests());
                }
                if (client?.pairingId) this.emit('paired-devices-changed', this.getConnectedDevices());
                this.emit('connections-changed', this.getStatus().connections);
            });

            this.emit('connections-changed', this.getStatus().connections);
        });

        try {
            await new Promise<void>((resolve, reject) => {
                const onError = (error: Error) => {
                    this.startError = error.message;
                    reject(error);
                };
                this.server.once('error', onError);
                this.server.listen(this.port, this.listenAddress, () => {
                    this.server.off('error', onError);
                    this.isRunning = true;
                    this.generation += 1;
                    const scheme = this.securityMode === 'safe' ? 'https' : 'http';
                    const address = this.advertisedAddress ?? 'no pairing address selected';
                    console.log(`[RemoteService] Listening on ${this.listenAddress}:${this.port}; pairing address ${scheme}://${address}:${this.port}`);
                    this.emit('status-changed', true);
                    resolve();
                });
            });
        } catch (error) {
            this.wss?.close();
            this.wss = null;
            try {
                this.server?.close();
            } catch (closeError) {
                console.warn('[RemoteService] Failed to close server after startup error:', closeError);
            }
            this.server = null;
            throw error;
        }

        // Listen for player events to broadcast
        this.playerService.on('state-changed', this.handleStateChanged);
        this.playerService.on('track-changed', this.handleTrackChanged);
        this.playerService.on('time-update', this.handleTimeUpdate);
        this.playerService.on('queue-updated', this.handleQueueUpdated);

        // Listen for playlist changes
        this.playlistService.on('playlists-changed', this.handlePlaylistsChanged);
    }

    stop(): Promise<void> {
        if (this.stoppingPromise) return this.stoppingPromise;
        const stopping = (async () => {
            const startup = this.startingPromise;
            if (startup) await startup.catch(() => undefined);
            await this.stopInternal();
        })();
        this.stoppingPromise = stopping;
        void stopping.finally(() => {
            if (this.stoppingPromise === stopping) this.stoppingPromise = null;
        }).catch(() => undefined);
        return stopping;
    }

    private async stopInternal(): Promise<void> {
        if (!this.isRunning) return;

        console.log('[RemoteService] Stopping remote control service...');

        // Remove listeners
        this.playerService.off('state-changed', this.handleStateChanged);
        this.playerService.off('track-changed', this.handleTrackChanged);
        this.playerService.off('time-update', this.handleTimeUpdate);
        this.playerService.off('queue-updated', this.handleQueueUpdated);
        this.playlistService.off('playlists-changed', this.handlePlaylistsChanged);
        if (this.playlistsBroadcastTimer) {
            clearTimeout(this.playlistsBroadcastTimer);
            this.playlistsBroadcastTimer = null;
        }

        // Explicitly close all connected clients
        this.clients.forEach((client) => {
            try {
                if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
                    client.ws.terminate(); // terminate is more aggressive than close()
                }
            } catch (err) {
                console.error('[RemoteService] Error terminating client during shutdown:', err);
            }
        });
        this.clients.clear();
        this.pairingInvite = null;
        for (const pending of this.pairingRequests.values()) {
            clearTimeout(pending.timeout);
        }
        this.pairingRequests.clear();

        // Close WebSocket server
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }

        // Close HTTP server and force-close all remaining sockets
        if (this.server) {
            const server = this.server;
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>((resolve) => server.close(() => resolve()));
            this.server = null;
        }

        this.isRunning = false;
        this.emit('status-changed', false);
        this.emit('connections-changed', 0);
        this.emit('paired-devices-changed', this.getConnectedDevices());
    }


    private async resolveListenConfiguration(settings: AppSettings | null): Promise<{
        listenAddress: string;
        advertisedAddress: string | null;
        interfaces: RemoteNetworkInterface[];
        allowedHostAddresses: string[];
    }> {
        const interfaces = this.getAvailableInterfaces();
        this.recommendedInterface = await this.getRecommendedInterface(interfaces);

        const requestedMode = settings?.remoteListenMode;
        const mode: RemoteListenMode = requestedMode === 'all' || requestedMode === 'interface'
            ? requestedMode
            : 'recommended';

        if (mode === 'all') {
            if (interfaces.length === 0) {
                throw new Error('No private IPv4 network interfaces are available for remote control.');
            }
            const qrInterface = settings?.remoteQrAddress
                ? interfaces.find((networkInterface) => networkInterface.address === settings.remoteQrAddress)
                : this.recommendedInterface;
            return {
                listenAddress: '0.0.0.0',
                advertisedAddress: qrInterface?.address ?? null,
                interfaces,
                allowedHostAddresses: interfaces.map((networkInterface) => networkInterface.address),
            };
        }

        if (mode === 'interface') {
            const selectedInterface = interfaces.find((networkInterface) => networkInterface.name === settings?.remoteInterfaceName);
            if (!selectedInterface) {
                throw new Error('The selected network interface is unavailable. Choose another interface or use Recommended.');
            }
            return {
                listenAddress: selectedInterface.address,
                advertisedAddress: selectedInterface.address,
                interfaces,
                allowedHostAddresses: [selectedInterface.address],
            };
        }

        if (!this.recommendedInterface) {
            throw new Error('Could not identify the recommended network interface. Choose a specific interface or All interfaces.');
        }
        return {
            listenAddress: this.recommendedInterface.address,
            advertisedAddress: this.recommendedInterface.address,
            interfaces,
            allowedHostAddresses: [this.recommendedInterface.address],
        };
    }

    private async getRecommendedInterface(interfaces: RemoteNetworkInterface[]): Promise<RemoteNetworkInterface | null> {
        if (interfaces.length === 0) return null;

        const routeAddress = await new Promise<string | null>((resolve) => {
            const socket = createSocket('udp4');
            let completed = false;
            const finish = (address: string | null) => {
                if (completed) return;
                completed = true;
                try {
                    socket.close();
                } catch { /* empty */ }
                resolve(address);
            };

            socket.once('error', () => finish(null));
            try {
                socket.connect(9, '192.0.2.1', () => finish(socket.address().address));
            } catch {
                finish(null);
            }
        });

        if (routeAddress) {
            const routedInterface = interfaces.find((networkInterface) => networkInterface.address === routeAddress);
            if (routedInterface) return routedInterface;

            const addressIsAssignedLocally = Object.values(networkInterfaces()).some((entries) =>
                entries?.some((entry) => entry.family === 'IPv4' && !entry.internal && entry.address === routeAddress),
            );
            if (addressIsAssignedLocally) return null;
        }
        return interfaces.length === 1 ? interfaces[0] : null;
    }

    private getAvailableInterfaces(): RemoteNetworkInterface[] {
        const interfaces: RemoteNetworkInterface[] = [];
        for (const [name, entries] of Object.entries(networkInterfaces())) {
            for (const entry of entries ?? []) {
                if (entry.family === 'IPv4' && !entry.internal && this.isPrivateIpv4(entry.address)) {
                    interfaces.push({ name, address: entry.address });
                }
            }
        }
        return interfaces.sort((left, right) => left.name.localeCompare(right.name) || left.address.localeCompare(right.address));
    }

    getStatus(): RemoteControlStatus {
        const settings = this.database.getSettings();
        const requestedMode = settings?.remoteListenMode;
        const listenMode: RemoteListenMode = requestedMode === 'all' || requestedMode === 'interface'
            ? requestedMode
            : 'recommended';
        const interfaces = this.isRunning ? this.activeInterfaces : this.getAvailableInterfaces();
        const recommendedInterface = this.recommendedInterface
            ? interfaces.find((networkInterface) => networkInterface.address === this.recommendedInterface?.address) ?? null
            : null;
        const configuredInterface = settings?.remoteInterfaceName
            ? interfaces.find((networkInterface) => networkInterface.name === settings.remoteInterfaceName) ?? null
            : null;
        const qrInterface = listenMode === 'all'
            ? settings?.remoteQrAddress
                ? interfaces.find((networkInterface) => networkInterface.address === settings.remoteQrAddress) ?? null
                : recommendedInterface
            : listenMode === 'interface'
                ? configuredInterface
                : recommendedInterface;
        const ip = qrInterface?.address ?? '';
        const scheme = this.securityMode === 'safe' ? 'https' : 'http';
        const listeningAddress = this.isRunning
            ? this.listenAddress
            : listenMode === 'all'
                ? '0.0.0.0'
                : qrInterface?.address ?? '';
        return {
            isRunning: this.isRunning,
            port: this.port,
            ip,
            url: ip ? `${scheme}://${ip}:${this.port}` : '',
            listenMode,
            listeningAddress,
            generation: this.generation,
            availableInterfaces: interfaces,
            recommendedAddress: recommendedInterface?.address ?? null,
            recommendedInterfaceName: recommendedInterface?.name ?? null,
            connections: Array.from(this.clients.values()).filter(client => client.authenticated).length,
            securityMode: this.securityMode,
            caFingerprint: this.tlsMaterial?.caFingerprint ?? null,
            pairingRequests: this.getPairingRequests(),
            error: this.startError,
        };
    }

    getConnectedDevices(): RemotePairedDevice[] {
        const onlinePairings = new Set(
            Array.from(this.clients.values())
                .filter(client => client.authenticated && client.pairingId)
                .map(client => client.pairingId!),
        );
        const onlineClients = new Map(
            Array.from(this.clients.values())
                .filter(client => client.authenticated && client.pairingId)
                .map(client => [client.pairingId!, client]),
        );
        const paired = this.database.getRemotePairings().map((device) => ({
            id: device.id,
            ip: onlineClients.get(device.id)?.ip ?? 'offline',
            name: device.name,
            platform: device.platform,
            appVersion: device.appVersion,
            device: device.device,
            createdAt: device.createdAt,
            lastConnectedAt: device.lastConnectedAt,
            online: onlinePairings.has(device.id),
        }));
        if (this.securityMode === 'safe') return paired;
        return Array.from(this.clients.values()).map(({ ws: _ws, authenticated: _authenticated, failedAuthAttempts: _failed, ...client }) => ({
            id: client.id,
            ip: client.ip,
            name: client.deviceInfo?.device || client.userAgent,
            platform: client.deviceInfo?.platform || 'web',
            appVersion: client.deviceInfo?.appVersion || 'unknown',
            device: client.deviceInfo?.device || 'unknown',
            createdAt: client.connectedAt,
            lastConnectedAt: client.lastActiveAt,
            online: true,
        }));
    }

    disconnectDevice(clientId: string): boolean {
        if (this.securityMode === 'safe') {
            const revoked = this.database.revokeRemotePairing(clientId);
            for (const client of this.clients.values()) {
                if (client.pairingId === clientId) client.ws.close(4001, 'Pairing revoked');
            }
            if (revoked) this.emit('paired-devices-changed', this.getConnectedDevices());
            return revoked;
        }
        const client = this.clients.get(clientId);
        if (client) {
            // Send disconnect message before closing
            // Use callback to ensure message is sent (if socket is open)
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: 'disconnect' }), () => {
                    client.ws.close();
                });
            } else {
                client.ws.close();
            }

            this.clients.delete(clientId);
            this.emit('connections-changed', this.getStatus().connections);
            return true;
        }
        return false;
    }

    createPairingInvite(): { code: string; expiresAt: string; caCertificate: string; caFingerprint: string } {
        if (!this.isRunning || this.securityMode !== 'safe' || !this.tlsMaterial) {
            throw new Error('Safe remote mode must be running before creating a pairing code.');
        }
        const code = crypto.randomBytes(18).toString('base64url');
        const expiresAt = Date.now() + 2 * 60 * 1000;
        this.pairingInvite = {
            codeHash: this.hashToken(code),
            expiresAt,
        };
        return {
            code,
            expiresAt: new Date(expiresAt).toISOString(),
            caCertificate: this.tlsMaterial.caCertificate,
            caFingerprint: this.tlsMaterial.caFingerprint,
        };
    }

    getPairingCertificate(): string | null {
        return this.securityMode === 'safe' ? this.tlsService.getCaCertificate() : null;
    }

    getPairingRequests(): RemotePairingRequest[] {
        return Array.from(this.pairingRequests.values()).map(({ request }) => request);
    }

    approvePairing(requestId: string): boolean {
        const pending = this.pairingRequests.get(requestId);
        const client = this.clients.get(requestId);
        if (!pending || !client || !this.tlsMaterial) return false;

        clearTimeout(pending.timeout);
        this.pairingRequests.delete(requestId);
        const token = crypto.randomBytes(32).toString('base64url');
        const pairing: RemotePairingRecord = {
            id: crypto.randomUUID(),
            tokenHash: this.hashToken(token).toString('hex'),
            name: pending.request.name,
            platform: pending.request.platform,
            appVersion: pending.request.appVersion,
            device: pending.request.device,
            createdAt: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
        };
        this.database.saveRemotePairing(pairing);
        client.deviceInfo = {
            platform: pairing.platform,
            appVersion: pairing.appVersion,
            device: pairing.device,
        };
        client.authenticated = true;
        client.pairingId = pairing.id;
        client.id = pairing.id;
        this.sendToClient(client.ws, 'paired', {
            deviceId: pairing.id,
            token,
            caFingerprint: this.tlsMaterial.caFingerprint,
        });
        this.sendToClient(client.ws, 'state-changed', this.playerService.getState());
        this.emit('pairing-requests-changed', this.getPairingRequests());
        this.emit('paired-devices-changed', this.getConnectedDevices());
        this.emit('connections-changed', this.getStatus().connections);
        return true;
    }

    rejectPairing(requestId: string): boolean {
        const pending = this.pairingRequests.get(requestId);
        if (!pending) return false;
        clearTimeout(pending.timeout);
        this.pairingRequests.delete(requestId);
        pending.ws.send(JSON.stringify({ type: 'pairing-rejected' }));
        pending.ws.close(4003, 'Pairing rejected by desktop user');
        this.emit('pairing-requests-changed', this.getPairingRequests());
        return true;
    }

    private async handleSecureHandshake(
        clientId: string,
        ws: WebSocket,
        message: { type?: string; payload?: any },
    ): Promise<void> {
        const client = this.clients.get(clientId);
        if (!client) return;
        if (!this.allowHandshake(client.ip)) {
            ws.close(4008, 'Too many authentication attempts');
            return;
        }
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};

        if (message.type === 'authenticate') {
            if (
                typeof payload.deviceId === 'string' &&
                typeof payload.token === 'string' &&
                this.authenticateClient(client, payload.deviceId, payload.token)
            ) {
                this.sendToClient(ws, 'authenticated', { deviceId: payload.deviceId });
                this.sendToClient(ws, 'state-changed', this.playerService.getState());
                this.emit('connections-changed', this.getStatus().connections);
                this.emit('paired-devices-changed', this.getConnectedDevices());
                return;
            }
            client.failedAuthAttempts += 1;
            this.sendToClient(ws, 'authentication-failed', null);
            if (client.failedAuthAttempts >= 3) ws.close(4003, 'Authentication failed');
            return;
        }

        if (message.type !== 'pair' || typeof payload.code !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(payload.code)) {
            client.failedAuthAttempts += 1;
            this.sendToClient(ws, 'authentication-failed', null);
            if (client.failedAuthAttempts >= 3) ws.close(4003, 'Authentication required');
            return;
        }

        const invite = this.pairingInvite;
        const suppliedHash = this.hashToken(payload.code);
        if (
            !invite || invite.expiresAt < Date.now() ||
            suppliedHash.length !== invite.codeHash.length ||
            !crypto.timingSafeEqual(suppliedHash, invite.codeHash)
        ) {
            client.failedAuthAttempts += 1;
            this.sendToClient(ws, 'pairing-failed', { message: 'Pairing code is invalid or expired.' });
            if (client.failedAuthAttempts >= 5) ws.close(4003, 'Pairing failed');
            return;
        }

        this.pairingInvite = null;
        const requestedInfo = payload.deviceInfo && typeof payload.deviceInfo === 'object'
            ? payload.deviceInfo
            : {};
        const request: RemotePairingRequest = {
            id: clientId,
            name: this.safeText(requestedInfo.device, 'Remote device', 80),
            platform: this.safeText(requestedInfo.platform, 'unknown', 40),
            appVersion: this.safeText(requestedInfo.appVersion, 'unknown', 40),
            device: this.safeText(requestedInfo.device, 'unknown', 80),
            ip: client.ip,
            requestedAt: new Date().toISOString(),
        };
        const timeout = setTimeout(() => this.rejectPairing(clientId), 2 * 60 * 1000);
        this.pairingRequests.set(clientId, { ws, request, timeout });
        this.sendToClient(ws, 'pairing-pending', { requestId: clientId });
        this.emit('pairing-requests-changed', this.getPairingRequests());
    }

    private authenticateClient(
        client: { authenticated: boolean; pairingId?: string; id: string },
        deviceId: string,
        token: string,
    ): boolean {
        const pairing = this.database.getRemotePairing(deviceId);
        if (!pairing) return false;
        const actual = this.hashToken(token);
        const expected = Buffer.from(pairing.tokenHash, 'hex');
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
        client.authenticated = true;
        client.pairingId = pairing.id;
        client.id = pairing.id;
        this.database.updateRemotePairingLastConnected(pairing.id, new Date().toISOString());
        return true;
    }

    private hashToken(token: string): Buffer {
        return crypto.createHash('sha256').update(token, 'utf8').digest();
    }

    private allowHandshake(ip: string): boolean {
        const now = Date.now();
        const current = this.handshakeWindows.get(ip);
        if (!current || now - current.startedAt >= 60_000) {
            if (this.handshakeWindows.size >= 1024) {
                for (const [address, window] of this.handshakeWindows) {
                    if (now - window.startedAt >= 60_000) this.handshakeWindows.delete(address);
                    if (this.handshakeWindows.size < 1024) break;
                }
                if (this.handshakeWindows.size >= 1024) {
                    this.handshakeWindows.delete(this.handshakeWindows.keys().next().value!);
                }
            }
            this.handshakeWindows.set(ip, { startedAt: now, count: 1 });
            return true;
        }
        current.count += 1;
        return current.count <= 12;
    }

    private consumeMessageQuota(clientId: string): boolean {
        const now = Date.now();
        const current = this.messageWindows.get(clientId);
        if (!current || now - current.startedAt >= 1_000) {
            this.messageWindows.set(clientId, { startedAt: now, count: 1 });
            return true;
        }
        current.count += 1;
        return current.count <= 120;
    }

    private safeText(value: unknown, fallback: string, maxLength: number): string {
        return typeof value === 'string' && value.trim()
            ? value.trim().replace(/\p{Cc}/gu, '').slice(0, maxLength)
            : fallback;
    }

    private isAllowedBandcampUrl(value: unknown): value is string {
        if (typeof value !== 'string' || value.length > 2048) return false;
        try {
            const url = new URL(value);
            return url.protocol === 'https:' &&
                (url.hostname === 'bandcamp.com' || url.hostname.endsWith('.bandcamp.com')) &&
                (url.port === '' || url.port === '443') &&
                !url.username && !url.password;
        } catch {
            return false;
        }
    }

    private isAllowedHost(hostHeader: string): boolean {
        const [host, port] = hostHeader.startsWith('[')
            ? [hostHeader.slice(1, hostHeader.indexOf(']')), hostHeader.slice(hostHeader.indexOf(']') + 2)]
            : [hostHeader.slice(0, hostHeader.lastIndexOf(':')), hostHeader.slice(hostHeader.lastIndexOf(':') + 1)];
        if (port !== String(this.port)) return false;
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
        return this.allowedHostAddresses.has(host);
    }

    private isAllowedRemoteClient(remoteAddress: string): boolean {
        const address = remoteAddress.replace('::ffff:', '');
        return address === '::1' || address === '127.0.0.1' || this.isPrivateIpv4(address);
    }

    private getCookieValue(cookieHeader: string | undefined, name: string): string | null {
        const prefix = `${name}=`;
        const value = cookieHeader?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
        if (!value) return null;
        try {
            return decodeURIComponent(value.slice(prefix.length));
        } catch {
            return null;
        }
    }

    private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
        if (
            !this.isAllowedHost(req.headers.host || '') ||
            !this.isAllowedRemoteClient(req.socket.remoteAddress || '')
        ) {
            res.writeHead(403);
            res.end();
            return;
        }
        const requestUrl = new URL(req.url || '/', `${this.securityMode === 'safe' ? 'https' : 'http'}://localhost`);
        if (requestUrl.pathname === '/pairing-ca.crt' && req.method === 'GET') {
            const certificate = this.tlsService.getCaCertificate();
            if (!certificate) {
                res.writeHead(404);
                res.end();
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/x-x509-ca-cert',
                'Content-Disposition': 'attachment; filename="beta-player-remote-ca.crt"',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            });
            res.end(certificate);
            return;
        }
        if (requestUrl.pathname === '/pair/claim' && req.method === 'POST') {
            void this.handleBrowserClaim(req, res);
            return;
        }
        if (req.method !== 'GET') {
            res.writeHead(405, { Allow: 'GET, POST' });
            res.end();
            return;
        }
        if (requestUrl.pathname === '/') this.serveIndex(res);
        else if (requestUrl.pathname === '/styles.css') this.serveStatic(res, 'styles.css', 'text/css');
        else if (requestUrl.pathname === '/client.js') this.serveStatic(res, 'client.js', 'application/javascript');
        else {
            res.writeHead(404);
            res.end();
        }
    }

    private async handleBrowserClaim(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const origin = req.headers.origin;
        if (this.securityMode !== 'safe' || !origin || !this.isAllowedHost(req.headers.host || '')) {
            res.writeHead(403);
            res.end();
            return;
        }
        try {
            const parsedOrigin = new URL(origin);
            if (parsedOrigin.protocol !== 'https:' || parsedOrigin.host !== req.headers.host) {
                res.writeHead(403);
                res.end();
                return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            for await (const chunk of req) {
                const bytes = Buffer.from(chunk);
                length += bytes.length;
                if (length > 2048) throw new Error('Request too large');
                chunks.push(bytes);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { deviceId?: string; token?: string };
            if (!body.deviceId || !body.token) throw new Error('Invalid claim');
            const pairing = this.database.getRemotePairing(body.deviceId);
            if (!pairing) throw new Error('Unknown device');
            const actual = this.hashToken(body.token);
            const expected = Buffer.from(pairing.tokenHash, 'hex');
            if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
                throw new Error('Invalid claim');
            }
            res.writeHead(204, {
                'Set-Cookie': `remote_session=${encodeURIComponent(`${body.deviceId}.${body.token}`)}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=315360000`,
                'Cache-Control': 'no-store',
            });
            res.end();
        } catch {
            res.writeHead(400, { 'Cache-Control': 'no-store' });
            res.end();
        }
    }

    private isPrivateIpv4(address: string): boolean {
        const octets = address.split('.').map(Number);
        if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
        return octets[0] === 10 ||
            (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
            (octets[0] === 192 && octets[1] === 168) ||
            (octets[0] === 169 && octets[1] === 254);
    }

    private iconToSvg(icon: IconNode, size: number = 24, className: string = ''): string {
        // Lucide icons are [tag, attrs, children][] - wait, actually the Lucide package exports 
        // the icon definition as `[tag, attrs, children][]` is internal?
        // Let's rely on the structure I verified: array of [tag, attrs]

        // The structure inspected was: [["path", { d: "..." }]]
        // LucideIcon type is: type IconNode = [elementName: string, attrs: Record<string, string>][]

        const children = (icon as any).map(([tag, attrs]: [string, any]) => {
            const attrStr = Object.entries(attrs)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            return `<${tag} ${attrStr}></${tag}>`;
        }).join('');

        return `<svg xmlns="http://www.w3.org/2000/svg" 
            width="${size}" height="${size}" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            class="${className}">${children}</svg>`;
    }

    private async handleMessage(ws: WebSocket, message: { type: string; payload?: any }, clientId: string): Promise<void> {
        const { type, payload } = message;

        // The mode is set on the desktop and is authoritative. Mobile builds predating it
        // push unconditionally, and the desktop auto-updates while the phone does not.
        // Keyed on deviceInfo, which only `identify` sets: the web remote (client.js) never
        // sends it, so the browser keeps full editing regardless of the mode.
        if (PLAYLIST_MUTATING_TYPES.has(type) && this.clients.get(clientId)?.deviceInfo) {
            const mode = this.database.getSettings()?.playlistSyncMode ?? 'two-way';
            if (mode === 'desktop-to-mobile' || mode === 'disabled') {
                console.log(`[RemoteService] Dropped ${type} from mobile client (sync mode: ${mode})`);
                return;
            }
        }

        switch (type) {
            case 'identify': {
                const client = this.clients.get(clientId);
                if (client && payload) {
                    client.deviceInfo = {
                        platform: payload.platform || 'unknown',
                        appVersion: payload.appVersion || 'unknown',
                        device: payload.device || 'unknown'
                    };
                    console.log(`[RemoteService] Client ${clientId} identified: ${payload.platform}/${payload.device} v${payload.appVersion}`);
                    this.emit('connections-changed', this.getStatus().connections);
                }
                break;
            }
            case 'play':
                await this.playerService.play();
                break;
            case 'pause':
                console.log(`[RemoteService] Pause received from client ${clientId}`);
                this.playerService.pause();
                break;
            case 'next':
                await this.playerService.next();
                break;
            case 'previous':
                await this.playerService.previous();
                break;
            case 'seek':
                this.playerService.seek(payload);
                break;
            case 'set-volume':
                this.playerService.setVolume(payload);
                break;
            case 'get-collection': {
                try {
                    const auth = this.authService.getUser();
                    if (!auth.isAuthenticated) {
                        console.warn('[RemoteService] Client requested collection but user is not authenticated');
                        this.sendToClient(ws, 'collection-data', { items: [], totalCount: 0, lastUpdated: new Date().toISOString() });
                        return;
                    }

                    const forceRefresh = payload ? payload.forceRefresh === true : false;
                    const offset = payload?.offset || 0;
                    const limit = payload?.limit || 250; // Default limit
                    const query = payload?.query ? String(payload.query).toLowerCase().trim() : '';

                    console.log(`[RemoteService] Get Collection: offset=${offset}, limit=${limit}, query="${query}", forceRefresh=${forceRefresh}`);

                    const includeWishlist = payload?.includeWishlist;
                    const sortKey = payload?.sortKey || 'default';
                    const sortDirection = payload?.sortDirection || 'desc';
                    const dedupeEnabled = payload?.dedupeEnabled ?? true;
                    const filterAlbums = payload?.filterAlbums ?? true;
                    const filterTracks = payload?.filterTracks ?? true;
                    const filterWishlist = payload?.filterWishlist ?? true;

                    const collection = await this.scraperService.fetchCollection(forceRefresh, includeWishlist);

                    // 1. Filter first (by flags and query)
                    let allItems = [...collection.items].filter((item: any) => {
                        if (item.isWishlist) return includeWishlist && filterWishlist;
                        if (item.type === 'album') return filterAlbums;
                        if (item.type === 'track') return filterTracks;
                        return true;
                    });

                    if (query) {
                        allItems = allItems.filter((item: any) => {
                            // Check item generic title/artist
                            // Or check specific album/track fields
                            const title = (item.title || item.album?.title || item.track?.title || '').toLowerCase();
                            const artist = (item.artist || item.album?.artist || item.track?.artist || '').toLowerCase();
                            return title.includes(query) || artist.includes(query);
                        });
                    }

                    // 2. Sort according to requested key/direction
                    // This ensures pagination (slice) works on correctly ordered list
                    allItems = sortCollectionItems(allItems, sortKey, sortDirection, dedupeEnabled);

                    // 3. Slice for pagination
                    // If no payload is provided (legacy clients), returns full collection (offset 0, limit undefined -> slice(0))
                    let itemsToSend = allItems;
                    if (payload && (payload.offset !== undefined || payload.limit !== undefined)) {
                        itemsToSend = allItems.slice(offset, offset + limit);
                    }

                    // Map to flat structure expected by remote client
                    const simplifiedCollection = {
                        ...collection, // This has totalCount of the FULL collection. 
                        // Should we return filtered count?
                        // The client uses totalCount to determine hasMore.
                        // If we return filtered subset, totalCount should probably be the length of 'allItems' (the filtered set).
                        totalCount: allItems.length,
                        items: itemsToSend.map((item: any) => {
                            if (item.type === 'album' && item.album) {
                                return {
                                    ...item,
                                    ...item.album,
                                    item_url: item.album.bandcampUrl,
                                    hasTracks: item.album.tracks && item.album.tracks.length > 1
                                };
                            } else if (item.type === 'track' && item.track) {
                                return {
                                    ...item,
                                    ...item.track,
                                    item_url: item.track.bandcampUrl
                                };
                            }
                            return item;
                        }),
                        offset,
                        limit: payload?.limit ? limit : collection.items.length
                    };
                    this.sendToClient(ws, 'collection-data', simplifiedCollection);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-collection:', e);
                    this.sendToClient(ws, 'error', { message: 'Failed to fetch collection' });
                }
                break;
            }
            case 'get-artist-collection': {
                try {
                    const artistId = payload;
                    if (!artistId) {
                        this.sendToClient(ws, 'error', { message: 'Missing artist ID' });
                        return;
                    }

                    const collection = await this.scraperService.fetchCollection();
                    const artistItems = collection.items.filter((item: any) => {
                        const data = item.type === 'album' ? item.album : item.track;
                        return data?.artistId === artistId;
                    });

                    // Map to flat structure expected by remote client
                    const artistCollection = {
                        items: artistItems.map((item: any) => {
                            if (item.type === 'album' && item.album) {
                                return {
                                    ...item,
                                    ...item.album,
                                    item_url: item.album.bandcampUrl,
                                    hasTracks: item.album.tracks && item.album.tracks.length > 1
                                };
                            } else if (item.type === 'track' && item.track) {
                                return {
                                    ...item,
                                    ...item.track,
                                    item_url: item.track.bandcampUrl
                                };
                            }
                            return item;
                        }),
                        artistId,
                        totalCount: artistItems.length,
                        lastUpdated: collection.lastUpdated
                    };

                    this.sendToClient(ws, 'artist-collection-data', artistCollection);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-artist-collection:', e);
                    this.sendToClient(ws, 'error', { message: 'Failed to fetch artist collection' });
                }
                break;
            }
            case 'get-radio-stations': {
                try {
                    const stations = await this.scraperService.getRadioStations();
                    this.sendToClient(ws, 'radio-data', stations);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-radio-stations:', e);
                }
                break;
            }
            case 'get-playlist-sync-mode':
                this.sendToClient(ws, 'playlist-sync-mode',
                    this.database.getSettings()?.playlistSyncMode ?? 'two-way');
                break;
            case 'get-playlists': {
                const playlists = this.playlistService.getAll();
                this.sendToClient(ws, 'playlists-data', playlists);
                break;
            }
            case 'get-playlist-for-export': {
                const playlistId = payload;
                if (!playlistId) {
                    this.sendToClient(ws, 'error', { message: 'Missing playlist ID' });
                    return;
                }
                const playlist = this.playlistService.getById(playlistId);
                if (playlist) {
                    this.sendToClient(ws, 'export-playlist-data', playlist);
                } else {
                    this.sendToClient(ws, 'error', { message: 'Playlist not found' });
                }
                break;
            }
            case 'get-bandcamp-playlists': {
                try {
                    const playlists = await this.scraperService.fetchBandcampPlaylists();
                    this.sendToClient(ws, 'bandcamp-playlists-data', playlists);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-bandcamp-playlists:', e);
                }
                break;
            }
            case 'get-artists': {
                try {
                    const artists = this.database.getArtists();
                    this.sendToClient(ws, 'artists-data', artists);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-artists:', e);
                }
                break;
            }
            case 'create-playlist': {
                const { id, name, description } = payload;
                this.playlistService.create({ id, name, description });
                break;
            }
            case 'import-playlist': {
                const importedData = payload as any;
                if (!importedData || !importedData.name) {
                    console.error('[RemoteService] Invalid import-playlist payload');
                    break;
                }
                // Deliberately *not* honouring importedData.id / playlistEntryId: this is a
                // file import, and an exported file carries the ids it was exported with —
                // reusing them would silently merge into the existing playlist. The sync
                // flush never comes through here; it decomposes into create + add-track ops.
                const newPlaylist = this.playlistService.create({ name: importedData.name, description: importedData.description });
                if (importedData.tracks && importedData.tracks.length > 0) {
                    this.playlistService.addTracks(newPlaylist.id, importedData.tracks);
                }
                break;
            }
            case 'update-playlist': {
                const { id, name, description } = payload;
                this.playlistService.update({ id, name, description });
                break;
            }
            case 'delete-playlist': {
                const id = payload;
                this.playlistService.delete(id);
                break;
            }
            case 'play-playlist': {
                const playlist = this.playlistService.getById(payload);
                if (playlist && playlist.tracks.length > 0) {
                    this.playerService.clearQueue(false);
                    // Add all tracks from playlist
                    this.playerService.addTracksToQueue(playlist.tracks, 'playlist');
                    this.playerService.playIndex(0);
                }
                break;
            }
            case 'play-playlist-next': {
                const playlist = this.playlistService.getById(payload);
                if (playlist && playlist.tracks.length > 0) {
                    this.playerService.addTracksToQueue(playlist.tracks, 'playlist', true);
                }
                break;
            }
            case 'add-playlist-to-queue': {
                const playlist = this.playlistService.getById(payload);
                if (playlist && playlist.tracks.length > 0) {
                    this.playerService.addTracksToQueue(playlist.tracks, 'playlist');
                }
                break;
            }
            case 'remove-track-from-playlist': {
                const { playlistId, trackId } = payload;
                this.playlistService.removeTrack(playlistId, trackId);
                break;
            }
            case 'reorder-playlist-tracks': {
                const { playlistId, from, to, orderedEntryIds } = payload;
                if (Array.isArray(orderedEntryIds)) {
                    this.playlistService.setTrackOrder(playlistId, orderedEntryIds);
                } else {
                    this.playlistService.reorderTracks(playlistId, from, to);
                }
                break;
            }
            case 'toggle-shuffle':
                await this.playerService.toggleShuffle();
                break;
            case 'set-repeat':
                await this.playerService.setRepeat(payload);
                break;
            case 'play-album': {
                if (!this.isAllowedBandcampUrl(payload)) {
                    console.error('[RemoteService] Invalid play-album payload:', payload);
                    return;
                }
                const album = await this.scraperService.getAlbumDetails(payload);
                if (album) {
                    this.playerService.clearQueue(false);
                    this.playerService.addTracksToQueue(album.tracks);
                    await this.playerService.playIndex(0);
                }
                break;
            }
            case 'play-bandcamp-playlist': {
                if (!this.isAllowedBandcampUrl(payload)) {
                    console.error('[RemoteService] Invalid play-bandcamp-playlist payload:', payload);
                    return;
                }
                const tracks = await this.scraperService.fetchBandcampPlaylistTracks(payload);
                if (tracks && tracks.length > 0) {
                    this.playerService.clearQueue(false);
                    this.playerService.addTracksToQueue(tracks);
                    await this.playerService.playIndex(0);
                }
                break;
            }
            case 'get-bandcamp-playlist-tracks': {
                if (!this.isAllowedBandcampUrl(payload)) {
                    this.sendToClient(ws, 'error', { message: 'Invalid Bandcamp playlist URL' });
                    return;
                }
                const tracks = await this.scraperService.fetchBandcampPlaylistTracks(payload);
                this.sendToClient(ws, 'bandcamp-playlist-tracks-data', { url: payload, tracks: tracks || [] });
                break;
            }
            case 'get-album': {
                if (!this.isAllowedBandcampUrl(payload)) {
                    this.sendToClient(ws, 'error', { message: 'Invalid album URL' });
                    return;
                }
                const album = await this.scraperService.getAlbumDetails(payload);
                this.sendToClient(ws, 'album-details', album);
                break;
            }
            case 'play-track': {
                const track = await this.resolveTrack(payload);
                if (track && track.streamUrl) {
                    // Clear queue and add track, then play - matches desktop behavior
                    this.playerService.clearQueue(false);
                    this.playerService.addToQueue(track, 'collection');
                    await this.playerService.playIndex(0);
                } else {
                    console.error('[RemoteService] Could not play track, missing stream URL:', payload.title);
                }
                break;
            }
            case 'add-track-to-queue': {
                const track = await this.resolveTrack(payload.track);
                if (track && track.streamUrl) {
                    this.playerService.addToQueue(track, 'collection', payload.playNext);
                }
                break;
            }
            case 'add-album-to-queue': {
                if (!this.isAllowedBandcampUrl(payload?.albumUrl)) {
                    this.sendToClient(ws, 'error', { message: 'Invalid album URL' });
                    return;
                }
                console.log(`[RemoteService] Received add-album-to-queue for ${payload.albumUrl}`);
                try {
                    let tracks: Track[] | null = null;

                    // If tracks are provided in payload (e.g. from mobile), use them directly
                    if (payload.tracks && Array.isArray(payload.tracks) && payload.tracks.length > 0) {
                        console.log(`[RemoteService] Using ${payload.tracks.length} tracks from payload (skipping fetch)`);
                        tracks = payload.tracks;
                    } else {
                        // Fallback to scraping
                        const album = await this.scraperService.getAlbumDetails(payload.albumUrl);
                        console.log(`[RemoteService] Album fetched: ${album?.title}, tracks: ${album?.tracks?.length}`);
                        if (album) {
                            tracks = album.tracks;
                        }
                    }

                    if (tracks && tracks.length > 0) {
                        this.playerService.addTracksToQueue(tracks, 'collection', payload.playNext);
                        console.log('[RemoteService] Tracks added to player service');
                        if (!payload.playNext) {
                            this.playerService.playIndex(0);
                        }
                    } else {
                        console.error('[RemoteService] Failed to fetch album details or no tracks');
                    }
                } catch (e) {
                    console.error('[RemoteService] Error processing add-album-to-queue:', e);
                }
                break;
            }
            case 'add-track-to-playlist': {
                // Bulk form: already-resolved entries, so nothing here hits the network.
                if (Array.isArray(payload.tracks)) {
                    for (const entry of payload.tracks) {
                        if (entry?.track) {
                            this.playlistService.addTrack(payload.playlistId, entry.track, entry.entryId);
                        }
                    }
                    break;
                }
                const track = await this.resolveTrack(payload.track);
                if (track) {
                    this.playlistService.addTrack(payload.playlistId, track, payload.entryId);
                }
                break;
            }
            case 'add-album-to-playlist': {
                if (!this.isAllowedBandcampUrl(payload?.albumUrl)) break;
                const album = await this.scraperService.getAlbumDetails(payload.albumUrl);
                if (album) {
                    this.playlistService.addTracks(payload.playlistId, album.tracks);
                }
                break;
            }
            case 'play-station':
                await this.playerService.playStation(payload);
                break;
            case 'extract-radio-tracks': {
                const station = payload.station || payload;
                const append = payload.append || false;
                await this.playerService.extractRadioTracksToQueue(station, append);
                break;
            }
            case 'extract-radio-to-playlist': {
                const tracks = await this.scraperService.getStationTracks(payload.station.id);
                if (tracks.length > 0) {
                    this.playlistService.addTracks(payload.playlistId, tracks);
                }
                break;
            }
            case 'add-station-to-queue':
                await this.playerService.addStationToQueue(payload.station, payload.playNext);
                break;
            case 'add-station-to-playlist': {
                const radioTrack: Track = {
                    id: `radio-${payload.station.id}`,
                    title: payload.station.name,
                    artist: payload.station.description || 'Bandcamp Radio',
                    album: 'Bandcamp Radio',
                    duration: 0,
                    artworkUrl: payload.station.imageUrl || '',
                    streamUrl: '',
                    bandcampUrl: '',
                    isCached: false,
                    radioStationId: payload.station.id,
                };
                this.playlistService.addTrack(payload.playlistId, radioTrack);
                break;
            }
            case 'toggle-mute':
                this.playerService.toggleMute();
                break;
            case 'play-queue-index':
                if (typeof payload === 'number') {
                    await this.playerService.playIndex(payload);
                }
                break;
            case 'remove-from-queue':
                if (typeof payload === 'string') {
                    this.playerService.removeFromQueue(payload);
                }
                break;
            case 'clear-queue':
                if (payload && typeof payload.keepTrack === 'boolean')
                    this.playerService.clearQueue(payload.keepTrack);
                else
                    this.playerService.clearQueue();
                break;
            case 'reorder-queue':
                if (payload && typeof payload.from === 'number' && typeof payload.to === 'number') {
                    this.playerService.reorderQueue(payload.from, payload.to);
                }
                break;
            case 'get-state':
                this.sendToClient(ws, 'state-changed', this.playerService.getState());
                break;
            default:
                console.warn('[RemoteService] Unknown message type:', type);
        }
    }

    private broadcast(type: string, payload: any): void {
        if (!this.wss) return;
        try {
            const data = JSON.stringify({ type, payload });

            this.clients.forEach((client) => {
                if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
                    try {
                        client.ws.send(data);
                    } catch (err) {
                        console.error('[RemoteService] Error sending to client:', err);
                    }
                }
            });
        } catch (e) {
            console.error('[RemoteService] Error stringifying broadcast payload:', e);
        }
    }

    private sendToClient(ws: WebSocket, type: string, payload: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    }


    private getAssetsPath(): string {
        const prodPath = path.join(__dirname, '../../assets/remote');
        // In dev mode (tsc -w), assets aren't copied to dist
        const devPath = path.join(__dirname, '../../../src/assets/remote');

        // Check electron app property if available, but dynamic import to avoid circular dep issues in some archetypes
        const isDev = process.env.NODE_ENV === 'development';

        if (isDev && fs.existsSync(path.join(devPath, 'index.html'))) {
            return devPath;
        }

        if (fs.existsSync(path.join(prodPath, 'index.html'))) {
            return prodPath;
        } else if (fs.existsSync(path.join(devPath, 'index.html'))) {
            return devPath;
        }

        return prodPath; // Fallback
    }

    private serveIndex(res: ServerResponse): void {
        const icons = {
            Play: this.iconToSvg(Play),
            Pause: this.iconToSvg(Pause),
            SkipBack: this.iconToSvg(SkipBack),
            SkipForward: this.iconToSvg(SkipForward),
            Shuffle: this.iconToSvg(Shuffle),
            Repeat: this.iconToSvg(Repeat),
            Repeat1: this.iconToSvg(Repeat1),
            VolumeX: this.iconToSvg(VolumeX),
            Volume1: this.iconToSvg(Volume1),
            Volume2: this.iconToSvg(Volume2),
            List: this.iconToSvg(List),
            Library: this.iconToSvg(Library),
            ListMusic: this.iconToSvg(ListMusic),
            Radio: this.iconToSvg(Radio),
            Search: this.iconToSvg(Search),
            MoreVertical: this.iconToSvg(MoreVertical),
            ListOrdered: this.iconToSvg(ListOrdered)
        };

        const assetsPath = this.getAssetsPath();
        const indexPath = path.join(assetsPath, 'index.html');

        fs.readFile(indexPath, 'utf8', (err, html) => {
            if (err) {
                console.error('[RemoteService] Error reading index.html:', err);
                res.writeHead(500);
                res.end('Error loading remote interface');
                return;
            }

            const iconsScript = `const ICONS = ${JSON.stringify(icons)};`;
            const finalHtml = html.replace('/* ICONS_INJECTION */', iconsScript);

            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(finalHtml);
        });
    }

    private serveStatic(res: ServerResponse, filename: string, contentType: string): void {
        const assetsPath = this.getAssetsPath();
        const filePath = path.join(assetsPath, filename);

        fs.readFile(filePath, (err, content) => {
            if (err) {
                console.warn(`[RemoteService] File not found: ${filename}`);
                res.writeHead(404);
                res.end();
                return;
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content);
        });
    }

}
