import { test, expect } from './fixtures';

test.describe('Playlist Management', () => {
    test.beforeEach(async ({ window }) => {
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });

        if (await loginBtn.isVisible()) {
            await loginBtn.click();
        }
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });
    });

    test('should show empty playlists view', async ({ window }) => {
        // Navigate to Playlists
        await window.getByRole('button', { name: 'Playlists' }).click();
        await expect(window.getByRole('heading', { name: 'Playlists', level: 1 })).toBeVisible({ timeout: 10000 });

        // Verify "Create Playlist" button exists
        const createBtn = window.locator('button', { hasText: 'Create Playlist' });
        await expect(createBtn).toBeVisible();
    });

    test('should create, rename, and delete a playlist', async ({ window }) => {
        const playlistName = `E2E-Manage-${Date.now()}`;
        const renamedName = `Renamed-${Date.now()}`;

        // Navigate to Playlists view
        await window.getByRole('button', { name: 'Playlists' }).click();
        await expect(window.getByRole('heading', { name: 'Playlists', level: 1 })).toBeVisible({ timeout: 10000 });

        // --- Create ---
        const createBtn = window.locator('button', { hasText: 'Create Playlist' }).first();
        await createBtn.click();

        // Fill in the name in the inline form
        const nameInput = window.getByPlaceholder('Playlist Name');
        await nameInput.fill(playlistName);
        await window.getByTitle('Save').click();

        // Verify the playlist card appears
        await expect(window.locator('h3', { hasText: playlistName })).toBeVisible({ timeout: 10000 });

        // --- Rename ---
        const renameBtn = window.getByTitle('Rename playlist').first();
        await renameBtn.click();

        // The edit input should appear
        const editInput = window.locator('input[class*="cardEditInput"]');
        await editInput.fill(renamedName);
        await editInput.press('Enter');

        // Verify renamed playlist card
        await expect(window.locator('h3', { hasText: renamedName })).toBeVisible({ timeout: 10000 });

        // --- Delete ---
        // Accept the confirm dialog
        window.on('dialog', dialog => dialog.accept());

        const deleteBtn = window.getByTitle('Delete playlist').first();
        await deleteBtn.click();

        // Verify the playlist is removed
        await expect(window.locator('h3', { hasText: renamedName })).not.toBeVisible({ timeout: 10000 });
    });
});
