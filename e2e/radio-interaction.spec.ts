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
        await electronApp.evaluate(({ ipcMain, BrowserWindow }, mockStations) => {
            ipcMain.removeHandler('radio:get-stations');
            ipcMain.removeHandler('radio:refresh-stations');
            ipcMain.removeHandler('radio:play-station');
            ipcMain.removeHandler('radio:add-to-queue');
            ipcMain.handle('radio:get-stations', async () => mockStations);
            ipcMain.handle('radio:refresh-stations', async (e) => {
                e.sender.send('radio:on-stations-updated', mockStations);
                return mockStations;
            });
            ipcMain.handle('radio:play-station', async (_event, station) => {
                BrowserWindow.getAllWindows()[0]?.webContents.send('radio:on-state-changed', {
                    isActive: true,
                    currentStation: station,
                    currentTrack: null,
                });
            });
            let queue: { items: unknown[]; currentIndex: number } = { items: [], currentIndex: -1 };
            ipcMain.handle('radio:add-to-queue', async (_event, station) => {
                queue = {
                    items: [
                        ...queue.items,
                        {
                            id: `radio-${station.id}`,
                            source: 'radio',
                            radioStation: station,
                            track: {
                                id: `radio-track-${station.id}`,
                                title: station.name,
                                artist: 'Bandcamp',
                                album: station.name,
                                duration: 180,
                                artworkUrl: '',
                                streamUrl: station.streamUrl,
                                bandcampUrl: '',
                                isCached: false,
                            },
                        },
                    ],
                    currentIndex: -1,
                };
                BrowserWindow.getAllWindows()[0]?.webContents.send('queue:on-updated', queue);
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

        await expect(window.getByTestId('radio-card')).toHaveCount(MOCK_STATIONS.length);
    });

    test('should play and switch radio stations', async ({ window }) => {
        const stations = window.getByTestId('radio-card');
        await expect(stations.first()).toBeVisible({ timeout: 15000 });

        const firstStation = stations.nth(0);
        await firstStation.getByTitle('Play Mix').click({ force: true });
        await expect(firstStation).toHaveClass(/active/);

        const secondStation = stations.nth(1);
        await secondStation.getByTitle('Play Mix').click({ force: true });
        await expect(secondStation).toHaveClass(/active/);
        await expect(firstStation).not.toHaveClass(/active/);

        const thirdStation = stations.nth(2);
        await thirdStation.getByTitle('More options').click({ force: true });
        const contextMenu = thirdStation.locator('[class*="contextMenu"]');
        await expect(contextMenu.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
        await expect(contextMenu.getByRole('button', { name: 'Play Next', exact: true })).toBeVisible();
        await contextMenu.getByRole('button', { name: 'Add to Queue', exact: true }).first().click();

        await window.getByTestId('player-queue-btn').click();
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        await expect(queueItems.first()).toContainText('The Metal Show');
    });

    test('should search for radio stations', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search radio shows...');
        await expect(searchInput).toBeVisible();

        const stations = window.getByTestId('radio-card');
        await expect(stations.first()).toBeVisible({ timeout: 15000 });

        await searchInput.fill('Bandcamp');

        const filteredStations = window.getByTestId('radio-card');
        await expect(filteredStations).toHaveCount(2);

        // Clear search via the X button
        await window.locator('button').filter({ has: window.locator('svg[class*="lucide-x"]') }).click({ force: true });
        await expect(searchInput).toHaveValue('');
        await expect(filteredStations).toHaveCount(MOCK_STATIONS.length);
    });
});
