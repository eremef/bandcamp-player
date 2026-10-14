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
    QueueItem,
    RadioStation,
    RemoteClient,
    RemotePairingRecord,
    RemotePairedDevice,
    RemotePairingRequest,
    RemoteNetworkInterface,
    RemoteControlStatus,
    RemoteSecurityMode,
    DesktopQueueHandoffStatus,
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

const MAX_QUEUE_TRANSFER_BYTES = 8 * 1024 * 1024;
const MAX_QUEUE_TRANSFER_CHUNK_BYTES = 700 * 1024;
const MAX_QUEUE_TRANSFER_CHUNK_TEXT = 960 * 1024;
const QUEUE_TRANSFER_TIMEOUT_MS = 60_000;
const PAUSE_LEASE_TIMEOUT_MS = 20_000;

interface StagedDesktopQueueTransfer {
    clientId: string;
    ownerId: string;
    requestId: string;
    transferId: string;
    expectedQueueVersion: number;
    expectedActionVersion: number;
    totalBytes: number;
    chunkCount: number;
    chunks: Map<number, Buffer>;
    receivedBytes: number;
    preparedItems?: QueueItem[];
    currentIndex?: number;
    committing: boolean;
    expiresAt: number;
    timeout: ReturnType<typeof setTimeout>;
}

interface DesktopQueueTransferOutcome {
    ownerId: string;
    requestId: string;
    transferId: string;
    status: 'pending' | 'completed';
    result?: { success: boolean; queueVersion?: number; actionVersion?: number; reason?: string };
    timeout: ReturnType<typeof setTimeout>;
}

const QUEUE_TRANSFER_OUTCOME_TTL_MS = 60_000;
const MAX_QUEUE_TRANSFER_OUTCOMES = 20;

interface DesktopQueuePauseLease {
    clientId: string;
    requestId: string;
    expectedActionVersion: number;
    trackId: string;
    position: number;
    wasPlaying: boolean;
    timeout: ReturnType<typeof setTimeout>;
}

interface CompletedDesktopQueuePause {
    expectedActionVersion: number;
    timeout: ReturnType<typeof setTimeout>;
}

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
    private clients: Map<string, { ws: WebSocket; authenticated: boolean; pairingId?: string; failedAuthAttempts: number; stateSubscription?: 'remote' | 'standalone' } & RemoteClient> = new Map();
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
    private queueTransfers = new Map<string, StagedDesktopQueueTransfer>();
    private queueTransferClients = new Map<string, string>();
    private queueTransferOutcomes = new Map<string, DesktopQueueTransferOutcome>();
    private queuePauseLeases = new Map<string, DesktopQueuePauseLease>();
    private completedQueuePauses = new Map<string, CompletedDesktopQueuePause>();
    private queueHandoffPauseInProgress = false;

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
                this.sendQueueHandoffCapabilities(ws);
                this.sendToClient(ws, 'state-changed', this.playerService.getState());
            } else {
                const cookie = this.getCookieValue(req.headers.cookie, 'remote_session');
                const cookieMatch = cookie?.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/i);
                if (cookieMatch && this.authenticateClient(client, cookieMatch[1], cookieMatch[2])) {
                    this.sendToClient(ws, 'authenticated', { deviceId: cookieMatch[1] });
                    this.sendQueueHandoffCapabilities(ws);
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
                this.releaseQueuePauseLeases(clientId);
                this.clearQueueTransfersForClient(clientId);
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
        for (const lease of Array.from(this.queuePauseLeases.values())) {
            this.clearQueuePauseLease(lease.clientId, lease.requestId);
            await this.playerService.resumeForQueueHandoff(lease.trackId, lease.expectedActionVersion, lease.position, lease.wasPlaying);
        }
        for (const stage of this.queueTransfers.values()) clearTimeout(stage.timeout);
        this.queueTransfers.clear();
        this.queueTransferClients.clear();
        for (const outcome of this.queueTransferOutcomes.values()) clearTimeout(outcome.timeout);
        this.queueTransferOutcomes.clear();
        for (const completion of this.completedQueuePauses.values()) clearTimeout(completion.timeout);
        this.completedQueuePauses.clear();
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

        const selectedInterface = settings?.remoteInterfaceName
            ? interfaces.find((networkInterface) => networkInterface.name === settings.remoteInterfaceName)
            : null;
        if (settings?.remoteInterfaceName && !selectedInterface) {
            throw new Error('The selected network interface is unavailable. Choose another interface or use the recommended interface.');
        }

        const listenInterface = selectedInterface ?? this.recommendedInterface;
        if (!listenInterface) {
            throw new Error('Could not identify the recommended network interface. Choose an available interface.');
        }
        return {
            listenAddress: listenInterface.address,
            advertisedAddress: listenInterface.address,
            interfaces,
            allowedHostAddresses: [listenInterface.address],
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
        const interfaces = this.isRunning ? this.activeInterfaces : this.getAvailableInterfaces();
        const recommendedInterface = this.recommendedInterface
            ? interfaces.find((networkInterface) => networkInterface.address === this.recommendedInterface?.address) ?? null
            : null;
        const configuredInterface = settings?.remoteInterfaceName
            ? interfaces.find((networkInterface) => networkInterface.name === settings.remoteInterfaceName) ?? null
            : null;
        const selectedInterface = configuredInterface ?? recommendedInterface;
        const ip = selectedInterface?.address ?? '';
        const scheme = this.securityMode === 'safe' ? 'https' : 'http';
        const listeningAddress = this.isRunning ? this.listenAddress : selectedInterface?.address ?? '';
        return {
            isRunning: this.isRunning,
            port: this.port,
            ip,
            url: ip ? `${scheme}://${ip}:${this.port}` : '',
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
        this.sendQueueHandoffCapabilities(client.ws);
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
                this.sendQueueHandoffCapabilities(ws);
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
            case 'set-state-subscription': {
                const client = this.clients.get(clientId);
                if (!client?.authenticated || (payload?.mode !== 'remote' && payload?.mode !== 'standalone')) break;
                client.stateSubscription = payload.mode;
                if (payload.mode === 'standalone') {
                    this.sendToClient(ws, 'queue-handoff-status', this.getQueueHandoffStatus());
                } else {
                    this.sendToClient(ws, 'state-changed', this.playerService.getState());
                }
                break;
            }
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
                this.playerService.markHandoffAction();
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
                this.playerService.markHandoffAction();
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
                this.playerService.markHandoffAction();
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
                this.playerService.markHandoffAction();
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
                this.playerService.markHandoffAction();
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
            case 'request-desktop-queue-continuation': {
                if (typeof payload?.requestId !== 'string' || payload.requestId.length > 128) break;
                const state = this.playerService.getState();
                const queue = state.queue && Array.isArray(state.queue.items)
                    ? state.queue
                    : { items: [], currentIndex: -1 };
                const snapshot = {
                    queue,
                    currentTrack: state.currentTrack || null,
                    currentIndex: Number.isInteger(queue.currentIndex) ? queue.currentIndex : -1,
                    position: Number.isFinite(state.currentTime) ? Math.max(0, state.currentTime) : 0,
                    duration: Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0,
                };
                this.sendToClient(ws, 'desktop-queue-snapshot', { requestId: payload.requestId, snapshot });
                break;
            }
            case 'request-desktop-queue-handoff-snapshot':
                await this.handleQueueHandoffSnapshot(ws, payload);
                break;
            case 'request-desktop-queue-pause':
                await this.handleQueueHandoffPause(ws, clientId, payload);
                break;
            case 'request-desktop-queue-resume':
                await this.handleQueueHandoffResume(ws, clientId, payload);
                break;
            case 'complete-desktop-queue-pause':
                await this.handleQueueHandoffComplete(ws, clientId, payload);
                break;
            case 'begin-desktop-queue-transfer':
                this.handleQueueTransferBegin(ws, clientId, payload);
                break;
            case 'desktop-queue-transfer-chunk':
                this.handleQueueTransferChunk(ws, clientId, payload);
                break;
            case 'prepare-desktop-queue-transfer':
                await this.handleQueueTransferPrepare(ws, clientId, payload);
                break;
            case 'commit-desktop-queue-transfer':
                await this.handleQueueTransferCommit(ws, clientId, payload);
                break;
            case 'request-desktop-queue-transfer-status':
                this.handleQueueTransferStatus(ws, clientId, payload);
                break;
            case 'abort-desktop-queue-transfer':
                this.handleQueueTransferAbort(ws, clientId, payload);
                break;
            default:
                console.warn('[RemoteService] Unknown message type:', type);
        }
    }

    private sendQueueHandoffCapabilities(ws: WebSocket): void {
        this.sendToClient(ws, 'capabilities', {
            capabilities: ['queue-handoff-v1', 'queue-handoff-status-v1'],
            queueHandoffStatus: this.getQueueHandoffStatus(),
        });
    }

    private getQueueHandoffStatus(state = this.playerService.getState()): DesktopQueueHandoffStatus {
        const selectedTrack = state.queue?.items?.[state.queue.currentIndex]?.track;
        return {
            queueNonempty: !!state.queue?.items?.length,
            hasActiveTrack: !!selectedTrack?.id && state.currentTrack?.id === selectedTrack.id,
            ...this.playerService.getHandoffVersions(),
        };
    }

    private async handleQueueHandoffSnapshot(ws: WebSocket, payload: any): Promise<void> {
        if (!this.isValidRequestId(payload?.requestId)) return;
        const state = this.playerService.getState();
        const versions = this.playerService.getHandoffVersions();
        const actualCastState = state.isCasting ? await this.playerService.getActualCastPlaybackState() : null;
        const actualPlaying = state.isCasting
            ? actualCastState === null ? null : !['PAUSED', 'IDLE'].includes(actualCastState)
            : this.playerService.getActualLocalPlaybackStatus(state.currentTrack?.id);
        const snapshot = {
            queue: state.queue,
            currentTrack: state.currentTrack || null,
            currentIndex: Number.isInteger(state.queue?.currentIndex) ? state.queue.currentIndex : -1,
            position: Number.isFinite(state.currentTime) ? Math.max(0, state.currentTime) : 0,
            duration: Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0,
            queueVersion: versions.queueVersion,
            actionVersion: versions.actionVersion,
            isPlaying: actualPlaying === true,
            isCasting: state.isCasting,
            playbackStatusKnown: actualPlaying !== null,
        };
        this.sendToClient(ws, 'desktop-queue-snapshot', { requestId: payload.requestId, snapshot });
    }

    private async handleQueueHandoffPause(ws: WebSocket, clientId: string, payload: any): Promise<void> {
        if (!this.isValidRequestId(payload?.requestId) || typeof payload?.expectedTrackId !== 'string' ||
            payload.expectedTrackId.length > 256 || !Number.isSafeInteger(payload?.expectedQueueVersion) ||
            !Number.isSafeInteger(payload?.expectedActionVersion)) return;
        const existingLease = this.queuePauseLeases.get(this.queuePauseLeaseKey(clientId, payload.requestId));
        if (existingLease) {
            const versions = this.playerService.getHandoffVersions();
            this.sendToClient(ws, 'desktop-queue-paused', {
                requestId: payload.requestId,
                success: versions.actionVersion === existingLease.expectedActionVersion,
                trackId: existingLease.trackId,
                position: existingLease.position,
                queueVersion: versions.queueVersion,
                actionVersion: existingLease.expectedActionVersion,
                wasPlaying: true,
                reason: versions.actionVersion === existingLease.expectedActionVersion
                    ? undefined
                    : 'Desktop playback changed after it was paused.',
            });
            return;
        }
        if (this.queueHandoffPauseInProgress || this.queuePauseLeases.size > 0 || this.queueTransfers.size > 0) {
            this.sendToClient(ws, 'desktop-queue-paused', {
                requestId: payload.requestId,
                success: false,
                reason: 'Another queue handoff is already in progress.',
            });
            return;
        }
        this.queueHandoffPauseInProgress = true;
        try {
            const result = await this.playerService.pauseForQueueHandoff(
                payload.expectedTrackId,
                payload.expectedQueueVersion,
                payload.expectedActionVersion,
            );
            if (result.success && result.wasPlaying) this.createQueuePauseLease(clientId, payload.requestId, result);
            this.sendToClient(ws, 'desktop-queue-paused', { requestId: payload.requestId, ...result });
        } finally {
            this.queueHandoffPauseInProgress = false;
        }
    }

    private async handleQueueHandoffResume(ws: WebSocket, clientId: string, payload: any): Promise<void> {
        if (!this.isValidRequestId(payload?.requestId) || typeof payload?.expectedTrackId !== 'string' ||
            payload.expectedTrackId.length > 256 || !Number.isSafeInteger(payload?.expectedActionVersion) ||
            typeof payload?.wasPlaying !== 'boolean' || !Number.isFinite(payload?.position)) return;
        const success = await this.playerService.resumeForQueueHandoff(
            payload.expectedTrackId,
            payload.expectedActionVersion,
            Math.max(0, payload.position),
            payload.wasPlaying,
        );
        this.clearQueuePauseLease(clientId, payload.requestId);
        this.sendToClient(ws, 'desktop-queue-resume-result', { requestId: payload.requestId, success });
    }

    private async handleQueueHandoffComplete(ws: WebSocket, clientId: string, payload: any): Promise<void> {
        if (!this.isValidRequestId(payload?.requestId) || !Number.isSafeInteger(payload?.expectedActionVersion)) return;
        const key = this.queuePauseLeaseKey(clientId, payload.requestId);
        const lease = this.queuePauseLeases.get(key);
        if (!lease) {
            const completed = this.completedQueuePauses.get(key);
            this.sendToClient(ws, 'desktop-queue-handoff-completed', {
                requestId: payload.requestId,
                success: completed?.expectedActionVersion === payload.expectedActionVersion,
            });
            return;
        }
        const state = this.playerService.getState();
        const versions = this.playerService.getHandoffVersions();
        const sourceIsPaused = state.isCasting
            ? (await this.playerService.getActualCastPlaybackState()) === 'PAUSED'
            : this.playerService.getActualLocalPlaybackStatus(state.currentTrack?.id) === false;
        const success = lease.expectedActionVersion === payload.expectedActionVersion &&
            versions.actionVersion === payload.expectedActionVersion && state.currentTrack?.id === lease.trackId &&
            sourceIsPaused;
        if (success) {
            this.clearQueuePauseLease(clientId, payload.requestId);
            for (const [completedKey, completion] of this.completedQueuePauses) {
                if (this.completedQueuePauses.size >= 20) {
                    clearTimeout(completion.timeout);
                    this.completedQueuePauses.delete(completedKey);
                    break;
                }
            }
            const timeout = setTimeout(() => this.completedQueuePauses.delete(key), 60_000);
            this.completedQueuePauses.set(key, { expectedActionVersion: payload.expectedActionVersion, timeout });
        }
        this.sendToClient(ws, 'desktop-queue-handoff-completed', { requestId: payload.requestId, success });
    }

    private handleQueueTransferBegin(ws: WebSocket, clientId: string, payload: any): void {
        const fail = (reason: string) => this.sendToClient(ws, 'desktop-queue-transfer-ready', {
            requestId: payload?.requestId,
            transferId: payload?.transferId,
            success: false,
            reason,
        });
        if (!this.isValidRequestId(payload?.requestId) || !this.isValidRequestId(payload?.transferId) ||
            !Number.isSafeInteger(payload?.expectedQueueVersion) || !Number.isSafeInteger(payload?.expectedActionVersion) ||
            !Number.isSafeInteger(payload?.totalBytes) || payload.totalBytes < 2 || payload.totalBytes > MAX_QUEUE_TRANSFER_BYTES ||
            !Number.isSafeInteger(payload?.chunkCount) || payload.chunkCount < 1 ||
            payload.chunkCount > Math.ceil(MAX_QUEUE_TRANSFER_BYTES / MAX_QUEUE_TRANSFER_CHUNK_BYTES) ||
            payload.chunkCount !== Math.ceil(payload.totalBytes / MAX_QUEUE_TRANSFER_CHUNK_BYTES)) {
            fail('The queue transfer size or metadata is invalid.');
            return;
        }
        if (this.queueHandoffPauseInProgress || this.queuePauseLeases.size > 0) {
            fail('Another queue handoff is already in progress.');
            return;
        }
        const versions = this.playerService.getHandoffVersions();
        if (versions.queueVersion !== payload.expectedQueueVersion || versions.actionVersion !== payload.expectedActionVersion) {
            fail('Desktop playback changed before the transfer started.');
            return;
        }
        const priorKey = this.queueTransferClients.get(clientId);
        if (priorKey) this.removeQueueTransfer(priorKey);
        if (this.queueTransfers.size >= 3) {
            fail('Another queue transfer is already in progress.');
            return;
        }
        const key = this.queueTransferKey(clientId, payload.transferId);
        if (this.queueTransferOutcomes.has(payload.transferId)) {
            fail('This queue transfer ID has already been used.');
            return;
        }
        const timeout = setTimeout(() => this.removeQueueTransfer(key), QUEUE_TRANSFER_TIMEOUT_MS);
        const stage: StagedDesktopQueueTransfer = {
            clientId,
            ownerId: this.queueTransferOwnerId(clientId),
            requestId: payload.requestId,
            transferId: payload.transferId,
            expectedQueueVersion: payload.expectedQueueVersion,
            expectedActionVersion: payload.expectedActionVersion,
            totalBytes: payload.totalBytes,
            chunkCount: payload.chunkCount,
            chunks: new Map(),
            receivedBytes: 0,
            committing: false,
            expiresAt: Date.now() + QUEUE_TRANSFER_TIMEOUT_MS,
            timeout,
        };
        this.queueTransfers.set(key, stage);
        this.queueTransferClients.set(clientId, key);
        this.sendToClient(ws, 'desktop-queue-transfer-ready', {
            requestId: stage.requestId,
            transferId: stage.transferId,
            success: true,
        });
    }

    private handleQueueTransferChunk(ws: WebSocket, clientId: string, payload: any): void {
        const stage = this.getQueueTransferStage(clientId, payload);
        if (!stage) {
            this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
                requestId: payload?.requestId,
                transferId: payload?.transferId,
                index: payload?.index,
                success: false,
                reason: 'The queue transfer is unavailable or expired.',
            });
            return;
        }
        const index = payload?.index;
        const encoded = payload?.data;
        if (!Number.isSafeInteger(index) || index < 0 || index >= stage.chunkCount ||
            typeof encoded !== 'string' || encoded.length > MAX_QUEUE_TRANSFER_CHUNK_TEXT ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
            this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
            this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
                requestId: payload?.requestId,
                transferId: payload?.transferId,
                index,
                success: false,
                reason: 'The queue transfer chunk is invalid.',
            });
            return;
        }
        const chunk = Buffer.from(encoded, 'base64');
        if (chunk.length === 0 || chunk.length > MAX_QUEUE_TRANSFER_CHUNK_BYTES || chunk.toString('base64') !== encoded) {
            this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
            this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
                requestId: stage.requestId,
                transferId: stage.transferId,
                index,
                success: false,
                reason: 'The queue transfer chunk is invalid.',
            });
            return;
        }
        const priorChunk = stage.chunks.get(index);
        if (priorChunk) {
            const success = priorChunk.equals(chunk);
            this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
                requestId: stage.requestId,
                transferId: stage.transferId,
                index,
                success,
                reason: success ? undefined : 'A different chunk was already received at this index.',
            });
            return;
        }
        if (index !== stage.chunks.size || stage.receivedBytes + chunk.length > stage.totalBytes) {
            this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
            this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
                requestId: stage.requestId,
                transferId: stage.transferId,
                index,
                success: false,
                reason: 'The queue transfer chunks arrived out of order or exceeded the declared size.',
            });
            return;
        }
        stage.chunks.set(index, chunk);
        stage.receivedBytes += chunk.length;
        this.sendToClient(ws, 'desktop-queue-transfer-chunk-ack', {
            requestId: stage.requestId,
            transferId: stage.transferId,
            index,
            success: true,
        });
    }

    private async handleQueueTransferPrepare(ws: WebSocket, clientId: string, payload: any): Promise<void> {
        const stage = this.getQueueTransferStage(clientId, payload);
        if (!stage || stage.chunks.size !== stage.chunkCount || stage.receivedBytes !== stage.totalBytes) {
            this.sendToClient(ws, 'desktop-queue-transfer-prepared', {
                requestId: payload?.requestId,
                transferId: payload?.transferId,
                success: false,
                reason: 'The complete queue transfer has not arrived.',
            });
            return;
        }
        try {
            const bytes = Buffer.concat(Array.from({ length: stage.chunkCount }, (_, index) => stage.chunks.get(index)!));
            const queueDocument = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            const sanitized = this.sanitizeTransferredQueue(queueDocument);
            if (!sanitized) throw new Error('The transferred queue contains invalid data.');
            const prepared = await this.playerService.prepareQueueForHandoff(
                sanitized.items,
                sanitized.currentIndex,
                stage.expectedQueueVersion,
                stage.expectedActionVersion,
            );
            if (!prepared.success || !prepared.items) throw new Error(prepared.reason || 'The selected track could not be prepared on desktop.');
            stage.preparedItems = prepared.items;
            stage.currentIndex = sanitized.currentIndex;
            this.sendToClient(ws, 'desktop-queue-transfer-prepared', {
                requestId: stage.requestId,
                transferId: stage.transferId,
                success: true,
            });
        } catch (error) {
            this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
            this.sendToClient(ws, 'desktop-queue-transfer-prepared', {
                requestId: stage.requestId,
                transferId: stage.transferId,
                success: false,
                reason: error instanceof Error ? error.message : 'The queue transfer could not be prepared.',
            });
        }
    }

    private async handleQueueTransferCommit(ws: WebSocket, clientId: string, payload: any): Promise<void> {
        if (!this.isValidRequestId(payload?.requestId) || !this.isValidRequestId(payload?.transferId)) return;
        const ownerId = this.queueTransferOwnerId(clientId);
        const outcomeKey = this.queueTransferOutcomeKey(ownerId, payload.transferId);
        const cachedOutcome = this.queueTransferOutcomes.get(outcomeKey);
        if (cachedOutcome?.ownerId === ownerId && cachedOutcome.requestId === payload.requestId) {
            if (cachedOutcome.status === 'completed' && cachedOutcome.result) {
                this.sendToClient(ws, 'desktop-queue-transfer-result', {
                    requestId: cachedOutcome.requestId,
                    transferId: cachedOutcome.transferId,
                    ...cachedOutcome.result,
                });
            }
            return;
        }

        const stage = this.getQueueTransferStage(clientId, payload);
        const fail = (reason: string) => this.sendToClient(ws, 'desktop-queue-transfer-result', {
            requestId: payload?.requestId,
            transferId: payload?.transferId,
            success: false,
            reason,
        });
        if (!stage || !stage.preparedItems || !Number.isFinite(payload?.position) || payload.position < 0 || payload.position > 100_000) {
            fail('The prepared queue transfer is unavailable or the playback position is invalid.');
            return;
        }
        if (stage.committing) return;
        stage.committing = true;
        this.storeQueueTransferOutcome(stage, 'pending');
        const versions = this.playerService.getHandoffVersions();
        if (versions.queueVersion !== stage.expectedQueueVersion || versions.actionVersion !== stage.expectedActionVersion) {
            this.storeQueueTransferOutcome(stage, 'completed', {
                success: false,
                queueVersion: versions.queueVersion,
                actionVersion: versions.actionVersion,
                reason: 'Desktop playback changed before the queue transfer could commit.',
            });
            this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
            this.sendQueueTransferOutcome(ws, this.queueTransferOutcomes.get(outcomeKey)!);
            return;
        }
        let result: { success: boolean; queueVersion: number; actionVersion: number; reason?: string };
        try {
            result = await this.playerService.replaceQueueForHandoff(
                stage.preparedItems,
                stage.currentIndex!,
                payload.position,
                stage.expectedQueueVersion,
                stage.expectedActionVersion,
                true,
            );
        } catch (error) {
            const latestVersions = this.playerService.getHandoffVersions();
            result = {
                success: false,
                queueVersion: latestVersions.queueVersion,
                actionVersion: latestVersions.actionVersion,
                reason: error instanceof Error ? error.message : 'The desktop could not commit the queue transfer.',
            };
        }
        this.storeQueueTransferOutcome(stage, 'completed', result);
        this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
        this.sendQueueTransferOutcome(ws, this.queueTransferOutcomes.get(outcomeKey)!);
    }

    private handleQueueTransferStatus(ws: WebSocket, clientId: string, payload: any): void {
        if (!this.isValidRequestId(payload?.requestId) || !this.isValidRequestId(payload?.transferId)) return;
        const ownerId = this.queueTransferOwnerId(clientId);
        const outcome = this.queueTransferOutcomes.get(this.queueTransferOutcomeKey(ownerId, payload.transferId));
        if (outcome && outcome.ownerId === ownerId) {
            this.sendToClient(ws, 'desktop-queue-transfer-status', {
                requestId: payload.requestId,
                transferId: payload.transferId,
                status: outcome.status,
                ...(outcome.result ? { result: outcome.result } : {}),
            });
            return;
        }
        this.sendToClient(ws, 'desktop-queue-transfer-status', {
            requestId: payload.requestId,
            transferId: payload.transferId,
            status: 'unknown',
        });
    }

    private handleQueueTransferAbort(ws: WebSocket, clientId: string, payload: any): void {
        if (!this.isValidRequestId(payload?.requestId) || !this.isValidRequestId(payload?.transferId)) return;
        const stage = this.getQueueTransferStage(clientId, payload);
        if (stage) this.removeQueueTransfer(this.queueTransferKey(clientId, stage.transferId));
        this.sendToClient(ws, 'desktop-queue-transfer-aborted', {
            requestId: payload.requestId,
            transferId: payload.transferId,
            success: true,
        });
    }

    private sanitizeTransferredQueue(value: unknown): { items: QueueItem[]; currentIndex: number } | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const document = value as { items?: unknown; currentIndex?: unknown };
        if (!Array.isArray(document.items) || document.items.length === 0 || document.items.length > 10_000 ||
            !Number.isSafeInteger(document.currentIndex) || (document.currentIndex as number) < 0 || (document.currentIndex as number) >= document.items.length) return null;
        const items: QueueItem[] = [];
        for (const valueItem of document.items) {
            if (!valueItem || typeof valueItem !== 'object' || Array.isArray(valueItem)) return null;
            const rawItem = valueItem as Record<string, any>;
            const id = this.transferText(rawItem.id, 256);
            const source = rawItem.source;
            if (!id || !['collection', 'playlist', 'radio', 'search'].includes(source)) return null;
            const track = this.sanitizeTransferredTrack(rawItem.track);
            if (!track) return null;
            const item: QueueItem = { id, source, track };
            if (rawItem.sourceId !== undefined) {
                const sourceId = this.transferText(rawItem.sourceId, 256);
                if (!sourceId) return null;
                item.sourceId = sourceId;
            }
            if (rawItem.radioStation !== undefined) {
                const station = this.sanitizeTransferredStation(rawItem.radioStation);
                if (!station) return null;
                item.radioStation = station;
            }
            items.push(item);
        }
        return { items, currentIndex: document.currentIndex as number };
    }

    private sanitizeTransferredTrack(value: unknown): Track | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const raw = value as Record<string, any>;
        const id = this.transferText(raw.id, 256);
        const title = this.transferText(raw.title, 1000);
        const artist = this.transferFieldText(raw.artist, 1000);
        const album = this.transferFieldText(raw.album, 1000);
        if (!id || !title || artist === null || album === null || !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 100_000) return null;
        const track: Track = {
            id,
            title,
            artist: artist || 'Unknown Artist',
            album,
            duration: raw.duration,
            artworkUrl: this.sanitizeTransferUrl(raw.artworkUrl),
            streamUrl: this.sanitizeTransferUrl(raw.streamUrl),
            bandcampUrl: this.isAllowedBandcampUrl(raw.bandcampUrl) ? raw.bandcampUrl : '',
            isCached: false,
        };
        for (const field of ['artistId', 'albumId', 'playlistEntryId', 'radioStationId'] as const) {
            if (raw[field] !== undefined) {
                const text = this.transferFieldText(raw[field], 256);
                if (text === null) return null;
                track[field] = text;
            }
        }
        if (raw.trackNumber !== undefined) {
            if (!Number.isSafeInteger(raw.trackNumber) || raw.trackNumber < 0) return null;
            track.trackNumber = raw.trackNumber;
        }
        if (raw.hasStream !== undefined) {
            if (typeof raw.hasStream !== 'boolean') return null;
            track.hasStream = raw.hasStream;
        }
        if (raw.isPreorderTrack !== undefined) {
            if (typeof raw.isPreorderTrack !== 'boolean') return null;
            track.isPreorderTrack = raw.isPreorderTrack;
        }
        return track;
    }

    private sanitizeTransferredStation(value: unknown): RadioStation | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const raw = value as Record<string, any>;
        const id = this.transferText(raw.id, 256);
        const name = this.transferText(raw.name, 500);
        if (!id || !name) return null;
        const station: RadioStation = {
            id,
            name,
            streamUrl: this.sanitizeTransferUrl(raw.streamUrl),
            imageUrl: this.sanitizeTransferUrl(raw.imageUrl),
        };
        for (const field of ['description', 'longDescription', 'imageCaption', 'date'] as const) {
            if (raw[field] !== undefined) {
                const text = this.transferFieldText(raw[field], 2048);
                if (text === null) return null;
                station[field] = text;
            }
        }
        if (raw.duration !== undefined) {
            if (!Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 100_000) return null;
            station.duration = raw.duration;
        }
        return station;
    }

    private transferText(value: unknown, maxLength: number): string | null {
        const clean = this.transferFieldText(value, maxLength);
        return clean?.trim() || null;
    }

    private transferFieldText(value: unknown, maxLength: number): string | null {
        if (typeof value !== 'string' || value.length > maxLength) return null;
        return value.replace(/\p{Cc}/gu, '').trim();
    }

    private sanitizeTransferUrl(value: unknown): string {
        if (typeof value !== 'string' || value.length > 2048 || !value) return '';
        try {
            const url = new URL(value);
            const allowedHost = ['bandcamp.com', 'bcbits.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
            if (url.protocol !== 'https:' || !allowedHost || (url.port !== '' && url.port !== '443') || url.username || url.password) return '';
            return url.toString();
        } catch {
            return '';
        }
    }

    private isValidRequestId(value: unknown): value is string {
        return typeof value === 'string' && value.length > 0 && value.length <= 128;
    }

    private queueTransferKey(clientId: string, transferId: string): string {
        return `${clientId}:${transferId}`;
    }

    private queueTransferOwnerId(clientId: string): string {
        const client = this.clients.get(clientId);
        if (client?.pairingId) return `paired:${client.pairingId}`;
        return this.securityMode === 'unsafe' ? 'unsafe' : `connection:${clientId}`;
    }

    private queueTransferOutcomeKey(ownerId: string, transferId: string): string {
        return JSON.stringify([ownerId, transferId]);
    }

    private storeQueueTransferOutcome(
        stage: StagedDesktopQueueTransfer,
        status: 'pending' | 'completed',
        result?: { success: boolean; queueVersion?: number; actionVersion?: number; reason?: string },
    ): void {
        const key = this.queueTransferOutcomeKey(stage.ownerId, stage.transferId);
        const prior = this.queueTransferOutcomes.get(key);
        if (prior) clearTimeout(prior.timeout);
        if (!prior && this.queueTransferOutcomes.size >= MAX_QUEUE_TRANSFER_OUTCOMES) {
            const oldestKey = this.queueTransferOutcomes.keys().next().value;
            if (oldestKey) {
                const oldest = this.queueTransferOutcomes.get(oldestKey);
                if (oldest) clearTimeout(oldest.timeout);
                this.queueTransferOutcomes.delete(oldestKey);
            }
        }
        const outcome: DesktopQueueTransferOutcome = {
            ownerId: stage.ownerId,
            requestId: stage.requestId,
            transferId: stage.transferId,
            status,
            result,
            timeout: setTimeout(() => {
                if (this.queueTransferOutcomes.get(key) === outcome) {
                    this.queueTransferOutcomes.delete(key);
                }
            }, QUEUE_TRANSFER_OUTCOME_TTL_MS),
        };
        this.queueTransferOutcomes.set(key, outcome);
    }

    private sendQueueTransferOutcome(ws: WebSocket, outcome: DesktopQueueTransferOutcome): void {
        if (outcome.status !== 'completed' || !outcome.result) return;
        this.sendToClient(ws, 'desktop-queue-transfer-result', {
            requestId: outcome.requestId,
            transferId: outcome.transferId,
            ...outcome.result,
        });
    }

    private getQueueTransferStage(clientId: string, payload: any): StagedDesktopQueueTransfer | undefined {
        if (!this.isValidRequestId(payload?.requestId) || !this.isValidRequestId(payload?.transferId)) return undefined;
        const key = this.queueTransferKey(clientId, payload.transferId);
        const stage = this.queueTransfers.get(key);
        if (!stage || stage.expiresAt <= Date.now() || stage.requestId !== payload.requestId) {
            if (stage) this.removeQueueTransfer(key);
            return undefined;
        }
        return stage;
    }

    private removeQueueTransfer(key: string): void {
        const stage = this.queueTransfers.get(key);
        if (!stage) return;
        clearTimeout(stage.timeout);
        this.queueTransfers.delete(key);
        if (this.queueTransferClients.get(stage.clientId) === key) this.queueTransferClients.delete(stage.clientId);
    }

    private clearQueueTransfersForClient(clientId: string): void {
        const key = this.queueTransferClients.get(clientId);
        const stage = key ? this.queueTransfers.get(key) : undefined;
        if (key && !stage?.committing) this.removeQueueTransfer(key);
    }

    private queuePauseLeaseKey(clientId: string, requestId: string): string {
        return `${clientId}:${requestId}`;
    }

    private createQueuePauseLease(
        clientId: string,
        requestId: string,
        result: { expectedActionVersion?: number; actionVersion: number; trackId: string; position: number; wasPlaying: boolean },
    ): void {
        const key = this.queuePauseLeaseKey(clientId, requestId);
        const existing = this.queuePauseLeases.get(key);
        if (existing) clearTimeout(existing.timeout);
        const timeout = setTimeout(() => {
            const lease = this.queuePauseLeases.get(key);
            if (!lease) return;
            void this.playerService.resumeForQueueHandoff(lease.trackId, lease.expectedActionVersion, lease.position, lease.wasPlaying)
                .finally(() => {
                    if (this.queuePauseLeases.get(key) === lease) this.queuePauseLeases.delete(key);
                });
        }, PAUSE_LEASE_TIMEOUT_MS);
        this.queuePauseLeases.set(key, {
            clientId,
            requestId,
            expectedActionVersion: result.actionVersion,
            trackId: result.trackId,
            position: result.position,
            wasPlaying: result.wasPlaying,
            timeout,
        });
    }

    private clearQueuePauseLease(clientId: string, requestId: string): void {
        const key = this.queuePauseLeaseKey(clientId, requestId);
        const lease = this.queuePauseLeases.get(key);
        if (!lease) return;
        clearTimeout(lease.timeout);
        this.queuePauseLeases.delete(key);
    }

    private releaseQueuePauseLeases(clientId: string): void {
        for (const lease of Array.from(this.queuePauseLeases.values())) {
            if (lease.clientId !== clientId) continue;
            clearTimeout(lease.timeout);
            void this.playerService.resumeForQueueHandoff(lease.trackId, lease.expectedActionVersion, lease.position, lease.wasPlaying)
                .finally(() => {
                    if (this.queuePauseLeases.get(this.queuePauseLeaseKey(clientId, lease.requestId)) === lease) {
                        this.queuePauseLeases.delete(this.queuePauseLeaseKey(clientId, lease.requestId));
                    }
                });
        }
    }

    private broadcast(type: string, payload: any): void {
        if (!this.wss) return;
        try {
            let data: string | undefined;
            let statusData: string | undefined;

            this.clients.forEach((client) => {
                if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
                    const outgoing = type === 'state-changed' && client.stateSubscription === 'standalone'
                        ? (statusData ??= JSON.stringify({ type: 'queue-handoff-status', payload: this.getQueueHandoffStatus(payload) }))
                        : (data ??= JSON.stringify({ type, payload }));
                    try {
                        client.ws.send(outgoing);
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
