import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { Track } from '../../shared/types';
import { Database } from '../database/database';
import {
    Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
    VolumeX, Volume1, Volume2, List, Library, ListMusic, Radio, Search,
    MoreVertical, ListOrdered,
    IconNode
} from 'lucide';

export class RemoteControlService extends EventEmitter {
    private server: any;
    private wss: WebSocketServer | null = null;
    private port: number = 9999;
    private isRunning: boolean = false;
    private playerService: PlayerService;
    private scraperService: ScraperService;
    private playlistService: PlaylistService;
    private database: Database;

    constructor(playerService: PlayerService, scraperService: ScraperService, playlistService: PlaylistService, database: Database) {
        super();
        this.playerService = playerService;
        this.scraperService = scraperService;
        this.playlistService = playlistService;
        this.database = database;
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
    private handlePlaylistsChanged = () => {
        const playlists = this.playlistService.getAll();
        this.broadcast('playlists-data', playlists);
    };
    private handleQueueUpdated = () => {
        this.broadcast('state-changed', this.playerService.getState());
    };

    start(): void {
        if (this.isRunning) return;

        this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
            const url = req.url || '/';

            if (url === '/') {
                this.serveIndex(res);
            } else if (url === '/styles.css') {
                this.serveStatic(res, 'styles.css', 'text/css');
            } else if (url === '/client.js') {
                this.serveStatic(res, 'client.js', 'application/javascript');
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws: WebSocket) => {
            console.log('[RemoteService] New connection');

            // Send initial state
            this.sendToClient(ws, 'state-changed', this.playerService.getState());

            ws.on('message', async (data: string) => {
                try {
                    const message = JSON.parse(data);
                    await this.handleMessage(ws, message);
                } catch (err) {
                    console.error('[RemoteService] Error handling message:', err);
                }
            });

            ws.on('close', () => {
                console.log('[RemoteService] Connection closed');
                this.emit('connections-changed', this.wss?.clients.size || 0);
            });

            this.emit('connections-changed', this.wss?.clients.size || 0);
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            this.isRunning = true;
            console.log(`[RemoteService] Running at http://${this.getLocalIp()}:${this.port}`);
            this.emit('status-changed', true);
        });

        // Listen for player events to broadcast
        this.playerService.on('state-changed', this.handleStateChanged);
        this.playerService.on('track-changed', this.handleTrackChanged);
        this.playerService.on('time-update', this.handleTimeUpdate);
        this.playerService.on('queue-updated', this.handleQueueUpdated);

        // Listen for playlist changes
        this.playlistService.on('playlists-changed', this.handlePlaylistsChanged);
    }

    stop(): void {
        if (!this.isRunning) return;

        // Remove listeners
        this.playerService.off('state-changed', this.handleStateChanged);
        this.playerService.off('track-changed', this.handleTrackChanged);
        this.playerService.off('time-update', this.handleTimeUpdate);
        this.playerService.off('queue-updated', this.handleQueueUpdated);
        this.playlistService.off('playlists-changed', this.handlePlaylistsChanged);

        this.wss?.close();
        this.server.close();
        this.isRunning = false;
        this.wss = null;
        this.server = null;
        this.emit('status-changed', false);
        this.emit('connections-changed', 0);
    }

    getStatus(): { isRunning: boolean; port: number; ip: number; url: string; connections: number } {
        const ip = this.getLocalIp();
        return {
            isRunning: this.isRunning,
            port: this.port,
            ip: ip as any,
            url: `http://${ip}:${this.port}`,
            connections: this.wss?.clients.size || 0
        };
    }

    private getLocalIp(): string {
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]!) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'localhost';
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

    private async handleMessage(ws: WebSocket, message: { type: string; payload?: any }): Promise<void> {
        const { type, payload } = message;

        switch (type) {
            case 'play':
                await this.playerService.play();
                break;
            case 'pause':
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
                    const collection = await this.scraperService.fetchCollection();

                    // Map to flat structure expected by remote client
                    const simplifiedCollection = {
                        ...collection,
                        items: collection.items.map(item => {
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
                        })
                    };
                    this.sendToClient(ws, 'collection-data', simplifiedCollection);
                } catch (e) {
                    console.error('[RemoteService] Error processing get-collection:', e);
                    this.sendToClient(ws, 'error', { message: 'Failed to fetch collection' });
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
            case 'get-playlists': {
                const playlists = this.playlistService.getAll();
                this.sendToClient(ws, 'playlists-data', playlists);
                break;
            }
            case 'create-playlist': {
                const { name, description } = payload;
                this.playlistService.create({ name, description });
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
                    this.playerService.addTracksToQueue(playlist.tracks);
                    await this.playerService.playIndex(0);
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
                if (!payload || typeof payload !== 'string' || !payload.startsWith('http')) {
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
            case 'get-album': {
                if (!payload || typeof payload !== 'string' || !payload.startsWith('http')) {
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
                    } else {
                        console.error('[RemoteService] Failed to fetch album details or no tracks');
                    }
                } catch (e) {
                    console.error('[RemoteService] Error processing add-album-to-queue:', e);
                }
                break;
            }
            case 'add-track-to-playlist': {
                const track = await this.resolveTrack(payload.track);
                if (track) {
                    this.playlistService.addTrack(payload.playlistId, track);
                }
                break;
            }
            case 'add-album-to-playlist': {
                const album = await this.scraperService.getAlbumDetails(payload.albumUrl);
                if (album) {
                    this.playlistService.addTracks(payload.playlistId, album.tracks);
                }
                break;
            }
            case 'play-station':
                await this.playerService.playStation(payload);
                break;
            case 'add-station-to-queue':
                await this.playerService.addStationToQueue(payload.station, payload.playNext);
                break;
            case 'add-station-to-playlist': {
                const radioTrack = await this.playerService.stationToTrack(payload.station);
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
            default:
                console.warn('[RemoteService] Unknown message type:', type);
        }
    }

    private broadcast(type: string, payload: any): void {
        if (!this.wss) return;
        try {
            const data = JSON.stringify({ type, payload });

            this.wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(data);
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

            res.writeHead(200, { 'Content-Type': 'text/html' });
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

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    }

}
