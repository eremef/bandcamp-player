import { test, expect } from './fixtures';

test('opens an artist from a collection artist link', async ({ window }) => {
    const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
    const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
    if (await loginButton.isVisible()) {
        await loginButton.click();
    }
    await expect(collectionButton).toBeVisible({ timeout: 15000 });
    await collectionButton.click();

    const artistLink = window.getByTitle('Go to artist').first();
    await expect(artistLink).toBeVisible({ timeout: 15000 });
    const artistName = (await artistLink.innerText()).trim();
    await artistLink.click();

    await expect(window.getByRole('heading', { name: artistName, level: 1 })).toBeVisible();
    await expect(window.getByText('Artist not found', { exact: true })).toHaveCount(0);
});
