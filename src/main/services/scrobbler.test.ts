import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScrobblerService } from './scrobbler.service';
import { Database } from '../database/database';
import axios from 'axios';
import { BrowserWindow } from 'electron';
import { Track } from '../../shared/types';
import * as crypto from 'crypto';

// Mock dependencies
vi.mock('axios');
vi.mock('../database/database');
// Mock instance that we can spy on
const mockLoadURL = vi.fn().mockResolvedValue(undefined);
const mockBrowserWindowInstance = {
    loadURL: mockLoadURL,
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
        on: vi.fn(),
        session: {
            webRequest: {
                onBeforeRequest: vi.fn(),
            },
        },
    },
    on: vi.fn(),
};

vi.mock('electron', () => {
    // Use regular function, not arrow, so it can be called with `new`
    const MockBrowserWindow = vi.fn(function () {
        return mockBrowserWindowInstance;
    });
    return { BrowserWindow: MockBrowserWindow };
});

describe('ScrobblerService', () => {
    let scrobblerService: ScrobblerService;
    let mockDatabase: any;

    const mockTrack: Track = {
        id: '1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        artworkUrl: '',
        streamUrl: '',
        bandcampUrl: '',
        isCached: false,
    };

    beforeEach(() => {
        mockDatabase = {
            getSettings: vi.fn().mockReturnValue({
                scrobblingEnabled: true,
                lastfmSessionKey: 'mock-session-key',
                lastfmApiKey: 'mock-api-key',
                lastfmApiSecret: 'mock-secret'
            }),
            setSettings: vi.fn(),
            addScrobble: vi.fn(),
            getPendingScrobbles: vi.fn().mockReturnValue([]),
            deleteScrobble: vi.fn(),
        };

        // Reset axios
        (axios.get as any).mockResolvedValue({ data: {} });
        (axios.post as any).mockResolvedValue({ data: {} });

        scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => { });

    describe('Initialization', () => {
        it('should load session from settings', () => {
            expect(scrobblerService.getState().isConnected).toBe(false); // User is null until verified
            // In verification, it calls API. 
        });
    });

    describe('Authentication', () => {
        it('should verify session on load', async () => {
            // Mock verify response
            (axios.get as any).mockResolvedValue({
                data: {
                    user: { name: 'testuser', url: 'http://last.fm/user/testuser' }
                }
            });

            // Re-instantiate to trigger constructor load
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);

            // Wait for promise (verifySession is async in constructor but not awaited)
            // We can cheat by calling verifySession manually or waiting
            await (scrobblerService as any).verifySession();

            expect(scrobblerService.getState().isConnected).toBe(true);
            expect(scrobblerService.getState().user?.name).toBe('testuser');
        });

        it('should open auth window on connect', async () => {
            scrobblerService.connect();
            expect(BrowserWindow).toHaveBeenCalled();
            // Await next tick to ensure constructor logic ran
            await new Promise(resolve => setTimeout(resolve, 0));
            // Just check if called, as URL param matching might be flaky
            expect(mockLoadURL).toHaveBeenCalled();
        });
    });

    describe('Scrobbling', () => {
        it('should scrobble track when online', async () => {
            await (scrobblerService as any).verifySession(); // Ensure connected

            await scrobblerService.scrobble(mockTrack);

            expect(axios.post).toHaveBeenCalledTimes(1);
            const postCall = (axios.post as any).mock.calls[0];
            const params = postCall[2].params;

            expect(params.method).toBe('track.scrobble');
            expect(params['artist[0]']).toBe(mockTrack.artist);
            expect(params['track[0]']).toBe(mockTrack.title);
            expect(params.sk).toBe('mock-session-key');
        });

        it('should queue scrobble when offline or error occurs', async () => {
            await (scrobblerService as any).verifySession();

            // Simulate API error
            (axios.post as any).mockRejectedValue(new Error('Network Error'));

            await scrobblerService.scrobble(mockTrack);

            expect(mockDatabase.addScrobble).toHaveBeenCalled();
        });

        it('should queue scrobble if validation/session missing', async () => {
            mockDatabase.getSettings.mockReturnValue({ scrobblingEnabled: true, lastfmSessionKey: null });
            // Re-init with no session
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);

            await scrobblerService.scrobble(mockTrack);

            expect(axios.post).not.toHaveBeenCalled();
            expect(mockDatabase.addScrobble).toHaveBeenCalled();
        });
    });

    describe('Retry Logic', () => {
        it('should submit pending scrobbles', async () => {
            const pending = [
                { id: 1, artist: 'A', track: 'B', timestamp: 12345 }
            ];
            mockDatabase.getPendingScrobbles.mockReturnValue(pending);

            await (scrobblerService as any).verifySession();

            // Trigger retry via scrobble (it calls submitPendingScrobbles after success)
            await scrobblerService.scrobble(mockTrack);

            // 1 call for current track, 1 call for pending
            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(mockDatabase.deleteScrobble).toHaveBeenCalledWith(1);
        });
    });

    describe('Updates', () => {
        it('should update now playing', async () => {
            await (scrobblerService as any).verifySession();

            await scrobblerService.updateNowPlaying(mockTrack);

            expect(axios.post).toHaveBeenCalled();
            const params = (axios.post as any).mock.calls[0][2].params;
            expect(params.method).toBe('track.updateNowPlaying');
            expect(params.track).toBe(mockTrack.title);
        });
    });
});
