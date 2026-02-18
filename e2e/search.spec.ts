import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

test.describe('Search', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeEach(async ({ }, testInfo) => {
        electronApp = await electron.launch({
            args: [join(__dirname, '../dist/main/main.js'), `--user-data-dir=${join(__dirname, '../temp-test-data', testInfo.workerIndex.toString())}`],
            env: { 
                ...process.env, 
                NODE_ENV: 'production', 
                E2E_TEST: 'true',
                REMOTE_PORT: (9999 + testInfo.workerIndex).toString()
            },
        });
        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait for either login button or collection to be ready
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        await loginBtn.or(collectionBtn).waitFor();

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible();

        // Navigate to Artists view where the search bar is
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists' })).toBeVisible();
    });

    test.afterEach(async () => {
        await electronApp.close();
    });

    test('should allow typing in search bar', async () => {
        const searchInput = window.locator('input[placeholder="Search artists.."]');
        await expect(searchInput).toBeVisible();

        await searchInput.fill('Test Artist');
        await expect(searchInput).toHaveValue('Test Artist');
    });
});
