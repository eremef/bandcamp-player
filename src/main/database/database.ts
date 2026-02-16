import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { AppSettings, Playlist, Track, CacheEntry } from '../../shared/types';

// ============================================================================
// Database Class
// ============================================================================

export class Database {
    private db: BetterSqlite3.Database;

    constructor(dbPath: string) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new BetterSqlite3(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initialize();
    }

    private initialize() {
        // Create tables
        this.db.exec(`
      -- Settings table (key-value store)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Playlists table
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Playlist tracks (join table with ordering)
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL,
        track_data TEXT NOT NULL,
        position INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist 
        ON playlist_tracks(playlist_id, position);

      -- Cached collection (for faster loading)
      CREATE TABLE IF NOT EXISTS collection_cache (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );

      -- Audio file cache metadata
      CREATE TABLE IF NOT EXISTS audio_cache (
        track_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        cached_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );

      -- Scrobble queue (for offline scrobbles)
      CREATE TABLE IF NOT EXISTS scrobble_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT NOT NULL,
        track TEXT NOT NULL,
        album TEXT,
        duration INTEGER,
        timestamp INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

        // Initialize default settings if not exists
        this.initializeDefaultSettings();
    }

    private initializeDefaultSettings() {
        const defaultSettings: AppSettings = {
            cacheEnabled: true,
            cacheMaxSizeGB: 5,
            cacheLocation: '',
            defaultVolume: 0.8,
            crossfadeDuration: 0,
            startMinimized: false,
            minimizeToTray: true,
            showNotifications: true,
            scrobblingEnabled: true,
            scrobbleThreshold: 50,
            remoteEnabled: true,
        };

        const existing = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined;
        if (!existing) {
            this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
                'app_settings',
                JSON.stringify(defaultSettings)
            );
        } else {
            // Force enable remote for debugging/setup if it was disabled
            const current = JSON.parse(existing.value);
            if (!current.remoteEnabled) {
                current.remoteEnabled = true;
                this.db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
                    JSON.stringify(current),
                    'app_settings'
                );
            }
        }
    }

    // ---- Settings ----

    getSettings(): AppSettings | null {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined;
        return row ? JSON.parse(row.value) : null;
    }

    setSettings(settings: Partial<AppSettings>): AppSettings {
        const current = this.getSettings() || {} as AppSettings;
        const updated = { ...current, ...settings };
        this.db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
            JSON.stringify(updated),
            'app_settings'
        );
        return updated;
    }

    // ---- Playlists ----

    getAllPlaylists(): Playlist[] {
        const rows = this.db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = p.id) as track_count,
        (SELECT SUM(json_extract(track_data, '$.duration')) FROM playlist_tracks WHERE playlist_id = p.id) as total_duration,
        (SELECT json_extract(track_data, '$.artworkUrl') FROM playlist_tracks WHERE playlist_id = p.id ORDER BY position ASC LIMIT 1) as artwork_url
      FROM playlists p
      ORDER BY p.updated_at DESC
    `).all() as Array<{
            id: string;
            name: string;
            description: string | null;
            created_at: string;
            updated_at: string;
            track_count: number;
            total_duration: number;
            artwork_url: string | null;
        }>;

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            tracks: [],
            trackCount: row.track_count,
            totalDuration: row.total_duration || 0,
            artworkUrl: row.artwork_url || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    getPlaylistById(id: string): Playlist | null {
        const playlistRow = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as {
            id: string;
            name: string;
            description: string | null;
            created_at: string;
            updated_at: string;
        } | undefined;

        if (!playlistRow) return null;

        const trackRows = this.db.prepare(`
      SELECT id, track_data FROM playlist_tracks 
      WHERE playlist_id = ? 
      ORDER BY position
    `).all(id) as Array<{ id: string; track_data: string }>;

        const tracks: Track[] = trackRows.map(row => {
            const track = JSON.parse(row.track_data);
            track.playlistEntryId = row.id;
            return track;
        });
        const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

        return {
            id: playlistRow.id,
            name: playlistRow.name,
            description: playlistRow.description || undefined,
            tracks,
            trackCount: tracks.length,
            totalDuration,
            artworkUrl: tracks[0]?.artworkUrl,
            createdAt: playlistRow.created_at,
            updatedAt: playlistRow.updated_at,
        };
    }

    createPlaylist(id: string, name: string, description?: string): Playlist {
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO playlists (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description || null, now, now);

        return {
            id,
            name,
            description,
            tracks: [],
            trackCount: 0,
            totalDuration: 0,
            createdAt: now,
            updatedAt: now,
        };
    }

    updatePlaylist(id: string, name?: string, description?: string): void {
        const now = new Date().toISOString();
        const sets: string[] = ['updated_at = ?'];
        const params: any[] = [now];

        if (name !== undefined) {
            sets.push('name = ?');
            params.push(name);
        }
        if (description !== undefined) {
            sets.push('description = ?');
            params.push(description);
        }

        params.push(id);
        const sql = `UPDATE playlists SET ${sets.join(', ')} WHERE id = ?`;

        // console.log(`[Database] Updating playlist ${id}: name=${name}, description=${description}`);
        const result = this.db.prepare(sql).run(...params);

        if (result.changes === 0) {
            console.warn(`[Database] No playlist found with ID ${id} to update`);
        }
    }

    deletePlaylist(id: string): void {
        this.db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    }

    addTrackToPlaylist(playlistId: string, trackId: string, track: Track): void {
        const now = new Date().toISOString();
        const maxPos = this.db.prepare(
            'SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?'
        ).get(playlistId) as { max: number | null };

        const position = (maxPos.max ?? -1) + 1;

        this.db.prepare(`
      INSERT INTO playlist_tracks (id, playlist_id, track_data, position, added_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(trackId, playlistId, JSON.stringify(track), position, now);

        this.db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);
    }

    addTracksToPlaylist(playlistId: string, tracks: Track[]): void {
        if (tracks.length === 0) return;

        const now = new Date().toISOString();

        // Get current max position
        const maxPos = this.db.prepare(
            'SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?'
        ).get(playlistId) as { max: number | null };

        let currentPos = (maxPos.max ?? -1) + 1;

        const insertStmt = this.db.prepare(`
            INSERT INTO playlist_tracks (id, playlist_id, track_data, position, added_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        // Use transaction for bulk insert
        const transaction = this.db.transaction(() => {
            for (const track of tracks) {
                // Generate a unique ID for the playlist item
                const trackId = `${playlistId}-${track.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                insertStmt.run(trackId, playlistId, JSON.stringify(track), currentPos++, now);
            }

            // Update playlist timestamp
            this.db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);
        });

        transaction();
    }

    removeTrackFromPlaylist(playlistId: string, trackId: string): void {
        const now = new Date().toISOString();
        this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND id = ?').run(playlistId, trackId);
        this.db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);
    }

    reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number): void {
        const tracks = this.db.prepare(`
      SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position
    `).all(playlistId) as Array<{ id: string }>;

        const [moved] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, moved);

        const updateStmt = this.db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?');
        const transaction = this.db.transaction(() => {
            tracks.forEach((track, index) => {
                updateStmt.run(index, track.id);
            });
        });
        transaction();
    }

    // ---- Audio Cache ----

    getCacheEntry(trackId: string): CacheEntry | null {
        const row = this.db.prepare('SELECT * FROM audio_cache WHERE track_id = ?').get(trackId) as {
            track_id: string;
            file_path: string;
            file_size: number;
            cached_at: string;
            last_accessed_at: string;
        } | undefined;

        if (!row) return null;

        return {
            trackId: row.track_id,
            filePath: row.file_path,
            fileSize: row.file_size,
            cachedAt: row.cached_at,
            lastAccessedAt: row.last_accessed_at,
        };
    }

    addCacheEntry(entry: CacheEntry): void {
        this.db.prepare(`
      INSERT OR REPLACE INTO audio_cache (track_id, file_path, file_size, cached_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(entry.trackId, entry.filePath, entry.fileSize, entry.cachedAt, entry.lastAccessedAt);
    }

    updateCacheAccess(trackId: string): void {
        const now = new Date().toISOString();
        this.db.prepare('UPDATE audio_cache SET last_accessed_at = ? WHERE track_id = ?').run(now, trackId);
    }

    deleteCacheEntry(trackId: string): void {
        this.db.prepare('DELETE FROM audio_cache WHERE track_id = ?').run(trackId);
    }

    getAllCacheEntries(): CacheEntry[] {
        const rows = this.db.prepare('SELECT * FROM audio_cache ORDER BY last_accessed_at DESC').all() as Array<{
            track_id: string;
            file_path: string;
            file_size: number;
            cached_at: string;
            last_accessed_at: string;
        }>;

        return rows.map(row => ({
            trackId: row.track_id,
            filePath: row.file_path,
            fileSize: row.file_size,
            cachedAt: row.cached_at,
            lastAccessedAt: row.last_accessed_at,
        }));
    }

    getCacheTotalSize(): number {
        const result = this.db.prepare('SELECT SUM(file_size) as total FROM audio_cache').get() as { total: number | null };
        return result.total || 0;
    }

    getOldestCacheEntries(count: number): CacheEntry[] {
        const rows = this.db.prepare(`
      SELECT * FROM audio_cache ORDER BY last_accessed_at ASC LIMIT ?
    `).all(count) as Array<{
            track_id: string;
            file_path: string;
            file_size: number;
            cached_at: string;
            last_accessed_at: string;
        }>;

        return rows.map(row => ({
            trackId: row.track_id,
            filePath: row.file_path,
            fileSize: row.file_size,
            cachedAt: row.cached_at,
            lastAccessedAt: row.last_accessed_at,
        }));
    }

    clearCache(): void {
        this.db.prepare('DELETE FROM audio_cache').run();
    }

    // ---- Scrobble Queue ----

    addScrobble(artist: string, track: string, album?: string, duration?: number, timestamp?: number): void {
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO scrobble_queue (artist, track, album, duration, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(artist, track, album || null, duration || null, timestamp || Math.floor(Date.now() / 1000), now);
    }

    getPendingScrobbles(): Array<{ id: number; artist: string; track: string; album: string | null; duration: number | null; timestamp: number }> {
        return this.db.prepare('SELECT * FROM scrobble_queue ORDER BY timestamp ASC').all() as Array<{
            id: number;
            artist: string;
            track: string;
            album: string | null;
            duration: number | null;
            timestamp: number;
        }>;
    }

    deleteScrobble(id: number): void {
        this.db.prepare('DELETE FROM scrobble_queue WHERE id = ?').run(id);
    }

    // ---- Collection Cache ----

    getCollectionCache(id: string): { data: any, cachedAt: string } | null {
        const row = this.db.prepare('SELECT data, cached_at FROM collection_cache WHERE id = ?').get(id) as { data: string, cached_at: string } | undefined;
        return row ? { data: JSON.parse(row.data), cachedAt: row.cached_at } : null;
    }

    saveCollectionCache(id: string, type: string, data: any): void {
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT OR REPLACE INTO collection_cache (id, type, data, cached_at)
      VALUES (?, ?, ?, ?)
    `).run(id, type, JSON.stringify(data), now);
    }

    clearCollectionCache(id: string): void {
        this.db.prepare('DELETE FROM collection_cache WHERE id = ?').run(id);
    }

    // ---- Cleanup ----

    close(): void {
        this.db.close();
    }
}
