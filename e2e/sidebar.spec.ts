import { test, expect } from './fixtures';

test.describe('Sidebar', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should display all navigation items', async ({ window }) => {
        // Verify all 4 nav items are visible
        await expect(window.getByRole('button', { name: 'Collection' })).toBeVisible();
        await expect(window.getByRole('button', { name: 'Artists' })).toBeVisible();
        await expect(window.getByRole('button', { name: 'Playlists' })).toBeVisible();
        await expect(window.getByRole('button', { name: 'Radio' })).toBeVisible();
    });

    test('should display user info after login', async ({ window }) => {
        // After mock login, test user info should display "Test User"
        const userName = window.locator('text=Test User');
        await expect(userName).toBeVisible({ timeout: 5000 });
    });

    test('should show playlists section in sidebar', async ({ window }) => {
        // The sidebar has a "Your Playlists" heading
        const playlistsHeading = window.locator('h3', { hasText: 'Your Playlists' });
        await expect(playlistsHeading).toBeVisible({ timeout: 5000 });

        // The "Create Playlist" button (plus icon) should be visible
        const createBtn = window.getByTitle('Create Playlist');
        await expect(createBtn).toBeVisible();
    });

    test('should create playlist from sidebar', async ({ window }) => {
        const playlistName = `Sidebar-${Date.now()}`;

        // Click the "+" button in sidebar to create playlist
        await window.getByTitle('Create Playlist').click();

        // Fill the inline form
        const nameInput = window.getByPlaceholder('Playlist name...');
        await expect(nameInput).toBeVisible({ timeout: 5000 });
        await nameInput.fill(playlistName);

        // Submit (click Save button)
        await window.getByTitle('Save').click();

        // Verify the playlist appears in the sidebar list
        const playlistItem = window.locator('button', { hasText: playlistName });
        await expect(playlistItem).toBeVisible({ timeout: 10000 });
    });
});
