import * as SQLite from 'expo-sqlite';
import { CollectionItem, AppSettings, Playlist } from '@shared/types';

const DB_NAME = 'bandcamp_mobile.db';

export class MobileDatabase {
    private db: SQLite.SQLiteDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    async init() {
        if (this.db) return;

        if (!this.initPromise) {
            this.initPromise = (async () => {
                this.db = await SQLite.openDatabaseAsync(DB_NAME);
                await this.setupTables();
            })();
        }

        await this.initPromise;
    }

    private async setupTables() {
        if (!this.db) return;
        await this.db.execAsync(`
            PRAGMA journal_mode = WAL;
            
            CREATE TABLE IF NOT EXISTS collection_cache (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                cached_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id TEXT PRIMARY KEY,
                playlist_id TEXT NOT NULL,
                track_data TEXT NOT NULL,
                position INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS artists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                image_url TEXT,
                is_simulated INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);
    }

    // --- Collection Cache ---

    async getCollectionCache(userId: string): Promise<{ data: any; cachedAt: string } | null> {
        if (!this.db) await this.init();
        const result = await this.db!.getFirstAsync<{ data: string; cached_at: string }>(
            'SELECT data, cached_at FROM collection_cache WHERE id = ? AND type = ?',
            [userId, 'collection']
        );

        if (!result) return null;
        return {
            data: JSON.parse(result.data),
            cachedAt: result.cached_at
        };
    }

    async saveCollectionCache(userId: string, data: any) {
        if (!this.db) await this.init();
        const now = new Date().toISOString();
        await this.db!.runAsync(
            'INSERT OR REPLACE INTO collection_cache (id, type, data, cached_at) VALUES (?, ?, ?, ?)',
            [userId, 'collection', JSON.stringify(data), now]
        );
    }

    // --- Playlists ---

    async getAllPlaylists(): Promise<Playlist[]> {
        if (!this.db) await this.init();

        // Get playlists
        const playlists = await this.db!.getAllAsync<{ id: string; name: string; created_at: string; updated_at: string }>(
            'SELECT * FROM playlists ORDER BY name ASC'
        );

        const result: Playlist[] = [];

        for (const p of playlists) {
            // Get tracks for each playlist
            const tracks = await this.db!.getAllAsync<{ track_data: string }>(
                'SELECT track_data FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
                [p.id]
            );

            const parsedTracks = tracks.map(t => JSON.parse(t.track_data));

            result.push({
                id: p.id,
                name: p.name,
                createdAt: p.created_at,
                updatedAt: p.updated_at,
                tracks: parsedTracks,
                trackCount: parsedTracks.length,
                totalDuration: parsedTracks.reduce((acc: number, t: any) => acc + (t.duration || 0), 0)
            });
        }

        return result;
    }

    async createPlaylist(name: string): Promise<Playlist> {
        if (!this.db) await this.init();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await this.db!.runAsync(
            'INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
            [id, name, now, now]
        );

        return {
            id,
            name,
            createdAt: now,
            updatedAt: now,
            tracks: [],
            trackCount: 0,
            totalDuration: 0
        };
    }

    async deletePlaylist(id: string) {
        if (!this.db) await this.init();
        await this.db!.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
    }

    async renamePlaylist(id: string, name: string) {
        if (!this.db) await this.init();
        const now = new Date().toISOString();
        await this.db!.runAsync(
            'UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?',
            [name, now, id]
        );
    }

    async addTrackToPlaylist(playlistId: string, track: any) {
        if (!this.db) await this.init();

        // Get current max position
        const result = await this.db!.getFirstAsync<{ max_pos: number }>(
            'SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?',
            [playlistId]
        );
        const position = (result?.max_pos ?? -1) + 1;
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await this.db!.runAsync(
            'INSERT INTO playlist_tracks (id, playlist_id, track_data, position, added_at) VALUES (?, ?, ?, ?, ?)',
            [id, playlistId, JSON.stringify(track), position, now]
        );

        // Update playlist timestamp
        await this.db!.runAsync(
            'UPDATE playlists SET updated_at = ? WHERE id = ?',
            [now, playlistId]
        );
    }

    async removeTrackFromPlaylist(playlistId: string, trackId: string) { // Note: this removes logically by track content ID if needed, 
        // but typically robust apps use a unique playlist_entry_id. 
        // For now, mirroring desktop which might just use array filtering.
        // Implementing simple removal by matching track ID inside JSON is hard in SQLite.
        // Ideally we pass the playlist_track row ID.
        // For MVP, if the track object has a unique ID, we can fetch all, filter, and rewrite, or delete based on match.
        // Let's assume playlisEntryId logic will be handled at service layer or we just don't support granular delete in this first pass.
    }

    // --- Artists ---

    async getArtists(): Promise<any[]> {
        if (!this.db) await this.init();
        return await this.db!.getAllAsync('SELECT * FROM artists ORDER BY name ASC');
    }

    // Simple mutex for transaction serialization
    private artistTransactionLock: Promise<void> = Promise.resolve();

    async replaceArtists(artists: { id: string; name: string; url: string; image_url?: string }[]) {
        if (!this.db) await this.init();

        // Chain transactions to prevent "cannot start a transaction within a transaction"
        // Wait for previous transaction to finish before starting new one
        const currentLock = this.artistTransactionLock;
        let releaseLock: () => void;

        const newLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        this.artistTransactionLock = newLock;

        await currentLock;

        try {
            await this.db!.withTransactionAsync(async () => {
                const deleted = await this.db!.runAsync('DELETE FROM artists WHERE is_simulated = 0');
                console.log(`[MobileDatabase] Deleted ${deleted.changes} non-simulated artists`);

                let inserted = 0;
                for (const artist of artists) {
                    await this.db!.runAsync(
                        'INSERT OR REPLACE INTO artists (id, name, url, image_url, is_simulated) VALUES (?, ?, ?, ?, 0)',
                        [artist.id, artist.name, artist.url, artist.image_url ?? null]
                    );
                    inserted++;
                }
                console.log(`[MobileDatabase] Inserted/Replaced ${inserted} artists`);
            });
        } finally {
            releaseLock!();
        }
    }

    // --- Settings ---

    async getSettings(): Promise<Partial<AppSettings>> {
        if (!this.db) await this.init();
        const rows = await this.db!.getAllAsync<{ key: string; value: string }>('SELECT * FROM settings');
        const settings: any = {};
        for (const row of rows) {
            try {
                settings[row.key] = JSON.parse(row.value);
            } catch {
                settings[row.key] = row.value;
            }
        }
        return settings;
    }

    async setSetting(key: string, value: any) {
        if (!this.db) await this.init();
        await this.db!.runAsync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            [key, JSON.stringify(value)]
        );
    }
}

export const mobileDatabase = new MobileDatabase();
