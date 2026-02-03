import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
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
    MoreVertical,
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

    start(): void {
        if (this.isRunning) return;

        this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
            if (req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getRemoteHtml());
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

        // Listen for playlist changes
        this.playlistService.on('playlists-changed', this.handlePlaylistsChanged);
    }

    stop(): void {
        if (!this.isRunning) return;

        // Remove listeners
        this.playerService.off('state-changed', this.handleStateChanged);
        this.playerService.off('track-changed', this.handleTrackChanged);
        this.playerService.off('time-update', this.handleTimeUpdate);
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
                const collection = await this.scraperService.fetchCollection();
                // Map to flat structure expected by remote client
                const simplifiedCollection = {
                    ...collection,
                    items: collection.items.map(item => {
                        if (item.type === 'album' && item.album) {
                            return {
                                ...item,
                                title: item.album.title,
                                artist: item.album.artist,
                                artworkUrl: item.album.artworkUrl,
                                item_url: item.album.bandcampUrl,
                                trackCount: item.album.trackCount,
                                hasTracks: item.album.tracks && item.album.tracks.length > 1
                            };
                        } else if (item.type === 'track' && item.track) {
                            return {
                                ...item,
                                title: item.track.title,
                                artist: item.track.artist,
                                artworkUrl: item.track.artworkUrl,
                                item_url: item.track.bandcampUrl
                            };
                        }
                        return item;
                    })
                };
                this.sendToClient(ws, 'collection-data', simplifiedCollection);
                break;
            }
            case 'get-radio-stations': {
                const stations = await this.scraperService.getRadioStations();
                this.sendToClient(ws, 'radio-data', stations);
                break;
            }
            case 'get-playlists': {
                const playlists = this.playlistService.getAll();
                this.sendToClient(ws, 'playlists-data', playlists);
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
                    this.playerService.play(track);
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
                const album = await this.scraperService.getAlbumDetails(payload.albumUrl);
                if (album) {
                    if (payload.playNext) {
                        for (let i = album.tracks.length - 1; i >= 0; i--) {
                            this.playerService.addToQueue(album.tracks[i], 'collection', true);
                        }
                    } else {
                        this.playerService.addTracksToQueue(album.tracks);
                    }
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
            default:
                console.warn('[RemoteService] Unknown message type:', type);
        }
    }

    private broadcast(type: string, payload: any): void {
        if (!this.wss) return;
        const data = JSON.stringify({ type, payload });
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    private sendToClient(ws: WebSocket, type: string, payload: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    }

    private getRemoteHtml(): string {
        const cssVariables = `
            :root {
                /* ---- Colors ---- */
                --bg-primary: #0a0a0a;
                --bg-secondary: #141414;
                --bg-tertiary: #1e1e1e;
                --bg-elevated: #252525;
                --bg-hover: #2a2a2a;
                --bg-active: #333333;
                
                --accent-primary: #1da0c3;
                --accent-hover: #22b8e0;
                --accent-muted: rgba(29, 160, 195, 0.15);
                --accent-gradient: linear-gradient(135deg, #1da0c3 0%, #0d7a99 100%);
                
                --text-primary: #ffffff;
                --text-secondary: #a0a0a0;
                --text-tertiary: #666666;
                --text-link: #1da0c3;
                --text-on-accent: #ffffff;
                
                --color-error: #e74c3c;
                
                --border-subtle: rgba(255, 255, 255, 0.06);
                
                /* ---- Spacing ---- */
                --spacing-sm: 0.5rem;
                --spacing-md: 0.75rem;
                --spacing-lg: 1rem;
                
                /* ---- Radius ---- */
                --radius-md: 6px;
                --radius-full: 9999px;

                /* ---- Font ---- */
                --font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
        `;

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
            MoreVertical: this.iconToSvg(MoreVertical)
        };

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Bandcamp Remote</title>
    <style>
        ${cssVariables}

        body {
            margin: 0;
            padding: 0;
            font-family: var(--font-family);
            background: var(--bg-primary);
            color: var(--text-primary);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        header {
            padding: 1rem;
            text-align: center;
            border-bottom: 1px solid var(--border-subtle);
            font-weight: 600;
            font-size: 1.1rem;
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }

        #tabs {
            display: flex;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
        }

        .tab-btn {
            flex: 1;
            padding: 1rem;
            border: none;
            background: none;
            color: var(--text-secondary);
            font-weight: 500;
            cursor: pointer;
            transition: 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 0.8rem;
        }

        .tab-btn svg {
            width: 20px;
            height: 20px;
            stroke-width: 2;
        }

        .tab-btn.active {
            color: var(--accent-primary);
            background: var(--bg-tertiary);
        }

        #content {
            flex: 1;
            overflow-y: auto;
            position: relative;
        }

        .tab-content {
            display: none;
            padding: 1.5rem;
            height: 100%;
            box-sizing: border-box;
        }

        .tab-content.active {
            display: block;
        }

        #collection-tab.active {
            display: flex;
            flex-direction: column;
        }

        /* Now Playing Styles - REMOVED */


        /* Progress */
        #progress-container {
            width: 85%; 
            margin-top: 2rem;
        }
        
        .time-labels {
            display: flex; 
            justify-content: space-between; 
            font-size: 0.8rem; 
            color: var(--text-tertiary); 
            margin-bottom: 0.2rem;
            font-variant-numeric: tabular-nums;
        }

        input[type=range] {
            -webkit-appearance: none;
            width: 100%;
            background: transparent;
            outline: none;
            cursor: pointer;
            height: 16px; /* Touch target */
            margin: 0;
            /* Ensure the gradient track is centered and correct height */
            background-size: 100% 4px;
            background-repeat: no-repeat;
            background-position: center;
        }

        /* Track */
        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            cursor: pointer;
            background: transparent; /* Remove grey line */
            border-radius: var(--radius-full);
        }
        
        /* Thumb */
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 12px;
            width: 12px;
            border-radius: 50%;
            background: var(--text-primary);
            margin-top: -4px; /* adjusted for transparent track */
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            transition: transform 0.1s;
        }

        input[type=range]:active::-webkit-slider-thumb {
            transform: scale(1.2);
        }

        /* Generated via JS for fill */
        #progress-slider {
            /* Fallback or initial state */
            background-image: linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) 0%, var(--bg-active) 0%, var(--bg-active) 100%);
        }

        /* Controls */
        /* Modal */
        .modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000;
            display: none; align-items: center; justify-content: center;
        }
        .modal-overlay.active { display: flex; }
        .modal-content {
            background: var(--bg-elevated); width: 100%; max-width: 300px;
            border-radius: 20px; padding: 15px; box-sizing: border-box;
            transform: translateY(100%); transition: transform 0.3s;
            margin-left: 35vw;
        }
        .modal-overlay.active .modal-content { transform: translateY(0); }
        .modal-header { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center; }
        .modal-title { font-size: 1.2rem; font-weight: bold; }
        .modal-close { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.5rem; }
        .modal-option {
            padding: 15px; border-bottom: 1px solid var(--border-subtle);
            display: flex; align-items: center; gap: 10px; cursor: pointer;
        }
        .modal-option:last-child { border-bottom: none; }
        .modal-option:active { background: var(--bg-active); }
        .options-btn {
            background: none; border: none; color: var(--text-secondary);
            padding: 8px; cursor: pointer; display: flex; align-items: center; margin-left: 8px;
        }

        /* Controls */
        .controls {
            margin-top: 2rem;
            display: flex;
            gap: 1.5rem;
            align-items: center;
            justify-content: center;
            width: 100%;
        }

        .control-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.15s, transform 0.1s;
            border-radius: 50%;
        }
        
        .control-btn:active {
            transform: scale(0.95);
        }

        .control-btn.active {
            color: var(--accent-primary);
            background: rgba(29, 160, 195, 0.1);
        }

        .control-btn svg {
            width: 24px;
            height: 24px;
            stroke-width: 2;
        }

        .play-btn {
            width: 64px;
            height: 64px;
            background: var(--text-primary);
            border-radius: 50%;
            color: var(--bg-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            cursor: pointer;
            transition: transform 0.1s;
            box-shadow: 0 4px 12px rgba(255,255,255,0.2);
        }

        .play-btn:active {
            transform: scale(0.95);
        }

        .play-btn svg {
            width: 32px;
            height: 32px;
            fill: var(--bg-primary);
            stroke: var(--bg-primary);
        }

        .volume-controls {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-left: 0.5rem;
            min-width: 40px;
        }

        /* List Styles */
        .list-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            border-bottom: 1px solid var(--border-subtle);
            cursor: pointer;
            transition: background 0.15s;
        }

        .list-item:active {
            background: var(--bg-hover);
        }

        .list-item img {
            width: 50px;
            height: 50px;
            border-radius: var(--radius-md);
            background: var(--bg-tertiary);
            object-fit: cover;
        }

        .list-item-info {
            flex: 1;
            min-width: 0;
        }

        .list-item-title {
            font-weight: 600;
            margin-bottom: 0.25rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .list-item-subtitle {
            font-size: 0.85rem;
            color: var(--text-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .item-options-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            padding: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            margin-left: 8px;
        }

        #status-bar {
            padding: 0.5rem;
            background: var(--bg-secondary);
            font-size: 0.75rem;
            text-align: center;
            color: var(--text-tertiary);
            border-top: 1px solid var(--border-subtle);
        }

        #collection-search {
            width: 100%;
            padding: 1rem;
            background: var(--bg-secondary);
            border: none;
            border-bottom: 1px solid var(--border-subtle);
            color: var(--text-primary);
            font-size: 1rem;
            box-sizing: border-box;
            outline: none;
            font-family: inherit;
        }

        #collection-search::placeholder {
            color: var(--text-tertiary);
        }

        #mini-progress-container {
            position: absolute;
            top: 12px;
            left: 0;
            right: 0;
            margin: 0 3rem;
            height: 12px; 
            background: transparent;
            cursor: pointer;
            z-index: 101;
        }

        #mini-progress-container::before {
            content: '';
            position: absolute;
            top: -10px;
            bottom: -10px;
            left: 0;
            right: 0;
        }
        
        #mini-time-labels {
            position: absolute;
            top: 28px;
            left: 0;
            right: 0;
            margin: 0 3rem;
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
            pointer-events: none;
        }

        input[id="mini-progress-slider"] {
            position: absolute;
            top: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            background: transparent;
            outline: none;
            -webkit-appearance: none;
            cursor: pointer;
            background-size: 100% 4px;
            background-repeat: no-repeat;
            background-position: center;
        }
        
        input[id="mini-progress-slider"]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            cursor: pointer;
            background: transparent;
            border-radius: 9999px;
        }

        input[id="mini-progress-slider"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 12px;
            width: 12px;
            border-radius: 50%;
            background: var(--text-primary);
            margin-top: -4px;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            transition: transform 0.1s;
        }
        
        input[id="mini-progress-slider"]:active::-webkit-slider-thumb {
            transform: scale(1.2);
        }
        
        #mini-player {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            /* Height increased for bigger margins */
            height: 160px; 
            background: var(--bg-elevated);
            border-top: 1px solid var(--border-subtle);
            display: flex; /* Always visible now */
            flex-direction: column;
            justify-content: flex-end; /* Push content to bottom */
            /* Increased padding */
            padding: 0 3rem 2rem 3rem;
            box-sizing: border-box;
            z-index: 100;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
        }

        #mini-player-row {
            display: flex;
            align-items: center;
            width: 100%;
            gap: 1.5rem;
            margin-top: auto; 
            position: relative; /* For absolute centering of controls */
        }
        
        #mini-player img {
            width: 64px; /* Slightly larger */
            height: 64px;
            border-radius: 6px;
            background: var(--bg-tertiary);
            object-fit: cover;
            flex-shrink: 0;
        }

        #mini-player-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            mask-image: linear-gradient(to right, black 90%, transparent 100%);
            -webkit-mask-image: linear-gradient(to right, black 90%, transparent 100%);
            margin-right: 1rem; /* Spacing from potential overlap */
        }

        #mini-player-controls {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-shrink: 0;
            
            /* Absolute Center */
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            /* Ensure it sits on top if overlap occurs (though we try to avoid it) */
            z-index: 2; 
        }

        #mini-volume-container {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-shrink: 0;
            width: 180px; 
            margin-left: auto; /* Push to right */
        }
        
        #mini-volume-slider {
            flex: 1;
        }
        
        #mini-volume-value {
            font-size: 0.85rem;
            color: var(--text-secondary);
            font-variant-numeric: tabular-nums;
            width: 3ch;
            text-align: right;
        }

        /* Responsive */
        @media (max-width: 768px) {
            #mini-player {
                height: 160px; /* Allow more height if needed, or keep same */
                padding: 0 1rem 1rem 1rem;
            }
            #mini-volume-container {
                display: none;
            }
            #mini-player-info {
                 /* Give more space to info on mobile since volume is gone */
            }
        }
    </style>
</head>
<body>
    <header>Bandcamp Remote</header>
    
    <div id="tabs">
        <button class="tab-btn active" onclick="switchTab('collection')">
            ${icons.Library}
            <span>Collection</span>
        </button>
        <button class="tab-btn" onclick="switchTab('playlists')">
            ${icons.ListMusic}
            <span>Playlists</span>
        </button>
        <button class="tab-btn" onclick="switchTab('radio')">
            ${icons.Radio}
            <span>Radio</span>
        </button>
    </div>

    <div id="content">
        <div id="collection-tab" class="tab-content active" style="padding: 0;">
            <input type="text" id="collection-search" placeholder="Search collection..." oninput="filterCollection(this.value)">
            <div id="collection-list" style="padding: 0; overflow-y: auto; flex: 1;">
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">Loading...</div>
            </div>
        </div>

        <div id="playlists-tab" class="tab-content" style="padding: 0;">
            <div id="playlists-list" style="padding: 0;">
                 <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">Loading...</div>
            </div>
        </div>

        <div id="radio-tab" class="tab-content" style="padding: 0;">
            <div id="radio-list" style="padding: 0;">
                 <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">Loading...</div>
            </div>
        </div>

        <div id="album-tab" class="tab-content" style="padding: 0;">
             <div class="album-header" style="padding: 1.5rem; text-align: center; border-bottom: 1px solid var(--border-subtle);">
                <img id="album-view-artwork" src="" style="width: 150px; height: 150px; border-radius: var(--radius-md); background: var(--bg-tertiary); box-shadow: 0 4px 12px rgba(0,0,0,0.3); margin-bottom: 1rem; object-fit: cover;">
                <div id="album-view-title" style="font-size: 1.2rem; font-weight: bold; margin-bottom: 0.5rem; color: var(--text-primary);"></div>
                <div id="album-view-artist" style="color: var(--text-secondary);"></div>
                <div style="margin-top: 1rem; display: flex; gap: 1rem; justify-content: center;">
                    <button id="album-view-play" style="background: var(--text-primary); color: var(--bg-primary); padding: 8px 24px; border-radius: 20px; border: none; font-weight: 600; cursor: pointer;">Play</button>
                    <button id="album-view-queue" style="background: var(--bg-active); color: var(--text-primary); padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer;">Queue</button>
                    <button onclick="switchTab('collection')" style="background: transparent; color: var(--text-secondary); padding: 8px; border: none; cursor: pointer;">Back</button>
                </div>
             </div>
             <div id="album-view-tracks" style="padding-bottom: 200px;"></div>
        </div>
    </div>

    <div id="mini-player">
        <div id="mini-progress-container">
             <input type="range" id="mini-progress-slider" min="0" max="100" value="0" step="0.1" 
                oninput="onSeekInput(this.value)" 
                onchange="onSeekChange(this.value)"
                onmousedown="isScrubbing=true"
                ontouchstart="isScrubbing=true"
                onmouseup="isScrubbing=false"
                ontouchend="isScrubbing=false"
            >
        </div>
        
        <div id="mini-time-labels">
            <span id="mini-current-time">0:00</span>
            <span id="mini-total-time">0:00</span>
        </div>

        <div id="mini-player-row">
            <img id="mini-player-artwork" src="" alt="">
            <div id="mini-player-info">
                <div id="mini-player-title">Not Playing</div>
                <div id="mini-player-artist"></div>
            </div>
            
            <div id="mini-player-controls">
                <button id="mini-btn-shuffle" class="control-btn" onclick="sendCommand('toggle-shuffle')">
                    ${icons.Shuffle}
                </button>
                <button class="control-btn" onclick="sendCommand('previous')">
                    ${icons.SkipBack}
                </button>
                <button id="mini-play-pause" class="play-btn" style="width: 48px; height: 48px;" onclick="togglePlay()">
                    ${icons.Play}
                </button>
                <button class="control-btn" onclick="sendCommand('next')">
                    ${icons.SkipForward}
                </button>
                <button id="mini-btn-repeat" class="control-btn" onclick="cycleRepeat()">
                    ${icons.Repeat}
                </button>
            </div>
            
            
            <div id="mini-volume-container">
                <button id="mini-volume-icon" class="control-btn" style="padding: 4px;" onclick="toggleMute()">
                    ${icons.Volume2}
                </button>
                <input type="range" id="mini-volume-slider" min="0" max="1" step="0.01" value="0.8" oninput="setVolume(this.value)">
                <span id="mini-volume-value">80%</span>
            </div>
        </div>
    </div>

    <div id="status-bar">Connecting...</div>

    <div id="options-modal" class="modal-overlay" onclick="closeModal(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div class="modal-title" id="modal-title">Options</div>
                <button class="modal-close" onclick="closeModal()">✕</button>
            </div>
            <div id="modal-options"></div>
        </div>
    </div>

    <script>
        // Inject server-side generated icons
        const ICONS = ${JSON.stringify(icons)};
        
        let ws;
        let currentState = {};
        let fullCollectionItems = [];
        let isScrubbing = false;

        function formatTime(seconds) {
            if (!seconds || isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return mins + ':' + (secs < 10 ? '0' : '') + secs;
        }

        function formatDuration(seconds) {
            if (!seconds || isNaN(seconds)) return '0 min';
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            
            if (hours > 0) {
                return hours + 'h ' + minutes + 'm';
            }
            return minutes + ' min';
        }
        
        function connect() {
            const host = window.location.host;
            ws = new WebSocket('ws://' + host);

            ws.onopen = () => {
                document.getElementById('status-bar').innerText = 'Connected';
                document.getElementById('status-bar').style.color = 'var(--color-success)';
                // Initial load of collection
                sendCommand('get-collection');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                document.getElementById('status-bar').innerText = 'Disconnected. Retrying...';
                document.getElementById('status-bar').style.color = 'var(--color-error)';
                setTimeout(connect, 3000);
            };
        }

        function handleMessage(message) {
            const { type, payload } = message;

            if (type === 'state-changed') {
                updateUI(payload);
            } else if (type === 'collection-data') {
                renderCollection(payload);
            } else if (type === 'radio-data') {
                renderRadio(payload);
            } else if (type === 'playlists-data') {
                renderPlaylists(payload);
            } else if (type === 'time-update') {
                updateProgress(payload);
            } else if (type === 'album-details') {
                renderAlbumDetails(payload);
            }
        }

        function updateUI(state) {
            currentState = state;
            
            // Common updates (Volume)
            const miniVolSlider = document.getElementById('mini-volume-slider');
            if (miniVolSlider) {
                miniVolSlider.value = state.volume;
                updateRangeFill(miniVolSlider, 'var(--text-primary)', 'var(--bg-active)');
                updateMiniVolumeIcon(state.volume, state.isMuted);
            }
            const miniVolValue = document.getElementById('mini-volume-value');
            if (miniVolValue) {
                    miniVolValue.innerText = Math.round(state.volume * 100) + '%';
            }

            const miniShuffle = document.getElementById('mini-btn-shuffle');
            if(miniShuffle) miniShuffle.classList.toggle('active', state.isShuffled);

            const miniRepeat = document.getElementById('mini-btn-repeat');
            if(miniRepeat) {
                miniRepeat.classList.toggle('active', state.repeatMode !== 'off');
                miniRepeat.innerHTML = state.repeatMode === 'one' ? ICONS.Repeat1 : ICONS.Repeat;
            }

            if (state.currentTrack) {
                // Update Mini Player
                document.getElementById('mini-player-title').innerText = state.currentTrack.title;
                document.getElementById('mini-player-artist').innerText = state.currentTrack.artist;
                
                const artworkImg = document.getElementById('mini-player-artwork');
                if (artworkImg) {
                    artworkImg.src = state.currentTrack.artworkUrl;
                    artworkImg.alt = state.currentTrack.title;
                    artworkImg.style.display = 'block';
                }
                const placeholder = document.getElementById('mini-player-placeholder');
                if (placeholder) placeholder.style.display = 'none';

                const playBtn = document.getElementById('mini-play-pause');
                playBtn.innerHTML = state.isPlaying ? ICONS.Pause : ICONS.Play;
                playBtn.style.opacity = '1';
                playBtn.style.cursor = 'pointer';

                // Progress
                const miniSlider = document.getElementById('mini-progress-slider');
                if (miniSlider) miniSlider.max = state.duration;

                if (!isScrubbing && miniSlider) {
                        miniSlider.value = state.currentTime;
                        updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
                }
                
                // Update mini time labels
                document.getElementById('mini-current-time').innerText = formatTime(state.currentTime);
                document.getElementById('mini-total-time').innerText = formatTime(state.duration);

                if (state.isPlaying) {
                    if (!progressInterval) startProgressLoop();
                } else {
                    stopProgressLoop();
                }
            } else {
                // No track playing
                document.getElementById('mini-player-title').innerText = 'Not Playing';
                document.getElementById('mini-player-artist').innerText = '';
                
                const artworkImg = document.getElementById('mini-player-artwork');
                if (artworkImg) {
                    artworkImg.src = ''; // Ensure no loading
                    artworkImg.style.display = 'none';
                }
                
                // Ensure we have a placeholder if not already there
                let placeholder = document.getElementById('mini-player-placeholder');
                if (!placeholder) {
                    placeholder = document.createElement('div');
                    placeholder.id = 'mini-player-placeholder';
                    placeholder.innerText = 'No track';
                    placeholder.style.width = '64px';
                    placeholder.style.height = '64px';
                    placeholder.style.borderRadius = '6px';
                    placeholder.style.background = 'var(--bg-tertiary)';
                    placeholder.style.display = 'flex';
                    placeholder.style.alignItems = 'center';
                    placeholder.style.justifyContent = 'center';
                    placeholder.style.fontSize = '0.7rem';
                    placeholder.style.color = 'var(--text-secondary)'; // Lighter font
                    placeholder.style.flexShrink = '0';
                    
                    // Insert before info
                    const row = document.getElementById('mini-player-row');
                    const info = document.getElementById('mini-player-info');
                    if(row && info) row.insertBefore(placeholder, info);
                } else {
                    placeholder.style.display = 'flex';
                }

                document.getElementById('mini-play-pause').innerHTML = ICONS.Play;
                document.getElementById('mini-play-pause').style.opacity = '0.5';
                document.getElementById('mini-play-pause').style.cursor = 'not-allowed';
                
                document.getElementById('mini-current-time').innerText = '0:00';
                document.getElementById('mini-total-time').innerText = '0:00';
                
                const miniSlider = document.getElementById('mini-progress-slider');
                if (miniSlider) {
                    miniSlider.value = 0;
                    updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
                }
                
                stopProgressLoop();
            }
        }

        function updateVolumeIcon(volume, isMuted) {
             /* Unused in mini player logic directly, but kept if needed by common func? 
                Actually updateUI calls updateMiniVolumeIcon directly. 
                We can remove this or rename updateMiniVolumeIcon to updateVolumeIcon and use mini id inside.
             */
        }

        function updateMiniVolumeIcon(volume, isMuted) {
             const btn = document.getElementById('mini-volume-icon');
             if (!btn) return;
            if (isMuted || volume === 0) {
                btn.innerHTML = ICONS.VolumeX;
            } else if (volume < 0.5) {
                btn.innerHTML = ICONS.Volume1;
            } else {
                btn.innerHTML = ICONS.Volume2;
            }
        }

        let progressInterval;
        let lastUpdateTime = 0;

        function startProgressLoop() {
            if (progressInterval) cancelAnimationFrame(progressInterval);
            
            function loop() {
                if (currentState.isPlaying) {
                    const now = Date.now();
                    const elapsed = (now - lastUpdateTime) / 1000;
                    currentState.currentTime += elapsed;
                    lastUpdateTime = now;
                    
                    if (currentState.currentTime > currentState.duration) {
                        currentState.currentTime = currentState.duration;
                    }
                    
                    updateProgressUI(currentState.currentTime, currentState.duration);
                }
                progressInterval = requestAnimationFrame(loop);
            }
            lastUpdateTime = Date.now();
            loop();
        }

        function stopProgressLoop() {
            if (progressInterval) cancelAnimationFrame(progressInterval);
        }

        function updateProgress(data) {
            if (!isScrubbing) {
                const { currentTime, duration } = data;
                currentState.currentTime = currentTime;
                currentState.duration = duration;
                lastUpdateTime = Date.now();
                updateProgressUI(currentTime, duration);
            }
        }

        function updateProgressUI(currentTime, duration) {
            const miniSlider = document.getElementById('mini-progress-slider');
            
            if (!isScrubbing) {
                if (miniSlider) {
                    miniSlider.max = duration || 1;
                    miniSlider.value = currentTime;
                    updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
                }
            }
            
            const miniCurrentEl = document.getElementById('mini-current-time');
            const miniTotalEl = document.getElementById('mini-total-time');
            
            if (miniCurrentEl) miniCurrentEl.innerText = formatTime(currentTime);
            if (miniTotalEl) miniTotalEl.innerText = formatTime(duration);
        }

        function updateRangeFill(slider, activeColor, inactiveColor) {
            if (!slider) return;
            const val = parseFloat(slider.value);
            const min = parseFloat(slider.min || 0);
            const max = parseFloat(slider.max || 100);
            
            let percentage = 0;
            if (max > min) {
                percentage = ((val - min) / (max - min)) * 100;
            }
            
            slider.style.backgroundImage = \`linear-gradient(to right, \${activeColor} 0%, \${activeColor} \${percentage}%, \${inactiveColor} \${percentage}%, \${inactiveColor} 100%)\`;
        }

        function onSeekInput(val) {
            const time = parseFloat(val);
            const miniSlider = document.getElementById('mini-progress-slider');
            
            if (miniSlider) updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
            
            currentState.currentTime = time;
            lastUpdateTime = Date.now();
            
            const miniCurrentEl = document.getElementById('mini-current-time');
            if (miniCurrentEl) miniCurrentEl.innerText = formatTime(time);
        }

        function onSeekChange(val) {
            const time = parseFloat(val);
            const miniSlider = document.getElementById('mini-progress-slider');

            if (miniSlider) {
                miniSlider.value = time;
                updateRangeFill(miniSlider, 'var(--accent-primary)', 'var(--bg-active)');
            }
            
            currentState.currentTime = time;
            lastUpdateTime = Date.now();
            
            const miniCurrentEl = document.getElementById('mini-current-time');
            if (miniCurrentEl) miniCurrentEl.innerText = formatTime(time);

            sendCommand('seek', time);
        }

        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            const btn = document.querySelector('.tab-btn[onclick*="'+tabId+'"]');
            if (btn) btn.classList.add('active');
            
            const tabContent = document.getElementById(tabId + '-tab');
            if (tabContent) tabContent.classList.add('active');

            if (tabId === 'collection') {
                sendCommand('get-collection');
            } else if (tabId === 'radio') {
                sendCommand('get-radio-stations');
            } else if (tabId === 'playlists') {
                sendCommand('get-playlists');
            }
        }

        function filterCollection(query) {
            const lowerQuery = query.toLowerCase();
            const filtered = fullCollectionItems.filter(item => 
                (item.title && item.title.toLowerCase().includes(lowerQuery)) ||
                (item.artist && item.artist.toLowerCase().includes(lowerQuery))
            );
            renderCollectionItems(filtered);
        }

        function renderCollection(collection) {
            fullCollectionItems = collection.items;
            renderCollectionItems(fullCollectionItems);
        }

        function renderCollectionItems(items) {
            const list = document.getElementById('collection-list');
            list.innerHTML = '';
            
            if (items.length === 0) {
                 list.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">No items found</div>';
                 return;
            }
            
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => {
                    if (item.type === 'album') {
                        // Check for multi-track album (or unknown count = 0)
                        // If trackCount is NOT 1, we assume it's an album that needs opening
                        if (item.trackCount !== 1 || item.hasTracks) {
                            showAlbum(item.albumUrl || item.item_url);
                        } else {
                            // Play single album directly (it acts as a single)
                            sendCommand('play-album', item.albumUrl || item.item_url);
                        }
                    } else {
                         // Play single track directly
                         sendCommand('play-track', item);
                    }
                };
                div.innerHTML = \`
                    <img src="\${item.artworkUrl}" alt="">
                    <div class="list-item-info">
                        <div class="list-item-title">\${item.title}</div>
                        <div class="list-item-subtitle">\${item.artist}</div>
                    </div>
                \`;

                // Options button
                const btn = document.createElement('button');
                btn.className = 'item-options-btn';
                btn.innerHTML = ICONS.MoreVertical;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    showCollectionOptions(item);
                };
                
                div.appendChild(btn);
                list.appendChild(div);
            });
        }

        function showAlbum(url) {
            // Manually switch to album tab (not in nav bar)
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById('album-tab').classList.add('active');
            
            document.getElementById('album-view-title').innerText = 'Loading...';
            document.getElementById('album-view-artist').innerText = '';
            document.getElementById('album-view-tracks').innerHTML = '<div style="padding:2rem;text-align:center">Loading tracks...</div>';
            
            sendCommand('get-album', url);
        }

        function renderAlbumDetails(album) {
            document.getElementById('album-view-title').innerText = album.title;
            document.getElementById('album-view-artist').innerText = album.artist;
            document.getElementById('album-view-artwork').src = album.artworkUrl;
            
            document.getElementById('album-view-play').onclick = () => sendCommand('play-album', album.bandcampUrl);
            document.getElementById('album-view-queue').onclick = () => sendCommand('add-album-to-queue', { albumUrl: album.bandcampUrl, playNext: false });

            const list = document.getElementById('album-view-tracks');
            list.innerHTML = '';
            
            album.tracks.forEach((track, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => sendCommand('play-track', track); 
                
                div.innerHTML = \`
                    <div style="width: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.8rem;">\${index + 1}</div>
                    <div class="list-item-info">
                        <div class="list-item-title">\${track.title}</div>
                        <div class="list-item-subtitle">\${formatDuration(track.duration)}</div>
                    </div>
                \`;
                
                const btn = document.createElement('button');
                btn.className = 'item-options-btn';
                btn.innerHTML = ICONS.MoreVertical;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    showCollectionOptions({ ...track, type: 'track' });
                };
                div.appendChild(btn);

                list.appendChild(div);
            });
        }


        let currentCollectionItem = null;

        function showCollectionOptions(item) {
            currentCollectionItem = item;
            const modal = document.getElementById('options-modal');
            const title = document.getElementById('options-title');
            const list = document.getElementById('options-list');
            
            title.innerText = item.title;
            list.innerHTML = '';

            const isAlbum = item.type === 'album';
            
            // Play Next
            const playNextBtn = document.createElement('div');
            playNextBtn.className = 'options-item';
            playNextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Play Next';
            playNextBtn.onclick = () => {
                if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: true });
                else sendCommand('add-track-to-queue', { track: item, playNext: true });
                modal.classList.remove('active');
            };
            list.appendChild(playNextBtn);

            // Add to Queue
            const queueBtn = document.createElement('div');
            queueBtn.className = 'options-item';
            queueBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to Queue';
            queueBtn.onclick = () => {
                if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: false });
                else sendCommand('add-track-to-queue', { track: item, playNext: false });
                modal.classList.remove('active');
            };
            list.appendChild(queueBtn);
            
            // Add to Playlist
            const playlistBtn = document.createElement('div');
            playlistBtn.className = 'options-item';
            playlistBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> Add to Playlist';
            playlistBtn.onclick = () => {
                showCollectionPlaylistSelection(item);
            };
            list.appendChild(playlistBtn);

            modal.classList.add('active');
        }

        function showCollectionPlaylistSelection(item) {
             const modal = document.getElementById('options-modal');
             const title = document.getElementById('options-title');
             const list = document.getElementById('options-list');
             
             // We need to fetch playlists if not available?
             // Use global playlists variable if available?
             // Assuming playlists are cached in JS or we can access them.
             // We can trigger 'get-playlists' but that's async.
             // But 'renderPlaylists' populates the playlist tab. 
             // We can assume 'playlists' (global data) might not be available.
             // But existing playlist modal code (for radio) likely used 'currentPlaylists'.
             // I need to check renderPlaylists to see if it saves data.
             
             // Hack: Trigger get-playlists and wait? No.
             // Better: Assume playlists are loaded. Client usually loads them.
             // I'll send 'get-playlists' on connect.
             
             // I'll assume 'renderPlaylists' stores them or I can get them from DOM?
             // Let's implement dynamic playlist fetching later or now?
             // I'll just check if I can use a simpler approach.
             // I'll use sendCommand('get-playlists') and handle response to open modal?
             // That's complex.
             
             // Let's assume we have them. 
             // I'll implement showCollectionPlaylistSelection assuming we have a global 'allPlaylists' or similar.
             // If not, I'll need to update renderPlaylists to store them.
             
             // Wait, I'll verify renderPlaylists in next turn if needed.
             // For now I'll just put a placeholder or basic implementation.
             // Actually, Radio implementation had playlists?
             // I'll use the same logic as Radio if I can find it.
             // Radio used 'showRadioPlaylistSelection' (hypothetically).
             
             // I'll just implement it to Render message 'Loading...' and send 'get-playlists'.
             // Then 'playlists-data' handler can check if we are in 'selection mode'.
             // That's robust.
             
             title.innerText = 'Select Playlist';
             list.innerHTML = '<div style="padding: 1rem; color: #888;">Loading playlists...</div>';
             
             // Set a flag
             window.selectingPlaylistFor = { item: item, type: item.type === 'album' ? 'album' : 'track' };
             sendCommand('get-playlists');
        }

        function renderRadio(stations) {
            const list = document.getElementById('radio-list');
            list.innerHTML = '';
            
            stations.forEach(station => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => sendCommand('play-station', station);

                const content = document.createElement('div');
                content.style.display = 'flex';
                content.style.alignItems = 'center';
                content.style.flex = '1';
                content.style.overflow = 'hidden';
                content.innerHTML = \`
                    <img src="\${station.imageUrl}" alt="">
                    <div class="list-item-info">
                        <div class="list-item-title">\${station.name}</div>
                        \${station.date ? \`<div class="list-item-subtitle" style="color:var(--text-primary); margin-bottom:0.2rem; font-size:0.75rem; text-transform:uppercase;">\${station.date}</div>\` : ''}
                        <div class="list-item-subtitle">\${station.description}</div>
                    </div>
                \`;
                div.appendChild(content);

                const btn = document.createElement('button');
                btn.className = 'options-btn';
                btn.innerHTML = ICONS.MoreVertical;
                btn.onclick = (e) => { 
                    e.stopPropagation(); 
                    showRadioOptions(station); 
                };
                div.appendChild(btn);

                list.appendChild(div);
            });
        }
        
        function renderPlaylists(playlists) {
            allPlaylists = playlists;
            const list = document.getElementById('playlists-list');
            list.innerHTML = '';
            
            // If modal is open for selection, update it
            if (document.getElementById('options-modal').classList.contains('active') && 
                document.getElementById('modal-title').innerText === 'Select Playlist') {
                renderPlaylistSelection();
            }
            
            if (playlists.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-tertiary)">No playlists found</div>';
                return;
            }

            playlists.forEach(playlist => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => sendCommand('play-playlist', playlist.id);
                // Use first track artwork or default
                const artwork = playlist.artworkUrl || 'https://bandcamp.com/img/0.gif'; 
                div.innerHTML = \`
                    <img src="\${artwork}" alt="" style="background:var(--bg-tertiary)">
                    <div class="list-item-info">
                        <div class="list-item-title">\${playlist.name}</div>
                        <div class="list-item-subtitle">\${playlist.trackCount} tracks • \${formatDuration(playlist.totalDuration)}</div>
                    </div>
                \`;


                list.appendChild(div);
            });
        }

        function sendCommand(type, payload) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type, payload }));
            }
        }
        
        function toggleMute() {
             sendCommand('toggle-mute');
        }

        function togglePlay() {
            if (currentState.isPlaying) {
                sendCommand('pause');
            } else {
                // If there's no track and we are not playing, check if we should even allow 'play'
                // But usually 'play' command handles resuming or starting queue.
                // User requirement: "play button shouldn't let play the finished queue"
                // Finished queue state means currentTrack is null but queue might not be empty (just at end).
                // If currentTrack is null, we can assume we are either stopped or finished.
                // To be safe, if we have no currentTrack, we prevent play IF the intention is to not restart.
                // However, play() on backend logic restarts if queue exists. 
                // We will block it here if currentTrack is null.
                if (currentState.currentTrack) {
                    sendCommand('play');
                } else {
                    // Visual feedback or just ignore?
                    console.log("Cannot play: no active track");
                }
            }
        }

        function setVolume(val) {
            const miniVol = document.getElementById('mini-volume-slider');
            if(miniVol) updateRangeFill(miniVol, 'var(--text-primary)', 'var(--bg-active)');

            updateMiniVolumeIcon(val, currentState.isMuted);
            
            const miniVolValue = document.getElementById('mini-volume-value');
            if (miniVolValue) {
                miniVolValue.innerText = Math.round(val * 100) + '%';
            }
            
            sendCommand('set-volume', parseFloat(val));
        }

        function cycleRepeat() {
            const modes = ['off', 'all', 'one'];
            const currentMode = currentState.repeatMode || 'off';
            const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
            sendCommand('set-repeat', modes[nextIndex]);
        }

        // --- Options Modal Logic ---
        let selectedContext = null;
        let allPlaylists = [];

        function showCollectionOptions(item) {
            selectedContext = { 
                type: item.type === 'album' ? 'album' : 'track', 
                data: item
            };
            document.getElementById('modal-title').innerText = item.title;
            const options = document.getElementById('modal-options');
            options.innerHTML = '';

            const isAlbum = item.type === 'album';
            
            // Play Next
            const playNextBtn = document.createElement('div');
            playNextBtn.className = 'modal-option';
            playNextBtn.innerHTML = ICONS.Play + '<span style="margin-left:8px">Play Next</span>';
            // Options button logic
            playNextBtn.onclick = () => {
                closeModal();
                if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: true });
                else sendCommand('add-track-to-queue', { track: item, playNext: true });
            };
            options.appendChild(playNextBtn);

            // Add to Queue
            const queueBtn = document.createElement('div');
            queueBtn.className = 'modal-option';
            queueBtn.innerHTML = ICONS.List + '<span style="margin-left:8px">Add to Queue</span>';
            queueBtn.onclick = () => {
                closeModal();
                if (isAlbum) sendCommand('add-album-to-queue', { albumUrl: item.albumUrl || item.item_url, playNext: false });
                else sendCommand('add-track-to-queue', { track: item, playNext: false });
            };
            options.appendChild(queueBtn);
            
            // Add to Playlist
            const playlistBtn = document.createElement('div');
            playlistBtn.className = 'modal-option';
            playlistBtn.innerHTML = ICONS.ListMusic + '<span style="margin-left:8px">Add to Playlist</span>';
            playlistBtn.onclick = () => {
                showPlaylistSelection();
            };
            options.appendChild(playlistBtn);

            document.getElementById('options-modal').classList.add('active');
        }

        function showRadioOptions(station) {
            selectedContext = { type: 'station', data: station };
            document.getElementById('modal-title').innerText = station.name;
            const options = document.getElementById('modal-options');
            options.innerHTML = \`
                <div class="modal-option" onclick="closeModal(); sendCommand('play-station', selectedContext.data)">
                    \${ICONS.Play} <span style="margin-left:8px">Play Now</span>
                </div>
                <div class="modal-option" onclick="closeModal(); sendCommand('add-station-to-queue', {station: selectedContext.data, playNext: true})">
                   <div style="width:24px"></div> Play Next
                </div>
                <div class="modal-option" onclick="closeModal(); sendCommand('add-station-to-queue', {station: selectedContext.data, playNext: false})">
                   <div style="width:24px"></div> Add to Queue
                </div>
                <div class="modal-option" onclick="showPlaylistSelection()">
                   <div style="width:24px"></div> Add to Playlist
                </div>
            \`;
            document.getElementById('options-modal').classList.add('active');
        }

        function showPlaylistSelection() {
            document.getElementById('modal-title').innerText = 'Select Playlist';
            const options = document.getElementById('modal-options');
            options.innerHTML = '<div style="padding:20px;text-align:center">Loading playlists...</div>';
            
            if (allPlaylists.length === 0) {
                 sendCommand('get-playlists');
            } else {
                 renderPlaylistSelection();
            }
        }

        function renderPlaylistSelection() {
            const options = document.getElementById('modal-options');
            options.innerHTML = '';
            
            if (allPlaylists.length === 0) {
                options.innerHTML = '<div style="padding:20px;text-align:center">No playlists found</div>';
                return;
            }
            
            allPlaylists.forEach(pl => {
                const div = document.createElement('div');
                div.className = 'modal-option';
                div.innerText = pl.name;
                div.onclick = () => {
                   closeModal();
                   if (selectedContext.type === 'station') {
                       sendCommand('add-station-to-playlist', {playlistId: pl.id, station: selectedContext.data});
                   } else if (selectedContext.type === 'album') {
                       const item = selectedContext.data;
                       sendCommand('add-album-to-playlist', {playlistId: pl.id, albumUrl: item.albumUrl || item.item_url});
                   } else {
                       // type === 'track'
                       const item = selectedContext.data;
                       sendCommand('add-track-to-playlist', {playlistId: pl.id, track: item});
                   }
                };
                options.appendChild(div);
            });
        }

        function closeModal(e) {
            if (e && e.target !== e.currentTarget && e.target.className !== 'modal-close') return;
            document.getElementById('options-modal').classList.remove('active');
        }

        connect();
    </script>
</body>
</html>
        `;
    }
}
