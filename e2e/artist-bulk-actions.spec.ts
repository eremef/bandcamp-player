import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Mock data: one artist with two collection items (1 track + 1 album with 2 tracks = 3 playable tracks)
// ---------------------------------------------------------------------------
const MOCK_ARTIST_ID = 'artist-mock';
const MOCK_ARTIST_NAME = 'Mock Artist';

const MOCK_ARTISTS = [
    { id: MOCK_ARTIST_ID, name: MOCK_ARTIST_NAME, bandcampUrl: 'https://mockartist.bandcamp.com', imageUrl: '' },
];

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-0', type: 'track' as const, token: 'tok-0',
            purchaseDate: new Date().toISOString(),
            track: {
                id: 'mt-1', title: 'Mock Track Alpha', artist: MOCK_ARTIST_NAME,
                artistId: MOCK_ARTIST_ID, album: 'Mock Album One', duration: 200,
                artworkUrl: '', streamUrl: 'https://mock.stream/alpha.mp3',
                bandcampUrl: '', isCached: true,
            },
        },
        {
            id: 'item-1', type: 'album' as const, token: 'tok-1',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'Mock Album Two', artist: MOCK_ARTIST_NAME,
                artistId: MOCK_ARTIST_ID, artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/two',
                trackCount: 2,
                tracks: [
                    {
                        id: 'mt-2', title: 'Mock Track Beta', artist: MOCK_ARTIST_NAME,
                        artistId: MOCK_ARTIST_ID, album: 'Mock Album Two', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/beta.mp3',
                        bandcampUrl: '', isCached: true,
                    },
                    {
                        id: 'mt-3', title: 'Mock Track Gamma', artist: MOCK_ARTIST_NAME,
                        artistId: MOCK_ARTIST_ID, album: 'Mock Album Two', duration: 220,
                        artworkUrl: '', streamUrl: 'https://mock.stream/gamma.mp3',
                        bandcampUrl: '', isCached: true,
                    },
                ],
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Artist Bulk Actions', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        // Mock IPC handlers at the main process level
        await electronApp.evaluate(({ ipcMain }, { mockCollection, mockArtists }) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.removeHandler('collection:get-artists');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
            ipcMain.handle('collection:get-artists', async () => mockArtists);
        }, { mockCollection: MOCK_COLLECTION, mockArtists: MOCK_ARTISTS });

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Force collection refresh to load mock data
        await collectionBtn.click();
        await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 15000 });
        await window.getByTitle('Refresh').click();
        await expect(window.locator('text=Mock Artist').first()).toBeVisible({ timeout: 10000 });

        // Navigate to Artists view
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });
        // Wait for mock artist card
        await expect(window.locator('[class*="artistCard"]').first()).toBeVisible({ timeout: 10000 });
    });

    // -----------------------------------------------------------------------
    // Artist detail view tests
    // -----------------------------------------------------------------------

    test('artist detail shows Play All button and More options menu', async ({ window }) => {
        // Click mock artist card to open detail
        await window.locator('[class*="artistCard"]').first().click();
        await expect(window.getByRole('heading', { name: MOCK_ARTIST_NAME, level: 1 })).toBeVisible({ timeout: 10000 });

        // Play All button should be visible
        await expect(window.locator('button', { hasText: 'Play All' }).first()).toBeVisible();

        // Open More options menu — scope to detailActions to avoid strict mode violation
        const detailActions = window.locator('[class*="detailActions"]');
        const moreBtn = detailActions.getByTitle('More options');
        await expect(moreBtn).toBeVisible();
        await moreBtn.click();
        await expect(window.locator('button', { hasText: 'Play Next' }).first()).toBeVisible({ timeout: 3000 });
        await expect(window.locator('button', { hasText: 'Add to Queue' }).first()).toBeVisible();

        // Close menu
        await moreBtn.click();
        await expect(window.locator('button', { hasText: 'Play Next' }).first()).not.toBeVisible({ timeout: 3000 });
    });

    test('"Play All" on artist detail changes player state away from idle', async ({ window }) => {
        await expect(window.locator('text=No track playing')).toBeVisible({ timeout: 5000 });

        // Open artist detail
        await window.locator('[class*="artistCard"]').first().click();
        await expect(window.getByRole('heading', { name: MOCK_ARTIST_NAME, level: 1 })).toBeVisible({ timeout: 10000 });

        // Click Play All
        await window.locator('button', { hasText: 'Play All' }).first().click();
        await window.waitForTimeout(500);

        await expect(window.locator('text=No track playing')).not.toBeVisible({ timeout: 5000 });
    });

    test('"Add to Queue" on artist detail adds tracks to the queue', async ({ window }) => {
        // Clear queue first
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        const clearBtn = window.getByTitle('Clear queue');
        if (await clearBtn.isVisible()) await clearBtn.click();
        const closeBtn = window.getByTitle('Close');
        if (await closeBtn.isVisible()) await closeBtn.click();

        // Open artist detail
        await window.locator('[class*="artistCard"]').first().click();
        await expect(window.getByRole('heading', { name: MOCK_ARTIST_NAME, level: 1 })).toBeVisible({ timeout: 10000 });

        // Open More options and click Add to Queue — scope to detailActions
        await window.locator('[class*="detailActions"]').getByTitle('More options').click();
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click();
        await window.waitForTimeout(500);

        // Verify queue has items
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Artist card context menu tests
    // -----------------------------------------------------------------------

    test('right-click on artist card opens context menu with actions', async ({ window }) => {
        const artistCard = window.locator('[class*="artistCard"]').first();
        await artistCard.click({ button: 'right' });

        await expect(window.locator('button', { hasText: 'Play Now' }).first()).toBeVisible({ timeout: 3000 });
        await expect(window.locator('button', { hasText: 'Play Next' }).first()).toBeVisible();
        await expect(window.locator('button', { hasText: 'Add to Queue' }).first()).toBeVisible();
    });

    test('"Add to Queue" from card context menu adds tracks', async ({ window }) => {
        // Clear queue first
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        const clearBtn = window.getByTitle('Clear queue');
        if (await clearBtn.isVisible()) await clearBtn.click();
        const closeBtn = window.getByTitle('Close');
        if (await closeBtn.isVisible()) await closeBtn.click();

        // Right-click artist card and Add to Queue
        const artistCard = window.locator('[class*="artistCard"]').first();
        await artistCard.click({ button: 'right' });
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click();
        await window.waitForTimeout(500);

        // Verify queue has items
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });

    test('"Play Next" from card context menu increases queue count', async ({ window }) => {
        // First add tracks to queue via card context menu
        const artistCard = window.locator('[class*="artistCard"]').first();
        await artistCard.click({ button: 'right' });
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click();
        await window.waitForTimeout(500);

        // Check initial queue count
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        const initialCount = await queueItems.count();

        // Close queue
        await window.getByTitle('Close').click();

        // Right-click and Play Next
        await artistCard.click({ button: 'right' });
        const playNextItem = window.locator('button', { hasText: 'Play Next' }).first();
        await expect(playNextItem).toBeVisible({ timeout: 3000 });
        await playNextItem.click({ force: true });
        await window.waitForTimeout(500);

        // Verify count grew
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const newCount = await queueItems.count();
        expect(newCount).toBeGreaterThan(initialCount);
    });
});
