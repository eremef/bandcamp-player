import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-album1', type: 'album' as const, token: 'tok-album1',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'Album 1', artist: 'Artist',
                artistId: 'artist-id', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/1',
                trackCount: 1,
                tracks: [
                    {
                        id: 'mt-1', title: 'Track 1', artist: 'Artist',
                        artistId: 'artist-id', album: 'Album 1', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/1.mp3',
                        bandcampUrl: '', isCached: true,
                    }
                ],
            },
        },
        {
            id: 'item-album2', type: 'album' as const, token: 'tok-album2',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-2', title: 'Album 2', artist: 'Artist',
                artistId: 'artist-id', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/2',
                trackCount: 1,
                tracks: [
                    {
                        id: 'mt-2', title: 'Track 2', artist: 'Artist',
                        artistId: 'artist-id', album: 'Album 2', duration: 180,
                        artworkUrl: '', streamUrl: 'https://mock.stream/2.mp3',
                        bandcampUrl: '', isCached: true,
                    }
                ],
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Queue Interactions', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
        }, MOCK_COLLECTION);

        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        const helpers = new AppHelpers(window);
        await helpers.resetCollectionState();

        await collectionBtn.click();
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
    });

    test('should play and remove tracks from the queue', async ({ window }) => {
        // 1. Ensure queue is clear
        const queueToggleBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await expect(queueToggleBtn).toBeVisible();
        await queueToggleBtn.click();

        const clearBtn = window.getByTitle('Clear queue');
        if (await clearBtn.isVisible()) {
            await clearBtn.evaluate(el => el.click());
        }
        await expect(window.getByText('Queue is empty')).toBeVisible();

        // 2. Add an album to the queue from the Collection
        await window.getByRole('button', { name: 'Collection', exact: true }).click();
        const firstAlbumCard = window.getByTestId('album-card').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        // Right-click to open context menu and add to queue
        await firstAlbumCard.click({ button: 'right' });
        const addToQueueBtn = window.locator('button').filter({ hasText: 'Add to Queue' });
        await expect(addToQueueBtn).toBeVisible();
        await addToQueueBtn.evaluate(el => el.click());

        // 3. Ensure Queue panel is open
        const isQueueOpen = await queueToggleBtn.evaluate(el => el.classList.contains('_active_') || el.className.includes('active'));
        if (!isQueueOpen) {
            await queueToggleBtn.click();
        }
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible();

        // 4. Verify something is in the queue
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        const initialCount = await queueItems.count();
        expect(initialCount).toBeGreaterThan(0);

        // 5. Test playing the first track from the queue
        const firstItem = queueItems.first();
        const itemPlayBtn = firstItem.getByTitle('Play');
        await expect(itemPlayBtn).toBeVisible();
        await itemPlayBtn.click();
        await expect(firstItem).toHaveClass(/current/);

        // 6. Test removing all tracks from the queue to verify empty state
        let currentCount = await queueItems.count();
        while (currentCount > 0) {
            await queueItems.first().getByTitle('Remove').click();
            currentCount--;
            // Wait for the DOM to actually remove the element before next click
            await expect(queueItems).toHaveCount(currentCount);
        }

        // Verify the queue is now empty
        await expect(window.getByText('Queue is empty')).toBeVisible();
    });

    test('should clear the queue', async ({ window }) => {
        // 1. Add multiple tracks to queue (by adding two different albums or one album multiple times)
        await window.getByRole('button', { name: 'Collection', exact: true }).click();
        const albumCards = window.getByTestId('album-card');
        await expect(albumCards.first()).toBeVisible({ timeout: 15000 });

        // Add first album
        await albumCards.nth(0).click({ button: 'right' });
        const addToQueueBtn = window.locator('button').filter({ hasText: 'Add to Queue' });
        await expect(addToQueueBtn).toBeVisible();
        await addToQueueBtn.evaluate(el => el.click());
        
        // Wait for context menu to disappear before opening the next one
        await expect(addToQueueBtn).toBeHidden();

        // Add second album
        await albumCards.nth(1).click({ button: 'right' });
        await expect(window.locator('button').filter({ hasText: 'Add to Queue' })).toBeVisible();
        await window.locator('button').filter({ hasText: 'Add to Queue' }).evaluate(el => el.click());

        // 2. Open Queue and verify tracks are present
        await window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true }).click();
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);

        // 3. Click Clear Queue
        const clearBtn = window.getByTitle('Clear queue');
        await expect(clearBtn).toBeVisible();
        await clearBtn.click();

        // 4. Verify queue is empty
        await expect(window.getByText('Queue is empty')).toBeVisible();
        await expect(queueItems).toHaveCount(0);
    });
});
