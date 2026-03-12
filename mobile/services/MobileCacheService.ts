import { File, Directory, Paths } from 'expo-file-system';
import { mobileDatabase } from './MobileDatabase';

export interface Track {
    id: string;
    title: string;
    artist?: string;
    album?: string;
    albumId?: string;
    streamUrl: string;
    artworkUrl?: string;
    duration?: number;
}

interface CacheProgress {
    trackId: string;
    bytesWritten: number;
    totalBytes: number;
    progress: number;
}

const getAudioDirectory = (): Directory => {
    return new Directory(Paths.document, 'audio');
};

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024 * 1024;

export class MobileCacheService {
    maxSizeBytes: number;
    activeDownloads: Map<string, AbortController>;

    constructor(maxSizeBytes: number = DEFAULT_MAX_SIZE) {
        this.maxSizeBytes = maxSizeBytes;
        this.activeDownloads = new Map();
    }

    private getExtension(url: string): string {
        try {
            const pathname = new URL(url).pathname;
            const lastDot = pathname.lastIndexOf('.');
            if (lastDot > 0) {
                return pathname.slice(lastDot);
            }
        } catch {
            // URL parsing failed, use default
        }
        return '.mp3';
    }

    private getFile(trackId: string, ext: string): File {
        return new File(getAudioDirectory(), `${trackId}${ext}`);
    }

    private async ensureDirectory(): Promise<void> {
        const audioDir = getAudioDirectory();
        if (!audioDir.exists) {
            audioDir.create();
        }
    }

    async downloadTrack(track: Track, onProgress?: (progress: CacheProgress) => void): Promise<void> {
        await this.ensureDirectory();

        const ext = this.getExtension(track.streamUrl);
        const destFile = this.getFile(track.id, ext);

        const existingEntry = await mobileDatabase.getAudioCacheEntry(track.id);
        if (existingEntry) {
            await mobileDatabase.updateLastAccessed(track.id);
            return;
        }

        const controller = new AbortController();
        this.activeDownloads.set(track.id, controller);

        try {
            const downloadedFile = await File.downloadFileAsync(track.streamUrl, destFile);

            const fileSize = downloadedFile.size;

            await mobileDatabase.addToAudioCache(
                track.id,
                track.albumId ?? null,
                downloadedFile.uri,
                fileSize
            );

            onProgress?.({
                trackId: track.id,
                bytesWritten: fileSize,
                totalBytes: fileSize,
                progress: 1,
            });
        } finally {
            this.activeDownloads.delete(track.id);
        }
    }

    async downloadAlbum(tracks: Track[], onProgress?: (progress: CacheProgress) => void): Promise<void> {
        const results = await Promise.allSettled(
            tracks.map(track => this.downloadTrack(track, onProgress))
        );

        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`[MobileCacheService] Failed to download ${failed.length} tracks from album`);
        }
    }

    async deleteTrack(trackId: string): Promise<void> {
        const entry = await mobileDatabase.getAudioCacheEntry(trackId);
        if (!entry) {
            return;
        }

        try {
            const file = new File(entry.filePath);
            if (file.exists) {
                file.delete();
            }
        } catch (e) {
            console.warn(`[MobileCacheService] Failed to delete file: ${entry.filePath}`, e);
        }

        await mobileDatabase.removeFromAudioCache(trackId);
    }

    async deleteAlbum(albumId: string): Promise<void> {
        const entries = await mobileDatabase.getAllAudioCacheEntries();
        const albumEntries = entries.filter(e => e.albumId === albumId);

        await Promise.all(
            albumEntries.map(e => this.deleteTrack(e.trackId))
        );
    }

    async clearCache(): Promise<void> {
        try {
            const audioDir = getAudioDirectory();
            if (audioDir.exists) {
                audioDir.delete();
            }
        } catch (e) {
            console.warn('[MobileCacheService] Failed to clear audio directory', e);
        }

        await mobileDatabase.clearAudioCache();
    }

    async getCacheStatus(trackId: string): Promise<boolean> {
        const entry = await mobileDatabase.getAudioCacheEntry(trackId);
        if (!entry) return false;

        const file = new File(entry.filePath);
        if (!file.exists) {
            await mobileDatabase.removeFromAudioCache(trackId);
            return false;
        }

        return true;
    }

    async getCacheSize(): Promise<number> {
        return await mobileDatabase.getAudioCacheTotalSize();
    }

    async ensureCacheSpace(requiredBytes: number): Promise<void> {
        const currentSize = await this.getCacheSize();
        if (currentSize + requiredBytes <= this.maxSizeBytes) {
            return;
        }

        const bytesToFree = (currentSize + requiredBytes) - this.maxSizeBytes;
        let bytesFreed = 0;

        const entries = await mobileDatabase.getOldestCacheEntries(100);

        for (const entry of entries) {
            if (bytesFreed >= bytesToFree) break;

            await this.deleteTrack(entry.trackId);
            bytesFreed += entry.fileSize;
        }
    }

    async getCachedTrackIds(): Promise<Set<string>> {
        const entries = await mobileDatabase.getAllAudioCacheEntries();
        return new Set(entries.map(e => e.trackId));
    }

    async getCacheEntry(trackId: string): Promise<{ trackId: string; albumId: string | null; filePath: string; fileSize: number } | null> {
        return await mobileDatabase.getAudioCacheEntry(trackId);
    }

    async updateLastAccessed(trackId: string): Promise<void> {
        await mobileDatabase.updateLastAccessed(trackId);
    }
}

export const mobileCacheService = new MobileCacheService();
