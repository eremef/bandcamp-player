import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheService } from './cache.service';
import { Database } from '../database/database';
import * as fs from 'fs';
import { Track } from '../../shared/types';

// Mock dependencies
vi.mock('axios');
vi.mock('../database/database');
vi.mock('fs', () => {
    return {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        createWriteStream: vi.fn(),
        unlinkSync: vi.fn(),
        renameSync: vi.fn(),
        statSync: vi.fn(),
        default: {
            existsSync: vi.fn(),
            mkdirSync: vi.fn(),
            createWriteStream: vi.fn(),
            unlinkSync: vi.fn(),
            renameSync: vi.fn(),
            statSync: vi.fn(),
        }
    };
});

describe('CacheService', () => {
    let cacheService: CacheService;
    let mockDatabase: any;
    const mockCacheDir = '/mock/cache/dir';

    beforeEach(() => {
        // Setup mocks
        mockDatabase = {
            getSettings: vi.fn().mockReturnValue({ cacheEnabled: true, cacheMaxSizeGB: 1 }),
            getCacheEntry: vi.fn(),
            addCacheEntry: vi.fn(),
            deleteCacheEntry: vi.fn(),
            getAllCacheEntries: vi.fn().mockReturnValue([]),
            getCacheTotalSize: vi.fn().mockReturnValue(0),
            updateCacheAccess: vi.fn(),
            clearCache: vi.fn(),
        };

        // Mock fs default behaviors
        (fs.existsSync as any).mockReturnValue(false);
        (fs.mkdirSync as any).mockImplementation(() => { });

        cacheService = new CacheService(mockDatabase as unknown as Database, mockCacheDir);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should create cache directory if it does not exist', () => {
            expect(fs.existsSync).toHaveBeenCalledWith(mockCacheDir);
            expect(fs.mkdirSync).toHaveBeenCalledWith(mockCacheDir, { recursive: true });
        });
    });

    describe('Cache Management', () => {
        it('should return true if track is cached and file exists', () => {
            const trackId = '1';
            const mockEntry = { trackId, filePath: '/path/to/file.mp3' };

            mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
            (fs.existsSync as any).mockReturnValue(true);

            expect(cacheService.isCached(trackId)).toBe(true);
        });

        it('should return false if track is in DB but file missing', () => {
            const trackId = '1';
            const mockEntry = { trackId, filePath: '/path/to/file.mp3' };

            mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
            (fs.existsSync as any).mockReturnValue(false);

            expect(cacheService.isCached(trackId)).toBe(false);
        });

        it('should return cached path if valid', () => {
            const trackId = '1';
            const mockEntry = { trackId, filePath: '/path/to/file.mp3' };

            mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
            (fs.existsSync as any).mockReturnValue(true);

            const path = cacheService.getCachedPath(trackId);
            expect(path).toBe(mockEntry.filePath);
            expect(mockDatabase.updateCacheAccess).toHaveBeenCalledWith(trackId);
        });

        it('should delete track from cache', () => {
            const trackId = '1';
            const mockEntry = { trackId, filePath: '/path/to/file.mp3' };

            mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
            (fs.existsSync as any).mockReturnValue(true);
            (fs.unlinkSync as any).mockImplementation(() => { });

            cacheService.deleteTrack(trackId);

            expect(fs.unlinkSync).toHaveBeenCalledWith(mockEntry.filePath);
            expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledWith(trackId);
        });

        it('should clear entire cache', () => {
            const mockEntries = [
                { trackId: '1', filePath: '/file1.mp3' },
                { trackId: '2', filePath: '/file2.mp3' }
            ];
            mockDatabase.getAllCacheEntries.mockReturnValue(mockEntries);
            (fs.existsSync as any).mockReturnValue(true);
            (fs.unlinkSync as any).mockImplementation(() => { });

            cacheService.clearCache();

            expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
            expect(mockDatabase.clearCache).toHaveBeenCalled();
        });
    });

    describe('Stats', () => {
        it('should return cache stats', () => {
            mockDatabase.getCacheTotalSize.mockReturnValue(1024 * 1024 * 100); // 100MB
            mockDatabase.getAllCacheEntries.mockReturnValue([{}, {}]); // 2 items

            const stats = cacheService.getStats();
            expect(stats.totalSize).toBe(1024 * 1024 * 100);
            expect(stats.trackCount).toBe(2);
            expect(stats.maxSize).toBe(1 * 1024 * 1024 * 1024); // 1GB
            expect(stats.usagePercent).toBeCloseTo(9.76, 1); // ~10%
        });
    });
});
