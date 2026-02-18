import { test, expect } from './fixtures';

test.describe('Player State', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should show "No track playing" in empty player state', async ({ window }) => {
        // Without any track loaded, the player bar shows "No track playing"
        await expect(window.locator('text=No track playing')).toBeVisible({ timeout: 5000 });
    });

    test('should show player bar controls even without a track', async ({ window }) => {
        // Play/Pause button should exist
        const playPauseBtn = window.getByRole('button', { name: 'Play' }).first();
        await expect(playPauseBtn).toBeVisible();

        // Previous and Next buttons
        await expect(window.getByRole('button', { name: 'Previous' })).toBeVisible();
        await expect(window.getByRole('button', { name: 'Next' })).toBeVisible();

        // Volume/mute button
        await expect(window.getByRole('button', { name: 'Mute' })).toBeVisible();

        // Time display should show 0:00
        const timeDisplay = window.locator('text=0:00').first();
        await expect(timeDisplay).toBeVisible();
    });

    test('should show Cast button and Mini Player button', async ({ window }) => {
        // Cast button
        await expect(window.getByRole('button', { name: 'Cast to Device' })).toBeVisible();

        // Mini Player button
        await expect(window.getByRole('button', { name: 'Mini Player' })).toBeVisible();
    });
});
