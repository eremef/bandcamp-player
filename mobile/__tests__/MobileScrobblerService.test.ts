import { LastfmApiError } from '../services/lastfm-api-client';
import { MobileScrobblerService } from '../services/MobileScrobblerService';
import { lastfmSessionStorage } from '../services/lastfm-session-storage';
import { mobileDatabase } from '../services/MobileDatabase';
import { useStore } from '../store';

const mockExchangeToken = jest.fn();
const mockGetAuthenticatedUser = jest.fn();
const mockUpdateNowPlaying = jest.fn();
const mockScrobble = jest.fn();

jest.mock('../services/lastfm-api-client', () => {
    const actual = jest.requireActual('../services/lastfm-api-client');
    return {
        ...actual,
        getLastfmApiConfig: () => ({
            apiKey: 'api-key',
            apiSecret: 'api-secret',
            apiUrl: 'https://example.test/api',
            authUrl: 'https://example.test/auth',
        }),
        LastfmApiClient: class {
            apiKey = 'api-key';
            authUrl = 'https://example.test/auth';
            exchangeToken = mockExchangeToken;
            getAuthenticatedUser = mockGetAuthenticatedUser;
            updateNowPlaying = mockUpdateNowPlaying;
            scrobble = mockScrobble;
        },
    };
});

jest.mock('../services/lastfm-session-storage', () => ({
    lastfmSessionStorage: {
        load: jest.fn(),
        save: jest.fn(),
        clear: jest.fn(),
    },
}));

jest.mock('../services/MobileDatabase', () => ({
    mobileDatabase: {
        enqueueScrobble: jest.fn(),
        claimPendingScrobbles: jest.fn(),
        acknowledgeScrobble: jest.fn(),
        markScrobbleIgnored: jest.fn(),
        releaseScrobbles: jest.fn(),
        countPendingScrobbles: jest.fn(),
        countLegacyScrobbles: jest.fn(),
        getNextScrobbleRetryAt: jest.fn(),
        clearScrobblesForAccount: jest.fn(),
        assignLegacyScrobbles: jest.fn(),
        discardLegacyScrobbles: jest.fn(),
    },
}));

jest.mock('../store', () => ({
    useStore: {
        getState: jest.fn(),
        setState: jest.fn(),
    },
}));

describe('MobileScrobblerService', () => {
    const track = {
        id: 'track-1',
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        duration: 120,
        artworkUrl: '',
        streamUrl: '',
        bandcampUrl: '',
        isCached: false,
    };
    let store: any;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-09-16T12:00:00Z'));
        jest.clearAllMocks();
        store = {
            mode: 'standalone',
            scrobblingEnabled: true,
            isPlaying: true,
            currentTrack: track,
            currentTime: 0,
            duration: 120,
            queue: { items: [{ id: 'queue-1', track }], currentIndex: 0 },
        };
        (useStore.getState as jest.Mock).mockImplementation(() => store);
        (lastfmSessionStorage.load as jest.Mock).mockResolvedValue(null);
        (lastfmSessionStorage.save as jest.Mock).mockResolvedValue(undefined);
        (lastfmSessionStorage.clear as jest.Mock).mockResolvedValue(undefined);
        (mobileDatabase.countPendingScrobbles as jest.Mock).mockResolvedValue(0);
        (mobileDatabase.countLegacyScrobbles as jest.Mock).mockResolvedValue(0);
        (mobileDatabase.claimPendingScrobbles as jest.Mock).mockResolvedValue([]);
        (mobileDatabase.getNextScrobbleRetryAt as jest.Mock).mockResolvedValue(null);
        (mobileDatabase.enqueueScrobble as jest.Mock).mockResolvedValue(undefined);
        mockExchangeToken.mockResolvedValue({
            sessionKey: 'session',
            user: { name: 'User', url: 'https://last.fm/user/User' },
        });
        mockGetAuthenticatedUser.mockResolvedValue({ name: 'User', url: 'https://last.fm/user/User' });
        mockUpdateNowPlaying.mockResolvedValue(undefined);
        mockScrobble.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('preserves a restored session when verification fails temporarily', async () => {
        (lastfmSessionStorage.load as jest.Mock).mockResolvedValue({
            version: 1,
            sessionKey: 'saved',
            apiKey: 'api-key',
            savedAt: Date.now(),
            user: { name: 'User', url: 'https://last.fm/user/User' },
        });
        mockGetAuthenticatedUser.mockRejectedValue(new LastfmApiError('Offline', 'transport', undefined, true));
        const service = new MobileScrobblerService();

        await service.loadSession();
        await Promise.resolve();
        await Promise.resolve();

        expect(lastfmSessionStorage.clear).not.toHaveBeenCalled();
        expect(service.getState()).toMatchObject({ isConnected: true, deliveryStatus: 'offline' });
    });

    it('activates the current track as soon as login is durably saved', async () => {
        const service = new MobileScrobblerService();

        await service.getSession('token');

        expect((lastfmSessionStorage.save as jest.Mock).mock.invocationCallOrder[0])
            .toBeLessThan(mockUpdateNowPlaying.mock.invocationCallOrder[0]);
        expect(mockUpdateNowPlaying).toHaveBeenCalledWith('session', expect.objectContaining({ track: 'Track' }));
    });

    it('retries a failed durable save without exchanging the token again', async () => {
        (lastfmSessionStorage.save as jest.Mock)
            .mockRejectedValueOnce(new Error('Secure storage unavailable'))
            .mockResolvedValueOnce(undefined);
        const service = new MobileScrobblerService();
        const attempt = service.createAuthenticationUrl('http://localhost/callback');

        await expect(service.getSession('token', attempt.attemptId)).rejects.toThrow('Secure storage unavailable');
        expect(service.hasPendingSession(attempt.attemptId)).toBe(true);

        await service.retryPendingSession(attempt.attemptId);

        expect(mockExchangeToken).toHaveBeenCalledTimes(1);
        expect(lastfmSessionStorage.save).toHaveBeenCalledTimes(2);
        expect(service.getState().isConnected).toBe(true);
    });

    it('does not count a long pause as listening time', async () => {
        const service = new MobileScrobblerService();
        await service.getSession('token');
        store.isPlaying = false;
        jest.advanceTimersByTime(90_000);
        await service.handleProgressUpdate(1, 120, 'queue-1');
        store.isPlaying = true;
        jest.advanceTimersByTime(1_000);
        await service.handleProgressUpdate(2, 120, 'queue-1');

        expect(mobileDatabase.enqueueScrobble).not.toHaveBeenCalled();
    });

    it('deduplicates the same native transition delivered by two event paths', async () => {
        const service = new MobileScrobblerService();
        await service.getSession('token');
        mockUpdateNowPlaying.mockClear();

        await service.handleTrackTransition('queue-1', 0);
        await service.handleTrackTransition('queue-1', 0);

        expect(mockUpdateNowPlaying).toHaveBeenCalledTimes(1);
    });

    it('persists an eligible play with its start timestamp before delivery', async () => {
        const service = new MobileScrobblerService();
        await service.getSession('token');
        jest.advanceTimersByTime(61_000);

        await service.handleProgressUpdate(61, 120, 'queue-1');

        expect(mobileDatabase.enqueueScrobble).toHaveBeenCalledWith(expect.objectContaining({
            accountId: 'api-key:user',
            timestamp: Math.floor(new Date('2026-09-16T12:00:00Z').getTime() / 1000),
        }));
    });

    it('never queues tracks that are 30 seconds or shorter', async () => {
        store.currentTrack = { ...track, duration: 30 };
        store.duration = 30;
        store.queue.items[0].track = store.currentTrack;
        const service = new MobileScrobblerService();
        await service.getSession('token');
        jest.advanceTimersByTime(20_000);

        await service.handleProgressUpdate(20, 30, 'queue-1');

        expect(mobileDatabase.enqueueScrobble).not.toHaveBeenCalled();
    });

    it('does not let an old verification overwrite a newly connected account', async () => {
        let finishVerification: (value: unknown) => void = () => undefined;
        mockGetAuthenticatedUser.mockReturnValue(new Promise(resolve => {
            finishVerification = resolve;
        }));
        (lastfmSessionStorage.load as jest.Mock).mockResolvedValue({
            version: 1,
            sessionKey: 'old-session',
            apiKey: 'api-key',
            savedAt: Date.now(),
            user: { name: 'OldUser', url: 'https://last.fm/user/OldUser' },
        });
        mockExchangeToken.mockResolvedValue({
            sessionKey: 'new-session',
            user: { name: 'NewUser', url: 'https://last.fm/user/NewUser' },
        });
        const service = new MobileScrobblerService();
        await service.loadSession();

        await service.getSession('new-token');
        finishVerification({ name: 'OldUser', url: 'https://last.fm/user/OldUser' });
        await Promise.resolve();
        await Promise.resolve();

        expect(service.getState().user?.name).toBe('NewUser');
    });

    it('releases claimed rows when Last.fm rejects the session', async () => {
        const row = {
            id: 1,
            play_id: 'play-1',
            account_id: 'api-key:user',
            artist: 'Artist',
            track: 'Track',
            album: 'Album',
            duration: 120,
            timestamp: 100,
            attempt_count: 0,
        };
        (mobileDatabase.claimPendingScrobbles as jest.Mock).mockResolvedValue([row]);
        mockScrobble.mockRejectedValue(new LastfmApiError('Invalid session', 'session', 9));
        const service = new MobileScrobblerService();

        await service.getSession('token');
        await service.flushPendingScrobbles();

        expect(mobileDatabase.acknowledgeScrobble).not.toHaveBeenCalled();
        expect(mobileDatabase.releaseScrobbles).toHaveBeenCalledWith([1], expect.any(Number), '9');
        expect(service.getState().sessionStatus).toBe('reconnect-required');
    });

    it('requires explicit assignment before sending legacy unowned rows', async () => {
        (mobileDatabase.countLegacyScrobbles as jest.Mock).mockResolvedValue(2);
        const service = new MobileScrobblerService();
        await service.getSession('token');

        expect(service.getState().legacyPendingCount).toBe(2);
        expect(mobileDatabase.assignLegacyScrobbles).not.toHaveBeenCalled();

        await service.assignLegacyScrobblesToCurrentAccount();

        expect(mobileDatabase.assignLegacyScrobbles).toHaveBeenCalledWith('api-key:user');
    });
});
