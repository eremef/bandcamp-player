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

            CREATE TABLE IF NOT EXISTS collection_items (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                token TEXT,
                purchase_date TEXT,
                user_id TEXT NOT NULL,
                position INTEGER
            );

            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist_id TEXT,
                artist_name TEXT,
                artwork_url TEXT,
                bandcamp_url TEXT,
                track_count INTEGER
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist_id TEXT,
                artist_name TEXT,
                album_id TEXT,
                album_title TEXT,
                artwork_url TEXT,
                stream_url TEXT,
                duration INTEGER,
                bandcamp_url TEXT
            );

            -- FTS5 Virtual Table for searching
            CREATE VIRTUAL TABLE IF NOT EXISTS collection_search_fts USING fts5(
                id UNINDEXED,
                title,
                artist
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            
            -- ... rest of playlists and other tables ...
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

            CREATE TABLE IF NOT EXISTS scrobble_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist TEXT NOT NULL,
                track TEXT NOT NULL,
                album TEXT,
                duration REAL,
                timestamp INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Migration for existing users: add position column if missing
        try {
            const tableInfo = await this.db.getAllAsync<any>("PRAGMA table_info(collection_items)");
            const hasPosition = tableInfo.some(col => col.name === 'position');
            if (!hasPosition) {
                console.log('[MobileDatabase] Migrating: Adding position column to collection_items');
                await this.db.execAsync("ALTER TABLE collection_items ADD COLUMN position INTEGER");
            }
        } catch (e) {
            console.error('[MobileDatabase] Migration failed:', e);
        }

        // Migration for FTS5: Drop and recreate if it was incorrectly created with external content
        try {
            const ftsInfo = await this.db.getAllAsync<any>("SELECT sql FROM sqlite_master WHERE name='collection_search_fts'");
            if (ftsInfo.length > 0 && ftsInfo[0].sql.includes("content='collection_items'")) {
                console.log('[MobileDatabase] Migrating: Recreating broken FTS5 table');
                await this.db.execAsync("DROP TABLE collection_search_fts");
                await this.db.execAsync(`
                    CREATE VIRTUAL TABLE collection_search_fts USING fts5(
                        id UNINDEXED,
                        title,
                        artist
                    )
                `);
            }
        } catch (e) {
            console.error('[MobileDatabase] FTS Migration failed:', e);
        }
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

    async saveCollectionGranular(userId: string, items: CollectionItem[], onProgress?: (msg: string) => void) {
        if (!this.db) await this.init();

        const totalItems = items.length;
        const BATCH_SIZE = 100; // Multi-row inserts of 100 items at a time

        await this.db!.withTransactionAsync(async () => {
            onProgress?.(`Clearing old collection search index...`);
            await this.db!.runAsync(
                'DELETE FROM collection_search_fts WHERE id IN (SELECT id FROM collection_items WHERE user_id = ?)',
                [userId]
            );

            onProgress?.(`Cleaning collection records...`);
            await this.db!.runAsync('DELETE FROM collection_items WHERE user_id = ?', [userId]);

            onProgress?.(`Consolidating in bulk...`);

            let position = 0;
            for (let i = 0; i < totalItems; i += BATCH_SIZE) {
                const batch = items.slice(i, i + BATCH_SIZE);
                onProgress?.(`Consolidating items: ${Math.min(i + BATCH_SIZE, totalItems)}/${totalItems}`);

                // 1. Bulk Insert collection_items
                const itemPlaceholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                const itemParams = batch.flatMap(item => [item.id, item.type, item.token ?? null, item.purchaseDate ?? null, userId, position++]);
                await this.db!.runAsync(`INSERT INTO collection_items (id, type, token, purchase_date, user_id, position) VALUES ${itemPlaceholders}`, itemParams);

                // 2. Bulk Insert albums
                const albums = batch.filter(it => it.type === 'album' && it.album).map(it => it.album!);
                if (albums.length > 0) {
                    const albumPlaceholders = albums.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
                    const albumParams = albums.flatMap(a => [a.id, a.title, a.artistId ?? null, a.artist, a.artworkUrl ?? null, a.bandcampUrl ?? null, a.trackCount ?? 0]);
                    await this.db!.runAsync(`INSERT OR REPLACE INTO albums (id, title, artist_id, artist_name, artwork_url, bandcamp_url, track_count) VALUES ${albumPlaceholders}`, albumParams);
                }

                // 3. Bulk Insert tracks
                const tracks = batch.filter(it => it.type === 'track' && it.track).map(it => it.track!);
                if (tracks.length > 0) {
                    const trackPlaceholders = tracks.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                    const trackParams = tracks.flatMap(t => [t.id, t.title, t.artistId ?? null, t.artist, t.albumId ?? null, t.album ?? null, t.artworkUrl ?? null, t.streamUrl ?? null, t.duration ?? 0, t.bandcampUrl ?? null]);
                    await this.db!.runAsync(`INSERT OR REPLACE INTO tracks (id, title, artist_id, artist_name, album_id, album_title, artwork_url, stream_url, duration, bandcamp_url) VALUES ${trackPlaceholders}`, trackParams);
                }

                // 4. Bulk Insert FTS
                const ftsItems = batch.map(it => ({ id: it.id, title: it.type === 'album' ? it.album?.title : it.track?.title, artist: it.type === 'album' ? it.album?.artist : it.track?.artist }));
                const ftsPlaceholders = ftsItems.map(() => '(?, ?, ?)').join(', ');
                const ftsParams = ftsItems.flatMap(f => [f.id, f.title ?? 'Untitled', f.artist ?? 'Unknown Artist']);
                await this.db!.runAsync(`INSERT INTO collection_search_fts (id, title, artist) VALUES ${ftsPlaceholders}`, ftsParams);
            }
        });
    }

    async getCollectionGranular(userId: string, offset: number = 0, limit: number = 50, query?: string): Promise<CollectionItem[]> {
        if (!this.db) await this.init();

        let sql = '';
        let params: any[] = [];

        if (query) {
            // Use FTS5 search
            sql = `
                SELECT ci.*, a.title as a_title, a.artist_name as a_artist, a.artwork_url as a_art, a.bandcamp_url as a_url, a.track_count as a_count, a.artist_id as a_aid,
                       t.title as t_title, t.artist_name as t_artist, t.artwork_url as t_art, t.stream_url as t_stream, t.duration as t_dur, t.bandcamp_url as t_url, t.album_title as t_album, t.artist_id as t_aid, t.album_id as t_alid
                FROM collection_items ci
                JOIN collection_search_fts fts ON ci.id = fts.id
                LEFT JOIN albums a ON ci.id = a.id AND ci.type = 'album'
                LEFT JOIN tracks t ON ci.id = t.id AND ci.type = 'track'
                WHERE ci.user_id = ? AND collection_search_fts MATCH ?
                ORDER BY ci.position ASC
                LIMIT ? OFFSET ?
            `;
            params = [userId, `${query}*`, limit, offset];
        } else {
            sql = `
                SELECT ci.*, a.title as a_title, a.artist_name as a_artist, a.artwork_url as a_art, a.bandcamp_url as a_url, a.track_count as a_count, a.artist_id as a_aid,
                       t.title as t_title, t.artist_name as t_artist, t.artwork_url as t_art, t.stream_url as t_stream, t.duration as t_dur, t.bandcamp_url as t_url, t.album_title as t_album, t.artist_id as t_aid, t.album_id as t_alid
                FROM collection_items ci
                LEFT JOIN albums a ON ci.id = a.id AND ci.type = 'album'
                LEFT JOIN tracks t ON ci.id = t.id AND ci.type = 'track'
                WHERE ci.user_id = ?
                ORDER BY ci.position ASC
                LIMIT ? OFFSET ?
            `;
            params = [userId, limit, offset];
        }

        const rows = await this.db!.getAllAsync<any>(sql, params);

        return rows.map(row => {
            if (row.type === 'album') {
                return {
                    id: row.id,
                    type: 'album',
                    token: row.token,
                    purchaseDate: row.purchase_date,
                    album: {
                        id: row.id,
                        title: row.a_title,
                        artist: row.a_artist,
                        artistId: row.a_aid,
                        artworkUrl: row.a_art,
                        bandcampUrl: row.a_url,
                        trackCount: row.a_count,
                        tracks: []
                    }
                };
            } else {
                return {
                    id: row.id,
                    type: 'track',
                    token: row.token,
                    purchaseDate: row.purchase_date,
                    track: {
                        id: row.id,
                        title: row.t_title,
                        artist: row.t_artist,
                        artistId: row.t_aid,
                        album: row.t_album,
                        albumId: row.t_alid,
                        duration: row.t_dur,
                        artworkUrl: row.t_art,
                        streamUrl: row.t_stream,
                        bandcampUrl: row.t_url,
                        isCached: false
                    }
                };
            }
        });
    }

    async getCollectionTotalCount(userId: string, query?: string): Promise<number> {
        if (!this.db) await this.init();

        if (query) {
            const result = await this.db!.getFirstAsync<{ count: number }>(
                'SELECT COUNT(*) as count FROM collection_items ci JOIN collection_search_fts fts ON ci.id = fts.id WHERE ci.user_id = ? AND collection_search_fts MATCH ?',
                [userId, `${query}*`]
            );
            return result?.count ?? 0;
        } else {
            const result = await this.db!.getFirstAsync<{ count: number }>(
                'SELECT COUNT(*) as count FROM collection_items WHERE user_id = ?',
                [userId]
            );
            return result?.count ?? 0;
        }
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
        const id = this.generateUUID();
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
        const id = this.generateUUID();
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

    // --- Scrobble Queue ---

    async addScrobble(artist: string, track: string, album: string | undefined, duration: number | undefined, timestamp: number) {
        if (!this.db) await this.init();
        await this.db!.runAsync(
            'INSERT INTO scrobble_queue (artist, track, album, duration, timestamp) VALUES (?, ?, ?, ?, ?)',
            [artist, track, album ?? null, duration ?? null, timestamp]
        );
    }

    async getPendingScrobbles(): Promise<{ id: number; artist: string; track: string; album: string | null; duration: number | null; timestamp: number }[]> {
        if (!this.db) await this.init();
        return await this.db!.getAllAsync(
            'SELECT * FROM scrobble_queue ORDER BY timestamp ASC'
        );
    }

    async deleteScrobble(id: number) {
        if (!this.db) await this.init();
        await this.db!.runAsync('DELETE FROM scrobble_queue WHERE id = ?', [id]);
    }

    private generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
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

                const BATCH_SIZE = 200;
                let inserted = 0;

                for (let i = 0; i < artists.length; i += BATCH_SIZE) {
                    const batch = artists.slice(i, i + BATCH_SIZE);
                    const placeholders = batch.map(() => '(?, ?, ?, ?, 0)').join(', ');
                    const params = batch.flatMap(a => [a.id, a.name, a.url, a.image_url ?? null]);
                    await this.db!.runAsync(`INSERT OR REPLACE INTO artists (id, name, url, image_url, is_simulated) VALUES ${placeholders}`, params);
                    inserted += batch.length;
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
