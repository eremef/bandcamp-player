import { test, expect } from './fixtures';

const MOCK_REMOTE_STATUS = {
    isRunning: true,
    port: 9999,
    ip: '192.168.1.100',
    url: 'http://192.168.1.100:9999',
    connections: 2,
};

const MOCK_DEVICES = [
    {
        id: 'device-1',
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        connectedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        deviceInfo: { platform: 'ios', appVersion: '1.0.0', device: 'mobile' },
    },
    {
        id: 'device-2',
        ip: '192.168.1.60',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        connectedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
    },
];

test.describe('Connected Devices Modal', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        // Mock remote IPC handlers
        await electronApp.evaluate(({ ipcMain }, { status, devices }) => {
            ipcMain.removeHandler('remote:get-status');
            ipcMain.removeHandler('remote:get-devices');
            ipcMain.removeHandler('remote:disconnect-device');
            ipcMain.handle('remote:get-status', async () => status);
            ipcMain.handle('remote:get-devices', async () => devices);
            ipcMain.handle('remote:disconnect-device', async () => true);
        }, { status: MOCK_REMOTE_STATUS, devices: MOCK_DEVICES });

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Open settings
        await window.getByTitle('Settings').click();
        await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 5000 });

        // Scroll to remote section and enable remote if not enabled
        const remoteLabel = window.locator('text=Enable Remote Control');
        await remoteLabel.scrollIntoViewIfNeeded();
        await expect(remoteLabel).toBeVisible();

        // Enable remote control checkbox (index 4 per CLAUDE.md)
        const remoteCheckbox = window.getByRole('checkbox').nth(4);
        const isChecked = await remoteCheckbox.isChecked();
        if (!isChecked) {
            await remoteCheckbox.evaluate((el: HTMLInputElement) => el.click());
            await window.waitForTimeout(500);
        }

        // Wait for remote status to show connections
        await expect(window.locator('text=2 connected devices')).toBeVisible({ timeout: 5000 });
    });

    test('opens Connected Devices modal showing device list', async ({ window }) => {
        // Click the connections count to open the modal
        await window.locator('text=2 connected devices').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        // Should show 2 device items
        const deviceItems = window.locator('[class*="deviceItem"]');
        await expect(deviceItems).toHaveCount(2);

        // First device should be identified as iPhone
        await expect(window.locator('text=iPhone')).toBeVisible();
        await expect(window.locator('text=192.168.1.50')).toBeVisible();

        // Second device should be identified as Windows PC
        await expect(window.locator('text=Windows PC')).toBeVisible();
        await expect(window.locator('text=192.168.1.60')).toBeVisible();
    });

    test('closes Connected Devices modal via close button', async ({ window }) => {
        await window.locator('text=2 connected devices').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        // Close via the X button inside the modal — overlay intercepts pointer events
        const modal = window.locator('[class*="modal"]').filter({ has: window.locator('text=Connected Devices') });
        await modal.locator('button').first().evaluate((el: HTMLElement) => el.click());

        await expect(window.getByRole('heading', { name: 'Connected Devices' })).not.toBeVisible({ timeout: 3000 });
    });

    test('shows disconnect button for each device', async ({ window }) => {
        await window.locator('text=2 connected devices').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        // Each device should have a disconnect button
        const disconnectBtns = window.getByTitle('Disconnect');
        await expect(disconnectBtns).toHaveCount(2);
    });
});
