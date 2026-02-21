import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock better-sqlite3 before importing Database
const mockPrepare = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockStatement = {
    run: mockRun,
    get: mockGet,
    all: mockAll,
};

vi.mock('better-sqlite3', () => {
    // Create a constructor function that Vitest treats as a class
    const MockDatabase = function (this: any) {
        this.pragma = vi.fn();
        this.prepare = mockPrepare.mockReturnValue(mockStatement);
        this.exec = vi.fn();
        this.close = vi.fn();
        // Mock transaction to execute the callback immediately
        this.transaction = vi.fn((callback) => callback);
    };
    return { default: MockDatabase };
});

// Mock fs and path
vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
}));

vi.mock('path', () => ({
    dirname: vi.fn().mockReturnValue('/mock/path'),
}));

import { Database } from './database';

describe('Database', () => {
    let database: Database;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock return values
        mockGet.mockReturnValue(null);
        mockAll.mockReturnValue([]);
        mockRun.mockReturnValue({ changes: 1 });
        database = new Database('/mock/test.db');
    });

    describe('Settings', () => {
        it('should get settings from database', () => {
            // Database uses { value: string } for settings storage
            const mockSettings = { value: '{"scrobblingEnabled":true}' };
            mockGet.mockReturnValue(mockSettings);

            const result = database.getSettings();

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
            expect(result).toEqual({ scrobblingEnabled: true });
        });

        it('should return null if no settings exist', () => {
            mockGet.mockReturnValue(null);

            const result = database.getSettings();

            expect(result).toBeNull();
        });

        it('should update settings in database', () => {
            // Return existing settings so merge logic works
            const mockSettings = { value: '{"scrobblingEnabled":true}' };
            mockGet.mockReturnValue(mockSettings);

            const result = database.setSettings({ scrobblingEnabled: false });

            expect(mockRun).toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });

    describe('Playlists', () => {
        it('should get all playlists', () => {
            mockAll.mockReturnValue([
                { id: 'p1', name: 'Playlist 1', description: '', created_at: '2024-01-01', updated_at: '2024-01-01' },
            ]);

            const result = database.getAllPlaylists();

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('playlists'));
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('p1');
        });

        it('should get playlist by ID', () => {
            mockGet.mockReturnValue({
                id: 'p1', name: 'Playlist 1', description: '', created_at: '2024-01-01', updated_at: '2024-01-01'
            });
            mockAll.mockReturnValue([]);

            const result = database.getPlaylistById('p1');

            expect(result).not.toBeNull();
            expect(result?.id).toBe('p1');
        });

        it('should return null for non-existent playlist', () => {
            mockGet.mockReturnValue(undefined);

            const result = database.getPlaylistById('non-existent');

            expect(result).toBeNull();
        });

        it('should create a playlist', () => {
            const result = database.createPlaylist('new-id', 'New Playlist', 'Description');

            expect(mockRun).toHaveBeenCalled();
            expect(result.id).toBe('new-id');
            expect(result.name).toBe('New Playlist');
        });

        it('should update a playlist', () => {
            database.updatePlaylist('p1', 'Updated Name', 'Updated Description');

            expect(mockRun).toHaveBeenCalled();
        });

        it('should delete a playlist', () => {
            database.deletePlaylist('p1');

            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Playlist Tracks', () => {
        const mockTrack = {
            id: 'track-1',
            title: 'Test Track',
            artist: 'Test Artist',
            album: 'Test Album',
            duration: 180,
            artworkUrl: 'https://example.com/art.jpg',
            streamUrl: 'https://example.com/stream.mp3',
            bandcampUrl: 'https://example.com',
            isCached: false,
        };

        it('should add track to playlist', () => {
            // Mock the max position query
            mockGet.mockReturnValue({ max: 0 });
            database.addTrackToPlaylist('p1', 'pt-1', mockTrack);

            expect(mockRun).toHaveBeenCalled();
        });

        it('should add multiple tracks to playlist', () => {
            // Mock the max position query
            mockGet.mockReturnValue({ max: 0 });
            const tracks = [
                { ...mockTrack, id: 't1' },
                { ...mockTrack, id: 't2' },
            ];

            database.addTracksToPlaylist('p1', tracks);

            // Should be called for each track
            expect(mockRun).toHaveBeenCalled();
        });

        it('should remove track from playlist', () => {
            database.removeTrackFromPlaylist('p1', 'track-1');

            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Cache', () => {
        it('should add cache entry', () => {
            database.addCacheEntry({
                trackId: 'cache-1',
                filePath: '/path/to/file.mp3',
                fileSize: 1024000,
                cachedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString(),
            });

            expect(mockRun).toHaveBeenCalled();
        });

        it('should get cache entry', () => {
            mockGet.mockReturnValue({
                track_id: 'cache-1',
                file_path: '/path/to/file.mp3',
                file_size: 1024000,
                cached_at: '2024-01-01',
                last_accessed_at: '2024-01-01',
            });

            const result = database.getCacheEntry('cache-1');

            expect(result).not.toBeNull();
            expect(result?.trackId).toBe('cache-1');
        });

        it('should get cache total size', () => {
            mockGet.mockReturnValue({ total: 5000000 });

            const result = database.getCacheTotalSize();

            expect(result).toBe(5000000);
        });

        it('should delete cache entry', () => {
            database.deleteCacheEntry('cache-1');

            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Scrobble Queue', () => {
        it('should add scrobble', () => {
            database.addScrobble('Artist', 'Track', 'Album', 180, 12345);

            expect(mockRun).toHaveBeenCalled();
        });

        it('should get pending scrobbles', () => {
            mockAll.mockReturnValue([
                { id: 1, artist: 'Artist', track: 'Track', album: 'Album', duration: 180, timestamp: 12345 },
            ]);

            const result = database.getPendingScrobbles();

            expect(result).toHaveLength(1);
            expect(result[0].artist).toBe('Artist');
        });

        it('should delete scrobble', () => {
            database.deleteScrobble(1);

            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Lifecycle', () => {
        it('should close database connection', () => {
            database.close();
            // Just verify no error is thrown
        });
    });

    describe('Cache - Additional', () => {
        it('should get all cache entries', () => {
            mockAll.mockReturnValue([{ track_id: '1', file_path: 'f1', file_size: 1, cached_at: '2024', last_accessed_at: '2024' }]);
            const result = database.getAllCacheEntries();
            expect(result).toHaveLength(1);
            expect(result[0].trackId).toBe('1');
        });

        it('should get oldest cache entries', () => {
            mockAll.mockReturnValue([{ track_id: '1', file_path: 'f1', file_size: 1, cached_at: '2024', last_accessed_at: '2024' }]);
            const result = database.getOldestCacheEntries(5);
            expect(result).toHaveLength(1);
        });

        it('should clear cache', () => {
            database.clearCache();
            expect(mockRun).toHaveBeenCalled();
        });

        it('should update cache access', () => {
            database.updateCacheAccess('track-1');
            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Collection Cache', () => {
        it('should get collection cache', () => {
            mockGet.mockReturnValue({ data: '{"test":"data"}', cached_at: '2024-01-01' });
            const result = database.getCollectionCache('test-id');
            expect(result?.data.test).toBe('data');

            mockGet.mockReturnValue(undefined);
            expect(database.getCollectionCache('none')).toBeNull();
        });

        it('should save collection cache', () => {
            database.saveCollectionCache('test-id', 'album', { some: 'data' });
            expect(mockRun).toHaveBeenCalled();
        });

        it('should clear collection cache', () => {
            database.clearCollectionCache('test-id');
            expect(mockRun).toHaveBeenCalled();
        });
    });

    describe('Artists', () => {
        const mockArtists = [
            { id: '1', name: 'Artist 1', url: 'url1', imageUrl: 'img1' }
        ];

        it('should save artists', () => {
            database.saveArtists(mockArtists, false);
            expect(mockRun).toHaveBeenCalled();
        });

        it('should save artists without image', () => {
            database.saveArtists([{ id: '2', name: 'No Img', url: 'url2' }], false);
            expect(mockRun).toHaveBeenCalled();
        });

        it('should replace artists', () => {
            database.replaceArtists(mockArtists, true);
            expect(mockRun).toHaveBeenCalled(); // delete and insert
        });

        it('should replace artists without image', () => {
            database.replaceArtists([{ id: '2', name: 'No Img', url: 'url2' }], true);
            expect(mockRun).toHaveBeenCalled();
        });

        it('should get artists', () => {
            mockAll.mockReturnValue([{ id: '1', name: 'Artist 1', url: 'url1', image_url: 'img1' }]);
            const result = database.getArtists(false);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Artist 1');
            expect(result[0].bandcampUrl).toBe('url1');
        });

        it('should get artists without image', () => {
            mockAll.mockReturnValue([{ id: '2', name: 'Artist 2', url: 'url2', image_url: null }]);
            const result = database.getArtists(true);
            expect(result[0].imageUrl).toBeUndefined();
        });

        it('should clear simulated data', () => {
            database.clearSimulatedData();
            expect(mockRun).toHaveBeenCalled(); // artists and cache_collection delete
        });
    });

});
