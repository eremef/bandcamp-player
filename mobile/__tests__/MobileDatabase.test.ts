import { MobileDatabase } from '../services/MobileDatabase';
import * as SQLite from 'expo-sqlite';

jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(),
}));

describe('MobileDatabase', () => {
    let mockDb: any;
    let dbInstance: MobileDatabase;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockDb = {
            execAsync: jest.fn().mockResolvedValue(undefined),
            getAllAsync: jest.fn().mockResolvedValue([]),
            getFirstAsync: jest.fn().mockResolvedValue(null),
            runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
            withTransactionAsync: jest.fn((cb) => cb()),
        };

        (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

        dbInstance = new MobileDatabase();
    });

    describe('init and setupTables', () => {
        it('should initialize and execute setup schema', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([{ name: 'position' }]); // collection_items pragma
            mockDb.getAllAsync.mockResolvedValueOnce([{ sql: 'CREATE VIRTUAL TABLE collection_search_fts USING fts5' }]); // fts info

            await dbInstance.init();

            expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('bandcamp_mobile.db');
            expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS collection_items'));
        });

        it('should migrate adding position column if missing', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([{ name: 'id' }]); // Missing position
            mockDb.getAllAsync.mockResolvedValueOnce([]); // No fts info

            await dbInstance.init();

            expect(mockDb.execAsync).toHaveBeenCalledWith('ALTER TABLE collection_items ADD COLUMN position INTEGER');
        });

        it('should migrate FTS table if incorrectly created', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([{ name: 'position' }]);
            mockDb.getAllAsync.mockResolvedValueOnce([{ sql: "CREATE VIRTUAL TABLE collection_search_fts USING fts5(content='collection_items')" }]);

            await dbInstance.init();

            expect(mockDb.execAsync).toHaveBeenCalledWith('DROP TABLE collection_search_fts');
            expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE VIRTUAL TABLE collection_search_fts USING fts5'));
        });

        it('should handle migration errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockDb.getAllAsync.mockRejectedValue(new Error('Migration Error'));

            await dbInstance.init();

            expect(consoleSpy).toHaveBeenCalledWith('[MobileDatabase] Migration failed:', expect.any(Error));
            expect(consoleSpy).toHaveBeenCalledWith('[MobileDatabase] FTS Migration failed:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('Collection Cache', () => {
        it('should return null if cache is empty', async () => {
            const result = await dbInstance.getCollectionCache('user1');
            expect(result).toBeNull();
        });

        it('should save and get collection cache', async () => {
            const mockData = { items: [1, 2] };

            await dbInstance.saveCollectionCache('user1', mockData);
            expect(mockDb.runAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO collection_cache'),
                ['user1', 'collection', JSON.stringify(mockData), expect.any(String)]
            );

            mockDb.getFirstAsync.mockResolvedValueOnce({
                data: JSON.stringify(mockData),
                cached_at: '2024-01-01'
            });

            const result = await dbInstance.getCollectionCache('user1');
            expect(result).toEqual({ data: mockData, cachedAt: '2024-01-01' });
        });
    });

    describe('Granular Storage', () => {
        beforeEach(async () => {
            await dbInstance.init();
            jest.clearAllMocks();
        });

        it('should save collection granularly', async () => {
            const mockItems = [
                {
                    id: 'album1_id',
                    type: 'album',
                    token: 'tok1',
                    purchaseDate: '2024',
                    album: { id: 'a1', title: 'T1', artist: 'Art1', trackCount: 5 }
                },
                {
                    id: 'track1_id',
                    type: 'track',
                    track: { id: 't1', title: 'TT1', artist: 'Art1', duration: 180 }
                }
            ] as any;

            await dbInstance.saveCollectionGranular('user1', mockItems);

            expect(mockDb.withTransactionAsync).toHaveBeenCalled();
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM collection_search_fts'), ['user1']);
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM collection_items'), ['user1']);

            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO collection_items'), expect.any(Array));
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO albums'), expect.any(Array));
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO tracks'), expect.any(Array));
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO collection_search_fts'), expect.any(Array));
        });

        it('should get collection mapping correctly', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([
                { id: '1', type: 'album', token: 'tok', a_title: 'A Title' },
                { id: '2', type: 'track', token: 'tok2', t_title: 'T Title' }
            ]);

            const res = await dbInstance.getCollectionGranular('u1', 0, 10, 'search');

            expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('MATCH'), ['u1', '"search"*', 10, 0]);
            expect(res).toHaveLength(2);
            expect(res[0].album?.title).toBe('A Title');
            expect(res[1].track?.title).toBe('T Title');
        });

        it('should fall back to unsearched getCollection Granular', async () => {
            await dbInstance.getCollectionGranular('u1');
            expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.not.stringContaining('MATCH'), ['u1', 50, 0]);
        });

        it('should use LIKE fallback for queries with special characters', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([]);
            await dbInstance.getCollectionGranular('u1', 0, 10, '#2');
            expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('LIKE'), ['u1', '%#2%', '%#2%', '%#2%', '%#2%', 10, 0]);
        });

        it('should handle getCollectionTotalCount', async () => {
            mockDb.getFirstAsync.mockResolvedValueOnce({ count: 42 });
            const count = await dbInstance.getCollectionTotalCount('u1', 'query');
            expect(mockDb.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('MATCH'), ['u1', '"query"*']);
            expect(count).toBe(42);

            mockDb.getFirstAsync.mockResolvedValueOnce({ count: 99 });
            const countNoQ = await dbInstance.getCollectionTotalCount('u1');
            expect(countNoQ).toBe(99);
        });

        it('should use LIKE fallback for getCollectionTotalCount with special characters', async () => {
            mockDb.getFirstAsync.mockResolvedValueOnce({ count: 3 });
            const count = await dbInstance.getCollectionTotalCount('u1', '#2');
            expect(mockDb.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('LIKE'), ['u1', '%#2%', '%#2%', '%#2%', '%#2%']);
            expect(count).toBe(3);
        });
    });

    describe('Playlists', () => {
        beforeEach(async () => {
            await dbInstance.init();
            jest.clearAllMocks();
        });

        it('should create playlist', async () => {
            const playlist = await dbInstance.createPlaylist('My PL');
            expect(playlist.name).toBe('My PL');
            expect(mockDb.runAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO playlists'),
                expect.any(Array)
            );
        });

        it('should delete and rename playlist', async () => {
            await dbInstance.deletePlaylist('pid');
            expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM playlists WHERE id = ?', ['pid']);

            await dbInstance.renamePlaylist('pid', 'New PL');
            expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE playlists SET name = ?'), ['New PL', expect.any(String), 'pid']);
        });

        it('should handle get all playlists mapping tracks', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([{ id: 'p1', name: 'PL1', created_at: 'date', updated_at: 'date' }]);
            mockDb.getAllAsync.mockResolvedValueOnce([{ track_data: JSON.stringify({ title: 't1', duration: 120 }) }]);

            const pls = await dbInstance.getAllPlaylists();
            expect(pls).toHaveLength(1);
            expect(pls[0].tracks).toHaveLength(1);
            expect(pls[0].totalDuration).toBe(120);
        });

        it('should add track to playlist', async () => {
            mockDb.getFirstAsync.mockResolvedValueOnce({ max_pos: 2 });
            await dbInstance.addTrackToPlaylist('p1', { id: 't1' });

            expect(mockDb.runAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO playlist_tracks'),
                [expect.any(String), 'p1', JSON.stringify({ id: 't1' }), 3, expect.any(String)]
            );
        });
    });

    describe('Artists', () => {
        beforeEach(async () => {
            await dbInstance.init();
            jest.clearAllMocks();
        });

        it('should get all artists', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([{ id: 'a1', name: 'Art1' }]);
            const res = await dbInstance.getArtists();
            expect(res).toEqual([{ id: 'a1', name: 'Art1' }]);
        });

        it('should replace artists inside transaction', async () => {
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            mockDb.runAsync.mockResolvedValueOnce({ changes: 5 }); // Delete
            mockDb.runAsync.mockResolvedValueOnce({ changes: 1 }); // Insert

            await dbInstance.replaceArtists([{ id: 'a1', name: 'A', url: 'u' }]);

            expect(mockDb.withTransactionAsync).toHaveBeenCalled();
            expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM artists WHERE is_simulated = 0');
            expect(mockDb.runAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO artists'),
                ['a1', 'A', 'u', null]
            );
            logSpy.mockRestore();
        });

        it('removeTrackFromPlaylist stub resolves empty', async () => {
            await expect(dbInstance.removeTrackFromPlaylist('a', 'b')).resolves.toBeUndefined();
        });
    });

    describe('Settings', () => {
        beforeEach(async () => {
            await dbInstance.init();
            jest.clearAllMocks();
        });

        it('should set and get settings parsing JSON', async () => {
            mockDb.getAllAsync.mockResolvedValueOnce([
                { key: 'setting1', value: JSON.stringify({ enable: true }) },
                { key: 'setting2', value: 'plain string' }
            ]);

            const settings = await dbInstance.getSettings();
            expect(settings).toEqual({
                setting1: { enable: true },
                setting2: 'plain string'
            });

            await dbInstance.setSetting('new_setting', false);
            expect(mockDb.runAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO settings'),
                ['new_setting', 'false']
            );
        });
    });
});
