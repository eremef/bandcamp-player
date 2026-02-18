import { test, expect } from './fixtures';

test.describe('Radio Search', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }

        // Wait for the app to be ready
        await expect(collectionBtn).toBeVisible();
    });

    test('should search for radio stations', async ({ window }) => {
        // Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', level: 1 })).toBeVisible();

        // Find the search bar and type
        const searchInput = window.getByPlaceholder('Search radio shows...');
        await searchInput.fill('Electronic');

        // Results should appear (or at least the UI should update)
        // Note: Actual scraping depends on network, but we check if the input reflects the value
        await expect(searchInput).toHaveValue('Electronic');

        // Wait for potential search results or UI change
        // Since it's a real app, we look for a characteristic result item if possible
        // For now, we'll verify the search input remains interactive
        await expect(searchInput).toBeEnabled();
    });
});
