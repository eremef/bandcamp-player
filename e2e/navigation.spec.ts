import { test, expect } from './fixtures';

test.describe('Navigation', () => {
    test.beforeEach(async ({ window }) => {
        // Perform login if needed
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }

        // Wait for the app to be ready (Sidebar/Layout visible)
        await expect(collectionBtn).toBeVisible();
    });

    test('should navigate between main views', async ({ window }) => {
        // Navigate to Artists
        await window.getByRole('button', { name: 'Artists' }).click();
        await expect(window.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible();

        // Navigate to Playlists
        await window.getByRole('button', { name: 'Playlists' }).click();
        await expect(window.getByRole('heading', { name: 'Playlists', level: 1 })).toBeVisible();

        // Navigate to Radio
        await window.getByRole('button', { name: 'Radio' }).click();
        await expect(window.getByRole('heading', { name: 'Bandcamp Radio', level: 1 })).toBeVisible();

        // Navigate back to Collection
        await window.getByRole('button', { name: 'Collection' }).click();
        await expect(window.getByRole('heading', { name: 'Your Collection', level: 1 })).toBeVisible();
    });
});
