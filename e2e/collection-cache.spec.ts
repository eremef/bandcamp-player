import { test, expect } from './fixtures';

/**
 * Guards cache-first startup.
 *
 * Every other spec stubs `collection:fetch` and `collection:refresh` with the
 * SAME fixture, which makes them behaviourally indistinguishable — a regression
 * that swaps one for the other is invisible. Here they return DIFFERENT data so
 * the test can tell which path the app actually took.
 */

const makeCollection = (label: string) => ({
    items: [
        {
            id: `item-${label}`,
            type: 'album' as const,
            token: `tok-${label}`,
            purchaseDate: new Date().toISOString(),
            album: {
                id: `album-${label}`,
                title: `${label} Album`,
                artist: `${label} Artist`,
                artistId: `artist-${label}`,
                artworkUrl: '',
                bandcampUrl: `https://mock.bandcamp.com/album/${label}`,
                trackCount: 1,
                tracks: [
                    {
                        id: `track-${label}`,
                        title: `${label} Track`,
                        artist: `${label} Artist`,
                        album: `${label} Album`,
                        duration: 180,
                        artworkUrl: '',
                        streamUrl: '',
                        bandcampUrl: '',
                        isCached: false,
                    },
                ],
            },
            isCached: false,
        },
    ],
    totalCount: 1,
    lastUpdated: new Date().toISOString(),
});

const CACHED = makeCollection('Cached');
const NETWORK = makeCollection('Network');

test.describe('Collection cache-first startup', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(
            ({ ipcMain }, { cached, network }) => {
                ipcMain.removeHandler('collection:fetch');
                ipcMain.removeHandler('collection:refresh');
                // Cache-first path resolves immediately...
                ipcMain.handle('collection:fetch', async () => cached);
                // ...while a forced refresh is slow, like a real scrape.
                ipcMain.handle('collection:refresh', async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    return network;
                });
            },
            { cached: CACHED, network: NETWORK },
        );

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(window.getByTestId('nav-collection')).toBeVisible({
            timeout: 15000,
        });
        await window.getByTestId('nav-collection').click();
    });

    test('renders the cached collection on startup without a blocking loader', async ({
        window,
    }) => {
        await expect(window.getByTestId('album-card').first()).toBeVisible({
            timeout: 15000,
        });

        // The cache-first channel supplied the data, not the slow refresh.
        await expect(window.locator('text=Cached Album').first()).toBeVisible();
        await expect(window.locator('text=Loading your collection...')).toHaveCount(0);
        await expect(window.getByTestId('collection-updating')).toHaveCount(0);
    });

    test('shows a non-blocking updating hint while a manual refresh runs', async ({
        window,
    }) => {
        await expect(window.getByTestId('album-card').first()).toBeVisible({
            timeout: 15000,
        });

        await window.getByTestId('icon-refresh').locator('..').click();

        // Hint appears and the grid keeps its cached content meanwhile.
        await expect(window.getByTestId('collection-updating')).toBeVisible();
        await expect(window.getByTestId('album-card').first()).toBeVisible();
        await expect(window.locator('text=Loading your collection...')).toHaveCount(0);

        // Once the refresh lands, the hint clears and fresh data is shown.
        await expect(window.getByTestId('collection-updating')).toHaveCount(0, {
            timeout: 15000,
        });
        await expect(window.locator('text=Network Album').first()).toBeVisible();
    });
});
