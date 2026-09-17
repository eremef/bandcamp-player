import * as SecureStore from 'expo-secure-store';
import { lastfmSessionStorage } from '../services/lastfm-session-storage';
import { mobileDatabase } from '../services/MobileDatabase';

jest.mock('../services/MobileDatabase', () => ({
    mobileDatabase: {
        getSettings: jest.fn(),
        setSetting: jest.fn(),
    },
}));

describe('lastfmSessionStorage', () => {
    const values = new Map<string, string>();

    beforeEach(() => {
        values.clear();
        jest.clearAllMocks();
        (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => values.get(key) ?? null);
        (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
            values.set(key, value);
        });
        (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
            values.delete(key);
        });
        (mobileDatabase.getSettings as jest.Mock).mockResolvedValue({});
        (mobileDatabase.setSetting as jest.Mock).mockResolvedValue(undefined);
    });

    it('migrates the historical SecureStore key into a verified versioned record', async () => {
        values.set('lastfm_session_key', 'historical-session');

        const record = await lastfmSessionStorage.load('api-key');

        expect(record).toMatchObject({ version: 1, sessionKey: 'historical-session', apiKey: 'api-key' });
        expect(values.has('lastfmSession.v1')).toBe(true);
        expect(values.has('lastfm_session_key')).toBe(false);
    });

    it('does not resurrect legacy credentials after explicit disconnect', async () => {
        values.set('lastfm_session_key', 'historical-session');
        values.set('lastfmDisconnected.v1', 'true');

        await expect(lastfmSessionStorage.load('api-key')).resolves.toBeNull();
    });

    it('honors the disconnect tombstone when canonical cleanup was interrupted', async () => {
        values.set('lastfmSession.v1', JSON.stringify({
            version: 1,
            sessionKey: 'old-session',
            apiKey: 'api-key',
            savedAt: Date.now(),
        }));
        values.set('lastfmDisconnected.v1', 'true');

        await expect(lastfmSessionStorage.load('api-key')).resolves.toBeNull();
    });

    it('writes a tombstone before removing every credential alias', async () => {
        values.set('lastfmSession.v1', '{}');
        values.set('lastfmSessionKey', 'current');
        values.set('lastfm_session_key', 'historical');

        await lastfmSessionStorage.clear();

        expect(values.get('lastfmDisconnected.v1')).toBe('true');
        expect(values.has('lastfmSession.v1')).toBe(false);
        expect(values.has('lastfmSessionKey')).toBe(false);
        expect(values.has('lastfm_session_key')).toBe(false);
    });
});
