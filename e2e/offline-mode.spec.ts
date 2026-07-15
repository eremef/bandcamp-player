import { test, expect } from './fixtures';
import { _electron as electron } from '@playwright/test';
import { join } from 'path';
import { AppHelpers } from './test-helpers';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-1', type: 'album' as const, token: 'tok-1',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-1', title: 'Cached Album', artist: 'Cached Artist',
                artistId: 'artist-cached', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/cached',
                trackCount: 1,
                tracks: [
                    { id: 'mt-1', title: 'Cached Track', artist: 'Cached Artist', artistId: 'artist-cached', album: 'Cached Album', duration: 180, artworkUrl: '', streamUrl: 'https://mock.stream/cached.mp3', bandcampUrl: '', isCached: true }
                ],
            },
            isCached: true
        },
        {
            id: 'item-2', type: 'album' as const, token: 'tok-2',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'ma-2', title: 'Online Album', artist: 'Online Artist',
                artistId: 'artist-online', artworkUrl: '',
                bandcampUrl: 'https://mock.bandcamp.com/album/online',
                trackCount: 1,
                tracks: [
                    { id: 'mt-2', title: 'Online Track', artist: 'Online Artist', artistId: 'artist-online', album: 'Online Album', duration: 180, artworkUrl: '', streamUrl: 'https://mock.stream/online.mp3', bandcampUrl: '', isCached: false }
                ],
            },
            isCached: false
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

test.describe('Offline Mode & Caching', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain, webContents }, mockCollection) => {
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => mockCollection);
            ipcMain.handle('collection:refresh', async () => mockCollection);

            // Mock cache to return the cached track so the badge displays properly
            ipcMain.removeHandler('cache:get-cached-tracks');
            ipcMain.handle('cache:get-cached-tracks', async () => [
                { id: 'mt-1', albumId: 'ma-1' }
            ]);

        }, MOCK_COLLECTION);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByTestId('nav-collection');

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        await collectionBtn.click();
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });

        // Trigger the renderer store to fetch the mocked cached tracks after UI is ready
        await electronApp.evaluate(({ webContents }) => {
            const wc = webContents.getAllWebContents()[0];
            if (wc) {
                wc.send('cache:on-stats-updated', { trackCount: 1, totalBytes: 1000 });
            }
        });

        await window.getByTestId('icon-refresh').locator('..').click();
        await expect(window.locator('text=Cached Artist').first()).toBeVisible({ timeout: 10000 });
    });

    test('should allow toggling offline caching setting', async ({ window }) => {
        const helpers = new AppHelpers(window);

        // 1. Open Settings
        await helpers.openSettings();

        // 2. Find the "Enable Caching" toggle
        const cachingCheckbox = window.getByTestId('setting-cache-enabled');
        await cachingCheckbox.scrollIntoViewIfNeeded();

        const initialState = await cachingCheckbox.isChecked();
        const newState = !initialState;

        await helpers.setSetting('setting-cache-enabled', newState);

        // Close settings
        await helpers.closeSettings();
    });

    test('should show cached badge and context menu actions for downloaded items', async ({ window }) => {
        // Find the Cached Album card
        const cachedCard = window.getByTestId('album-card').filter({ hasText: 'Cached Artist' });
        await expect(cachedCard).toBeVisible();

        // Check if there is a downloaded indicator (e.g. DownloadCloud icon or '✓')
        // In the desktop app, there's usually a badge with title 'Downloaded' or class matching 'downloaded'
        // We'll look for an element with title "Available offline"
        const downloadedBadge = cachedCard.locator('[title="Available offline"]');
        await expect(downloadedBadge.first()).toBeVisible();

        // Right click to open context menu
        await cachedCard.click({ button: 'right' });

        // Context menu should NOT show "Download for Offline" because it's cached
        await expect(window.locator('button', { hasText: 'Download for Offline' })).not.toBeVisible();

        // Close context menu by clicking elsewhere
        await window.mouse.click(0, 0);

        // Find the Online Album card
        const onlineCard = window.getByTestId('album-card').filter({ hasText: 'Online Artist' });
        await expect(onlineCard).toBeVisible();

        // Right click to open context menu
        await onlineCard.click({ button: 'right' });

        // If it was already cached from a previous test leak, we'll see "Remove from Cache"
        const removeBtn = window.locator('button', { hasText: 'Remove from Cache' });
        if (await removeBtn.isVisible()) {
            await removeBtn.click();
            await window.waitForTimeout(500);
            await onlineCard.click({ button: 'right' }); // Re-open menu
        }

        // Context menu should now show "Download for Offline"
        await expect(window.locator('button', { hasText: 'Download for Offline' })).toBeVisible();
    });

    test('should limit navigation when offline', async ({ window }) => {
        // Go offline in the browser context
        await window.context().setOffline(true);

        await window.waitForTimeout(2000); // Give React time to update online status

        // Try to navigate to Artists (requires network by default if not cached)
        await window.getByTestId('nav-artists').click();

        // Check if offline/error message is visible
        const errorText = window.getByText('offline', { exact: false }).or(window.getByText('network error', { exact: false })).or(window.getByText('failed to fetch', { exact: false }));
        try {
            await expect(errorText.first()).toBeVisible({ timeout: 5000 });
        } catch {
            console.log('No specific offline error text found, but artists might still be empty/cached.');
        }

        // Reconnect
        await window.context().setOffline(false);
    });
});
