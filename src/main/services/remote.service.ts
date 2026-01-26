import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { Database } from '../database/database';
import type { PlayerState, Track, Album, Collection, RadioStation } from '../../shared/types';

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
            case 'get-collection':
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
            case 'get-radio-stations':
                const stations = await this.scraperService.getRadioStations();
                this.sendToClient(ws, 'radio-data', stations);
                break;
            case 'get-playlists':
                const playlists = this.playlistService.getAll();
                this.sendToClient(ws, 'playlists-data', playlists);
                break;
            case 'play-playlist':
                const playlist = this.playlistService.getById(payload);
                if (playlist && playlist.tracks.length > 0) {
                    this.playerService.clearQueue(false);
                    // Add all tracks from playlist
                    this.playerService.addTracksToQueue(playlist.tracks);
                    await this.playerService.playIndex(0);
                }
                break;
            case 'toggle-shuffle':
                await this.playerService.toggleShuffle();
                break;
            case 'set-repeat':
                await this.playerService.setRepeat(payload);
                break;
            case 'play-album':
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
            case 'play-track':
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
            case 'play-station':
                await this.playerService.playStation(payload);
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
        // This will be a large string containing the entire remote UI
        // I'll define it in a separate step or a helper file
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Bandcamp Remote</title>
    <style>
        :root {
            --bg-color: #121212;
            --surface-color: #1e1e1e;
            --primary-color: #62b1ff;
            --text-color: #ffffff;
            --text-secondary: #b3b3b3;
            --accent-color: #2ab1ff;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-color);
            color: var(--text-color);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        header {
            padding: 1rem;
            text-align: center;
            border-bottom: 1px solid #333;
            font-weight: bold;
            font-size: 1.2rem;
            color: var(--primary-color);
        }

        #tabs {
            display: flex;
            background: var(--surface-color);
            border-bottom: 1px solid #333;
        }

        .tab-btn {
            flex: 1;
            padding: 1rem;
            border: none;
            background: none;
            color: var(--text-secondary);
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
        }

        .tab-btn.active {
            color: var(--primary-color);
            border-bottom: 2px solid var(--primary-color);
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

        /* Now Playing Styles */
        #now-playing {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
        }

        #artwork {
            width: 80%;
            max-width: 300px;
            aspect-ratio: 1;
            border-radius: 8px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.5);
            background: #333;
            margin-bottom: 2rem;
            object-fit: cover;
        }

        #track-info h2 {
            margin: 0;
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }

        #track-info p {
            margin: 0;
            color: var(--text-secondary);
            font-size: 1.1rem;
        }

        .controls {
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            width: 100%;
        }

        .volume-wrapper {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-left: 1rem;
            margin-top: 20px;
            min-width: 150px;
        }

        @media (max-width: 600px) {
            .volume-wrapper {
                width: 100%;
                margin-left: 0;
                justify-content: center;
                margin-top: 1rem;
            }
        }

        .main-btn {
            background: var(--primary-color);
            border: none;
            width: 70px;
            height: 70px;
            border-radius: 50%;
            color: #000;
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .sec-btn {
            background: none;
            border: none;
            color: var(--text-color);
            font-size: 1.8rem;
        }



        input[type=range] {
            flex: 1;
            -webkit-appearance: none;
            background: rgba(255, 255, 255, 0.1);
            height: 6px;
            border-radius: 3px;
            outline: none;
        }

        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: var(--primary-color);
            margin-top: -5px;
            cursor: pointer;
        }

        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 6px;
            cursor: pointer;
            border-radius: 3px;
        }

        /* Specific style for progress slider to show fill */
        #progress-slider {
            background: linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) 0%, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.1) 100%);
        }

        /* List Styles */
        .list-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            border-bottom: 1px solid #333;
            cursor: pointer;
        }

        .list-item img {
            width: 50px;
            height: 50px;
            border-radius: 4px;
        }

        .list-item-info {
            flex: 1;
        }

        .list-item-title {
            font-weight: bold;
            margin-bottom: 0.2rem;
        }

        .list-item-subtitle {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }

        #status-bar {
            padding: 0.5rem;
            background: #000;
            font-size: 0.8rem;
            text-align: center;
            color: var(--text-secondary);
        }



        .icon-btn {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--text-secondary);
            cursor: pointer;
            transition: color 0.2s;
        }
    </style>
</head>
<body>
    <header>Bandcamp Remote</header>
    
    <div id="tabs">
        <button class="tab-btn active" onclick="switchTab('now-playing')">Player</button>
        <button class="tab-btn" onclick="switchTab('collection')">Collection</button>
        <button class="tab-btn" onclick="switchTab('playlists')">Playlists</button>
        <button class="tab-btn" onclick="switchTab('radio')">Radio</button>
    </div>

    <div id="content">
        <div id="now-playing-tab" class="tab-content active">
            <div id="now-playing">
                <img id="artwork" src="" alt="Album Art">
                <div id="track-info">
                    <h2 id="title">Not Playing</h2>
                    <p id="artist">Connect to your desktop app</p>
                </div>


                
                <div id="progress-container" style="width: 80%; margin-top: 1rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                        <span id="current-time">0:00</span>
                        <span id="total-time">0:00</span>
                    </div>
                    <input type="range" id="progress-slider" min="0" max="100" value="0" style="width: 100%;" oninput="seek(this.value)">
                </div>

                <div class="controls">
                    <button id="btn-shuffle" class="icon-btn" onclick="sendCommand('toggle-shuffle')">🔀</button>
                    <button class="sec-btn" onclick="sendCommand('previous')">⏮</button>
                    <button id="play-pause" class="main-btn" onclick="togglePlay()">▶</button>
                    <button class="sec-btn" onclick="sendCommand('next')">⏭</button>
                    <button id="btn-repeat" class="icon-btn" onclick="cycleRepeat()">🔁</button>
                    <div style="display: flex; flex-direction: column; align-items: center; margin-left: 1rem;">
                        <div class="volume-wrapper" style="margin-left: 0;">
                            <span>🔈</span>
                            <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="0.8" oninput="setVolume(this.value)">
                            <span>🔊</span>
                        </div>
                        <span id="volume-percent" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">80%</span>
                    </div>
                </div>



                    
                </div>
            </div>
        </div>

        <div id="collection-tab" class="tab-content">
            <div id="collection-list">Loading collection...</div>
        </div>

        <div id="playlists-tab" class="tab-content">
            <div id="playlists-list">Loading playlists...</div>
        </div>

        <div id="radio-tab" class="tab-content">
            <div id="radio-list">Loading radio stations...</div>
        </div>
    </div>

    <div id="status-bar">Connecting...</div>

    <script>
        let ws;
        let currentState = {};
        
        function connect() {
            const host = window.location.host;
            ws = new WebSocket('ws://' + host);

            ws.onopen = () => {
                document.getElementById('status-bar').innerText = 'Connected';
                document.getElementById('status-bar').style.color = '#2ecc71';
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                document.getElementById('status-bar').innerText = 'Disconnected. Retrying...';
                document.getElementById('status-bar').style.color = '#e74c3c';
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
                document.getElementById('play-pause').innerText = state.isPlaying ? '⏸' : '▶';
                document.getElementById('volume-slider').value = state.volume;
                updateVolumeText(state.volume);
                
                // Update Progress
                const slider = document.getElementById('progress-slider');
                slider.max = state.duration;
                // Only update if not currently dragging (implied simple check for now, can improve)
                if (document.activeElement !== slider) {
                    slider.value = state.currentTime;
                }
                
                document.getElementById('current-time').innerText = formatTime(state.currentTime);
                document.getElementById('total-time').innerText = formatTime(state.duration);
                
                // Update Shuffle/Repeat UI
                document.getElementById('btn-shuffle').style.color = state.isShuffled ? 'var(--accent-color)' : 'var(--text-secondary)';
                
                const repeatBtn = document.getElementById('btn-repeat');
                repeatBtn.style.color = state.repeatMode !== 'off' ? 'var(--accent-color)' : 'var(--text-secondary)';
                repeatBtn.innerText = state.repeatMode === 'one' ? '🔂' : '🔁';
            }
        }

        function updateProgress(data) {
            const { currentTime, duration } = data;
            const slider = document.getElementById('progress-slider');
            
            if (slider && document.activeElement !== slider) {
                slider.max = duration; // Ensure max is up to date
                slider.value = currentTime;
                updateSliderFill(slider);
            }
            
            const currentEl = document.getElementById('current-time');
            const totalEl = document.getElementById('total-time');
            
            if (currentEl) currentEl.innerText = formatTime(currentTime);
            if (totalEl) totalEl.innerText = formatTime(duration);
        }

        function updateSliderFill(slider) {
            if (!slider) return;
            const val = slider.value;
            const min = parseFloat(slider.min || 0);
            const max = parseFloat(slider.max || 100);
            
            let percentage = 0;
            if (max > min) {
                percentage = ((val - min) / (max - min)) * 100;
            }
            if (!isFinite(percentage)) percentage = 0;
            
            slider.style.background = \`linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) \${percentage}%, rgba(255, 255, 255, 0.1) \${percentage}%, rgba(255, 255, 255, 0.1) 100%)\`;
        }

        function seek(val) {
            const slider = document.getElementById('progress-slider');
            updateSliderFill(slider);
            sendCommand('seek', parseFloat(val));
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

        function renderCollection(collection) {
            const list = document.getElementById('collection-list');
            list.innerHTML = '';
            
            collection.items.forEach(item => {
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
                        <div class="list-item-subtitle">\${station.description}</div>
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

        function togglePlay() {
            if (currentState.isPlaying) {
                sendCommand('pause');
            } else {
                sendCommand('play');
            }
        }

        function setVolume(val) {
            updateVolumeText(val);
            sendCommand('set-volume', parseFloat(val));
        }

        function updateVolumeText(val) {
            const percent = Math.round(val * 100);
            const el = document.getElementById('volume-percent');
            if (el) el.innerText = percent + '%';
        }

        function seek(val) {
            sendCommand('seek', parseFloat(val));
        }

        function renderPlaylists(playlists) {
            const list = document.getElementById('playlists-list');
            list.innerHTML = '';
            
            if (playlists.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary)">No playlists found</div>';
                return;
            }

            playlists.forEach(playlist => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.onclick = () => sendCommand('play-playlist', playlist.id);
                // Use first track artwork or default
                const artwork = playlist.artworkUrl || 'https://bandcamp.com/img/0.gif'; 
                div.innerHTML = \`
                    <img src="\${artwork}" alt="" style="background:#333">
                    <div class="list-item-info">
                        <div class="list-item-title">\${playlist.name}</div>
                        <div class="list-item-subtitle">\${playlist.trackCount} tracks • \${formatTime(playlist.totalDuration)}</div>
                    </div>
                \`;
                list.appendChild(div);
            });
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
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
