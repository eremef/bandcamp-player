import { test, expect } from './fixtures';

test.describe('Auto-Updater UI', () => {
    test.beforeEach(async ({ window }) => {
        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(collectionButton).toBeVisible({ timeout: 15000 });
    });

    test('shows install actions after an update downloads', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('update:on-downloaded', {
                version: '2.0.0',
                releaseDate: '2025-01-01T00:00:00.000Z',
            });
        });

        await window.getByRole('button', { name: 'Settings' }).click();
        await expect(window.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible({ timeout: 10000 });
        await expect(window.getByText('Update Ready to Install')).toBeVisible();
        await expect(window.getByText('Version 2.0.0')).toBeVisible();
        await expect(window.getByRole('button', { name: 'Restart & Install' }).first()).toBeEnabled();
    });

    test('shows the checking state from the updater event', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('update:on-checking');
        });

        await window.getByRole('button', { name: 'Settings' }).click();
        await expect(window.getByText('Checking for updates...')).toBeVisible();
    });
});
