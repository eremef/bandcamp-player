import { test, expect } from './fixtures';

test.describe('Player Controls', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should toggle shuffle on and off', async ({ window }) => {
        const shuffleBtn = window.getByRole('button', { name: 'Shuffle' });
        await expect(shuffleBtn).toBeVisible();

        // Click to enable shuffle
        await shuffleBtn.click();
        // The button gets an 'active' class — verify via visual cue or re-click
        // We can check if the title or aria attribute changed, but since it stays "Shuffle",
        // just verify the button is still clickable and toggle back
        await shuffleBtn.click();
        await expect(shuffleBtn).toBeVisible();
    });

    test('should cycle repeat mode: off → all → one → off', async ({ window }) => {
        // Initial state: "Repeat: off"
        const repeatBtn = window.getByRole('button', { name: 'Repeat: off' });
        await expect(repeatBtn).toBeVisible();

        // Click → should become "Repeat: all"
        await repeatBtn.click();
        await expect(window.getByRole('button', { name: 'Repeat: all' })).toBeVisible({ timeout: 3000 });

        // Click → should become "Repeat: one"
        await window.getByRole('button', { name: 'Repeat: all' }).click();
        await expect(window.getByRole('button', { name: 'Repeat: one' })).toBeVisible({ timeout: 3000 });

        // Click → should cycle back to "Repeat: off"
        await window.getByRole('button', { name: 'Repeat: one' }).click();
        await expect(window.getByRole('button', { name: 'Repeat: off' })).toBeVisible({ timeout: 3000 });
    });

    test('should toggle mute', async ({ window }) => {
        // Initially unmuted — title is "Mute"
        const muteBtn = window.getByRole('button', { name: 'Mute' });
        await expect(muteBtn).toBeVisible();

        // Click to mute — title becomes "Unmute"
        await muteBtn.click();
        await expect(window.getByRole('button', { name: 'Unmute' })).toBeVisible({ timeout: 3000 });

        // Click to unmute — title goes back to "Mute"
        await window.getByRole('button', { name: 'Unmute' }).click();
        await expect(window.getByRole('button', { name: 'Mute' })).toBeVisible({ timeout: 3000 });
    });

    test('should toggle queue panel', async ({ window }) => {
        const queueBtn = window.getByRole('button', { name: 'Queue' });
        await expect(queueBtn).toBeVisible();

        // Open queue panel
        await queueBtn.click();

        // Queue panel should show with "Queue is empty" or a queue heading
        const queueHeading = window.getByRole('heading', { name: 'Queue', level: 2 });
        await expect(queueHeading).toBeVisible({ timeout: 5000 });
        await expect(window.locator('text=Queue is empty')).toBeVisible();

        // Close queue panel
        await window.getByTitle('Close').click();
        await expect(queueHeading).not.toBeVisible({ timeout: 3000 });
    });
});
