import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

const ART = 'https://f4.bcbits.com/img/a2793963001_10.jpg';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'item-album-a', type: 'album' as const, token: 'tok-a',
            purchaseDate: new Date().toISOString(),
            album: {
                id: 'va-1', title: 'View Mode Album', artist: 'Layout Artist',
                artistId: 'artist-l', artworkUrl: ART,
                bandcampUrl: 'https://mock.bandcamp.com/album/a',
                trackCount: 1,
                tracks: [
                    {
                        id: 'vt-1', title: 'Track A', artist: 'Layout Artist',
                        artistId: 'artist-l', album: 'View Mode Album', duration: 180,
                        artworkUrl: ART, streamUrl: 'https://mock.stream/a.mp3',
                        bandcampUrl: '', isCached: false,
                    },
                ],
            },
        },
        {
            id: 'item-track-b', type: 'track' as const, token: 'tok-b',
            purchaseDate: new Date().toISOString(),
            track: {
                id: 'vt-2', title: 'Standalone Track', artist: 'Row Artist',
                artistId: 'artist-r', album: 'Row Album', duration: 200,
                artworkUrl: ART, streamUrl: 'https://mock.stream/b.mp3',
                bandcampUrl: '', isCached: false,
            },
        },
    ],
    totalCount: 2,
    lastUpdated: new Date().toISOString(),
};

async function openCollection(electronApp: any, window: any) {
    await electronApp.evaluate(({ ipcMain }: any, mockCollection: any) => {
        ipcMain.removeHandler('collection:fetch');
        ipcMain.removeHandler('collection:refresh');
        ipcMain.handle('collection:fetch', async () => mockCollection);
        ipcMain.handle('collection:refresh', async () => mockCollection);
    }, MOCK_COLLECTION);

    const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
    const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });
    if (await loginBtn.isVisible()) await loginBtn.click();
    await expect(collectionBtn).toBeVisible({ timeout: 15000 });

    await collectionBtn.click();
    await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
}

/** The layout container is the album cards' shared parent. */
function layoutClass(window: any) {
    return window.getByTestId('album-card').first()
        .evaluate((el: HTMLElement) => el.parentElement?.className ?? '');
}

test.describe('Collection View Mode', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await openCollection(electronApp, window);
        await new AppHelpers(window).resetCollectionState();
        await window.getByTitle('Refresh').click();
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
    });

    test('defaults to a medium grid', async ({ window }) => {
        const cls = await layoutClass(window);
        expect(cls).toMatch(/grid/);
        expect(cls).toMatch(/sizeMedium/);
        expect(cls).not.toMatch(/list/);
    });

    test('switches between grid and list without losing items', async ({ window }) => {
        const before = await window.getByTestId('album-card').count();
        expect(before).toBe(2);

        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('view-list-btn').click();

        await expect
            .poll(async () => await layoutClass(window))
            .toMatch(/list/);
        await expect(window.getByTestId('album-card')).toHaveCount(before);
        await expect(window.locator('text=View Mode Album')).toBeVisible();
        await expect(window.locator('text=Standalone Track')).toBeVisible();

        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('view-grid-btn').click();

        await expect
            .poll(async () => await layoutClass(window))
            .toMatch(/grid/);
        await expect(window.getByTestId('album-card')).toHaveCount(before);
    });

    test('applies each cover size', async ({ window }) => {
        for (const [size, expected] of [
            ['small', /sizeSmall/],
            ['large', /sizeLarge/],
            ['medium', /sizeMedium/],
        ] as const) {
            await window.getByTestId('view-toggle-btn').click();
            await window.getByTestId(`cover-${size}-btn`).click();
            await expect.poll(async () => await layoutClass(window)).toMatch(expected);
        }
    });

    test('requests a smaller artwork variant than the 1200px original', async ({ window }) => {
        const gridSrc = await window.getByTestId('album-card').first()
            .locator('img').getAttribute('src');
        expect(gridSrc).toBe('https://f4.bcbits.com/img/a2793963001_16.jpg');

        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('view-list-btn').click();
        await expect.poll(async () => await layoutClass(window)).toMatch(/list/);

        const listSrc = await window.getByTestId('album-card').first()
            .locator('img').getAttribute('src');
        expect(listSrc).toBe('https://f4.bcbits.com/img/a2793963001_7.jpg');
    });

    test('lazy-loads collection artwork', async ({ window }) => {
        await expect(window.getByTestId('album-card').first().locator('img'))
            .toHaveAttribute('loading', 'lazy');
    });

    test('keeps row actions working in list mode', async ({ window }) => {
        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('view-list-btn').click();
        await expect.poll(async () => await layoutClass(window)).toMatch(/list/);

        const row = window.getByTestId('album-card').first();
        await row.click({ button: 'right' });

        await expect(window.locator('text=Play Now')).toBeVisible();
        await expect(window.locator('text=Add to Queue')).toBeVisible();
    });

    test('persists the layout across a restart', async ({ electronApp, window }) => {
        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('view-list-btn').click();
        await expect.poll(async () => await layoutClass(window)).toMatch(/list/);

        await window.getByTestId('view-toggle-btn').click();
        await window.getByTestId('cover-small-btn').click();
        await expect.poll(async () => await layoutClass(window)).toMatch(/sizeSmall/);

        const saved = await window.evaluate(async () => {
            const s = await window.electron.settings.get();
            return { mode: s?.collectionViewMode, size: s?.collectionCoverSize };
        });
        expect(saved).toEqual({ mode: 'list', size: 'small' });

        // Reload the renderer — the choice must come back from SQLite.
        await window.reload();
        await openCollection(electronApp, window);

        const cls = await layoutClass(window);
        expect(cls).toMatch(/list/);
        expect(cls).toMatch(/sizeSmall/);

        // Leave the shared settings row as the other specs expect it.
        await new AppHelpers(window).resetCollectionState();
    });
});
