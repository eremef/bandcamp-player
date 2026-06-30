import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { Track, Album, CacheStats } from '@shared/types';
import { mobileDatabase } from './MobileDatabase';

const CACHE_DIR = FileSystem.documentDirectory + 'audio_cache/';

type ProgressListener = (data: { trackId?: string; albumId?: string; progress: number; total?: number; completed?: number }) => void;
type StatsListener = (stats: CacheStats) => void;

class MobileCacheService {
    private activeDownloads: Map<string, FileSystem.DownloadResumable> = new Map();
    private progressListeners: Set<ProgressListener> = new Set();
    private statsListeners: Set<StatsListener> = new Set();

    constructor() {
        this.init();
    }

    private async init() {
        const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        }
    }

    onProgress(listener: ProgressListener) {
        this.progressListeners.add(listener);
        return () => this.progressListeners.delete(listener);
    }

    onStatsUpdate(listener: StatsListener) {
        this.statsListeners.add(listener);
        return () => this.statsListeners.delete(listener);
    }

    private emitProgress(data: { trackId?: string; albumId?: string; progress: number; total?: number; completed?: number }) {
        this.progressListeners.forEach(listener => listener(data));
    }

    private async emitStatsUpdate() {
        const stats = await this.getStats();
        this.statsListeners.forEach(listener => listener(stats));
    }

    async downloadTrack(track: Track): Promise<void> {
        if (this.activeDownloads.has(track.id)) {
            return;
        }

        const settings = await mobileDatabase.getSettings();
        if (settings.cacheEnabled === false) {
            throw new Error("Caching is disabled");
        }

        if (settings.downloadWifiOnly) {
            const networkState = await Network.getNetworkStateAsync();
            if (networkState.type !== Network.NetworkStateType.WIFI) {
                throw new Error("Wi-Fi is required for downloading");
            }
        }

        if (await this.isCached(track.id)) {
            return;
        }

        if (!track.streamUrl || track.streamUrl.trim() === '') {
            console.warn(`[MobileCacheService] Track ${track.id} has no stream URL, skipping download.`);
            return;
        }

        try {
            await this.ensureCacheSpace();

            const safeId = track.id.replace(/[^a-zA-Z0-9-_]/g, '_');
            const fileUri = CACHE_DIR + `${safeId}.mp3`;

            const downloadResumable = FileSystem.createDownloadResumable(
                track.streamUrl,
                fileUri,
                {},
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesExpectedToWrite > 0
                        ? (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
                        : 0;
                    this.emitProgress({ trackId: track.id, progress });
                }
            );

            this.activeDownloads.set(track.id, downloadResumable);

            const result = await downloadResumable.downloadAsync();

            if (result) {
                const now = new Date().toISOString();
                const fileInfo = await FileSystem.getInfoAsync(result.uri);

                await mobileDatabase.addCacheEntry({
                    trackId: track.id,
                    albumId: track.albumId,
                    filePath: result.uri,
                    fileSize: fileInfo.exists ? fileInfo.size : 0,
                    cachedAt: now,
                    lastAccessedAt: now,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                    trackNumber: track.trackNumber,
                    artworkUrl: track.artworkUrl,
                });

                await this.emitStatsUpdate();
            }
        } catch (error) {
            console.error(`[MobileCacheService] Failed to download track ${track.id}:`, error);
            throw error;
        } finally {
            this.activeDownloads.delete(track.id);
        }
    }

    async cancelDownload(trackId: string): Promise<void> {
        const downloadResumable = this.activeDownloads.get(trackId);
        if (downloadResumable) {
            try {
                await downloadResumable.cancelAsync();
            } catch (e) {
                console.error(`[MobileCacheService] Error cancelling download for ${trackId}:`, e);
            }
            this.activeDownloads.delete(trackId);
        }
    }

    async removeTrack(trackId: string): Promise<void> {
        const entry = await mobileDatabase.getCacheEntry(trackId);
        if (entry) {
            try {
                const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(entry.file_path, { idempotent: true });
                }
            } catch (e) {
                console.error(`[MobileCacheService] Error deleting file for ${trackId}:`, e);
            }
            await mobileDatabase.deleteCacheEntry(trackId);
            await this.emitStatsUpdate();
        }
    }

    async removeAlbum(albumId: string): Promise<void> {
        const entries = await mobileDatabase.getCacheEntriesByAlbum(albumId);
        let updated = false;
        for (const entry of entries) {
            try {
                const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(entry.file_path, { idempotent: true });
                }
            } catch (e) {
                console.error(`[MobileCacheService] Error deleting file for ${entry.track_id}:`, e);
            }
            await mobileDatabase.deleteCacheEntry(entry.track_id);
            updated = true;
        }
        if (updated) {
            await this.emitStatsUpdate();
        }
    }

    async clearCache(): Promise<void> {
        const entries = await mobileDatabase.getAllCacheEntries();
        for (const entry of entries) {
            try {
                const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(entry.file_path, { idempotent: true });
                }
            } catch (e) {
                console.error(`[MobileCacheService] Error deleting file ${entry.file_path}:`, e);
            }
        }
        await mobileDatabase.clearAudioCache();
        await this.emitStatsUpdate();
    }

    async isCached(trackId: string): Promise<boolean> {
        const entry = await mobileDatabase.getCacheEntry(trackId);
        if (!entry) return false;
        const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
        return fileInfo.exists;
    }

    async getCachedUri(trackId: string): Promise<string | null> {
        const entry = await mobileDatabase.getCacheEntry(trackId);
        if (entry) {
            const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
            if (fileInfo.exists) {
                await mobileDatabase.updateCacheAccess(trackId);
                return entry.file_path;
            }
        }
        return null;
    }

    async getStats(): Promise<any> {
        const settings = await mobileDatabase.getSettings();
        const totalSize = await mobileDatabase.getCacheTotalSize();
        const entries = await mobileDatabase.getAllCacheEntries();
        const maxSize = (settings.cacheMaxSizeGb || 2) * 1024 * 1024 * 1024; // Default 2GB

        const cachedTrackIds = new Set<string>();
        const cachedAlbumIds = new Set<string>();

        for (const entry of entries) {
            cachedTrackIds.add(entry.track_id);
            if (entry.album_id) {
                cachedAlbumIds.add(entry.album_id);
            }
        }

        return {
            totalSize,
            trackCount: entries.length,
            maxSize,
            usagePercent: maxSize > 0 ? (totalSize / maxSize) * 100 : 0,
            cachedTrackIds,
            cachedAlbumIds,
        };
    }

    async getCacheStats(): Promise<{ cachedTrackIds: Set<string>, cachedAlbumIds: Set<string> }> {
        const entries = await mobileDatabase.getAllCacheEntries();
        const cachedTrackIds = new Set<string>();
        const cachedAlbumIds = new Set<string>();

        for (const entry of entries) {
            cachedTrackIds.add(entry.track_id);
            if (entry.album_id) {
                // If it has at least one track cached, we consider it partially or fully cached
                // For a more exact match, we would need the album's total tracks count, 
                // but this suffices for the UI indicator for now.
                cachedAlbumIds.add(entry.album_id);
            }
        }

        return { cachedTrackIds, cachedAlbumIds };
    }

    async downloadAlbum(album: Album): Promise<void> {
        const total = album.tracks.length;
        let completed = 0;

        for (const track of album.tracks) {
            try {
                if (!(await this.isCached(track.id))) {
                    await this.downloadTrack(track);
                }
                completed++;
                this.emitProgress({
                    albumId: album.id,
                    trackId: track.id,
                    progress: (completed / total) * 100,
                    total,
                    completed,
                });
            } catch (error) {
                console.error(`[MobileCacheService] Failed to download album track ${track.id}:`, error);
                completed++;
                this.emitProgress({
                    albumId: album.id,
                    trackId: track.id,
                    progress: (completed / total) * 100,
                    total,
                    completed,
                });
            }
        }
    }

    private async ensureCacheSpace(): Promise<void> {
        const settings = await mobileDatabase.getSettings();
        const maxSize = (settings.cacheMaxSizeGb || 2) * 1024 * 1024 * 1024;
        const estimatedTrackSize = 10 * 1024 * 1024; // 10MB

        let currentSize = await mobileDatabase.getCacheTotalSize();

        while (currentSize + estimatedTrackSize > maxSize) {
            const oldest = await mobileDatabase.getOldestCacheEntries(1);
            if (oldest.length === 0) break;

            const entry = oldest[0];
            try {
                const fileInfo = await FileSystem.getInfoAsync(entry.file_path);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(entry.file_path, { idempotent: true });
                }
            } catch (e) {
                console.error(`[MobileCacheService] Failed to delete old cache file ${entry.file_path}:`, e);
            }
            await mobileDatabase.deleteCacheEntry(entry.track_id);
            currentSize = await mobileDatabase.getCacheTotalSize();
        }
    }
}

export const mobileCacheService = new MobileCacheService();
