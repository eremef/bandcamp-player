import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ARTWORK_DIMENSIONS = [[120, 240], [160, 160], [320, 90]] as const;
const ARTWORK = ARTWORK_DIMENSIONS.map(([width, height]) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#bddbe7"/><rect width="100%" height="10" fill="#008000"/><rect y="${height - 10}" width="100%" height="10" fill="#0000ff"/><circle cx="${width / 2}" cy="24" r="12" fill="#e89768"/><rect x="${width / 2 - 12}" y="36" width="24" height="40" fill="#634e8a"/></svg>`,
));

const MOCK_STATIONS = Array.from({ length: 65 }, (_, index) => ({
    id: `station-${index + 1}`,
    name: index === 0 ? 'Bandcamp Weekly' : `Radio Station ${String(index + 1).padStart(2, '0')}`,
    description: index === 0 ? 'Curated weekly selections' : `Deterministic radio fixture ${index + 1}`,
    imageUrl: ARTWORK[index % ARTWORK.length],
    date: `Nov ${String((index % 28) + 1).padStart(2, '0')}, 2026`,
    duration: 3720,
    streamUrl: `https://mock.stream/radio-${index + 1}.mp3`,
    genre: 'Fixture',
}));

const SIZES = [
    { name: 'small', width: 40 },
    { name: 'medium', width: 48 },
    { name: 'large', width: 64 },
] as const;

async function selectLayout(window: Page, mode: 'grid' | 'list') {
    await window.getByTestId('radio-view-toggle-btn').click();
    await window.getByTestId(`radio-view-${mode}-btn`).click();
    await expect(window.getByTestId('radio-layout')).toHaveAttribute('data-layout', mode);
}

async function expectLayoutSelected(window: Page, mode: 'grid' | 'list') {
    await window.getByTestId('radio-view-toggle-btn').click();
    await expect(window.getByTestId(`radio-view-${mode}-btn`)).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('Escape');
}

async function selectSize(window: Page, size: 'small' | 'medium' | 'large') {
    await window.getByTestId('radio-view-toggle-btn').click();
    await window.getByTestId(`radio-cover-${size}-btn`).click();
    await expect(window.getByTestId('radio-layout')).toHaveAttribute('data-size', size);
}

async function expectSizeSelected(window: Page, size: 'small' | 'medium' | 'large') {
    await window.getByTestId('radio-view-toggle-btn').click();
    await expect(window.getByTestId(`radio-cover-${size}-btn`)).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('Escape');
}

async function loadAllStations(window: Page) {
    const stations = window.getByTestId('radio-card');
    for (let batch = 0; batch < 8; batch += 1) {
        const count = await stations.count();
        if (count === MOCK_STATIONS.length) break;

        await window.getByTestId('radio-load-more-sentinel').scrollIntoViewIfNeeded();
        await expect.poll(() => stations.count(), { timeout: 5000 }).toBeGreaterThan(count);
    }
    await expect(stations).toHaveCount(MOCK_STATIONS.length);
    await expect(stations.last()).toContainText('Radio Station 65');
}

test.describe('Radio layout and sizing', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain, BrowserWindow }, stations) => {
            const auth = {
                isAuthenticated: true,
                user: {
                    id: 'radio-layout-user',
                    username: 'radio-layout-user',
                    displayName: 'Radio Layout User',
                    avatarUrl: '',
                    profileUrl: '',
                },
            };
            for (const channel of ['auth:check-session', 'auth:login', 'auth:refresh-user']) {
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, () => auth);
            }

            ipcMain.removeHandler('collection:fetch');
            ipcMain.removeHandler('collection:refresh');
            ipcMain.removeHandler('playlist:get-all');
            ipcMain.removeHandler('playlist:get-bandcamp-playlists');
            ipcMain.removeHandler('radio:get-stations');
            ipcMain.removeHandler('radio:refresh-stations');
            ipcMain.removeHandler('radio:play-station');
            ipcMain.removeHandler('radio:extract-tracks');
            ipcMain.handle('collection:fetch', async () => ({ items: [] }));
            ipcMain.handle('collection:refresh', async () => ({ items: [] }));
            ipcMain.handle('playlist:get-all', async () => []);
            ipcMain.handle('playlist:get-bandcamp-playlists', async () => []);
            ipcMain.handle('radio:get-stations', async () => stations);
            ipcMain.handle('radio:refresh-stations', async (event) => {
                event.sender.send('radio:on-stations-updated', stations);
                return stations;
            });
            ipcMain.handle('radio:play-station', async (event, station) => {
                event.sender.send('radio:on-state-changed', {
                    isActive: true,
                    currentStation: station,
                    currentTrack: null,
                });
            });
            ipcMain.handle('radio:extract-tracks', async () => undefined);

            for (const browserWindow of BrowserWindow.getAllWindows()) {
                const webContents = browserWindow.webContents;
                const originalSend = webContents.send.bind(webContents);
                webContents.send = (channel, ...args) => originalSend(
                    channel,
                    ...(channel === 'radio:on-stations-updated' ? [stations] : args),
                );
            }
        }, MOCK_STATIONS);

        await window.reload();

        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) await loginButton.click();
        await expect(collectionButton).toBeVisible({ timeout: 15000 });

        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', exact: true })).toBeVisible();
        await window.evaluate(() => window.electron.radio.refreshStations());
        await expect(window.getByTestId('radio-card').first()).toContainText('Bandcamp Weekly');
        const initialCount = await window.getByTestId('radio-card').count();
        expect(initialCount).toBeGreaterThanOrEqual(20);
        expect(initialCount).toBeLessThanOrEqual(MOCK_STATIONS.length);
    });

    test('applies all six layouts with original grid overlays and uncropped artwork', async ({ window }, testInfo) => {
        const layout = window.getByTestId('radio-layout');
        const firstStation = window.getByTestId('radio-card').first();

        for (const size of SIZES) {
            await selectLayout(window, 'grid');
            await expectLayoutSelected(window, 'grid');
            await selectSize(window, size.name);
            await expectSizeSelected(window, size.name);

            await expect(firstStation.getByRole('heading', { level: 3 })).toHaveCSS('font-size', size.name === 'small' ? '12px' : '14px');
            await expect(firstStation.locator('[class*="cardDate"]')).toHaveCSS('font-size', size.name === 'small' ? '11px' : '12px');
            await expect(firstStation.locator('[class*="cardDescription"]')).toHaveCSS('font-size', size.name === 'small' ? '11px' : '13px');

            await window.getByRole('heading', { name: 'Bandcamp Radio' }).hover();
            const overlay = firstStation.getByTestId('radio-card-actions');
            await expect(overlay).toHaveCSS('opacity', '0');
            expect(await overlay.evaluate(element => element.parentElement?.getAttribute('data-testid'))).toBe('radio-card-image');
            await firstStation.getByTitle('Play Mix').focus();
            await expect(overlay).toHaveCSS('opacity', '1');
            await window.getByTestId('radio-view-toggle-btn').focus();
            await firstStation.hover();
            await expect(overlay).toHaveCSS('opacity', '1');

            const frame = await firstStation.getByTestId('radio-card-image').boundingBox();
            expect(frame).not.toBeNull();
            if (!frame) throw new Error('Radio artwork frame has no bounding box');
            const controls = [];
            for (const button of await overlay.getByRole('button').all()) {
                const box = await button.boundingBox();
                expect(box).not.toBeNull();
                if (!box) throw new Error('Radio overlay button has no bounding box');
                expect(box.x).toBeGreaterThanOrEqual(frame.x);
                expect(box.y).toBeGreaterThanOrEqual(frame.y);
                expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
                expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
                controls.push(box);
            }
            for (const [index, box] of controls.entries()) {
                for (const other of controls.slice(index + 1)) {
                    const overlaps = box.x < other.x + other.width && box.x + box.width > other.x
                        && box.y < other.y + other.height && box.y + box.height > other.y;
                    expect(overlaps).toBe(false);
                }
            }
            expect(controls[0].width).toBe(size.name === 'small' ? 28 : 56);
            expect(controls[0].height).toBe(controls[0].width);
            await expect(firstStation.getByTitle('Play Mix')).toHaveCSS('border-radius', '9999px');

            if (size.name === 'small') {
                const actions = firstStation.getByTestId('radio-card-actions').getByRole('button');
                await expect(actions).toHaveCount(4);
                for (const action of await actions.all()) {
                    const box = await action.boundingBox();
                    expect(box).not.toBeNull();
                    if (!box) throw new Error('Radio action button has no bounding box');
                    expect(box.width).toBeGreaterThanOrEqual(20);
                    expect(box.height).toBeGreaterThanOrEqual(20);
                    await expect(action).toBeVisible();
                }

                await firstStation.getByTitle('More options').click();
                const menu = firstStation.locator('[class*="contextMenu"]');
                await expect(menu).toBeVisible();
                const menuBox = await menu.boundingBox();
                expect(menuBox).not.toBeNull();
                if (!menuBox) throw new Error('Small grid context menu has no bounding box');
                const viewportWidth = await window.evaluate(() => window.innerWidth);
                expect(menuBox.x).toBeGreaterThanOrEqual(0);
                expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewportWidth);
                await window.getByRole('heading', { name: 'Bandcamp Radio' }).click();
                await expect(menu).toBeHidden();

                const rightmostIndex = await window.getByTestId('radio-card').evaluateAll((cards) => {
                    const top = Math.min(...cards.map(card => (card as HTMLElement).offsetTop));
                    return cards.reduce((rightmost, card, index) => {
                        const rect = card.getBoundingClientRect();
                        if ((card as HTMLElement).offsetTop !== top) return rightmost;
                        return rect.right > cards[rightmost].getBoundingClientRect().right ? index : rightmost;
                    }, 0);
                });
                const rightmostCard = window.getByTestId('radio-card').nth(rightmostIndex);
                await rightmostCard.getByTitle('More options').click();
                const rightmostMenu = rightmostCard.locator('[class*="contextMenu"]');
                await expect(rightmostMenu).toBeVisible();
                await expect(rightmostMenu).toHaveClass(/contextMenuRight/);
                const rightmostMenuBox = await rightmostMenu.boundingBox();
                expect(rightmostMenuBox).not.toBeNull();
                if (!rightmostMenuBox) throw new Error('Right aligned context menu has no bounding box');
                expect(rightmostMenuBox.x + rightmostMenuBox.width).toBeLessThanOrEqual(viewportWidth);
                await window.getByRole('heading', { name: 'Bandcamp Radio' }).click();
            }

            await selectLayout(window, 'list');
            await expectLayoutSelected(window, 'list');
            await expect(layout).toHaveAttribute('data-layout', 'list');
            await expect(layout).toHaveAttribute('data-size', size.name);
            const image = firstStation.getByTestId('radio-card-image');
            await expect(image).toBeVisible();
            const imageBox = await image.boundingBox();
            expect(imageBox).not.toBeNull();
            if (!imageBox) throw new Error('Radio list artwork has no bounding box');
            expect(imageBox.width).toBe(size.width);
            expect(imageBox.height).toBeCloseTo(size.width * 9 / 16, 1);
            expect(await firstStation.getByTestId('radio-card-actions').evaluate(element => element.parentElement?.getAttribute('data-testid'))).toBe('radio-card');

            for (const mode of ['list', 'grid'] as const) {
                await selectLayout(window, mode);
                for (let index = 0; index < ARTWORK_DIMENSIONS.length; index++) {
                    const cover = window.getByTestId('radio-card').nth(index).getByTestId('radio-card-image').locator('img');
                    await expect.poll(() => cover.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
                    await expect(cover).toHaveCSS('object-fit', 'contain');
                    await expect(cover).toHaveCSS('object-position', '50% 50%');
                    expect(await cover.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([...ARTWORK_DIMENSIONS[index]]);
                }
                if (mode === 'grid') await firstStation.hover();
                await window.screenshot({ path: testInfo.outputPath(`radio-${mode}-${size.name}-full-cover.png`) });
            }
        }

        await selectLayout(window, 'grid');
        await selectSize(window, 'medium');
        await expect(layout).toHaveAttribute('data-layout', 'grid');
        await expect(layout).toHaveAttribute('data-size', 'medium');
        await expect(firstStation).toContainText('Bandcamp Weekly');
        await expect(firstStation).toContainText('Curated weekly selections');

        await firstStation.getByTitle('Play Mix').focus();
        await window.keyboard.press('Enter');
        await expect(firstStation).toHaveClass(/active/);
        await firstStation.getByTitle('Play Tracks').click();

        const search = window.getByPlaceholder('Search radio shows...');
        await search.fill('Station 65');
        await expect(window.getByTestId('radio-card')).toHaveCount(1);
        await selectLayout(window, 'list');
        await expect(search).toHaveValue('Station 65');
        await expect(window.getByTestId('radio-card').first()).toContainText('Radio Station 65');
        await window.getByRole('button', { name: 'Clear search' }).click();
        await expect(search).toHaveValue('');
        await expect.poll(() => window.getByTestId('radio-card').count()).toBeGreaterThanOrEqual(20);
    });

    for (const mode of ['grid', 'list'] as const) {
        for (const size of SIZES) {
            test(`loads through the final station in ${mode} ${size.name} mode`, async ({ window }) => {
                await selectLayout(window, mode);
                await selectSize(window, size.name);
                await loadAllStations(window);
            });
        }
    }
});
