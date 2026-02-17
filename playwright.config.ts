import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60000,
    retries: 1,
    workers: 4,
    reporter: 'list',
    use: {
        trace: 'on-first-retry',
    },
});
