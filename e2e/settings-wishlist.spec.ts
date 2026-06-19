import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

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
            id: 'item-1', type: 'album' as const, token: 'tok-1',
            purchaseDate: new Date().toISOString(),
            isWishlist: true, // Wishlist item
            album: {
                id: 'ma-1', title: 'Wishlist Album', artist: 'Wishlist Artist',
                artistId: 'artist-wishlist', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/wishlist',
                trackCount: 1,
                tracks: [
                    {
                        id: 'mt-2', title: 'Wishlist Track', artist: 'Wishlist Artist',
                        artistId: 'artist-wishlist', album: 'Wishlist Album', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/wish.mp3',
                        bandcampUrl: '', isCached: false,
                    }
                ],
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Settings Wishlist Integration', () => {
    test.beforeEach(async ({ window, electronApp }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByTestId('nav-collection');
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Reset settings to default for this test to avoid cross-test state leakage
        await window.evaluate(async () => {
            await window.electron.settings.set({
                includeWishlistInCollection: false,
                collectionFilterAlbums: true,
                collectionFilterTracks: true,
                collectionFilterWishlist: true,
                collectionSortKey: 'default',
                collectionSortDirection: 'desc',
            });
        });
        await window.waitForTimeout(300);

        // Mock the collection response with standard collection and wishlist items
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async (e) => {
                e.sender.send('collection:on-updated', mockCollection);
                return mockCollection;
            });
        }, MOCK_COLLECTION);
    });


    test('should toggle wishlist visibility in collection', async ({ window }) => {
        const helpers = new AppHelpers(window);

        // 1. Go to Collection - verify wishlist item is NOT visible by default
        await window.getByTestId('nav-collection').click();
        
        // Click Refresh to ensure fetch is triggered with mock
        await window.getByTitle('Refresh').click();
        
        // Wait for the regular track to be visible
        await expect(window.locator('text=Mock Artist').first()).toBeVisible({ timeout: 15000 });
        
        // Wishlist Artist should not be visible initially
        await expect(window.locator('text=Wishlist Artist')).not.toBeVisible();

        // 2. Go to Settings and enable Wishlist
        await helpers.openSettings();
        await helpers.setSetting('setting-wishlist', true);
        await helpers.closeSettings();

        // 3. Go back to Collection, verify wishlist item is visible
        await window.getByTestId('nav-collection').click();
        
        // Wait a moment and then click refresh to guarantee re-render
        await window.waitForTimeout(500);
        await window.getByTitle('Refresh').click();
        
        // Ensure the Wishlist filter is checked in the Collection view
        await helpers.openCollectionFilters();
        
        const wishlistFilterBtn = window.getByTestId('filter-wishlist-btn');
        await expect(wishlistFilterBtn).toBeVisible();
        await wishlistFilterBtn.evaluate((el: HTMLButtonElement) => {
            if (!el.className.includes('active') && !el.querySelector('svg.lucide-check')) {
                el.click();
            }
        });
        
        // Close Filter Menu
        await window.getByTestId('filter-toggle-btn').click();
        
        // Now Wishlist Artist should be visible
        await expect(window.locator('text=Wishlist Artist').first()).toBeVisible({ timeout: 15000 });
    });
});
