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
    class MockWebSocket {
        static OPEN = 1;
    }
    return {
        WebSocketServer: vi.fn(),
        WebSocket: MockWebSocket
    };
});

vi.mock('fs');

describe('RemoteControlService Disconnect Flow', () => {
    let remoteService: RemoteControlService;
    let mockPlayerService: any;
    let mockScraperService: any;
    let mockPlaylistService: any;
    let mockAuthService: any;
    let mockDatabase: any;
    let mockHttpServer: any;
    let mockWss: any;
    let mockWs: any;
    let mockReq: any;

    beforeEach(() => {
        // Setup service mocks
        mockPlayerService = {
            on: vi.fn(),
            off: vi.fn(),
            getState: vi.fn().mockReturnValue({ isPlaying: false }),
        } as unknown as PlayerService;

        mockScraperService = {} as unknown as ScraperService;
        mockPlaylistService = { on: vi.fn(), off: vi.fn() } as unknown as PlaylistService;
        mockAuthService = {} as unknown as AuthService;
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

        remoteService.start();

        // Simulate connection
        mockWs = new EventEmitter();
        mockWs.send = vi.fn((data, cb) => { if (cb) cb(); }); // Mock send with callback support
        mockWs.terminate = vi.fn();
        mockWs.close = vi.fn();
        mockWs.readyState = 1; // OPEN

        mockReq = {
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'user-agent': 'TestAgent' }
        };
        mockWss.emit('connection', mockWs, mockReq);
    });

    afterEach(() => {
        vi.clearAllMocks();
        remoteService.stop();
    });

    it('should send disconnect message before closing socket', () => {
        const devices = remoteService.getConnectedDevices();
        expect(devices).toHaveLength(1);
        const clientId = devices[0].id;

        // Clear initial state message call
        mockWs.send.mockClear();

        const result = remoteService.disconnectDevice(clientId);

        expect(result).toBe(true);
        // Verify message sent
        expect(mockWs.send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'disconnect' }),
            expect.any(Function)
        );
        // Verify close called
        expect(mockWs.close).toHaveBeenCalled();
        expect(remoteService.getConnectedDevices()).toHaveLength(0);
    });

    it('should handled disconnected socket gracefully', () => {
        const devices = remoteService.getConnectedDevices();
        const clientId = devices[0].id;

        // Simulate socket closed
        mockWs.readyState = 3; // CLOSED

        // Clear initial state message call
        mockWs.send.mockClear();

        const result = remoteService.disconnectDevice(clientId);

        expect(result).toBe(true);
        // Should not try to send message to closed socket
        expect(mockWs.send).not.toHaveBeenCalled();
        // But should still try to ensure close/cleanup
        expect(mockWs.close).toHaveBeenCalled();
        expect(remoteService.getConnectedDevices()).toHaveLength(0);
    });
});
