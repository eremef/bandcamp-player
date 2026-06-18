import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-1', type: 'album' as const, token: 'tok-1',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'Look Up At The Stars', artist: 'Test Artist',
                artistId: 'artist-test', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/look-up',
                trackCount: 2,
                tracks: [
                    {
                        id: 'mt-1', title: 'Track One', artist: 'Test Artist',
                        artistId: 'artist-test', album: 'Look Up At The Stars', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/track1.mp3',
                        bandcampUrl: '', isCached: false,
                    },
                    {
                        id: 'mt-2', title: 'Track Two', artist: 'Test Artist',
                        artistId: 'artist-test', album: 'Look Up At The Stars', duration: 200,
                        artworkUrl: '', streamUrl: 'https://mock.stream/track2.mp3',
                        bandcampUrl: '', isCached: false,
                    },
                ],
            },
        },
        {
            id: 'item-2', type: 'album' as const, token: 'tok-2',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-2', title: 'Another Great Album', artist: 'Another Artist',
                artistId: 'artist-another', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/another',
                trackCount: 2,
                tracks: [
                    {
                        id: 'mt-3', title: 'Great Track 1', artist: 'Another Artist',
                        artistId: 'artist-another', album: 'Another Great Album', duration: 240,
                        artworkUrl: '', streamUrl: 'https://mock.stream/great1.mp3',
                        bandcampUrl: '', isCached: false,
                    },
                    {
                        id: 'mt-4', title: 'Great Track 2', artist: 'Another Artist',
                        artistId: 'artist-another', album: 'Another Great Album', duration: 210,
                        artworkUrl: '', streamUrl: 'https://mock.stream/great2.mp3',
                        bandcampUrl: '', isCached: false,
                    },
                ],
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Album Detail Navigation', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async (e) => {
                e.sender.send('collection:on-updated', mockCollection);
                return mockCollection;
            });
        }, MOCK_COLLECTION);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }

        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        const helpers = new AppHelpers(window);
        await helpers.resetCollectionState();

        await collectionBtn.click();
        await window.getByTitle('Refresh').click();
    });

    test('should navigate to album detail and back to collection', async ({ window }) => {
        const firstAlbumCard = window.getByTestId('album-card').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        const albumTitleElement = firstAlbumCard.locator('[class*="title"]');
        const albumTitle = (await albumTitleElement.textContent())?.trim() || '';

        await firstAlbumCard.click();
        await window.waitForLoadState('networkidle');

        const albumHeading = window.getByRole('heading', { level: 1 });
        await expect(albumHeading).toContainText(albumTitle, { timeout: 15000 });

        const backButton = window.getByRole('button', { name: 'Back' });
        await expect(backButton).toBeVisible({ timeout: 10000 });

        await backButton.click();

        await expect(window.getByRole('heading', { name: 'Collection', level: 1 })).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to album detail from search and back to search results', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });

        await searchInput.fill('Look Up');

        const firstResultCard = window.getByTestId('album-card').first();
        await expect(firstResultCard).toBeVisible({ timeout: 15000 });

        await firstResultCard.click();
        await window.waitForLoadState('networkidle');

        const backButton = window.getByRole('button', { name: 'Back' });
        await expect(backButton).toBeVisible({ timeout: 10000 });
        await backButton.click();

        await expect(searchInput).toHaveValue('Look Up');
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 10000 });
    });
});
