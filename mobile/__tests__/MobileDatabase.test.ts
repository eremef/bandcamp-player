import { mobileDatabase } from '../services/MobileDatabase';
import * as SQLite from 'expo-sqlite';

describe('MobileDatabase Granular Storage', () => {
    let mockDb: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        // Force re-init to ensure openDatabaseAsync is called
        (mobileDatabase as any).db = null;
        (mobileDatabase as any).initPromise = null;

        await mobileDatabase.init();
        mockDb = await (SQLite.openDatabaseAsync as jest.Mock).mock.results[0].value;
    });

    it('should save collection granularly', async () => {
        const mockItems = [
            {
                id: 'item1',
                type: 'album',
                token: 'token1',
                purchaseDate: '2024-01-01',
                album: {
                    id: 'album1',
                    title: 'Test Album',
                    artist: 'Test Artist',
                    artistId: 'artist1',
                    artworkUrl: 'art1',
                    bandcampUrl: 'url1',
                    trackCount: 10
                }
            }
        ] as any;

        await mobileDatabase.saveCollectionGranular('user1', mockItems);

        // Verify transaction
        expect(mockDb.withTransactionAsync).toHaveBeenCalled();

        // Inside transaction:
        // 1. Delete existing
        expect(mockDb.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM collection_items'),
            ['user1']
        );

        // 2. Insert item
        expect(mockDb.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO collection_items'),
            ['item1', 'album', 'token1', '2024-01-01', 'user1', 0]
        );

        // 3. Insert album
        expect(mockDb.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR REPLACE INTO albums'),
            ['album1', 'Test Album', 'artist1', 'Test Artist', 'art1', 'url1', 10]
        );

        // 4. Update FTS
        expect(mockDb.runAsync).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO collection_search_fts'),
            ['item1', 'Test Album', 'Test Artist']
        );
    });

    it('should get collection granularly without query', async () => {
        mockDb.getAllAsync.mockResolvedValue([
            {
                id: 'item1',
                type: 'album',
                token: 'token1',
                purchase_date: '2024-01-01',
                a_title: 'Title',
                a_artist: 'Artist',
                a_art: 'art',
                a_url: 'url',
                a_count: 5,
                a_aid: 'aid'
            }
        ]);

        const items = await mobileDatabase.getCollectionGranular('user1', 0, 20);

        expect(mockDb.getAllAsync).toHaveBeenCalledWith(
            expect.stringContaining('FROM collection_items'),
            ['user1', 20, 0]
        );
        expect(items.length).toBe(1);
        expect(items[0].album?.title).toBe('Title');
    });

    it('should get collection granularly with query (FTS5)', async () => {
        mockDb.getAllAsync.mockResolvedValue([]);

        await mobileDatabase.getCollectionGranular('user1', 0, 20, 'search-term');

        expect(mockDb.getAllAsync).toHaveBeenCalledWith(
            expect.stringContaining('MATCH'),
            ['user1', 'search-term*', 20, 0]
        );
    });
});
