import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createServer } from 'node:net';

type AppFixtures = {
    electronApp: ElectronApplication;
    window: Page;
    userDataPath: string;
    remotePort: number;
};

const getAvailablePort = () => new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
            server.close();
            reject(new Error('Could not allocate a test port'));
            return;
        }

        server.close((error) => error ? reject(error) : resolve(address.port));
    });
});

export const test = base.extend<AppFixtures>({
    userDataPath: async ({ }, use, testInfo) => {
        await use(testInfo.outputPath('user-data'));
    },
    remotePort: async ({ }, use) => {
        await use(await getAvailablePort());
    },
    electronApp: async ({ remotePort, userDataPath }, use) => {
        const electronApp = await electron.launch({
            args: [
                join(__dirname, '../dist/main/main.js'),
                `--user-data-dir=${userDataPath}`
            ],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                E2E_TEST: 'true',
                REMOTE_PORT: String(remotePort)
            },
        });

        await use(electronApp);

        try { await electronApp.close(); } catch { /* App may already be closed by test */ }
    },
    window: async ({ electronApp }, use, testInfo) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Start V8 coverage for the renderer process
        await window.coverage.startJSCoverage();

        // Wait for the UI to be interactive (either Login or Main Layout)
        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection', exact: true });
        await loginBtn.or(collectionBtn).waitFor();

        await use(window);

        // Stop coverage and save results
        const testName = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        try {
            const coverage = await window.coverage.stopJSCoverage();

            // Save raw coverage to a directory
            const coverageDir = join(__dirname, '../coverage-v8');
            if (!existsSync(coverageDir)) {
                mkdirSync(coverageDir, { recursive: true });
            }

            // Generate a unique filename for this test's coverage
            const filename = `${testName}_${testInfo.workerIndex}.json`;
            writeFileSync(join(coverageDir, filename), JSON.stringify(coverage, null, 2));
        } catch (err: any) {
            if (err.message && err.message.includes('Target page, context or browser has been closed')) {
                // Ignore silently: expected when a test closes the window or restarts the app
            } else {
                console.error(`ERROR in stopJSCoverage: ${err}`);
            }
        }
    },
});

export { expect } from '@playwright/test';
