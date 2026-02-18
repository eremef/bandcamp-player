import { test, expect } from './fixtures';

test.describe('Queue Management', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should open queue panel showing empty state', async ({ window }) => {
        const queueBtn = window.getByRole('button', { name: 'Queue' });
        await queueBtn.click();

        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        await expect(queueHeading).toBeVisible({ timeout: 5000 });
        await expect(window.locator('text=Queue is empty')).toBeVisible();
        await expect(window.locator('text=0 tracks')).toBeVisible();
    });

    test('should add album to queue via context menu', async ({ window }) => {
        // Wait for collection cards
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        // Right-click to open context menu
        await firstAlbumCard.click({ button: 'right' });

        // Click "Add to Queue" in context menu
        const addToQueueBtn = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueBtn).toBeVisible({ timeout: 5000 });
        await addToQueueBtn.click({ force: true });

        // Wait for queue update
        await window.waitForTimeout(1000);

        // Open the queue panel to verify
        const queueBtn = window.getByRole('button', { name: 'Queue' });
        await queueBtn.click();

        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        await expect(queueHeading).toBeVisible({ timeout: 5000 });

        // Queue should NOT be empty now
        await expect(window.locator('text=Queue is empty')).not.toBeVisible({ timeout: 3000 });
    });

    test('should clear queue', async ({ window }) => {
        // First, add something to the queue
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });
        await firstAlbumCard.click({ button: 'right' });

        const addToQueueBtn = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueBtn).toBeVisible({ timeout: 5000 });
        await addToQueueBtn.click({ force: true });
        await window.waitForTimeout(1000);

        // Open queue
        await window.getByRole('button', { name: 'Queue' }).click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });

        // Click Clear
        const clearBtn = window.locator('button', { hasText: 'Clear' }).first();
        await clearBtn.click();

        // Verify queue is empty
        await expect(window.locator('text=Queue is empty')).toBeVisible({ timeout: 5000 });
    });
});
