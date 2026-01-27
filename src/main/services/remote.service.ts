import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { Database } from '../database/database';
import {
    Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
    VolumeX, Volume1, Volume2, List, Library, ListMusic, Radio, Search,
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
        this.playerService.on('state-changed', (state) => this.broadcast('state-changed', state));
        this.playerService.on('track-changed', (track) => this.broadcast('track-changed', track));
        this.playerService.on('time-update', (data) => this.broadcast('time-update', data));
    }

    stop(): void {
        if (!this.isRunning) return;

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
                                item_url: item.album.bandcampUrl
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
            case 'play-track': {
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
                        console.log(`[RemoteService] Resolving stream URL for track: ${trackToPlay.title}`);
                        const albumDetails = await this.scraperService.getAlbumDetails(trackToPlay.bandcampUrl);
                        if (albumDetails && albumDetails.tracks.length > 0) {
                            // Use the first track if it's a track page, or try to match by title/ID
                            // For collection items pointing to track pages, it's usually the first (and only) track
                            const resolvedTrack = albumDetails.tracks[0];
                            // Merge with original payload to preserve IDs/metadata if needed, but prefer resolved data
                            trackToPlay = {
                                ...trackToPlay,
                                ...resolvedTrack,
                                id: trackToPlay.id || resolvedTrack.id // Keep original ID if present (e.g. from playlist)
                            };
                        }
                    } catch (e) {
                        console.error('[RemoteService] Failed to resolve track stream:', e);
                    }
                }

                if (trackToPlay.streamUrl) {
                    this.playerService.play(trackToPlay);
                } else {
                    console.error('[RemoteService] Could not play track, missing stream URL:', trackToPlay.title);
                }
                break;
            }
            case 'play-station':
                await this.playerService.playStation(payload);
                break;
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
            Search: this.iconToSvg(Search)
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

        /* Now Playing Styles */
        #now-playing {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            height: 100%;
        }

        #artwork {
            width: 70%;
            max-width: 280px;
            aspect-ratio: 1;
            border-radius: var(--radius-md);
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            background: var(--bg-tertiary);
            margin-bottom: 2rem;
            object-fit: cover;
        }

        #track-info h2 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--text-primary);
        }

        #track-info p {
            margin: 0;
            color: var(--text-secondary);
            font-size: 1rem;
        }

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
    </style>
</head>
<body>
    <header>Bandcamp Remote</header>
    
    <div id="tabs">
        <button class="tab-btn active" onclick="switchTab('now-playing')">
            ${icons.Play}
            <span>Player</span>
        </button>
        <button class="tab-btn" onclick="switchTab('collection')">
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
        <div id="now-playing-tab" class="tab-content active">
            <div id="now-playing">
                <img id="artwork" src="" alt="">
                <div id="track-info">
                    <h2 id="title">Not Playing</h2>
                    <p id="artist">Connect to desktop app</p>
                </div>
                
                <div id="progress-container">
                    <div class="time-labels">
                        <span id="current-time">0:00</span>
                        <span id="total-time">0:00</span>
                    </div>
                    <input type="range" id="progress-slider" min="0" max="100" value="0" step="0.1" 
                        oninput="onSeekInput(this.value)" 
                        onchange="onSeekChange(this.value)"
                        onmousedown="isScrubbing=true"
                        ontouchstart="isScrubbing=true"
                        onmouseup="isScrubbing=false"
                        ontouchend="isScrubbing=false"
                    >
                </div>

                <div class="controls">
                    <button id="btn-shuffle" class="control-btn" onclick="sendCommand('toggle-shuffle')">
                        ${icons.Shuffle}
                    </button>
                    <button class="control-btn" onclick="sendCommand('previous')">
                        ${icons.SkipBack}
                    </button>
                    <button id="play-pause" class="play-btn" onclick="togglePlay()">
                        ${icons.Play}
                    </button>
                    <button class="control-btn" onclick="sendCommand('next')">
                        ${icons.SkipForward}
                    </button>
                    <button id="btn-repeat" class="control-btn" onclick="cycleRepeat()">
                        ${icons.Repeat}
                    </button>
                </div>
                
                <div style="width: 85%; max-width: 300px; margin-top: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
                     <button id="volume-icon" class="control-btn" style="padding: 4px;" onclick="toggleMute()">
                        ${icons.Volume2}
                     </button>
                     <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="0.8" oninput="setVolume(this.value)">
                     <span id="volume-value" style="font-size: 0.8rem; font-variant-numeric: tabular-nums; width: 3.5ch; text-align: right;">80%</span>
                </div>
            </div>
        </div>

        <div id="collection-tab" class="tab-content" style="padding: 0;">
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
    </div>

    <div id="status-bar">Connecting...</div>

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
        
        function connect() {
            const host = window.location.host;
            ws = new WebSocket('ws://' + host);

            ws.onopen = () => {
                document.getElementById('status-bar').innerText = 'Connected';
                document.getElementById('status-bar').style.color = 'var(--color-success)';
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
            }
        }

        function updateUI(state) {
            currentState = state;
            if (state.currentTrack) {
                document.getElementById('title').innerText = state.currentTrack.title;
                document.getElementById('artist').innerText = state.currentTrack.artist;
                document.getElementById('artwork').src = state.currentTrack.artworkUrl;
                
                // Play/Pause Icon
                const playBtn = document.getElementById('play-pause');
                playBtn.innerHTML = state.isPlaying ? ICONS.Pause : ICONS.Play;
                
                // Volume
                const volSlider = document.getElementById('volume-slider');
                volSlider.value = state.volume;
                updateRangeFill(volSlider, 'var(--text-primary)', 'var(--bg-active)');
                updateVolumeIcon(state.volume, state.isMuted);
                document.getElementById('volume-value').innerText = Math.round(state.volume * 100) + '%';
                
                // Progress
                const slider = document.getElementById('progress-slider');
                slider.max = state.duration;
                if (!isScrubbing) {
                    slider.value = state.currentTime;
                    updateRangeFill(slider, 'var(--accent-primary)', 'var(--bg-active)');
                }
                
                document.getElementById('current-time').innerText = formatTime(state.currentTime);
                document.getElementById('total-time').innerText = formatTime(state.duration);
                
                // Shuffle
                const shuffleBtn = document.getElementById('btn-shuffle');
                shuffleBtn.classList.toggle('active', state.isShuffled);
                
                // Repeat
                const repeatBtn = document.getElementById('btn-repeat');
                repeatBtn.classList.toggle('active', state.repeatMode !== 'off');
                repeatBtn.innerHTML = state.repeatMode === 'one' ? ICONS.Repeat1 : ICONS.Repeat;

                if (state.isPlaying) {
                    if (!progressInterval) startProgressLoop();
                } else {
                    stopProgressLoop();
                }
            }
        }

        function updateVolumeIcon(volume, isMuted) {
            const btn = document.getElementById('volume-icon');
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
            const slider = document.getElementById('progress-slider');
            
            if (slider && !isScrubbing) {
                slider.max = duration || 1; 
                slider.value = currentTime;
                updateRangeFill(slider, 'var(--accent-primary)', 'var(--bg-active)');
            }
            
            const currentEl = document.getElementById('current-time');
            const totalEl = document.getElementById('total-time');
            
            if (currentEl) currentEl.innerText = formatTime(currentTime);
            if (totalEl) totalEl.innerText = formatTime(duration);
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
            const slider = document.getElementById('progress-slider');
            updateRangeFill(slider, 'var(--accent-primary)', 'var(--bg-active)');
            
            currentState.currentTime = time;
            lastUpdateTime = Date.now();
            
            const currentEl = document.getElementById('current-time');
            if (currentEl) currentEl.innerText = formatTime(time);
        }

        function onSeekChange(val) {
            const time = parseFloat(val);
            const slider = document.getElementById('progress-slider');
            if (slider) {
                slider.value = time;
                updateRangeFill(slider, 'var(--accent-primary)', 'var(--bg-active)');
            }
            
            currentState.currentTime = time;
            lastUpdateTime = Date.now();
            
            const currentEl = document.getElementById('current-time');
            if (currentEl) currentEl.innerText = formatTime(time);

            sendCommand('seek', time);
        }

        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            document.querySelector('.tab-btn[onclick*="'+tabId+'"]').classList.add('active');
            document.getElementById(tabId + '-tab').classList.add('active');

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
                div.onclick = () => sendCommand('play-album', item.albumUrl || item.item_url);
                div.innerHTML = \`
                    <img src="\${item.artworkUrl}" alt="">
                    <div class="list-item-info">
                        <div class="list-item-title">\${item.title}</div>
                        <div class="list-item-subtitle">\${item.artist}</div>
                    </div>
                \`;
                list.appendChild(div);
            });
        }

        function renderRadio(stations) {
            const list = document.getElementById('radio-list');
            list.innerHTML = '';
            
            stations.forEach(station => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => sendCommand('play-station', station);
                div.innerHTML = \`
                    <img src="\${station.imageUrl}" alt="">
                    <div class="list-item-info">
                        <div class="list-item-title">\${station.name}</div>
                        \${station.date ? \`<div class="list-item-subtitle" style="color:var(--text-primary); margin-bottom:0.2rem; font-size:0.75rem; text-transform:uppercase;">\${station.date}</div>\` : ''}
                        <div class="list-item-subtitle">\${station.description}</div>
                    </div>
                \`;
                list.appendChild(div);
            });
        }
        
        function renderPlaylists(playlists) {
            const list = document.getElementById('playlists-list');
            list.innerHTML = '';
            
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
                        <div class="list-item-subtitle">\${playlist.trackCount} tracks • \${formatTime(playlist.totalDuration)}</div>
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
                sendCommand('play');
            }
        }

        function setVolume(val) {
            updateRangeFill(document.getElementById('volume-slider'), 'var(--text-primary)', 'var(--bg-active)');
            updateVolumeIcon(val, currentState.isMuted);
            document.getElementById('volume-value').innerText = Math.round(val * 100) + '%';
            sendCommand('set-volume', parseFloat(val));
        }

        function cycleRepeat() {
            const modes = ['off', 'all', 'one'];
            const currentMode = currentState.repeatMode || 'off';
            const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
            sendCommand('set-repeat', modes[nextIndex]);
        }

        connect();
    </script>
</body>
</html>
        `;
    }
}
