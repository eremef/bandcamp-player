import { Page, expect } from '@playwright/test';

export class AppHelpers {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Opens the Settings modal.
     */
    async openSettings() {
        const settingsBtn = this.page.getByRole('button', { name: 'Settings' });
        await expect(settingsBtn).toBeVisible();
        await settingsBtn.click();
        await expect(this.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    }

    /**
     * Closes the Settings modal.
     */
    async closeSettings() {
        const settingsHeading = this.page.getByRole('heading', { name: 'Settings' });
        const closeButton = this.page.locator('header').filter({ has: settingsHeading }).locator('button');
        await closeButton.click();
        await expect(settingsHeading).not.toBeVisible();
    }

    /**
     * Toggles a setting checkbox. Uses evaluate() because the inputs are visually hidden.
     * @param testId The data-testid of the setting checkbox.
     * @param targetState true to check, false to uncheck.
     */
    async setSetting(testId: string, targetState: boolean) {
        const checkbox = this.page.getByTestId(testId);

        // Ensure it's in view
        await checkbox.scrollIntoViewIfNeeded();

        const isChecked = await checkbox.isChecked();
        if (isChecked !== targetState) {
            await checkbox.evaluate((el: HTMLInputElement) => el.click());
        }

        // Wait for the state to reflect
        await expect(checkbox).toBeChecked({ checked: targetState });
    }

    /**
     * Opens the Collection filter dropdown if not already open.
     */
    async openCollectionFilters() {
        const filterToggleBtn = this.page.getByTestId('filter-toggle-btn');
        await expect(filterToggleBtn).toBeVisible();

        const isExpanded = await this.page.getByTestId('filter-albums-btn').isVisible();
        if (!isExpanded) {
            await filterToggleBtn.click();
            await expect(this.page.getByTestId('filter-albums-btn')).toBeVisible();
        }
    }

    /**
     * Toggles a specific filter in the Collection view.
     * Assumes the filter dropdown is already open.
     */
    async toggleCollectionFilter(filterTestId: string) {
        const filterBtn = this.page.getByTestId(filterTestId);
        await expect(filterBtn).toBeVisible();
        await filterBtn.click();
    }

    /**
     * Resets sort and filter settings to defaults via the electron API.
     */
    async resetCollectionState() {
        await this.page.evaluate(async () => {
            await window.electron.settings.set({
                collectionSortKey: 'default',
                collectionSortDirection: 'desc',
                collectionFilterAlbums: true,
                collectionFilterTracks: true,
                collectionFilterWishlist: true,
                collectionViewMode: 'grid',
                collectionCoverSize: 'medium',
            });
        });
    }
}
