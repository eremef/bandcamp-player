import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

test.describe('Authentication', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeEach(async ({ }, testInfo) => {
        electronApp = await electron.launch({
            args: [join(__dirname, '../dist/main/main.js'), `--user-data-dir=${join(__dirname, '../temp-test-data', testInfo.workerIndex.toString())}`],
            env: { ...process.env, NODE_ENV: 'production' },
        });
        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
    });

    test.afterEach(async () => {
        await electronApp.close();
    });

    test('should verify login prompt presence or authenticated state', async () => {
        // Since we can't easily mock the IPC auth check without more setup,
        // we'll check if we are either in the LoginPrompt or Outline (Layout)
        // This is a basic sanity check designed to pass whether the user happens to have a session or not in this env.

        // Check if login prompt is visible OR if layout is visible
        const loginPrompt = window.getByRole('button', { name: 'Login with Bandcamp' });
        const layout = window.getByRole('button', { name: 'Collection' }); // Sidebar item present in Layout

        await expect(loginPrompt.or(layout)).toBeVisible();
    });
});
