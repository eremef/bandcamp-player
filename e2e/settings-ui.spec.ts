import { test, expect } from './fixtures';

test.describe('Settings UI', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Open Settings
        await window.getByTitle('Settings').click();
        await expect(window.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
    });

    test('should toggle various settings', async ({ window }) => {
        // 1. Toggle Theme (Appearance section)
        const themeSetting = window.locator('div[class*="setting"]').filter({ hasText: 'Theme' }).first();
        const themeSelect = themeSetting.locator('select');

        await themeSelect.selectOption('dark');
        await expect(themeSelect).toHaveValue('dark');

        await themeSelect.selectOption('light');
        await expect(themeSelect).toHaveValue('light');

        // 2. Toggle "Show Notifications"
        const notificationsSetting = window.locator('div[class*="setting"]').filter({ hasText: 'Show Notifications' }).first();
        const notificationsCheckbox = notificationsSetting.locator('input[type="checkbox"]');

        await notificationsSetting.scrollIntoViewIfNeeded();
        const isNotifChecked = await notificationsCheckbox.isChecked();
        await notificationsCheckbox.evaluate((el: HTMLInputElement) => el.click());
        await expect(notificationsCheckbox).toBeChecked({ checked: !isNotifChecked });

        // 3. Toggle "Minimize to Tray"
        const traySetting = window.locator('div[class*="setting"]').filter({ hasText: 'Minimize to Tray' }).first();
        const trayCheckbox = traySetting.locator('input[type="checkbox"]');

        await traySetting.scrollIntoViewIfNeeded();
        const isTrayChecked = await trayCheckbox.isChecked();
        await trayCheckbox.evaluate((el: HTMLInputElement) => el.click());
        await expect(trayCheckbox).toBeChecked({ checked: !isTrayChecked });
    });
});
