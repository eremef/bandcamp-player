import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { EventEmitter } from 'events';
import { Database } from '../database/database';
import type { Track, CacheStats } from '../../shared/types';

// ============================================================================
// Cache Service
// ============================================================================

export class CacheService extends EventEmitter {
    private database: Database;
    private cacheDir: string;
    private activeDownloads: Map<string, AbortController> = new Map();

    constructor(database: Database, cacheDir: string) {
        super();
        this.database = database;
        this.cacheDir = cacheDir;

        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Download and cache a track
     */
    async downloadTrack(track: Track): Promise<void> {
        if (this.activeDownloads.has(track.id)) {
            return; // Already downloading
        }

        const settings = this.database.getSettings();
        if (!settings?.cacheEnabled) {
            throw new Error('Caching is disabled');
        }

        // Check if already cached
        if (this.isCached(track.id)) {
            return;
        }

        const controller = new AbortController();
        this.activeDownloads.set(track.id, controller);

        try {
            // Ensure we have space
            await this.ensureCacheSpace(track);

            const filePath = this.getTrackFilePath(track.id);
            const tempPath = `${filePath}.tmp`;

            const response = await axios({
                method: 'get',
                url: track.streamUrl,
                responseType: 'stream',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            const totalLength = parseInt(response.headers['content-length'] || '0');
            let downloadedLength = 0;

            const writer = fs.createWriteStream(tempPath);

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk: Buffer) => {
                    downloadedLength += chunk.length;
                    const progress = totalLength > 0 ? (downloadedLength / totalLength) * 100 : 0;
                    this.emit('download-progress', { trackId: track.id, progress });
                });

                response.data.on('error', (error: Error) => {
                    fs.unlinkSync(tempPath);
                    reject(error);
                });

                writer.on('finish', () => {
                    // Rename temp file to final
                    fs.renameSync(tempPath, filePath);

                    // Get file size
                    const stats = fs.statSync(filePath);

                    // Save to database
                    const now = new Date().toISOString();
                    this.database.addCacheEntry({
                        trackId: track.id,
                        filePath,
                        fileSize: stats.size,
                        cachedAt: now,
                        lastAccessedAt: now,
                    });

                    this.activeDownloads.delete(track.id);
                    this.emitStatsUpdate();
                    resolve();
                });

                writer.on('error', (error) => {
                    if (fs.existsSync(tempPath)) {
                        fs.unlinkSync(tempPath);
                    }
                    reject(error);
                });

                response.data.pipe(writer);
            });
        } catch (error) {
            this.activeDownloads.delete(track.id);
            throw error;
        }
    }

    /**
     * Cancel an active download
     */
    cancelDownload(trackId: string): void {
        const controller = this.activeDownloads.get(trackId);
        if (controller) {
            controller.abort();
            this.activeDownloads.delete(trackId);
        }
    }

    /**
     * Delete a cached track
     */
    deleteTrack(trackId: string): void {
        const entry = this.database.getCacheEntry(trackId);
        if (entry && fs.existsSync(entry.filePath)) {
            fs.unlinkSync(entry.filePath);
        }
        this.database.deleteCacheEntry(trackId);
        this.emitStatsUpdate();
    }

    /**
     * Clear entire cache
     */
    clearCache(): void {
        const entries = this.database.getAllCacheEntries();
        for (const entry of entries) {
            if (fs.existsSync(entry.filePath)) {
                fs.unlinkSync(entry.filePath);
            }
        }
        this.database.clearCache();
        this.emitStatsUpdate();
    }

    /**
     * Check if a track is cached
     */
    isCached(trackId: string): boolean {
        const entry = this.database.getCacheEntry(trackId);
        return entry !== null && fs.existsSync(entry.filePath);
    }

    /**
     * Get cached file path
     */
    getCachedPath(trackId: string): string | null {
        const entry = this.database.getCacheEntry(trackId);
        if (entry && fs.existsSync(entry.filePath)) {
            // Update last accessed time
            this.database.updateCacheAccess(trackId);
            return entry.filePath;
        }
        return null;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const settings = this.database.getSettings();
        const totalSize = this.database.getCacheTotalSize();
        const entries = this.database.getAllCacheEntries();
        const maxSize = (settings?.cacheMaxSizeGB || 5) * 1024 * 1024 * 1024; // GB to bytes

        return {
            totalSize,
            trackCount: entries.length,
            maxSize,
            usagePercent: maxSize > 0 ? (totalSize / maxSize) * 100 : 0,
        };
    }

    /**
     * Get all cached tracks (with track data)
     */
    getCachedTracks(): Track[] {
        // Note: This would need track metadata to be stored
        // For now, return track IDs that are cached
        const entries = this.database.getAllCacheEntries();
        return entries.map(entry => ({
            id: entry.trackId,
            title: '',
            artist: '',
            album: '',
            duration: 0,
            artworkUrl: '',
            streamUrl: '',
            bandcampUrl: '',
            isCached: true,
            cachedPath: entry.filePath,
        }));
    }

    // ---- Private Helpers ----

    private getTrackFilePath(trackId: string): string {
        // Sanitize trackId for filename
        const safeId = trackId.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.cacheDir, `${safeId}.mp3`);
    }

    private async ensureCacheSpace(_track: Track): Promise<void> {
        const settings = this.database.getSettings();
        const maxSize = (settings?.cacheMaxSizeGB || 5) * 1024 * 1024 * 1024;
        const estimatedTrackSize = 10 * 1024 * 1024; // Estimate 10MB per track

        let currentSize = this.database.getCacheTotalSize();

        // If we're at capacity, remove oldest entries
        while (currentSize + estimatedTrackSize > maxSize) {
            const oldest = this.database.getOldestCacheEntries(1);
            if (oldest.length === 0) break;

            const entry = oldest[0];
            if (fs.existsSync(entry.filePath)) {
                fs.unlinkSync(entry.filePath);
            }
            this.database.deleteCacheEntry(entry.trackId);
            currentSize = this.database.getCacheTotalSize();
        }
    }

    private emitStatsUpdate(): void {
        this.emit('stats-updated', this.getStats());
    }
}
