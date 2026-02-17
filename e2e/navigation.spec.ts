import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

test.describe('Navigation', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeEach(async ({ }, testInfo) => {
        electronApp = await electron.launch({
            args: [join(__dirname, '../dist/main/main.js'), `--user-data-dir=${join(__dirname, '../temp-test-data', testInfo.workerIndex.toString())}`],
            env: { ...process.env, NODE_ENV: 'production', E2E_TEST: 'true' },
        });
        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait for either login button or collection to be ready
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        await loginBtn.or(collectionBtn).waitFor();

        // Perform login if needed
        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }

        // Wait for the app to be ready (Sidebar/Layout visible)
        await expect(collectionBtn).toBeVisible();
    });

    test.afterEach(async () => {
        await electronApp.close();
    });

    test('should navigate between main views', async () => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible();

        // Navigate to Playlists
        await window.getByRole('button', { name: 'Playlists' }).click();
        await expect(window.getByRole('heading', { name: 'Playlists', level: 1 })).toBeVisible();

        // Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', level: 1 })).toBeVisible();

        // Navigate back to Collection
        await window.getByRole('button', { name: 'Collection' }).click();
        await expect(window.getByRole('heading', { name: 'Your Collection', level: 1 })).toBeVisible();
    });
});
