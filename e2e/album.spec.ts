import { test, expect } from './fixtures';

test.describe('Album Detail Navigation', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }

        // Wait for the app to be ready
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should navigate to album detail and back to collection', async ({ window }) => {
        // 1. Click on the first album in collection
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        const albumTitleElement = firstAlbumCard.locator('[class*="title"]');
        const albumTitle = (await albumTitleElement.textContent())?.trim() || '';

        await firstAlbumCard.click();
        await window.waitForLoadState('networkidle');

        // 2. Verify Album Detail view is shown with correct title
        const albumHeading = window.getByRole('heading', { level: 1 });
        await expect(albumHeading).toContainText(albumTitle, { timeout: 15000 });

        // Verify Back button is visible (don't check Play since it may be disabled while loading)
        const backButton = window.getByRole('button', { name: 'Back' });
        await expect(backButton).toBeVisible({ timeout: 10000 });

        // 3. Click the Back button
        await backButton.click();

        // 4. Verify we are back in the Collection view
        await expect(window.getByRole('heading', { name: 'Your Collection', level: 1 })).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to album detail from search and back to search results', async ({ window }) => {
        // 1. Search for something
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Look Up');

        // 2. Click on a result album
        const firstResultCard = window.locator('[class*="card"]').first();
        await expect(firstResultCard).toBeVisible({ timeout: 15000 });

        await firstResultCard.click();
        await window.waitForLoadState('networkidle');

        // 3. Go back
        const backButton = window.getByRole('button', { name: 'Back' });
        await expect(backButton).toBeVisible({ timeout: 10000 });
        await backButton.click();

        // 4. Verify search query and results are still there
        await expect(searchInput).toHaveValue('Look Up');
        await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 10000 });
    });
});
