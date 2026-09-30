import { test, expect } from './fixtures';

test.describe('Search', () => {
    test.beforeEach(async ({ window }) => {
        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(collectionButton).toBeVisible({ timeout: 15000 });

        await window.getByRole('button', { name: 'Artists', exact: true }).click();
        await expect(window.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
        await expect(window.locator('[class*="artistCard"]').first()).toBeVisible();
    });

    test('filters the artists list as text is entered', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search..');
        await searchInput.fill('Electromagnetic');

        await expect(searchInput).toHaveValue('Electromagnetic');
        await expect(window.locator('[class*="artistCard"]')).toHaveCount(1);
        await expect(window.getByText('Electromagnetic Interference', { exact: true })).toBeVisible();
    });
});
