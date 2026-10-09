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
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });
    });

    test('should filter collection by search text', async ({ window }) => {
        // Wait for collection to load
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Count initial cards
        const cards = window.getByTestId('album-card');
        await expect(cards.first()).toBeVisible({ timeout: 15000 });
        const initialCount = await cards.count();

        await searchInput.fill('Look Up 180° (180°)');
        const filteredCards = window.getByTestId('album-card');
        await expect(filteredCards).toHaveCount(1);
        expect(await filteredCards.count()).toBeLessThanOrEqual(initialCount);
    });

    test('should clear search and restore full collection', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });

        // Wait for cards to load
        const cards = window.getByTestId('album-card');
        await expect(cards.first()).toBeVisible({ timeout: 15000 });
        const initialCount = await cards.count();

        await searchInput.fill('Look Up 180° (180°)');
        await expect(cards).toHaveCount(1);
        await searchInput.fill('');
        await expect(cards).toHaveCount(initialCount);
    });

    test('should show no results for nonexistent search', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your music...');
        await expect(searchInput).toBeVisible({ timeout: 10000 });
        await expect(window.getByTestId('album-card').first()).toBeVisible({ timeout: 15000 });

        await searchInput.fill('xyznonexistent12345');
        await expect(window.getByTestId('album-card')).toHaveCount(0);
    });
});
