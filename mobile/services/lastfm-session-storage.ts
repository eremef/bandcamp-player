import * as SecureStore from 'expo-secure-store';
import type { LastfmUser } from '@shared/types';
import { mobileDatabase } from './MobileDatabase';

const SESSION_RECORD_KEY = 'lastfmSession.v1';
const CURRENT_LEGACY_KEY = 'lastfmSessionKey';
const HISTORICAL_LEGACY_KEY = 'lastfm_session_key';
const DISCONNECT_TOMBSTONE_KEY = 'lastfmDisconnected.v1';

export interface LastfmSessionRecord {
    version: 1;
    sessionKey: string;
    apiKey: string;
    savedAt: number;
    user?: LastfmUser;
}

function isSessionRecord(value: unknown): value is LastfmSessionRecord {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return record.version === 1
        && typeof record.sessionKey === 'string'
        && record.sessionKey.length > 0
        && typeof record.apiKey === 'string'
        && typeof record.savedAt === 'number';
}

async function writeAndVerify(record: LastfmSessionRecord): Promise<void> {
    const serialized = JSON.stringify(record);
    await SecureStore.setItemAsync(SESSION_RECORD_KEY, serialized);
    const stored = await SecureStore.getItemAsync(SESSION_RECORD_KEY);
    if (stored !== serialized) {
        throw new Error('Last.fm session could not be verified after saving.');
    }
}

export const lastfmSessionStorage = {
    async load(apiKey: string): Promise<LastfmSessionRecord | null> {
        const tombstone = await SecureStore.getItemAsync(DISCONNECT_TOMBSTONE_KEY);
        if (tombstone === 'true') return null;

        const serialized = await SecureStore.getItemAsync(SESSION_RECORD_KEY);
        if (serialized) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(serialized);
            } catch {
                throw new Error('The saved Last.fm session is unreadable.');
            }
            if (!isSessionRecord(parsed)) {
                throw new Error('The saved Last.fm session has an unsupported format.');
            }
            return parsed;
        }

        const currentLegacy = await SecureStore.getItemAsync(CURRENT_LEGACY_KEY);
        const historicalLegacy = await SecureStore.getItemAsync(HISTORICAL_LEGACY_KEY);
        const settings = await mobileDatabase.getSettings();
        const databaseLegacy = typeof settings.lastfmSessionKey === 'string' ? settings.lastfmSessionKey : undefined;
        const sessionKey = currentLegacy || historicalLegacy || databaseLegacy;
        if (!sessionKey) return null;

        const record: LastfmSessionRecord = {
            version: 1,
            sessionKey,
            apiKey,
            savedAt: Date.now(),
        };
        await writeAndVerify(record);
        await SecureStore.deleteItemAsync(CURRENT_LEGACY_KEY);
        await SecureStore.deleteItemAsync(HISTORICAL_LEGACY_KEY);
        await mobileDatabase.setSetting('lastfmSessionKey', null);
        return record;
    },

    async save(record: LastfmSessionRecord): Promise<void> {
        await writeAndVerify(record);
        await SecureStore.deleteItemAsync(CURRENT_LEGACY_KEY);
        await SecureStore.deleteItemAsync(HISTORICAL_LEGACY_KEY);
        await mobileDatabase.setSetting('lastfmSessionKey', null);
        await SecureStore.deleteItemAsync(DISCONNECT_TOMBSTONE_KEY);
    },

    async clear(): Promise<void> {
        await SecureStore.setItemAsync(DISCONNECT_TOMBSTONE_KEY, 'true');
        await SecureStore.deleteItemAsync(SESSION_RECORD_KEY);
        await SecureStore.deleteItemAsync(CURRENT_LEGACY_KEY);
        await SecureStore.deleteItemAsync(HISTORICAL_LEGACY_KEY);
        await mobileDatabase.setSetting('lastfmSessionKey', null);
    },
};
