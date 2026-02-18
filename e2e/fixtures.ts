import { _electron as electron, test as base, ElectronApplication, Page } from '@playwright/test';
import { join } from 'path';

type AppFixtures = {
    electronApp: ElectronApplication;
    window: Page;
};

export const test = base.extend<AppFixtures>({
    electronApp: async ({ }, use, testInfo) => {
        const electronApp = await electron.launch({
            args: [
                join(__dirname, '../dist/main/main.js'),
                `--user-data-dir=${join(__dirname, '../temp-test-data', testInfo.workerIndex.toString())}`
            ],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                E2E_TEST: 'true',
                REMOTE_PORT: (9999 + testInfo.workerIndex).toString()
            },
        });

        await use(electronApp);

        try { await electronApp.close(); } catch { /* App may already be closed by test */ }
    },
    window: async ({ electronApp }, use) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait for the UI to be interactive (either Login or Main Layout)
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });
        await loginBtn.or(collectionBtn).waitFor();

        await use(window);
    },
});

export { expect } from '@playwright/test';
