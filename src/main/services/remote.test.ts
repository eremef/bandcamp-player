import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RemoteControlService } from './remote.service';
import { PlayerService } from './player.service';
import { ScraperService } from './scraper.service';
import { PlaylistService } from './playlist.service';
import { AuthService } from './auth.service';
import { Database } from '../database/database';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocketServer } from 'ws';

// Mock dependencies
vi.mock('./player.service');
vi.mock('./scraper.service');
vi.mock('./playlist.service');
vi.mock('./auth.service');
vi.mock('../database/database');

vi.mock('http', () => {
    const createServer = vi.fn();
    return {
        default: { createServer },
        createServer,
        IncomingMessage: class { },
        ServerResponse: class { },
    };
});

vi.mock('ws', () => {
    return {
        WebSocketServer: vi.fn(),
        WebSocket: { OPEN: 1 }
    };
});

vi.mock('fs');

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
        mockPlayerService = {
            on: vi.fn(),
            off: vi.fn(),
            getState: vi.fn().mockReturnValue({ isPlaying: false }),
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
        } as unknown as PlayerService;

        mockScraperService = {
            getAlbumDetails: vi.fn(),
            fetchCollection: vi.fn(),
            getRadioStations: vi.fn(),
        } as unknown as ScraperService;

        mockPlaylistService = {
            on: vi.fn(),
            off: vi.fn(),
            getAll: vi.fn().mockReturnValue([]),
            getById: vi.fn(),
            addTrack: vi.fn(),
            addTracks: vi.fn(),
        } as unknown as PlaylistService;

        mockAuthService = {
            getUser: vi.fn(),
        } as unknown as AuthService;

        mockDatabase = {} as unknown as Database;

        // Mock HTTP server
        mockHttpServer = {
            listen: vi.fn((port, host, cb) => cb && cb()),
            close: vi.fn(),
            on: vi.fn(),
        };
        (http.createServer as any).mockReturnValue(mockHttpServer);

        // Mock WebSocket Server
        mockWss = new EventEmitter();
        mockWss.clients = new Set();
        mockWss.close = vi.fn();
        (WebSocketServer as any).mockImplementation(function () { return mockWss; });

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

    describe('Lifecycle', () => {
        it('should start the server', () => {
            remoteService.start();
            expect(http.createServer).toHaveBeenCalled();
            expect(WebSocketServer).toHaveBeenCalled();
            expect(mockHttpServer.listen).toHaveBeenCalledWith(9999, '0.0.0.0', expect.any(Function));
            expect(remoteService.getStatus().isRunning).toBe(true);
        });

        it('should stop the server', () => {
            remoteService.start();
            remoteService.stop();
            expect(mockWss.close).toHaveBeenCalled();
            expect(mockHttpServer.close).toHaveBeenCalled();
            expect(remoteService.getStatus().isRunning).toBe(false);
        });
    });

    describe('Message Handling', () => {
        let mockWs: any;

        beforeEach(() => {
            remoteService.start();
            // Simulate connection
            mockWs = new EventEmitter();
            mockWs.send = vi.fn((data, cb) => {
                if (cb) cb();
            });
            mockWs.terminate = vi.fn(); // Add terminate mock
            mockWs.close = vi.fn(); // Add close mock
            mockWs.readyState = 1; // OPEN
            const mockReq = {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'TestAgent' }
            };
            mockWss.emit('connection', mockWs, mockReq);
        });

        const sendMessage = (type: string, payload?: any) => {
            mockWs.emit('message', JSON.stringify({ type, payload }));
        };

        it('should handle play command', () => {
            sendMessage('play');
            expect(mockPlayerService.play).toHaveBeenCalled();
        });

        it('should handle pause command', () => {
            sendMessage('pause');
            expect(mockPlayerService.pause).toHaveBeenCalled();
        });

        it('should handle queue management commands', () => {
            sendMessage('play-queue-index', 5);
            expect(mockPlayerService.playIndex).toHaveBeenCalledWith(5);

            sendMessage('remove-from-queue', 'item-id');
            expect(mockPlayerService.removeFromQueue).toHaveBeenCalledWith('item-id');
        });

        it('should handle add-track-to-queue', async () => {
            const track = { id: '1', title: 'Test', streamUrl: 'http://url' };
            // Since handleMessage is async, we need to wait a bit or make playIndex return a promise we can await if possible.
            // But here handleMessage is void. We can just wait for next tick.

            // Trigger the message
            mockWs.emit('message', JSON.stringify({
                type: 'add-track-to-queue',
                payload: { track, playNext: true }
            }));

            // Wait for async operations
            await new Promise(process.nextTick);

            expect(mockPlayerService.addToQueue).toHaveBeenCalledWith(track, 'collection', true);
        });

        it('should handle add-album-to-queue with provided tracks', async () => {
            const tracks = [{ id: '1' }, { id: '2' }];
            const payload = {
                albumUrl: 'http://album',
                tracks,
                playNext: false
            };

            mockWs.emit('message', JSON.stringify({
                type: 'add-album-to-queue',
                payload
            }));

            await new Promise(process.nextTick);

            expect(mockPlayerService.addTracksToQueue).toHaveBeenCalledWith(tracks, 'collection', false);
        });

        it('should handle add-album-to-queue with scraping', async () => {
            const tracks = [{ id: '1' }, { id: '2' }];
            mockScraperService.getAlbumDetails.mockResolvedValue({ tracks });

            const payload = {
                albumUrl: 'http://album',
                playNext: true
            };

            mockWs.emit('message', JSON.stringify({
                type: 'add-album-to-queue',
                payload
            }));

            await new Promise(process.nextTick);

            expect(mockScraperService.getAlbumDetails).toHaveBeenCalledWith('http://album');
            expect(mockPlayerService.addTracksToQueue).toHaveBeenCalledWith(tracks, 'collection', true);
        });

        it('should handle get-collection when authenticated', async () => {
            mockAuthService.getUser.mockReturnValue({ isAuthenticated: true });
            mockScraperService.fetchCollection.mockResolvedValue({ items: [], totalCount: 0 });

            sendMessage('get-collection');

            await new Promise(process.nextTick);

            expect(mockScraperService.fetchCollection).toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('collection-data'));
        });

        it('should handle get-collection when not authenticated', async () => {
            mockAuthService.getUser.mockReturnValue({ isAuthenticated: false });

            sendMessage('get-collection');

            await new Promise(process.nextTick);

            expect(mockScraperService.fetchCollection).not.toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('collection-data'));
            expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"items":[]'));
        });
    });

    describe('Device Management', () => {
        let mockWs: any;
        let mockReq: any;

        beforeEach(() => {
            remoteService.start();
            mockWs = new EventEmitter();
            mockWs.send = vi.fn((data, cb) => {
                if (cb) cb();
            });
            mockWs.terminate = vi.fn();
            mockWs.close = vi.fn();
            mockWs.readyState = 1;

            mockReq = {
                socket: { remoteAddress: '127.0.0.1' },
                headers: { 'user-agent': 'TestAgent' }
            };
            mockWss.emit('connection', mockWs, mockReq);
        });

        it('should list connected devices', () => {
            const devices = remoteService.getConnectedDevices();
            expect(devices).toHaveLength(1);
            expect(devices[0]).toMatchObject({
                ip: '127.0.0.1',
                userAgent: 'TestAgent'
            });
        });

        it('should disconnect a device', () => {
            const devices = remoteService.getConnectedDevices();
            const clientId = devices[0].id;

            const result = remoteService.disconnectDevice(clientId);
            expect(result).toBe(true);
            expect(mockWs.close).toHaveBeenCalled();
            expect(remoteService.getConnectedDevices()).toHaveLength(0);
        });

        it('should handle disconnecting non-existent device', () => {
            const result = remoteService.disconnectDevice('non-existent');
            expect(result).toBe(false);
        });
    });
});
