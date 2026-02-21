import { test, expect } from './fixtures';

test.describe('Radio Interactions', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByText('Bandcamp Radio')).toBeVisible({ timeout: 10000 });
    });

    test('should play and switch radio stations', async ({ window }) => {
        const stations = window.locator('[class*="card"]');
        await expect(stations.first()).toBeVisible({ timeout: 15000 });

        // 1. Play first station
        await stations.nth(0).click();

        // PlayerBar should update
        const playerBar = window.locator('div[class*="playerBar"]');
        await expect(playerBar).toBeVisible({ timeout: 10000 });

        // 2. Play second station (rapid switch)
        await stations.nth(1).click();

        // 3. Verify context menu options
        await stations.nth(2).click({ button: 'right' });
        const playNowMenu = window.getByText('Play Now');
        await expect(playNowMenu).toBeVisible();

        const addToQueueMenu = window.locator('button, div').filter({ hasText: 'Add to Queue' }).last();
        await expect(addToQueueMenu).toBeVisible();
        await addToQueueMenu.click();

        // Verify it was added to queue
        await window.getByTitle('Queue', { exact: true }).click();
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });

    test('should search for radio stations', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search radio shows...');
        await expect(searchInput).toBeVisible();

        await searchInput.fill('Bandcamp');
        await window.waitForTimeout(1000); // Wait for debounce/filter

        const filteredStations = window.locator('[class*="card"]');
        // We assume there's at least one station with "Monthly" in its name
        const count = await filteredStations.count();
        expect(count).toBeGreaterThan(0);

        // Clear search
        await window.locator('button').filter({ has: window.locator('svg[class*="lucide-x"]') }).click({ force: true });
        await expect(searchInput).toHaveValue('');
    });
});
