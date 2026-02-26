import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Mock collection with both track and album items.
// Every track has a truthy streamUrl so getAllFilteredTracks uses them
// directly without falling back to scraping.
// ---------------------------------------------------------------------------
const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-0', type: 'track' as const, token: 'tok-0',
            purchaseDate: new Date().toISOString(),
            track: {
                id: 'mt-1', title: 'Mock Track Alpha', artist: 'Mock Artist',
                artistId: 'artist-mock', album: 'Mock Album One', duration: 200,
                artworkUrl: '', streamUrl: 'https://mock.stream/alpha.mp3',
                bandcampUrl: '', isCached: true,
            },
        },
        {
            id: 'item-1', type: 'track' as const, token: 'tok-1',
            purchaseDate: new Date().toISOString(),
            track: {
                id: 'mt-2', title: 'Mock Track Beta', artist: 'Mock Artist',
                artistId: 'artist-mock', album: 'Mock Album One', duration: 180,
                artworkUrl: '', streamUrl: 'https://mock.stream/beta.mp3',
                bandcampUrl: '', isCached: true,
            },
        },
        {
            id: 'item-2', type: 'album' as const, token: 'tok-2',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'Mock Album Two', artist: 'Mock Artist',
                artistId: 'artist-mock', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/two',
                trackCount: 2,
                tracks: [
                    {
                        id: 'mt-3', title: 'Mock Track Gamma', artist: 'Mock Artist',
                        artistId: 'artist-mock', album: 'Mock Album Two', duration: 220,
                        artworkUrl: '', streamUrl: 'https://mock.stream/gamma.mp3',
                        bandcampUrl: '', isCached: true,
                    },
                    {
                        id: 'mt-4', title: 'Mock Track Delta', artist: 'Mock Artist',
                        artistId: 'artist-mock', album: 'Mock Album Two', duration: 195,
                        artworkUrl: '', streamUrl: 'https://mock.stream/delta.mp3',
                        bandcampUrl: '', isCached: true,
                    },
                ],
            },
        },
    ],
    totalCount: 3,
    lastUpdated: new Date().toISOString(),
};

test.describe('Collection Bulk Actions', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        // Mock at the main process IPC level — contextBridge makes window.electron read-only
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
        }, MOCK_COLLECTION);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Navigate to Collection view and wait for it to load
        await collectionBtn.click();
        await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 15000 });

        // Force refresh so the store re-fetches using our mocked IPC handlers
        await window.getByTitle('Refresh').click();
        // Wait for mock data to appear
        await expect(window.locator('text=Mock Artist').first()).toBeVisible({ timeout: 10000 });
    });

    // -----------------------------------------------------------------------
    // Visibility tests
    // -----------------------------------------------------------------------

    test('bulk actions button is hidden without a search query', async ({ window }) => {
        const bulkBtn = window.getByTitle('More actions for search results');
        await expect(bulkBtn).not.toBeVisible();
    });

    test('bulk actions button is hidden when search returns no results', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('xyznonexistent12345');
        await window.waitForTimeout(300);

        await expect(window.locator('[class*="card"]')).toHaveCount(0);
        await expect(window.getByTitle('More actions for search results')).not.toBeVisible();
    });

    test('bulk actions button appears when search has matching results', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await expect(window.locator('[class*="card"]').first()).toBeVisible();
        await expect(window.getByTitle('More actions for search results')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // Menu toggle
    // -----------------------------------------------------------------------

    test('bulk actions menu opens and closes on toggle', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        const bulkBtn = window.getByTitle('More actions for search results');
        await expect(bulkBtn).toBeVisible();

        // Open
        await bulkBtn.click();
        await expect(window.locator('button', { hasText: 'Play All' }).first()).toBeVisible({ timeout: 3000 });
        await expect(window.locator('button', { hasText: 'Add to Queue' }).first()).toBeVisible();
        await expect(window.locator('button', { hasText: 'Play Next' }).first()).toBeVisible();

        // Close
        await bulkBtn.click();
        await expect(window.locator('button', { hasText: 'Play All' }).first()).not.toBeVisible({ timeout: 3000 });
    });

    // -----------------------------------------------------------------------
    // Downstream actions
    // -----------------------------------------------------------------------

    test('"Add to Queue" adds all filtered tracks to the queue', async ({ window }) => {
        // Clear queue first
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        const clearBtn = window.getByTitle('Clear queue');
        if (await clearBtn.isVisible()) await clearBtn.click();
        // Close queue panel
        const closeBtn = window.getByTitle('Close');
        if (await closeBtn.isVisible()) await closeBtn.click();

        // Search and use bulk "Add to Queue"
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click();
        await window.waitForTimeout(500);

        // Open queue and verify items are present
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });

    test('"Play All" changes player state away from idle', async ({ window }) => {
        // Confirm we start in idle state
        await expect(window.locator('text=No track playing')).toBeVisible({ timeout: 5000 });

        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const playAllItem = window.locator('button', { hasText: 'Play All' }).first();
        await expect(playAllItem).toBeVisible({ timeout: 3000 });
        await playAllItem.click();
        await window.waitForTimeout(500);

        // Player should no longer be idle
        await expect(window.locator('text=No track playing')).not.toBeVisible({ timeout: 5000 });
    });

    test('"Play Next" increases the queue count', async ({ window }) => {
        // Step 1: Add some tracks to queue first
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click({ force: true });
        await window.waitForTimeout(500);

        // Check initial queue count
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        const initialCount = await queueItems.count();

        // Close queue panel
        await window.getByTitle('Close').click();

        // Step 2: Use "Play Next" with the same search results
        await window.getByTitle('More actions for search results').click();
        const playNextItem = window.locator('button', { hasText: 'Play Next' }).first();
        await expect(playNextItem).toBeVisible({ timeout: 3000 });
        await playNextItem.click({ force: true });
        await window.waitForTimeout(500);

        // Open queue and verify count grew
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const newCount = await queueItems.count();
        expect(newCount).toBeGreaterThan(initialCount);
    });
});
