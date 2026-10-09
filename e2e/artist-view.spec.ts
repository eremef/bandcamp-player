import { test, expect } from './fixtures';

test.describe('Artists View', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should display artists list and search', async ({ window }) => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists', exact: true }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });

        // Verify search bar exists
        const searchInput = window.getByPlaceholder('Search..');
        await expect(searchInput).toBeVisible();

        await expect(window.locator('[class*="artistCard"]').first()).toBeVisible({ timeout: 15000 });
    });

    test('should navigate to artist detail and back', async ({ window }) => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists', exact: true }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });

        const artistCards = window.locator('[class*="artistCard"]');
        await expect(artistCards.first()).toBeVisible({ timeout: 15000 });
        const firstCard = artistCards.first();
        const artistName = (await firstCard.locator('[class*="artistName"]').innerText()).trim();

        await firstCard.click();
        await expect(window.getByRole('heading', { name: artistName, level: 1 })).toBeVisible({ timeout: 10000 });

        const backButton = window.getByRole('button', { name: 'Back', exact: true });
        await expect(backButton).toBeVisible({ timeout: 5000 });
        await backButton.click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });
    });
});
