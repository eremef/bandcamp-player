import { test, expect } from './fixtures';
import { AppHelpers } from './test-helpers';

test.describe('Collection Search', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        const helpers = new AppHelpers(window);
        await helpers.resetCollectionState();

        await collectionBtn.click();
    });

    test('should filter collection by search text', async ({ window }) => {
        // Wait for collection to load
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Count initial cards
        const cards = window.getByTestId('album-card');
        await expect(cards.first()).toBeVisible({ timeout: 15000 });
        const initialCount = await cards.count();

        // Search for a specific term
        await searchInput.fill('Look Up');
        await window.waitForTimeout(500);

        // Cards should be filtered — at least one should match if data exists
        const filteredCards = window.getByTestId('album-card');
        const filteredCount = await filteredCards.count();
        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    test('should clear search and restore full collection', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Wait for cards to load
        const cards = window.getByTestId('album-card');
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
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });

        // Search for something that doesn't exist
        await searchInput.fill('xyznonexistent12345');
        await window.waitForTimeout(500);

        // No cards should be visible
        const cardCount = await window.getByTestId('album-card').count();
        expect(cardCount).toBe(0);
    });
});
