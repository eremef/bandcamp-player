import { test, expect } from './fixtures';

test.describe('Album Detail Tracks', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should display track list in album detail view', async ({ window }) => {
        // Click first album card to open detail
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });
        await firstAlbumCard.click();

        // Wait for album detail to load
        const backBtn = window.getByRole('button', { name: 'Back' });
        await expect(backBtn).toBeVisible({ timeout: 10000 });

        // Verify we see the album heading
        const albumHeading = window.getByRole('heading', { level: 1 });
        await expect(albumHeading).toBeVisible();

        // Wait for tracks to load (either shows a table or "Loading tracks..." or "No tracks found")
        // Try to wait for the track table to appear
        const trackTable = window.locator('table');
        const loadingText = window.locator('text=Loading tracks...');
        const noTracksText = window.locator('text=No tracks found');

        await trackTable.or(noTracksText).waitFor({ timeout: 30000 });

        if (await trackTable.isVisible()) {
            // Verify table headers
            await expect(window.locator('th', { hasText: '#' })).toBeVisible();
            await expect(window.locator('th', { hasText: 'Title' })).toBeVisible();
            await expect(window.locator('th', { hasText: 'Duration' })).toBeVisible();

            // Verify at least one track row
            const trackRows = window.locator('tbody tr');
            const rowCount = await trackRows.count();
            expect(rowCount).toBeGreaterThan(0);

            // Verify album meta shows track count
            const metaText = window.locator('text=/\\d+ tracks/').first();
            await expect(metaText).toBeVisible();
        }
    });

    test('should have Add to Queue button in album detail', async ({ window }) => {
        // Navigate to album detail
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });
        await firstAlbumCard.click();

        const backBtn = window.getByRole('button', { name: 'Back' });
        await expect(backBtn).toBeVisible({ timeout: 10000 });

        // Wait for loading to finish
        const trackTable = window.locator('table');
        const noTracksText = window.locator('text=No tracks found');
        await trackTable.or(noTracksText).waitFor({ timeout: 30000 });

        // Verify the "Add to Queue" action button in the header
        const addToQueueBtn = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueBtn).toBeVisible({ timeout: 5000 });
    });
});
