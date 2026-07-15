import { test, expect } from './fixtures';

const MOCK_STATIONS = [
    {
        id: 'station-1',
        name: 'Bandcamp Weekly',
        description: 'Weekly music from Bandcamp',
        imageUrl: '',
        streamUrl: 'https://mock.stream/weekly.mp3',
        genre: 'Various',
    },
    {
        id: 'station-2',
        name: 'Bandcamp Selects',
        description: 'Curated selections',
        imageUrl: '',
        streamUrl: 'https://mock.stream/selects.mp3',
        genre: 'Various',
    },
    {
        id: 'station-3',
        name: 'The Metal Show',
        description: 'Heavy music',
        imageUrl: '',
        streamUrl: 'https://mock.stream/metal.mp3',
        genre: 'Metal',
    },
];

test.describe('Radio Interactions', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        // Mock IPC handler so any call to get/refresh stations returns mock data
        await electronApp.evaluate(({ ipcMain }, mockStations) => {
            ipcMain.removeHandler('radio:get-stations');
            ipcMain.removeHandler('radio:refresh-stations');
            ipcMain.handle('radio:get-stations', async () => mockStations);
            ipcMain.handle('radio:refresh-stations', async (e) => {
                e.sender.send('radio:on-stations-updated', mockStations);
                return mockStations;
            });
        }, MOCK_STATIONS);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', exact: true })).toBeVisible({ timeout: 10000 });

        // Trigger a refresh so the mock handler broadcasts the updated stations to the store
        await window.evaluate(async () => {
            await window.electron.radio.refreshStations();
        });

        // Wait for mock stations to appear
        await window.waitForTimeout(300);
    });

    test('should play and switch radio stations', async ({ window }) => {
        const stations = window.getByTestId('radio-card');
        await expect(stations.first()).toBeVisible({ timeout: 15000 });

        // 1. Play first station
        await stations.nth(0).click();

        // PlayerBar should update
        const playerBar = window.locator('div[class*="playerBar"]');
        await expect(playerBar).toBeVisible({ timeout: 10000 });

        // 2. Play second station (rapid switch)
        await stations.nth(1).click();

        // 3. Verify context menu options
        await stations.nth(2).click({ button: 'right' });
        const playNowMenu = window.getByText('Play Mix', { exact: true });
        await expect(playNowMenu).toBeVisible();

        const addToQueueMenu = window.locator('button, div').filter({ hasText: 'Add Mix to Queue' }).last();
        await expect(addToQueueMenu).toBeVisible();
        await addToQueueMenu.click();

        // Verify it was added to queue
        await window.getByTitle('Queue', { exact: true }).click();
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });

    test('should search for radio stations', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search radio shows...');
        await expect(searchInput).toBeVisible();

        const stations = window.getByTestId('radio-card');
        await expect(stations.first()).toBeVisible({ timeout: 15000 });

        await searchInput.fill('Bandcamp');
        await window.waitForTimeout(500);

        const filteredStations = window.getByTestId('radio-card');
        const count = await filteredStations.count();
        expect(count).toBeGreaterThan(0);

        // Clear search via the X button
        await window.locator('button').filter({ has: window.locator('svg[class*="lucide-x"]') }).click({ force: true });
        await expect(searchInput).toHaveValue('');
    });
});
