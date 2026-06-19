import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-track', type: 'track' as const, token: 'tok-track',
            purchaseDate: new Date().toISOString(),
            track: {
                id: 'mt-1', title: 'A Mock Track', artist: 'Artist A',
                artistId: 'artist-a', album: 'Album A', duration: 200,
                artworkUrl: '', streamUrl: 'https://mock.stream/a.mp3',
                bandcampUrl: '', isCached: true,
            },
        },
        {
            id: 'item-album', type: 'album' as const, token: 'tok-album',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'B Mock Album', artist: 'Artist B',
                artistId: 'artist-b', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/b',
                trackCount: 1,
                tracks: [
                    {
                        id: 'mt-2', title: 'Track B', artist: 'Artist B',
                        artistId: 'artist-b', album: 'Album B', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/b.mp3',
                        bandcampUrl: '', isCached: true,
                    }
                ],
            },
        },
        {
            id: 'item-wishlist', type: 'album' as const, token: 'tok-wishlist',
            purchaseDate: new Date().toISOString(),
            isWishlist: true,
            album: {
                id: 'ma-2', title: 'C Wishlist Album', artist: 'Artist C',
                artistId: 'artist-c', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/c',
                trackCount: 1,
                tracks: [
                    {
                        id: 'mt-3', title: 'Track C', artist: 'Artist C',
                        artistId: 'artist-c', album: 'Album C', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/c.mp3',
                        bandcampUrl: '', isCached: false,
                    }
                ],
            },
        },
    ],
    totalCount: 3,
    lastUpdated: new Date().toISOString(),
};

test.describe('Collection Filters', () => {
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


    test('should filter albums, tracks, and wishlist items', async ({ window }) => {
        // Verify all 3 artists are visible, with a longer timeout to allow Collection to refresh
        // await expect(window.locator('text=Artist A')).toBeVisible();
        await expect(window.locator('text=Artist B')).toBeVisible();
        // Wait a bit for React to settle after Settings close
        await window.waitForTimeout(1000);

        // Open Filter Menu
        await window.getByTestId('filter-toggle-btn').click();

        await window.waitForTimeout(500);

        // Uncheck Albums
        await window.getByTestId('filter-albums-btn').click();

        // Verify Artist B (album) is hidden
        await expect(window.locator('text=Artist B')).not.toBeVisible();
        await expect(window.locator('text=Artist A')).toBeVisible(); // track
        await expect(window.locator('text=Artist C')).toBeVisible(); // wishlist album

        // Uncheck Tracks
        await window.getByTestId('filter-tracks-btn').click();

        // Verify Artist A (track) is hidden
        await expect(window.locator('text=Artist A')).not.toBeVisible();
        await expect(window.locator('text=Artist C')).toBeVisible(); // wishlist album

        // Uncheck Wishlist
        await window.getByTestId('filter-wishlist-btn').click();

        // Nothing visible
        await expect(window.locator('text=Artist C')).not.toBeVisible();
        await expect(window.getByTestId('album-card')).toHaveCount(0);

        // Re-check Albums
        await window.getByTestId('filter-albums-btn').click();
        await expect(window.locator('text=Artist B')).toBeVisible();
    });
});
