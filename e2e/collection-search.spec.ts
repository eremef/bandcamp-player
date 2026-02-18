import { test, expect } from './fixtures';

test.describe('Collection Search', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should filter collection by search text', async ({ window }) => {
        // Wait for collection to load
        const searchInput = window.getByPlaceholder('Search your collection...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Count initial cards
        const cards = window.locator('[class*="card"]');
        await expect(cards.first()).toBeVisible({ timeout: 15000 });
        const initialCount = await cards.count();

        // Search for a specific term
        await searchInput.fill('Look Up');
        await window.waitForTimeout(500);

        // Cards should be filtered — at least one should match if data exists
        const filteredCards = window.locator('[class*="card"]');
        const filteredCount = await filteredCards.count();
        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    test('should clear search and restore full collection', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Wait for cards to load
        const cards = window.locator('[class*="card"]');
        await expect(cards.first()).toBeVisible({ timeout: 15000 });
        const initialCount = await cards.count();

        // Search for something
        await searchInput.fill('Look Up');
        await window.waitForTimeout(500);

        // Clear the search
        await searchInput.fill('');
        await window.waitForTimeout(500);

        // Count should return to initial
        const restoredCount = await cards.count();
        expect(restoredCount).toBe(initialCount);
    });

    test('should show no results for nonexistent search', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });
        await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 15000 });

        // Search for something that doesn't exist
        await searchInput.fill('xyznonexistent12345');
        await window.waitForTimeout(500);

        // No cards should be visible
        const cardCount = await window.locator('[class*="card"]').count();
        expect(cardCount).toBe(0);
    });
});
