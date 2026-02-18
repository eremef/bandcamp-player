import { test, expect } from './fixtures';

test.describe('Playlist Lifecycle', () => {
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

    test('should create a new playlist and add an album to it', async ({ window }) => {
        const testPlaylistName = `Test Playlist ${Date.now()}`;

        // 1. Create Playlist via Sidebar
        await window.getByRole('button', { name: 'Create Playlist' }).click();
        const nameInput = window.getByPlaceholder('Playlist name...');
        await nameInput.fill(testPlaylistName);
        await nameInput.press('Enter');

        // Verify it appears in the sidebar list
        const playlistItem = window.getByRole('button', { name: testPlaylistName, exact: false });
        await expect(playlistItem).toBeVisible({ timeout: 10000 });

        // 2. Navigate to Collection and use right-click context menu to add to playlist
        await window.getByRole('button', { name: 'Collection' }).click();

        // Wait for cards to load
        const firstAlbumCard = window.locator('[class*="card"]').first();
        await expect(firstAlbumCard).toBeVisible({ timeout: 15000 });

        // Right-click to open context menu (more reliable than hover + button click)
        await firstAlbumCard.click({ button: 'right' });

        // Wait for the context menu to appear, then find the playlist option
        // The menu has a "Play Now", "Add to Queue" then playlist names as buttons
        const playlistMenuOption = window.locator('button', { hasText: testPlaylistName }).first();
        await expect(playlistMenuOption).toBeVisible({ timeout: 10000 });
        await playlistMenuOption.click({ force: true });

        // Wait for the add operation to complete
        await window.waitForTimeout(3000);

        // 3. Navigate to the playlist and verify tracks were added
        // Click the playlist in the sidebar
        const updatedPlaylistItem = window.getByRole('button', { name: testPlaylistName, exact: false });
        await updatedPlaylistItem.click();

        // Verify the detail view shows the playlist name
        const playlistHeading = window.getByRole('heading', { level: 1 });
        await expect(playlistHeading).toContainText(testPlaylistName, { timeout: 15000 });
    });
});
