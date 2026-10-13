import { test, expect } from './fixtures';

test.describe('Web Remote Connectivity', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('shows secure pairing details when remote control is enabled', async ({ window }) => {
        await window.getByRole('button', { name: 'Settings' }).click();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        const remoteEnabled = window.getByTestId('setting-remote-enabled');
        if (!(await remoteEnabled.isChecked())) {
            await remoteEnabled.evaluate((checkbox: HTMLInputElement) => checkbox.click());
        }
        await expect(remoteEnabled).toBeChecked();
        await expect(window.getByText('Scan with the mobile app to pair.', { exact: false })).toBeVisible({ timeout: 15000 });
        await expect(window.locator('canvas')).toBeVisible();

        await window.getByText("Can't scan? Enter details manually").click();

        const url = window.getByText(/^https:\/\//);
        await expect(url).toBeVisible();
        const urlValue = new URL((await url.textContent()) ?? '');
        expect(urlValue.protocol).toBe('https:');
        expect(Number(urlValue.port)).toBeGreaterThan(0);

        await expect(window.getByText('Pairing code', { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(window.locator('code').first()).not.toBeEmpty();
    });
});
