/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RemoteControlService } from './remote.service';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { AuthService } from './auth.service';
import { Database } from '../database/database';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as os from 'os';
import * as dgram from 'dgram';


// Mock dependencies
vi.mock('./player.service');
vi.mock('./scraper.service');
vi.mock('./playlist.service');
vi.mock('./auth.service');
vi.mock('../database/database');
vi.mock('fs');
vi.mock('dgram');

vi.mock('os', () => ({
    networkInterfaces: vi.fn()
}));

// Mock HTTP to capture the handler
vi.mock('http', () => {
    return {
        default: {
            createServer: vi.fn().mockImplementation((handler) => ({
                listen: vi.fn((_p, _h, cb) => {
                    // Store the handler on the listen mock so we can find it
                    (http.createServer as any)._lastHandler = handler;
                    cb && cb();
                }),
                close: vi.fn(),
                on: vi.fn(),
            }))
        },
        createServer: vi.fn().mockImplementation((handler) => ({
            listen: vi.fn((_p, _h, cb) => {
                (http.createServer as any)._lastHandler = handler;
                cb && cb();
            }),
            close: vi.fn(),
            on: vi.fn(),
        })),
        IncomingMessage: class { },
        ServerResponse: class {
            writeHead = vi.fn().mockReturnThis();
            end = vi.fn().mockReturnThis();
        },
    };
});

vi.mock('ws', () => {
    const { EventEmitter } = require('events');
    const wss = new EventEmitter() as any;
    wss.clients = new Set();
    wss.on('connection', (ws: any) => {
        wss.clients.add(ws);
        ws.on('close', () => wss.clients.delete(ws));
    });
    wss.close = vi.fn(() => wss.clients.clear());

    return {
        WebSocketServer: function () { return wss; },
        WebSocket: { OPEN: 1 }
    };
});

describe('RemoteControlService', () => {
    let remoteService: RemoteControlService;
    let mockPlayerService: any;
    let mockScraperService: any;
    let mockPlaylistService: any;
    let mockAuthService: any;
    let mockDatabase: any;
    let mockHttpServer: any;
    let mockWss: any;

    beforeEach(() => {
        // Setup service mocks
        mockPlayerService = new EventEmitter() as any;
        Object.assign(mockPlayerService, {
            off: vi.fn(),
            getState: vi.fn().mockReturnValue({ isPlaying: false, currentTime: 0, duration: 0, volume: 1 }),
            play: vi.fn(),
            pause: vi.fn(),
            next: vi.fn(),
            previous: vi.fn(),
            seek: vi.fn(),
            setVolume: vi.fn(),
            toggleShuffle: vi.fn(),
            setRepeat: vi.fn(),
            playIndex: vi.fn(),
            removeFromQueue: vi.fn(),
            addToQueue: vi.fn(),
            addTracksToQueue: vi.fn(),
            clearQueue: vi.fn(),
            toggleMute: vi.fn(),
            playStation: vi.fn(),
            addStationToQueue: vi.fn(),
            stationToTrack: vi.fn(),
        });

        mockScraperService = {
            getAlbumDetails: vi.fn(),
            fetchCollection: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
            getRadioStations: vi.fn().mockResolvedValue([]),
        } as unknown as ScraperService;

        mockPlaylistService = new EventEmitter() as any;
        Object.assign(mockPlaylistService, {
            off: vi.fn(),
            getAll: vi.fn().mockReturnValue([]),
            getById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            addTrack: vi.fn(),
            addTracks: vi.fn(),
        });

        mockAuthService = {
            getUser: vi.fn().mockReturnValue({ isAuthenticated: true }),
        } as unknown as AuthService;

        mockDatabase = {
            getArtists: vi.fn().mockReturnValue([]),
        } as unknown as Database;

        // Get the mock WSS instance
        mockWss = new (WebSocketServer as any)();

        // Mock networkInterfaces
        vi.mocked(os.networkInterfaces).mockReturnValue({
            eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.10' } as any]
        });

        remoteService = new RemoteControlService(
            mockPlayerService,
            mockScraperService,
            mockPlaylistService,
            mockAuthService,
            mockDatabase
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Lifecycle & Infrastructure', () => {
        it('should start the server', () => {
            remoteService.start();
            expect(remoteService.getStatus().isRunning).toBe(true);
        });

        it('should stop the server', () => {
            remoteService.start();
            remoteService.stop();
            expect(remoteService.getStatus().isRunning).toBe(false);
        });

        it('should handle icon conversion to SVG', () => {
            // @ts-ignore
            const svg = remoteService.iconToSvg([['circle', { cx: '12', cy: '12', r: '10' }]]);
            expect(svg).toContain('<circle cx="12" cy="12" r="10"></circle>');
        });
    });

    describe('Message Handling', () => {
        let mockWs: any;

        beforeEach(() => {
            remoteService.start();
            mockWs = new EventEmitter();
            mockWs.send = vi.fn();
            mockWs.readyState = 1;
            mockWss.emit('connection', mockWs, { socket: { remoteAddress: '127.0.0.1' }, headers: { 'user-agent': 'Test' } });
        });

        const sendMessage = async (type: string, payload?: any) => {
            mockWs.emit('message', JSON.stringify({ type, payload }));
            await new Promise(resolve => setTimeout(resolve, 0));
        };

        it('should handle get-collection', async () => {
            mockAuthService.getUser.mockReturnValue({ isAuthenticated: true });
            mockScraperService.fetchCollection.mockResolvedValue({ items: [], totalCount: 0 });
            await sendMessage('get-collection', { offset: 0, limit: 10 });
            expect(mockScraperService.fetchCollection).toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('collection-data'));
        });

        it('should handle get-artist-collection', async () => {
            mockScraperService.fetchCollection.mockResolvedValue({ items: [{ type: 'album', album: { artistId: 'a1' } }] });
            await sendMessage('get-artist-collection', 'a1');
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('artist-collection-data'));
        });

        it('should handle playlist CRUD', async () => {
            await sendMessage('create-playlist', { name: 'P1' });
            expect(mockPlaylistService.create).toHaveBeenCalled();

            await sendMessage('update-playlist', { id: '1', name: 'P2' });
            expect(mockPlaylistService.update).toHaveBeenCalled();

            await sendMessage('delete-playlist', '1');
            expect(mockPlaylistService.delete).toHaveBeenCalled();

            await sendMessage('get-playlists');
            expect(mockPlaylistService.getAll).toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('playlists-data'));
        });

        it('should handle track/album queueing', async () => {
            mockScraperService.getAlbumDetails.mockResolvedValue({ tracks: [{ id: 't1', streamUrl: 'url' }] });

            await sendMessage('play-track', { bandcampUrl: 'http://track.url' });
            expect(mockPlayerService.addToQueue).toHaveBeenCalled();

            await sendMessage('add-album-to-queue', { albumUrl: 'http://album.url' });
            expect(mockPlayerService.addTracksToQueue).toHaveBeenCalled();

            await sendMessage('get-album', 'http://album.url');
            expect(mockScraperService.getAlbumDetails).toHaveBeenCalledWith('http://album.url');
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('album-details'));
        });

        it('should handle station actions', async () => {
            await sendMessage('play-station', 's1');
            expect(mockPlayerService.playStation).toHaveBeenCalledWith('s1');

            await sendMessage('add-station-to-queue', { station: 's1', playNext: true });
            expect(mockPlayerService.addStationToQueue).toHaveBeenCalledWith('s1', true);

            mockPlayerService.stationToTrack.mockResolvedValue({ id: 't1' });
            await sendMessage('add-station-to-playlist', { station: 's1', playlistId: 'p1' });
            expect(mockPlaylistService.addTrack).toHaveBeenCalled();

            await sendMessage('get-radio-stations');
            expect(mockScraperService.getRadioStations).toHaveBeenCalled();
        });

        it('should handle secondary controls', async () => {
            await sendMessage('play-queue-index', 5);
            expect(mockPlayerService.playIndex).toHaveBeenCalledWith(5);

            await sendMessage('remove-from-queue', 't1');
            expect(mockPlayerService.removeFromQueue).toHaveBeenCalledWith('t1');

            await sendMessage('set-repeat', 'one');
            expect(mockPlayerService.setRepeat).toHaveBeenCalledWith('one');

            await sendMessage('get-state');
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('state-changed'));

            await sendMessage('get-artists');
            expect(mockDatabase.getArtists).toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('artists-data'));
        });

        it('should log warning for unknown message type', async () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            await sendMessage('unknown-type' as any);
            expect(consoleSpy).toHaveBeenCalledWith('[RemoteService] Unknown message type:', 'unknown-type');
            consoleSpy.mockRestore();
        });

        it('should handle broadcast stringify error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const circularObj: any = {};
            circularObj.self = circularObj;

            // Trigger state-changed which calls broadcast
            (mockPlayerService.getState as any).mockReturnValueOnce(circularObj);
            await sendMessage('get-state'); // This triggers this.sendToClient which uses JSON.stringify
            // Wait, sendToClient is not broadcast.
            // Let's trigger a broadcast event directly
            remoteService['handleStateChanged'](circularObj);

            expect(consoleSpy).toHaveBeenCalledWith('[RemoteService] Error stringifying broadcast payload:', expect.any(Error));
            consoleSpy.mockRestore();
            (mockPlayerService.getState as any).mockReturnValue({ isPlaying: false, currentTrack: null });
        });

        it('should handle client send error during broadcast', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            // client.send throws error
            mockWs.send.mockImplementationOnce(() => { throw new Error('Send failed'); });

            // Trigger broadcast
            remoteService['handleStateChanged']({});

            expect(consoleSpy).toHaveBeenCalledWith('[RemoteService] Error sending to client:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('Device Management', () => {
        it('should list and disconnect device', () => {
            remoteService.start();
            const mockWs = new EventEmitter() as any;
            mockWs.send = vi.fn((_data, cb) => cb && cb());
            mockWs.close = vi.fn();
            mockWs.readyState = 1;

            mockWss.emit('connection', mockWs, { socket: { remoteAddress: '127.0.0.1' }, headers: { 'user-agent': 'Test' } });

            const devices = remoteService.getConnectedDevices();
            expect(devices.length).toBe(1);
            expect(devices[0].ip).toBe('127.0.0.1');

            remoteService.disconnectDevice(devices[0].id);
            expect(mockWs.close).toHaveBeenCalled();
        });
    });

    describe('HTTP Server', () => {
        it('should serve files', () => {
            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            expect(typeof handler).toBe('function');

            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;

            // Mock fs.readFile for index
            (fs.readFile as any).mockImplementation((_p: string, _opts: any, cb: any) => cb(null, 'html /* ICONS_INJECTION */'));
            handler({ url: '/' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

            res.writeHead.mockClear();
            // Mock fs.readFile for static
            (fs.readFile as any).mockImplementation((_p: string, cb: any) => cb(null, 'js'));
            handler({ url: '/client.js' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'application/javascript' }));

            // Not found
            handler({ url: '/404' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(404);
        });

        it('should handle 500 when index.html read fails', () => {
            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;

            // Mock fs.readFile to fail
            (fs.readFile as any).mockImplementationOnce((_p: string, _opts: any, cb: any) => cb(new Error('Test Error')));
            handler({ url: '/' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(500);
            expect(res.end).toHaveBeenCalledWith('Error loading remote interface');
        });

        it('should handle static file read errors', () => {
            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;

            // Mock fs.readFile to fail
            (fs.readFile as any).mockImplementationOnce((_p: string, cb: any) => cb(new Error('Test Error')));
            handler({ url: '/styles.css' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(404);
            expect(res.end).toHaveBeenCalledWith();
        });

        it('should resolve assets path correctly in DEV mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            (fs.existsSync as any).mockImplementation((p: string) => p.includes('src/assets/remote') || p.includes('src\\assets\\remote'));

            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;
            (fs.readFile as any).mockImplementation((_p: string, _opts: any, cb: any) => cb(null, 'html'));
            handler({ url: '/' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

            process.env.NODE_ENV = originalEnv;
        });

        it('should resolve assets path correctly in PROD mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            (fs.existsSync as any).mockImplementation((p: string) => p.includes('assets') && !p.includes('src'));

            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;
            (fs.readFile as any).mockImplementation((_p: string, _opts: any, cb: any) => cb(null, 'html'));
            handler({ url: '/' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

            process.env.NODE_ENV = originalEnv;
        });

        it('should fallback to PROD mode path when index.html not found anywhere', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            (fs.existsSync as any).mockReturnValue(false);

            remoteService.start();
            const handler = (http.createServer as any)._lastHandler;
            const res = { writeHead: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() } as any;
            (fs.readFile as any).mockImplementation((_p: string, _opts: any, cb: any) => cb(null, 'html'));
            handler({ url: '/' }, res);
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

            process.env.NODE_ENV = originalEnv;
        });
    });
});
