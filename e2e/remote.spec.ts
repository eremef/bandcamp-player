import { test, expect } from './fixtures';

test.describe('Web Remote Connectivity', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should enable remote control and show connection details', async ({ window }) => {
        // 1. Open Settings
        await window.getByTitle('Settings').click();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', level: 2 });
        await expect(settingsHeading).toBeVisible({ timeout: 10000 });

        // 2. Verify Remote Control section is visible
        const remoteHeading = window.getByRole('heading', { name: 'Remote Control', level: 3 });
        await expect(remoteHeading).toBeVisible({ timeout: 5000 });

        // The Remote Control checkbox - find it near the "Enable Remote Control" text
        const enableText = window.locator('text=Enable Remote Control').first();
        await expect(enableText).toBeVisible();

        // Find the checkbox near this text using XPath
        const remoteCheckbox = enableText.locator('xpath=ancestor::div[contains(@class, "setting")]//input[@type="checkbox"]');
        let checkbox = remoteCheckbox;
        if (!(await checkbox.count())) {
            // Fallback: get the first checkbox after the Remote Control heading
            checkbox = remoteHeading.locator('xpath=following::input[@type="checkbox"]').first();
        }

        // Enable if not already enabled
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
            await checkbox.setChecked(true);
            await expect(checkbox).toBeChecked();
        }

        // 3. Verify the URL appears - it should contain "http://"
        // The URL is rendered as a <p> tag containing an http:// address
        const urlElement = window.locator('p').filter({ hasText: /^http:\/\// });
        await expect(urlElement).toBeVisible({ timeout: 30000 });

        const urlText = await urlElement.textContent();
        expect(urlText).toMatch(/^http:\/\//);

        // Verify QR code canvas is present
        const qrCanvas = window.locator('canvas');
        await expect(qrCanvas).toBeVisible({ timeout: 15000 });

        // 4. Close Settings
        const closeButton = window.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();
        await expect(settingsHeading).not.toBeVisible({ timeout: 5000 });
    });
});
