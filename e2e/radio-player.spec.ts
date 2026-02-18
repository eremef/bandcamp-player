import { test, expect } from './fixtures';

test.describe('Radio + Player Integration', () => {
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

    test('should load radio stations and display them', async ({ window }) => {
        // 1. Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', level: 1 })).toBeVisible({ timeout: 10000 });

        // 2. Verify radio stations are loaded
        // Stations have h3 headings with the station name
        const stationCards = window.locator('h3').filter({ hasText: /Bandcamp Selects|The Metal Show|The Hip Hop Show/ });
        await expect(stationCards.first()).toBeVisible({ timeout: 15000 });

        // 3. Verify there are multiple stations
        const count = await stationCards.count();
        expect(count).toBeGreaterThan(0);

        // 4. Verify the search box is present
        const searchInput = window.getByPlaceholder('Search radio shows...');
        await expect(searchInput).toBeVisible();
    });
});
