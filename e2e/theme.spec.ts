import { test, expect } from './fixtures';

test.describe('Theme Switching', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should switch between themes via settings dropdown', async ({ window }) => {
        // Open Settings
        await window.getByTitle('Settings').click();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        // Find the Theme combobox (dropdown)
        const themeSelect = window.getByRole('combobox');
        await expect(themeSelect).toBeVisible({ timeout: 5000 });

        // Switch to Dark theme
        await themeSelect.selectOption('dark');
        await window.waitForTimeout(500);

        // Verify the theme attribute changed on the document
        const darkTheme = await window.evaluate(() =>
            document.documentElement.getAttribute('data-theme') ||
            document.body.getAttribute('data-theme') ||
            document.documentElement.className
        );
        expect(darkTheme).toContain('dark');

        // Switch to Light theme
        await themeSelect.selectOption('light');
        await window.waitForTimeout(500);

        const lightTheme = await window.evaluate(() =>
            document.documentElement.getAttribute('data-theme') ||
            document.body.getAttribute('data-theme') ||
            document.documentElement.className
        );
        expect(lightTheme).toContain('light');

        // Reset to System Default
        await themeSelect.selectOption('system');
        await window.waitForTimeout(500);

        // Close settings
        const closeButton = window.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();
        await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });
    });
});
