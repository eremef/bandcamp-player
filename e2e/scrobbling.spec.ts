import { test, expect } from './fixtures';

test.describe('Last.fm Scrobbling', () => {
    test.beforeEach(async ({ window }) => {
        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(collectionButton).toBeVisible({ timeout: 15000 });
    });

    test('toggles scrobbling for a connected Last.fm account', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('scrobbler:on-state-changed', {
                isConnected: true,
                user: { name: 'TestUser', url: 'https://last.fm/user/TestUser' },
                sessionStatus: 'connected',
            });
        });

        await window.getByRole('button', { name: 'Settings' }).click();
        await expect(window.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible({ timeout: 10000 });

        await expect(window.getByText('Enable Scrobbling', { exact: true })).toBeVisible();
        const scrobblingCheckbox = window.getByTestId('setting-scrobbling');
        const initialState = await scrobblingCheckbox.isChecked();
        await scrobblingCheckbox.evaluate((checkbox: HTMLInputElement) => checkbox.click());
        await expect(scrobblingCheckbox).toBeChecked({ checked: !initialState });
    });
});
