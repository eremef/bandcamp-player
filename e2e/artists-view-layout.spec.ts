import { test, expect } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

const MOCK_COLLECTION = {
    items: [
        {
            id: 'artist-item-aster', type: 'track' as const, token: 'artist-token-aster',
            purchaseDate: '2026-01-01T00:00:00.000Z',
            track: {
                id: 'artist-track-aster', title: 'Aster track', artist: 'Aster',
                artistId: 'artist-aster', album: 'Aster album', duration: 180,
                artworkUrl: '', streamUrl: 'https://mock.stream/aster.mp3',
                bandcampUrl: '', isCached: false,
            },
        },
        {
            id: 'artist-item-alpine', type: 'track' as const, token: 'artist-token-alpine',
            purchaseDate: '2026-01-02T00:00:00.000Z',
            track: {
                id: 'artist-track-alpine', title: 'Alpine track', artist: 'Alpine',
                artistId: 'artist-alpine', album: 'Alpine album', duration: 180,
                artworkUrl: '', streamUrl: 'https://mock.stream/alpine.mp3',
                bandcampUrl: '', isCached: false,
            },
        },
        {
            id: 'artist-item-beacon', type: 'track' as const, token: 'artist-token-beacon',
            purchaseDate: '2026-01-03T00:00:00.000Z',
            track: {
                id: 'artist-track-beacon', title: 'Beacon track', artist: 'Beacon',
                artistId: 'artist-beacon', album: 'Beacon album', duration: 180,
                artworkUrl: '', streamUrl: 'https://mock.stream/beacon.mp3',
                bandcampUrl: '', isCached: false,
            },
        },
        {
            id: 'artist-item-seven', type: 'track' as const, token: 'artist-token-seven',
            purchaseDate: '2026-01-04T00:00:00.000Z',
            track: {
                id: 'artist-track-seven', title: 'Seven track', artist: '7 Wonders',
                artistId: 'artist-seven', album: 'Seven album', duration: 180,
                artworkUrl: '', streamUrl: 'https://mock.stream/seven.mp3',
                bandcampUrl: '', isCached: false,
            },
        },
    ],
    totalCount: 4,
    lastUpdated: '2026-01-04T00:00:00.000Z',
};

async function openArtists(electronApp: ElectronApplication, window: Page) {
    await electronApp.evaluate(({ ipcMain }, mockCollection) => {
        ipcMain.removeHandler('collection:fetch');
        ipcMain.removeHandler('collection:refresh');
        ipcMain.removeHandler('radio:get-stations');
        ipcMain.handle('collection:fetch', async () => mockCollection);
        ipcMain.handle('collection:refresh', async () => mockCollection);
        ipcMain.handle('radio:get-stations', async () => []);
    }, MOCK_COLLECTION);

    const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
    const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
    if (await loginButton.isVisible()) await loginButton.click();
    await expect(collectionButton).toBeVisible({ timeout: 15000 });
    await collectionButton.click();
    await window.getByTitle('Refresh').click();
    await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });

    await window.getByRole('button', { name: 'Artists', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible();
    await expect(window.getByTestId('artists-card').first()).toBeVisible();
}

test.describe('Artists View Layout', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await openArtists(electronApp, window);
    });

    test('applies all grid/list and cover size choices to every alphabetical group', async ({ window }) => {
        expect(await window.getByTestId('artists-card').count()).toBe(4);
        expect(await window.getByTestId('artists-layout').count()).toBe(3);
        await expect(window.getByRole('heading', { name: 'A', level: 2 })).toBeVisible();
        await expect(window.getByRole('heading', { name: 'B', level: 2 })).toBeVisible();
        await expect(window.getByRole('heading', { name: '#', level: 2 })).toBeVisible();

        for (const mode of ['grid', 'list'] as const) {
            for (const size of ['small', 'medium', 'large'] as const) {
                await window.getByTestId('artists-view-toggle-btn').click();
                await window.getByTestId(`artists-view-${mode}-btn`).click();
                await window.getByTestId('artists-view-toggle-btn').click();
                await window.getByTestId(`artists-cover-${size}-btn`).click();

                for (const layout of await window.getByTestId('artists-layout').all()) {
                    await expect(layout).toHaveAttribute('data-layout', mode);
                    await expect(layout).toHaveAttribute('data-size', size);
                    const className = await layout.getAttribute('class');
                    expect(className).toContain(mode);
                    expect(className).toContain(`size${size[0].toUpperCase()}${size.slice(1)}`);
                    const card = layout.getByTestId('artists-card').first();
                    const smallGrid = mode === 'grid' && size === 'small';
                    await expect(card.locator('[class*="artistName"]')).toHaveCSS('font-size', smallGrid ? '12px' : '14px');
                    await expect(card.locator('[class*="itemCount"]')).toHaveCSS('font-size', smallGrid ? '11px' : '12px');
                }
                await expect(window.getByTestId('artists-card')).toHaveCount(4);
            }
        }
    });

    test('keeps search and artist navigation working in list mode', async ({ window }) => {
        await window.getByTestId('artists-view-toggle-btn').click();
        await window.getByTestId('artists-view-list-btn').click();

        const search = window.getByPlaceholder('Search..');
        await search.fill('Aster');
        await expect(window.getByTestId('artists-card')).toHaveCount(1);
        await expect(window.getByTestId('artists-card').first()).toContainText('Aster');

        await window.getByTestId('artists-view-toggle-btn').click();
        await window.getByTestId('artists-view-grid-btn').click();
        await expect(search).toHaveValue('Aster');
        await expect(window.getByTestId('artists-card')).toHaveCount(1);

        await window.getByTestId('artists-card').focus();
        await window.keyboard.press('Enter');
        await expect(window.getByRole('heading', { name: 'Aster', level: 1 })).toBeVisible();
        await window.getByRole('button', { name: 'Back', exact: true }).click();
        await expect(window.getByPlaceholder('Search..')).toHaveValue('Aster');
    });

    test('uses the shared thumbnail widths in list mode', async ({ window }) => {
        await window.getByTestId('artists-view-toggle-btn').click();
        await window.getByTestId('artists-view-list-btn').click();

        for (const [size, width] of [
            ['small', 40],
            ['medium', 48],
            ['large', 64],
        ] as const) {
            await window.getByTestId('artists-view-toggle-btn').click();
            await window.getByTestId(`artists-cover-${size}-btn`).click();
            await expect(window.getByTestId('artists-layout').first()).toHaveAttribute('data-size', size);
            const artwork = await window.getByTestId('artists-artwork').first().boundingBox();
            expect(artwork?.width).toBe(width);
        }
    });

    test('shows full-width menus above neighbouring cards at either grid edge', async ({ window }, testInfo) => {
        for (const [size, width] of [['small', 260], ['medium', 400], ['large', 560]] as const) {
            await window.getByTestId('artists-view-toggle-btn').click();
            await window.getByTestId(`artists-cover-${size}-btn`).click();
            const layout = window.getByTestId('artists-layout').first();
            await layout.evaluate((element, layoutWidth) => { element.style.width = `${layoutWidth}px`; }, width);
            const bounds = await layout.boundingBox();
            expect(bounds).not.toBeNull();
            if (!bounds) throw new Error('Artist grid has no bounding box');

            for (const [artistId, artistName, side] of [
                ['name-aster', 'Aster', 'Right'],
                ['name-alpine', 'Alpine', 'Left'],
            ] as const) {
                const card = window.locator(`[data-testid="artists-card"][data-artist-id="${artistId}"]`);
                if (side === 'Left') {
                    await card.click({ button: 'right' });
                } else {
                    await card.getByRole('button', { name: `More options for ${artistName}` }).click();
                }
                const menu = card.locator('div[class*="cardMenu"]');
                await expect(menu).toHaveClass(new RegExp(`cardMenu${side}`));
                await expect(menu.getByRole('button', { name: 'Play Now' })).toBeVisible();
                const rect = await menu.boundingBox();
                const cardRect = await card.boundingBox();
                expect(rect).not.toBeNull();
                expect(cardRect).not.toBeNull();
                if (!rect || !cardRect) throw new Error('Artist menu or card has no bounding box');
                expect(rect.width).toBe(200);
                expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
                expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);

                if (size === 'small') {
                    expect(rect.width).toBeGreaterThan(cardRect.width);
                    const overhangX = side === 'Right'
                        ? (rect.x + cardRect.x) / 2
                        : (cardRect.x + cardRect.width + rect.x + rect.width) / 2;
                    const overhangY = rect.y + 20;
                    const hit = await menu.evaluate((element, point) => {
                        const target = document.elementFromPoint(point.x, point.y);
                        return {
                            inside: element.contains(target),
                            point,
                            menu: element.getBoundingClientRect().toJSON(),
                            target: target?.outerHTML.slice(0, 300),
                        };
                    }, { x: overhangX, y: overhangY });
                    expect(hit, JSON.stringify(hit)).toMatchObject({ inside: true });
                    await window.mouse.move(overhangX, overhangY);
                    await expect(menu).toBeVisible();
                    expect(await menu.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x: overhangX, y: overhangY })).toBe(true);
                    await window.screenshot({ path: testInfo.outputPath(`artist-menu-${side.toLowerCase()}-edge.png`) });
                }
                await window.getByRole('heading', { name: 'Artists', level: 1 }).hover();
                await expect(menu).toBeHidden();
            }
        }

        await window.getByTestId('artists-view-toggle-btn').click();
        await window.getByTestId('artists-view-list-btn').click();
        const row = window.getByTestId('artists-card').first();
        await row.getByRole('button', { name: /^More options for / }).click();
        const listMenu = row.locator('div[class*="cardMenu"]');
        await expect(listMenu).toHaveClass(/cardMenuRight/);
        await expect(listMenu).toHaveCSS('width', '200px');
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible();
        await expect(window.getByRole('heading', { name: 'Aster', level: 1 })).not.toBeVisible();
    });
});
