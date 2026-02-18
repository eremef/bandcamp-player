import { test, expect } from './fixtures';

test.describe('Authentication', () => {
    test('should verify login prompt presence or authenticated state', async ({ window }) => {
        // Check if login prompt is visible OR if layout is visible
        const loginPrompt = window.getByRole('button', { name: 'Login with Bandcamp' });
        const layout = window.getByRole('button', { name: 'Collection' });

        await expect(loginPrompt.or(layout)).toBeVisible();
    });
});
