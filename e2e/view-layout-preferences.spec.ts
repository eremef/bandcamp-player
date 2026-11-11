import { _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { test, expect } from './fixtures';

const artwork = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%231da0c3"/%3E%3C/svg%3E';
const collection = {
    items: Array.from({ length: 10 }, (_, index) => ({
        id: `layout-item-${index}`, type: 'album', token: `layout-token-${index}`, purchaseDate: '2026-01-01T00:00:00Z',
        album: {
            id: `layout-album-${index}`, title: `Layout Album ${index}`, artist: `Artist ${index}`,
            artistId: `layout-artist-${index}`, artworkUrl: artwork, bandcampUrl: '', trackCount: 2,
            tracks: Array.from({ length: 2 }, (_, track) => ({
                id: `layout-track-${index}-${track}`, title: `Layout Track ${index} ${track}`, artist: `Artist ${index}`,
                artistId: `layout-artist-${index}`, album: `Layout Album ${index}`, duration: 180,
                artworkUrl: artwork, streamUrl: '', bandcampUrl: '', isCached: false,
            })),
        },
    })),
    totalCount: 10, lastUpdated: '2026-01-01T00:00:00Z',
};
const playlists = Array.from({ length: 6 }, (_, index) => ({
    id: `layout-playlist-${index}`, name: `Layout Playlist ${index}`, tracks: [], trackCount: 0,
    artworkUrl: artwork, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}));
const stations = Array.from({ length: 8 }, (_, index) => ({
    id: `layout-radio-${index}`, name: `Layout Radio ${index}`, imageUrl: artwork,
    date: 'January 1, 2026', duration: 3600, description: 'A deterministic radio description for layout verification.',
    audioUrl: '', streamUrl: '',
}));
const views = [
    { name: 'Collection', prefix: '', card: 'album-card' },
    { name: 'Artists', prefix: 'artists-', card: 'artists-card' },
    { name: 'Playlists', prefix: 'playlists-', card: 'playlists-card' },
    { name: 'Radio', prefix: 'radio-', card: 'radio-card' },
] as const;

async function prepare(app: ElectronApplication, page: Page) {
    await app.evaluate(({ ipcMain, BrowserWindow }, data) => {
        const auth = { isAuthenticated: true, user: { id: 'layout-fan', username: 'layout-fan', displayName: 'Layout Fan', avatarUrl: '', profileUrl: '' } };
        for (const channel of ['auth:check-session', 'auth:login', 'auth:refresh-user']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, () => auth);
        }
        for (const channel of ['collection:fetch', 'collection:refresh']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, event => {
                event.sender.send('collection:on-updated', data.collection);
                return data.collection;
            });
        }
        ipcMain.removeHandler('collection:get-artists');
        ipcMain.handle('collection:get-artists', () => []);
        ipcMain.removeHandler('playlist:get-all');
        ipcMain.handle('playlist:get-all', () => data.playlists);
        ipcMain.removeHandler('playlist:get-bandcamp-playlists');
        ipcMain.handle('playlist:get-bandcamp-playlists', () => data.playlists.map(playlist => ({ ...playlist, id: `bc-${playlist.id}` })));
        for (const channel of ['radio:get-stations', 'radio:refresh-stations']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, () => data.stations);
        }
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('radio:on-stations-updated', data.stations);
    }, { collection, playlists, stations });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Collection', exact: true })).toBeVisible();
}

async function visit(page: Page, view: typeof views[number]) {
    await page.getByRole('button', { name: view.name, exact: true }).click();
    await expect(page.getByRole('heading', { name: view.name === 'Radio' ? 'Bandcamp Radio' : view.name, level: 1, exact: true })).toBeVisible();
    if (view.name === 'Radio') {
        await page.getByTitle('Refresh radio stations').click();
        await expect(page.getByTestId(view.card).filter({ hasText: 'Layout Radio 0' })).toBeVisible();
    }
    await expect(page.getByTestId(view.card).first()).toBeVisible();
}

async function choose(page: Page, prefix: string, option: string) {
    await page.getByTestId(`${prefix}view-toggle-btn`).click();
    await page.getByTestId(`${prefix}${option}`).click();
    await expect(page.getByTestId(`${prefix}view-toggle-btn`)).toHaveAttribute('aria-expanded', 'false');
}

async function checkChoice(page: Page, prefix: string, mode: string, size: string) {
    await page.getByTestId(`${prefix}view-toggle-btn`).click();
    await expect(page.getByTestId(`${prefix}view-${mode}-btn`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`${prefix}cover-${size}-btn`)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
}

async function geometry(card: Locator) {
    return card.evaluate(element => {
        const parent = element.parentElement!;
        const style = getComputedStyle(parent);
        const rect = element.getBoundingClientRect();
        return { width: rect.width, container: parent.getBoundingClientRect().width, gap: parseFloat(style.columnGap), columns: style.gridTemplateColumns.split(' ').length };
    });
}

test('keeps independent choices across navigation, settings updates, and a real Electron restart', async ({ electronApp, window, userDataPath, remotePort }) => {
    await prepare(electronApp, window);
    const choices = [
        { mode: 'list', size: 'small' }, { mode: 'grid', size: 'large' },
        { mode: 'list', size: 'medium' }, { mode: 'grid', size: 'small' },
    ];
    for (const [index, view] of views.entries()) {
        await visit(window, view);
        await choose(window, view.prefix, `view-${choices[index].mode}-btn`);
        await choose(window, view.prefix, `cover-${choices[index].size}-btn`);
    }
    const expected = {
        collectionViewMode: 'list', collectionCoverSize: 'small',
        artistsViewMode: 'grid', artistsCoverSize: 'large',
        playlistsViewMode: 'list', playlistsCoverSize: 'medium',
        radioViewMode: 'grid', radioCoverSize: 'small',
    };
    await window.evaluate(() => window.electron.settings.set({ showNotifications: false }));
    await expect.poll(() => window.evaluate(() => window.electron.settings.get())).toMatchObject(expected);
    for (const [index, view] of views.entries()) {
        await visit(window, view);
        await checkChoice(window, view.prefix, choices[index].mode, choices[index].size);
    }
    await electronApp.close();
    const restarted = await electron.launch({
        args: [join(__dirname, '../dist/main/main.js'), `--user-data-dir=${userDataPath}`],
        env: { ...process.env, NODE_ENV: 'production', E2E_TEST: 'true', REMOTE_PORT: String(remotePort) },
    });
    try {
        const page = await restarted.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        await prepare(restarted, page);
        await expect.poll(() => page.evaluate(() => window.electron.settings.get())).toMatchObject(expected);
        for (const [index, view] of views.entries()) {
            await visit(page, view);
            await checkChoice(page, view.prefix, choices[index].mode, choices[index].size);
        }
    } finally {
        await restarted.close();
    }
});

test('uses the same actual card widths and gaps across all grids at each size', async ({ electronApp, window }) => {
    await prepare(electronApp, window);
    for (const size of ['small', 'medium', 'large']) {
        const measurements: Awaited<ReturnType<typeof geometry>>[] = [];
        for (const view of views) {
            await visit(window, view);
            await choose(window, view.prefix, 'view-grid-btn');
            await choose(window, view.prefix, `cover-${size}-btn`);
            const cards = window.getByTestId(view.card);
            const parent = cards.first().locator('..');
            await parent.evaluate(element => { (element as HTMLElement).style.width = '560px'; });
            await expect.poll(() => geometry(cards.first()).then(result => result.container)).toBeCloseTo(560, 0);
            measurements.push(await geometry(cards.first()));
            if (view.name === 'Playlists') {
                const bandcampCard = cards.filter({ hasText: 'Layout Playlist 0' }).last();
                await bandcampCard.locator('..').evaluate(element => { (element as HTMLElement).style.width = '560px'; });
                measurements.push(await geometry(bandcampCard));
            }
        }
        for (const result of measurements) {
            expect(result.width).toBeCloseTo(measurements[0].width, 0);
            expect(result.gap).toBe(measurements[0].gap);
            expect(result.columns).toBe(size === 'small' ? 4 : 2);
        }
    }
});

test('keeps layout controls and cards inside the content area at supported desktop widths', async ({ electronApp, window }, testInfo) => {
    await prepare(electronApp, window);
    for (const width of [975, 1280, 1600]) {
        await electronApp.evaluate(({ BrowserWindow }, contentWidth) => {
            BrowserWindow.getAllWindows()[0].setContentSize(contentWidth, contentWidth === 975 ? 600 : 900);
        }, width);
        for (const view of views) {
            await visit(window, view);
            await choose(window, view.prefix, 'view-grid-btn');
            await choose(window, view.prefix, 'cover-small-btn');
            const trigger = window.getByTestId(`${view.prefix}view-toggle-btn`);
            await trigger.click();
            const option = await window.getByTestId(`${view.prefix}cover-large-btn`).boundingBox();
            expect(option).not.toBeNull();
            expect(option!.x).toBeGreaterThanOrEqual(0);
            expect(option!.x + option!.width).toBeLessThanOrEqual(await window.evaluate(() => innerWidth));
            await window.keyboard.press('Escape');
            const toolbarFits = await trigger.evaluate(element => {
                const container = element.closest('[class*="container"]')!;
                return container.scrollWidth <= container.clientWidth + 1;
            });
            expect(toolbarFits).toBe(true);
            const fits = await window.getByTestId(view.card).first().evaluate(element => {
                const parent = element.parentElement!;
                return parent.scrollWidth <= parent.clientWidth + 1;
            });
            expect(fits).toBe(true);
            await window.screenshot({ path: testInfo.outputPath(`${view.name.toLowerCase()}-${width}-small.png`) });
        }
    }
});
