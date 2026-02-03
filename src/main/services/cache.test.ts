import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheService } from './cache.service';
import { Database } from '../database/database';
import * as fs from 'fs';
import axios from 'axios';
import { EventEmitter } from 'events';
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
            getCacheEntry: vi.fn().mockReturnValue(null),
            addCacheEntry: vi.fn(),
            deleteCacheEntry: vi.fn(),
            getAllCacheEntries: vi.fn().mockReturnValue([]),
            getCacheTotalSize: vi.fn().mockReturnValue(0),
            getOldestCacheEntries: vi.fn().mockReturnValue([]),
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

    describe('Download', () => {
        const mockTrack: Track = {
            id: '123',
            title: 'Test Track',
            artist: 'Test Artist',
            streamUrl: 'http://example.com/stream.mp3',
            duration: 100,
            album: 'Test Album',
            artworkUrl: 'http://example.com/art.jpg',
            bandcampUrl: 'http://test.bandcamp.com/track/test'
        };

        it('should not download if caching is disabled', async () => {
            mockDatabase.getSettings.mockReturnValue({ cacheEnabled: false });
            await expect(cacheService.downloadTrack(mockTrack)).rejects.toThrow('Caching is disabled');
        });

        it('should not download if already cached', async () => {
            mockDatabase.getCacheEntry.mockReturnValue({ trackId: '123', filePath: 'some/path' });
            (fs.existsSync as any).mockReturnValue(true);
            
            await cacheService.downloadTrack(mockTrack);
            expect(axios).not.toHaveBeenCalled();
        });

        it('should successfully download a track', async () => {
            const mockStream = new EventEmitter();
            (mockStream as any).pipe = vi.fn();
            const mockWriter = new EventEmitter();
            (mockWriter as any).path = '/mock/cache/dir/123.mp3.tmp';
            
            (axios as any).mockResolvedValue({
                data: mockStream,
                headers: { 'content-length': '100' }
            });
            (fs.createWriteStream as any).mockReturnValue(mockWriter);
            (fs.statSync as any).mockReturnValue({ size: 100 });
            (fs.renameSync as any).mockImplementation(() => {});

            const downloadPromise = cacheService.downloadTrack(mockTrack);

            // Simulate stream events
            setTimeout(() => {
                mockStream.emit('data', Buffer.alloc(50));
                mockStream.emit('data', Buffer.alloc(50));
                // Simulate pipe finishing (writer finish)
                mockWriter.emit('finish');
            }, 10);

            await downloadPromise;

            expect(axios).toHaveBeenCalled();
            expect(fs.createWriteStream).toHaveBeenCalled();
            expect(fs.renameSync).toHaveBeenCalled();
            expect(mockDatabase.addCacheEntry).toHaveBeenCalled();
        });

        it('should handle download errors and cleanup', async () => {
            const mockStream = new EventEmitter();
            (mockStream as any).pipe = vi.fn();
            const mockWriter = new EventEmitter();
            
            (axios as any).mockResolvedValue({
                data: mockStream,
                headers: { 'content-length': '100' }
            });
            (fs.createWriteStream as any).mockReturnValue(mockWriter);
            (fs.existsSync as any).mockReturnValue(true);
            (fs.unlinkSync as any).mockImplementation(() => {});

            const downloadPromise = cacheService.downloadTrack(mockTrack);

            setTimeout(() => {
                const error = new Error('Network Error');
                mockStream.emit('error', error);
            }, 10);

            await expect(downloadPromise).rejects.toThrow('Network Error');
            expect(fs.unlinkSync).toHaveBeenCalled();
        });

        it('should ensure cache space before downloading', async () => {
            // Mock cache full scenario
            mockDatabase.getSettings.mockReturnValue({ cacheEnabled: true, cacheMaxSizeGB: 0.00001 }); // very small limit
            mockDatabase.getCacheTotalSize.mockReturnValue(20 * 1024 * 1024); // 20MB currently used
            mockDatabase.getOldestCacheEntries.mockReturnValueOnce([
                { trackId: 'old1', filePath: '/old/file1.mp3' }
            ]);
            
            (fs.existsSync as any).mockReturnValue(true);
            (fs.unlinkSync as any).mockImplementation(() => {});
            
            // Mock successful download setup
            const mockStream = new EventEmitter();
            (mockStream as any).pipe = vi.fn();
            const mockWriter = new EventEmitter();
            (axios as any).mockResolvedValue({
                data: mockStream,
                headers: { 'content-length': '100' }
            });
            (fs.createWriteStream as any).mockReturnValue(mockWriter);
            (fs.statSync as any).mockReturnValue({ size: 100 });

            const downloadPromise = cacheService.downloadTrack(mockTrack);
            
            setTimeout(() => {
                mockWriter.emit('finish');
            }, 10);

            await downloadPromise;

            expect(mockDatabase.getOldestCacheEntries).toHaveBeenCalled();
            expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledWith('old1');
        });

        it('should emit progress events', async () => {
            const mockStream = new EventEmitter();
            (mockStream as any).pipe = vi.fn();
            const mockWriter = new EventEmitter();
            const progressSpy = vi.fn();
            
            cacheService.on('download-progress', progressSpy);
            
            (axios as any).mockResolvedValue({
                data: mockStream,
                headers: { 'content-length': '100' }
            });
            (fs.createWriteStream as any).mockReturnValue(mockWriter);
            (fs.statSync as any).mockReturnValue({ size: 100 });

            const downloadPromise = cacheService.downloadTrack(mockTrack);

            setTimeout(() => {
                mockStream.emit('data', Buffer.alloc(50));
            }, 10);
            
            setTimeout(() => {
                mockWriter.emit('finish');
            }, 20);

            await downloadPromise;

            expect(progressSpy).toHaveBeenCalledWith({ trackId: mockTrack.id, progress: 50 });
        });

        it('should allow cancelling download', async () => {
             const mockStream = new EventEmitter();
             (mockStream as any).pipe = vi.fn();
             const mockWriter = new EventEmitter();
             const abortSpy = vi.fn();
             
             // Mock AbortController
             global.AbortController = vi.fn(function() {
                 return {
                    signal: {},
                    abort: abortSpy
                 };
             }) as any;

             (axios as any).mockResolvedValue({
                 data: mockStream,
                 headers: { 'content-length': '100' }
             });
             (fs.createWriteStream as any).mockReturnValue(mockWriter);
             
             // Start download but don't finish it
             cacheService.downloadTrack(mockTrack);
             
             // Cancel it
             cacheService.cancelDownload(mockTrack.id);
             
             expect(abortSpy).toHaveBeenCalled();
        });
    });
});

