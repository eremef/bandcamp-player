import { test, expect } from './fixtures';
import { _electron as electron } from '@playwright/test';
import { join } from 'path';

test.describe('Settings', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should open and close settings modal', async ({ window }) => {
        // Click settings button in Sidebar
        await window.getByTitle('Settings').click();

        // Wait for the settings heading to appear (this means the modal opened)
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        // Verify some content sections are visible
        await expect(window.getByRole('heading', { name: 'Appearance', level: 3 })).toBeVisible();
        await expect(window.getByRole('heading', { name: 'Window', level: 3 })).toBeVisible();

        // Close modal using the close button (it's in the header, next to the heading)
        const closeButton = window.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();

        // Verify the settings heading is gone
        await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });
    });

    test('should persist "Minimize to Tray" setting across sessions', async ({ electronApp }, testInfo) => {
        const window = await electronApp.firstWindow();

        // 1. Open Settings
        await window.getByTitle('Settings').click();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        // 2. Scroll to and find the "Minimize to Tray" toggle
        // The text label is "Minimize to Tray" — scroll it into view first
        const minimizeTrayLabel = window.locator('text=Minimize to Tray').first();
        await minimizeTrayLabel.scrollIntoViewIfNeeded();
        await expect(minimizeTrayLabel).toBeVisible({ timeout: 5000 });

        // The checkbox is hidden (opacity:0, width:0, height:0) inside a toggle switch <label>.
        // We'll use evaluate() to directly check and toggle the checkbox state
        // since Playwright cannot interact with zero-dimension elements.

        // Get the checkbox's current state via the accessibility role
        const trayCheckbox = window.getByRole('checkbox').nth(1);
        const initialState = await trayCheckbox.isChecked();
        const newState = !initialState;

        // Use evaluate to programmatically toggle the checkbox
        await trayCheckbox.evaluate((el: HTMLInputElement, shouldBeChecked: boolean) => {
            if (el.checked !== shouldBeChecked) {
                el.click();
            }
        }, newState);

        // Verify the checkbox state changed
        await expect(trayCheckbox).toBeChecked({ checked: newState });

        // 3. Close the modal
        const closeButton = window.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();
        await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });

        // Wait for settings to flush to disk
        await window.waitForTimeout(2000);

        // 4. Close the app
        const userDataDir = join(__dirname, '../temp-test-data', testInfo.workerIndex.toString());
        const remotePort = (9999 + testInfo.workerIndex).toString();

        await electronApp.close();
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 5. Relaunch with SAME user-data-dir
        const newApp = await electron.launch({
            args: [
                join(__dirname, '../dist/main/main.js'),
                `--user-data-dir=${userDataDir}`
            ],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                E2E_TEST: 'true',
                REMOTE_PORT: remotePort
            },
        });

        try {
            const newWindow = await newApp.firstWindow();
            await newWindow.waitForLoadState('networkidle');

            // Wait for UI
            const loginBtn = newWindow.getByRole('button', { name: 'Login with Bandcamp' });
            const collectionBtn = newWindow.getByRole('button', { name: 'Collection' });
            await loginBtn.or(collectionBtn).waitFor({ timeout: 15000 });

            if (await loginBtn.isVisible()) {
                await loginBtn.click();
                await expect(collectionBtn).toBeVisible({ timeout: 15000 });
            }

            // 6. Open Settings
            await newWindow.getByTitle('Settings').click();
            const newHeading = newWindow.getByRole('heading', { name: 'Settings', level: 2 });
            await expect(newHeading).toBeVisible({ timeout: 10000 });

            // 7. Verify persisted state
            const newTrayCheckbox = newWindow.getByRole('checkbox').nth(1);
            await expect(newTrayCheckbox).toBeChecked({ checked: newState, timeout: 10000 });
        } finally {
            await newApp.close();
        }
    });
});
