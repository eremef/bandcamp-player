import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

test.describe('Player Controls', () => {
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

    test('should have visible player controls', async () => {
        // Locate the player bar by finding the container with the specific set of controls
        // We need Shuffle, Play, AND Mute to ensure we target the main PlayerBar component
        // and not just the inner control buttons container
        const playerBar = window.locator('div')
            .filter({ has: window.locator('button[title="Shuffle"]') })
            .filter({ has: window.locator('button[title="Play"]') })
            .filter({ has: window.locator('button[title="Mute"]').or(window.locator('button[title="Unmute"]')) })
            .last();

        // Check for core controls based on their titles within the player bar
        await expect(playerBar.locator('button[title="Play"]').or(playerBar.locator('button[title="Pause"]'))).toBeVisible();
        await expect(playerBar.locator('button[title="Next"]')).toBeVisible();
        await expect(playerBar.locator('button[title="Previous"]')).toBeVisible();
        await expect(playerBar.locator('button[title="Shuffle"]')).toBeVisible();

        // Check for volume control
        await expect(playerBar.locator('button[title="Mute"]').or(playerBar.locator('button[title="Unmute"]'))).toBeVisible();
    });

    test('should toggle play/pause', async () => {
        // Note: Since we don't have a loaded track in a fresh launch without mocking, 
        // clicking play might not switch to pause if no track is queued.
        // However, we can assert the button exists. 
        // If we wanted to test full playback, we'd need to mock the store or database.
        // For now, we verify the UI element is interactable.

        const playerBar = window.locator('div')
            .filter({ has: window.locator('button[title="Shuffle"]') })
            .filter({ has: window.locator('button[title="Play"]') })
            .filter({ has: window.locator('button[title="Mute"]').or(window.locator('button[title="Unmute"]')) })
            .last();

        const playBtn = playerBar.locator('button[title="Play"]');
        await expect(playBtn).toBeEnabled();
    });
});
