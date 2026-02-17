import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

test.describe('Settings', () => {
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
    });

    test.afterEach(async () => {
        await electronApp.close();
    });

    test('should open and close settings modal', async () => {
        // Click settings button in Sidebar
        // The button has title="Settings"
        await window.click('button[title="Settings"]');

        // Check if modal is visible
        const modalHeading = window.getByRole('heading', { name: 'Settings' });
        await expect(modalHeading).toBeVisible();

        // Check for a specific setting to ensure content loaded
        await expect(window.locator('text=Appearance')).toBeVisible();

        // Close modal
        // Scope to the header containing the Settings heading to avoid ambiguity with other view headers
        const modalHeader = window.locator('header', { has: modalHeading });
        await modalHeader.getByRole('button').click();

        // Check if modal is closed (not visible)
        await expect(window.locator('text=Appearance')).not.toBeVisible();
    });
});
