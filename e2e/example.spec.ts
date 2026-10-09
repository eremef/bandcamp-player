import { test, expect } from './fixtures';

test('opens the desktop shell to an interactive screen', async ({ window }) => {
    await expect(window.locator('body')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Collection', exact: true }).or(
        window.getByRole('button', { name: 'Login with Bandcamp' }),
    )).toBeVisible();
});
