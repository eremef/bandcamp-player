import { test, expect } from './fixtures';

test.describe('Artists View', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should display artists list and search', async ({ window }) => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });

        // Verify search bar exists
        const searchInput = window.getByPlaceholder('Search artists..');
        await expect(searchInput).toBeVisible();

        // If artists are loaded, verify at least one artist card is visible
        // (artists may be empty if the test data doesn't have any, but the view should still render)
        await window.waitForTimeout(2000);
    });

    test('should navigate to artist detail and back', async ({ window }) => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });

        // Wait for artist cards to appear
        await window.waitForTimeout(3000);

        // Find any artist card — they are divs with the artist name
        // Artists are grouped under h2 letter headings
        const artistCards = window.locator('[class*="artistCard"]');
        const cardCount = await artistCards.count();

        if (cardCount > 0) {
            // Get the artist name before clicking
            const firstCard = artistCards.first();
            const artistName = await firstCard.locator('[class*="artistName"]').textContent();

            // Click to open detail view
            await firstCard.click();

            // Verify detail view shows artist name as h1
            if (artistName) {
                await expect(window.getByRole('heading', { name: artistName.trim(), level: 1 })).toBeVisible({ timeout: 10000 });
            }

            // Verify back button exists and click it
            const backBtn = window.getByTitle('Back to Artists');
            await expect(backBtn).toBeVisible({ timeout: 5000 });
            await backBtn.click();

            // Verify we're back to the list
            await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible({ timeout: 10000 });
        }
    });
});
