import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-1', type: 'album' as const, token: 'tok-1',
            purchaseDate: new Date('2023-01-01T00:00:00Z').toISOString(),
            album: {
                id: 'ma-1', title: 'Album Z', artist: 'Artist Z',
                artistId: 'artist-z', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/z',
                trackCount: 1,
                tracks: [
                    { id: 'mt-1', title: 'Track Z', artist: 'Artist Z', artistId: 'artist-z', album: 'Album Z', duration: 180, artworkUrl: '', streamUrl: 'https://mock.stream/z.mp3', bandcampUrl: '', isCached: true }
                ],
            },
        },
        {
            id: 'item-2', type: 'album' as const, token: 'tok-2',
            purchaseDate: new Date('2024-01-01T00:00:00Z').toISOString(),
            album: {
                id: 'ma-2', title: 'Album A', artist: 'Artist A',
                artistId: 'artist-a', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/a',
                trackCount: 1,
                tracks: [
                    { id: 'mt-2', title: 'Track A', artist: 'Artist A', artistId: 'artist-a', album: 'Album A', duration: 180, artworkUrl: '', streamUrl: 'https://mock.stream/a.mp3', bandcampUrl: '', isCached: true }
                ],
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Collection Sorting', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
        }, MOCK_COLLECTION);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        const helpers = new AppHelpers(window);
        await helpers.resetCollectionState();

        await collectionBtn.click();
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
        await window.getByTitle('Refresh').click();
    });

    test('should sort collection by Artist and Purchase Date', async ({ window }) => {
        // Wait for cards to appear
        await expect(window.getByTestId('album-card').nth(0)).toBeVisible();
        
        // Explicitly set Sort to Purchase Date Descending
        const sortBtn = window.getByTitle('Sort collection');
        await sortBtn.click();
        await window.locator('button', { hasText: /^Purchase Date$/ }).click();
        await sortBtn.click();
        await window.locator('button', { hasText: 'Descending' }).click();

        // Wait for sorting to apply
        await window.waitForTimeout(500);

        // Artist A is newer (2024) than Artist Z (2023)
        await expect(window.getByTestId('album-card').nth(0)).toContainText('Artist A');

        // Open Sort Menu
        await window.getByTestId('sort-toggle-btn').click();
        await window.waitForTimeout(500);
        
        // Change sort to Purchase Date Ascending (Oldest first)
        await window.getByTestId('sort-asc-btn').click();
        
        // Now Artist Z should be first
        await expect(window.getByTestId('album-card').nth(0)).toContainText('Artist Z');

        // Open Sort Menu again
        await window.getByTestId('sort-toggle-btn').click();
        await window.waitForTimeout(500);
        
        // Change to Artist
        await window.getByTestId('sort-artist-btn').click();
        
        // Artist Ascending -> Artist A first
        await expect(window.getByTestId('album-card').nth(0)).toContainText('Artist A');

        // Open Sort Menu again
        await window.getByTestId('sort-toggle-btn').click();
        await window.waitForTimeout(500);
        
        // Change to Descending
        await window.getByTestId('sort-desc-btn').click();
        
        // Artist Descending -> Artist Z first
        await expect(window.getByTestId('album-card').nth(0)).toContainText('Artist Z');
    });
});
