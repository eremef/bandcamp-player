import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
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
    ],
    totalCount: 1,
    lastUpdated: new Date().toISOString(),
};

test.describe('Queue Management', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);
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
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
    });

    test('should open queue panel showing empty state', async ({ window }) => {
        const queueBtn = window.getByRole('button', { name: 'Queue', exact: true }).first();
        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        
        if (!(await queueHeading.isVisible())) {
            await queueBtn.click();
        }

        await expect(queueHeading).toBeVisible({ timeout: 5000 });
        
        // Clear the queue if it's not empty from a previous test in the same worker
        const clearBtn = window.getByRole('button', { name: 'Clear queue' });
        if (await clearBtn.isVisible()) {
             await clearBtn.click();
        }
        
        await expect(window.locator('text=Queue is empty')).toBeVisible();
        await expect(window.locator('text=0 tracks')).toBeVisible();
    });

    test('should add album to queue via context menu', async ({ window }) => {
        // Wait for collection cards
        const firstAlbumCard = window.getByTestId('album-card').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        // Right-click to open context menu
        await firstAlbumCard.click({ button: 'right' });

        // Click "Add to Queue" in context menu
        const addToQueueBtn = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueBtn).toBeVisible({ timeout: 5000 });
        await addToQueueBtn.click({ force: true });

        // Wait for queue update
        await window.waitForTimeout(1000);

        // Open the queue panel to verify
        const queueBtn = window.getByRole('button', { name: 'Queue', exact: true }).first();
        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        
        if (!(await queueHeading.isVisible())) {
            await queueBtn.click();
        }

        await expect(queueHeading).toBeVisible({ timeout: 5000 });

        // Queue should NOT be empty now
        await expect(window.locator('text=Queue is empty')).not.toBeVisible({ timeout: 3000 });
    });

    test('should clear queue', async ({ window }) => {
        // First, add something to the queue
        const firstAlbumCard = window.getByTestId('album-card').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });
        await firstAlbumCard.click({ button: 'right' });

        const addToQueueBtn = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueBtn).toBeVisible({ timeout: 5000 });
        await addToQueueBtn.click({ force: true });
        await window.waitForTimeout(1000);

        // Open queue
        const queueBtn = window.getByRole('button', { name: 'Queue', exact: true }).first();
        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        
        if (!(await queueHeading.isVisible())) {
            await queueBtn.click();
        }
        await expect(queueHeading).toBeVisible({ timeout: 5000 });

        // Click Clear
        const clearBtn = window.locator('button', { hasText: 'Clear' }).first();
        await clearBtn.click();

        // Verify queue is empty
        await expect(window.locator('text=Queue is empty')).toBeVisible({ timeout: 5000 });
    });
});
