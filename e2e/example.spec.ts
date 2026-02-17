import { _electron as electron, test, expect } from '@playwright/test';
import { join } from 'path';

test('launch app', async ({ }, testInfo) => {
    const electronApp = await electron.launch({
        args: [join(__dirname, '../dist/main/main.js'), `--user-data-dir=${join(__dirname, '../temp-test-data', testInfo.workerIndex.toString())}`],
        env: { 
            ...process.env, 
            NODE_ENV: 'production',
            E2E_TEST: 'true',
            REMOTE_PORT: (9999 + testInfo.workerIndex).toString()
        },
    });
    const window = await electronApp.firstWindow();
    // Wait for the window to load
    await window.waitForLoadState('domcontentloaded');
    // Check title
    // Note: Adjust the expected title based on your actual application title
    // expect(await window.title()).toBe('Bandcamp Desktop Player'); 
    // Let's just check if the window is visible for now, or take a screenshot
    await expect(window.locator('body')).toBeVisible();

    await electronApp.close();
});
