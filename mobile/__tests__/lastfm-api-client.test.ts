import { LastfmApiClient, LastfmApiError } from '../services/lastfm-api-client';

const config = {
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    apiUrl: 'https://example.test/api',
    authUrl: 'https://example.test/auth',
};

describe('LastfmApiClient', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it('classifies an invalid session returned with HTTP 200', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ error: 9, message: 'Invalid session key' }),
        }) as jest.Mock;
        const client = new LastfmApiClient(config);

        await expect(client.getAuthenticatedUser('bad-session')).rejects.toMatchObject({
            kind: 'session',
            code: 9,
        });
    });

    it('returns per-item acceptance instead of treating every response as success', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                scrobbles: {
                    scrobble: [
                        { ignoredMessage: { code: '0', '#text': '' } },
                        { ignoredMessage: { code: '3', '#text': 'Timestamp too old' } },
                    ],
                },
            }),
        }) as jest.Mock;
        const client = new LastfmApiClient(config);

        const outcomes = await client.scrobble('session', [
            { playId: 'one', artist: 'A', track: 'One', timestamp: 100 },
            { playId: 'two', artist: 'A', track: 'Two', timestamp: 200 },
        ]);

        expect(outcomes).toEqual([
            { playId: 'one', accepted: true, ignoredCode: undefined, ignoredMessage: '' },
            { playId: 'two', accepted: false, ignoredCode: 3, ignoredMessage: 'Timestamp too old' },
        ]);
    });

    it('rejects an incomplete batch response so queue rows remain retryable', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ scrobbles: { scrobble: [] } }),
        }) as jest.Mock;
        const client = new LastfmApiClient(config);

        await expect(client.scrobble('session', [
            { playId: 'one', artist: 'A', track: 'One', timestamp: 100 },
        ])).rejects.toBeInstanceOf(LastfmApiError);
    });

    it('preserves Retry-After for rate limiting', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            headers: { get: jest.fn().mockReturnValue('120') },
            json: jest.fn().mockResolvedValue({ error: 29, message: 'Rate limit exceeded' }),
        }) as jest.Mock;
        const client = new LastfmApiClient(config);

        await expect(client.getAuthenticatedUser('session')).rejects.toMatchObject({
            kind: 'rate-limit',
            retryAfterSeconds: 120,
        });
    });
});
