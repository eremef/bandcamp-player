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

const mockLoadURL = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockOnBeforeRequest = vi.fn();
const mockWebContentsOn = vi.fn();

const mockBrowserWindowInstance = {
    loadURL: mockLoadURL,
    close: mockClose,
    isDestroyed: mockIsDestroyed,
    webContents: {
        on: mockWebContentsOn,
        session: {
            webRequest: {
                onBeforeRequest: mockOnBeforeRequest,
            },
        },
    },
    on: vi.fn(),
};

vi.mock('electron', () => {
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
        vi.clearAllMocks();

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

        (axios.get as any).mockResolvedValue({ data: {} });
        (axios.post as any).mockResolvedValue({ data: {} });

        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should load session from settings and verify it', async () => {
            (axios.get as any).mockResolvedValueOnce({
                data: { user: { name: 'testuser', url: 'http://last.fm/user/testuser', image: [{}, { '#text': 'img.jpg' }] } }
            });

            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            await (scrobblerService as any).verifySession();

            expect(scrobblerService.getState().isConnected).toBe(true);
            expect(scrobblerService.getState().user!.name).toBe('testuser');
            expect(scrobblerService.getState().user!.imageUrl).toBe('img.jpg');
        });

        it('should fail to verify session and reset state', async () => {
            (axios.get as any).mockRejectedValueOnce(new Error('API Error'));

            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            await (scrobblerService as any).verifySession();

            expect(scrobblerService.getState().isConnected).toBe(false);
            expect(scrobblerService.getState().user).toBeNull();
            expect(mockDatabase.setSettings).toHaveBeenCalledWith({ lastfmSessionKey: undefined });
        });

        it('should not load session if key is missing', () => {
            mockDatabase.getSettings.mockReturnValueOnce({});
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            expect(scrobblerService.getState().isConnected).toBe(false);
        });
    });

    describe('Authentication', () => {
        beforeEach(() => {
            mockDatabase.getSettings.mockReturnValue({});
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
        });

        it('should handle successful authentication callback via onBeforeRequest', async () => {
            const connectPromise = scrobblerService.connect();

            expect(mockOnBeforeRequest).toHaveBeenCalled();
            const callbackFilter = mockOnBeforeRequest.mock.calls[0][1];

            (axios.get as any).mockResolvedValue({
                data: { session: { key: 'new-session-key', name: 'newuser' } }
            });

            // Simulate the intercept callback with a token
            const cb = vi.fn();
            callbackFilter({ url: 'http://localhost:41234/lastfm-callback?token=mock-token' }, cb);

            const state = await connectPromise;

            expect(cb).toHaveBeenCalledWith({ cancel: true });
            expect(state.isConnected).toBe(true);
            expect(state.user!.name).toBe('newuser');
            expect(mockDatabase.setSettings).toHaveBeenCalledWith({ lastfmSessionKey: 'new-session-key' });
            expect(mockClose).toHaveBeenCalled();
        });

        it('should handle authentication window closing', async () => {
            const connectPromise = scrobblerService.connect();
            const closeCallback = mockBrowserWindowInstance.on.mock.calls.find(c => c[0] === 'closed')[1];

            closeCallback(); // Simulate window closed manually
            const state = await connectPromise;

            expect(state.isConnected).toBe(false);
        });

        it('should handle failed getSession after token extraction', async () => {
            const connectPromise = scrobblerService.connect();
            const callbackFilter = mockOnBeforeRequest.mock.calls[0][1];

            (axios.get as any).mockRejectedValue(new Error('Failed to get session'));

            const cb = vi.fn();
            callbackFilter({ url: 'http://localhost:41234/lastfm-callback?token=mock-token' }, cb);

            const state = await connectPromise;

            expect(state.isConnected).toBe(false);
        });

        it('should handle URL interception without token', async () => {
            const connectPromise = scrobblerService.connect();
            const callbackFilter = mockOnBeforeRequest.mock.calls[0][1];

            const cb = vi.fn();
            // Just no token in URL
            callbackFilter({ url: 'http://localhost:41234/lastfm-callback' }, cb);

            const state = await connectPromise;

            expect(state.isConnected).toBe(false);
        });

        it('should handle fallback will-navigate event', async () => {
            const connectPromise = scrobblerService.connect();

            (axios.get as any).mockResolvedValue({
                data: { session: { key: 'new-session-key', name: 'newuser' } }
            });

            // Find will-navigate handler
            const willNavigateEvent = mockWebContentsOn.mock.calls.find(c => c[0] === 'will-navigate')[1];
            const mockEvent = { preventDefault: vi.fn() };

            willNavigateEvent(mockEvent, 'http://localhost:41234/lastfm-callback?token=mock-token');

            const state = await connectPromise;

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(state.isConnected).toBe(true);
        });

        it('should ignore non-matching URLs in onBeforeRequest', async () => {
            scrobblerService.connect();
            const callbackFilter = mockOnBeforeRequest.mock.calls[0][1];
            const cb = vi.fn();

            callbackFilter({ url: 'http://example.com' }, cb);

            expect(cb).toHaveBeenCalledWith({ cancel: false });
        });
    });

    describe('Disconnect', () => {
        it('should disconnect and clear session', () => {
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            scrobblerService.disconnect();

            expect(scrobblerService.getState().isConnected).toBe(false);
            expect(mockDatabase.setSettings).toHaveBeenCalledWith({ lastfmSessionKey: undefined });
        });
    });

    describe('updateNowPlaying', () => {
        beforeEach(async () => {
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            (axios.get as any).mockResolvedValue({ data: { user: { name: 'testuser' } } });
            await (scrobblerService as any).verifySession();
        });

        it('should do nothing if missing sessionKey', async () => {
            scrobblerService.disconnect();
            await scrobblerService.updateNowPlaying(mockTrack);
            expect(axios.post).not.toHaveBeenCalled();
        });

        it('should post updateNowPlaying with duration and album', async () => {
            await scrobblerService.updateNowPlaying(mockTrack);
            expect(axios.post).toHaveBeenCalled();
        });

        it('should catch and log errors during updateNowPlaying', async () => {
            (axios.post as any).mockRejectedValue(new Error('Network error'));
            await scrobblerService.updateNowPlaying(mockTrack);
            expect(console.error).toHaveBeenCalledWith('Error updating now playing:', expect.any(Error));
        });
    });

    describe('Scrobbling', () => {
        beforeEach(async () => {
            scrobblerService = new ScrobblerService(mockDatabase as unknown as Database);
            (axios.get as any).mockResolvedValue({ data: { user: { name: 'testuser' } } });
            await (scrobblerService as any).verifySession();
        });

        it('should not scrobble if scrobbling is disabled', async () => {
            mockDatabase.getSettings.mockReturnValue({ scrobblingEnabled: false });
            await scrobblerService.scrobble(mockTrack);
            expect(axios.post).not.toHaveBeenCalled();
            expect(mockDatabase.addScrobble).not.toHaveBeenCalled();
        });

        it('should queue scrobble if not connected', async () => {
            scrobblerService.disconnect();
            await scrobblerService.scrobble(mockTrack);
            expect(axios.post).not.toHaveBeenCalled();
            expect(mockDatabase.addScrobble).toHaveBeenCalled();
        });

        it('should scrobble online and submit pending scrobbles', async () => {
            mockDatabase.getPendingScrobbles.mockReturnValue([{ id: 1, artist: 'A', track: 'B', album: 'C', duration: 100, timestamp: 123 }]);
            await scrobblerService.scrobble(mockTrack);
            expect(axios.post).toHaveBeenCalledTimes(2); // One main, one pending
            expect(mockDatabase.deleteScrobble).toHaveBeenCalledWith(1);
        });

        it('should queue scrobble if scrobbling online throws error', async () => {
            (axios.post as any).mockRejectedValueOnce(new Error('Network Error'));
            await scrobblerService.scrobble(mockTrack);
            expect(mockDatabase.addScrobble).toHaveBeenCalled();
        });

        it('should break submitting pending scrobbles if one throws an error', async () => {
            mockDatabase.getPendingScrobbles.mockReturnValue([
                { id: 1, artist: 'A', track: 'B', timestamp: 123 },
                { id: 2, artist: 'X', track: 'Y', timestamp: 456 }
            ]);

            // First mock resolves for main scrobble
            // Second mock throws for the pending scrobble
            (axios.post as any).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(new Error('Submit Error'));

            await scrobblerService.scrobble(mockTrack);

            expect(mockDatabase.deleteScrobble).not.toHaveBeenCalled(); // Failed before deleting
            expect(console.error).toHaveBeenCalledWith('Error submitting queued scrobble:', expect.any(Error));
        });
    });
});
