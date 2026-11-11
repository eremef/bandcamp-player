import { test, expect } from './fixtures';

const BANDCAMP_PLAYLIST = {
    id: 'bc-layout-playlist',
    name: 'Bandcamp Layout Playlist',
    trackCount: 3,
    totalDuration: 420,
    artworkUrl: null,
    description: 'Deterministic layout fixture',
    isBandcampPlaylist: true,
    bandcampUrl: 'https://mock.bandcamp.com/playlist/layout',
};

const EMPTY_COLLECTION = {
    items: [],
    totalCount: 0,
    lastUpdated: '2026-11-11T00:00:00.000Z',
};

test.describe('Playlists view layout', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, fixtures) => {
            ipcMain.removeHandler('playlist:get-bandcamp-playlists');
            ipcMain.handle('playlist:get-bandcamp-playlists', async () => [fixtures.playlist]);
            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.handle('collection:fetch', async () => fixtures.collection);
            ipcMain.handle('collection:refresh', async () => fixtures.collection);
            ipcMain.removeHandler('radio:get-stations');
            ipcMain.handle('radio:get-stations', async () => []);
        }, { playlist: BANDCAMP_PLAYLIST, collection: EMPTY_COLLECTION });

        await window.reload();

        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) await loginButton.click();
        await expect(collectionButton).toBeVisible({ timeout: 15000 });
        await window.getByTestId('nav-playlists').click();
        await expect(window.getByRole('heading', { name: 'Playlists', exact: true })).toBeVisible();

        const refreshButton = window.getByTitle('Refresh Bandcamp playlists');
        await expect(refreshButton).toBeEnabled();
        await refreshButton.click();
        await expect(window.getByTestId('playlists-card').filter({ hasText: BANDCAMP_PLAYLIST.name })).toBeVisible({ timeout: 10000 });

        await window.locator('button', { hasText: 'Create Playlist' }).first().click();
        await window.getByPlaceholder('Playlist Name').fill('Local Layout Playlist');
        await window.getByTitle('Save').click();
        await expect(window.getByTestId('playlists-card').filter({ hasText: 'Local Layout Playlist' })).toBeVisible({ timeout: 10000 });
    });

    test('applies all six choices to both playlist sections and uses shared list thumbnail sizes', async ({ window }) => {
        const layouts = window.getByTestId('playlists-layout');
        await expect(layouts).toHaveCount(2);

        for (const mode of ['grid', 'list'] as const) {
            for (const size of ['small', 'medium', 'large'] as const) {
                await window.getByTestId('playlists-view-toggle-btn').click();
                await window.getByTestId(`playlists-view-${mode}-btn`).click();
                await window.getByTestId('playlists-view-toggle-btn').click();
                await window.getByTestId(`playlists-cover-${size}-btn`).click();

                for (const layout of await layouts.all()) {
                    await expect(layout).toHaveAttribute('data-layout', mode);
                    await expect(layout).toHaveAttribute('data-size', size);
                    await expect(layout.getByTestId('playlists-card')).toHaveCount(1);
                    const card = layout.getByTestId('playlists-card');
                    const smallGrid = mode === 'grid' && size === 'small';
                    await expect(card.getByRole('heading', { level: 3 })).toHaveCSS('font-size', smallGrid ? '12px' : '14px');
                    await expect(card.getByRole('button', { name: /^Open playlist / })).toHaveCSS('font-size', smallGrid ? '12px' : '14px');
                    await expect(card.locator('[class*="cardMeta"]')).toHaveCSS('font-size', smallGrid ? '11px' : '13px');
                    if (mode === 'grid') {
                        const play = card.getByTitle('Play', { exact: true });
                        await expect(play).toHaveCSS('width', size === 'small' ? '28px' : '48px');
                        await expect(play).toHaveCSS('height', size === 'small' ? '28px' : '48px');
                        await expect(play.locator('svg')).toHaveCSS('width', size === 'small' ? '16px' : '32px');
                    }
                }

                if (mode === 'list') {
                    const expectedWidth = { small: 40, medium: 48, large: 64 }[size];
                    for (const layout of await layouts.all()) {
                        const artwork = layout.getByTestId('playlists-card').locator('div[class*="cardArtwork"]');
                        await expect.poll(async () => artwork.evaluate(element => element.getBoundingClientRect().width))
                            .toBe(expectedWidth);
                    }
                } else {
                    const widths = await Promise.all((await layouts.all()).map(layout =>
                        layout.getByTestId('playlists-card').evaluate(element => element.getBoundingClientRect().width),
                    ));
                    expect(widths[0]).toBeCloseTo(widths[1], 0);
                }
            }
        }
    });

    test('keeps an unfinished create input when layout changes', async ({ window }) => {
        await window.locator('button', { hasText: 'Create Playlist' }).first().click();
        const input = window.getByPlaceholder('Playlist Name');
        await input.fill('Unfinished playlist');

        await window.getByTestId('playlists-view-toggle-btn').click();
        await window.getByTestId('playlists-view-list-btn').click();

        await expect(window.getByPlaceholder('Playlist Name')).toHaveValue('Unfinished playlist');
        await expect(window.getByTestId('playlists-layout').first()).toHaveAttribute('data-layout', 'list');
    });
});
