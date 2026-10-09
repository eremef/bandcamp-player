import { test, expect } from './fixtures';
import { _electron as electron } from '@playwright/test';
import { join } from 'path';

test.describe('Settings', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

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

    test('persists Minimize to Tray across an app restart', async ({ electronApp, userDataPath, remotePort }) => {
        const window = await electronApp.firstWindow();

        await window.getByRole('button', { name: 'Settings' }).click();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        const trayCheckbox = window.getByTestId('setting-minimize-tray');
        await trayCheckbox.scrollIntoViewIfNeeded();
        const initialState = await trayCheckbox.isChecked();
        const newState = !initialState;
        await trayCheckbox.evaluate((el: HTMLInputElement) => el.click());
        await expect(trayCheckbox).toBeChecked({ checked: newState });

        const closeButton = window.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();
        await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });

        await electronApp.close();

        const newApp = await electron.launch({
            args: [
                join(__dirname, '../dist/main/main.js'),
                `--user-data-dir=${userDataPath}`
            ],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                E2E_TEST: 'true',
                REMOTE_PORT: String(remotePort)
            },
        });

        try {
            const newWindow = await newApp.firstWindow();
            await newWindow.waitForLoadState('domcontentloaded');

            const loginBtn = newWindow.getByRole('button', { name: 'Login with Bandcamp' });
            const collectionBtn = newWindow.getByRole('button', { name: 'Collection', exact: true });
            await loginBtn.or(collectionBtn).waitFor({ timeout: 15000 });

            if (await loginBtn.isVisible()) {
                await loginBtn.click();
                await expect(collectionBtn).toBeVisible({ timeout: 15000 });
            }

            await newWindow.getByRole('button', { name: 'Settings' }).click();
            const newHeading = newWindow.getByRole('heading', { name: 'Settings', level: 2 });
            await expect(newHeading).toBeVisible({ timeout: 10000 });

            const newTrayCheckbox = newWindow.getByTestId('setting-minimize-tray');
            await expect(newTrayCheckbox).toBeChecked({ checked: newState, timeout: 10000 });
        } finally {
            await newApp.close();
        }
    });
});
