import { test, expect } from './fixtures';
import type { RemoteControlStatus, RemotePairedDevice } from '../src/shared/types';

const MOCK_REMOTE_STATUS: RemoteControlStatus = {
    isRunning: true,
    port: 9999,
    ip: '192.168.1.100',
    url: 'https://192.168.1.100:9999',
    connections: 2,
    securityMode: 'safe',
    pairingRequests: [],
};

const MOCK_DEVICES: RemotePairedDevice[] = [
    {
        id: 'device-1',
        ip: '192.168.1.50',
        name: 'iPhone',
        platform: 'ios',
        appVersion: '1.0.0',
        device: 'mobile',
        createdAt: '2026-09-30T10:00:00.000Z',
        lastConnectedAt: '2026-09-30T10:00:00.000Z',
        online: true,
    },
    {
        id: 'device-2',
        ip: '192.168.1.60',
        name: 'Windows PC',
        platform: 'web',
        appVersion: '1.0.0',
        device: 'desktop',
        createdAt: '2026-09-30T10:00:00.000Z',
        lastConnectedAt: '2026-09-30T10:00:00.000Z',
        online: true,
    },
];

test.describe('Connected Devices Modal', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, { status, devices }) => {
            ipcMain.removeHandler('remote:get-status');
            ipcMain.removeHandler('remote:get-devices');
            ipcMain.removeHandler('remote:disconnect-device');
            ipcMain.handle('remote:get-status', async () => status);
            let pairedDevices = devices;
            ipcMain.handle('remote:get-devices', async () => pairedDevices);
            ipcMain.handle('remote:disconnect-device', async (_event, deviceId) => {
                pairedDevices = pairedDevices.filter((device) => device.id !== deviceId);
                return true;
            });
        }, { status: MOCK_REMOTE_STATUS, devices: MOCK_DEVICES });

        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(window.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 });

        await electronApp.evaluate(({ BrowserWindow }, devices) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('remote:on-paired-devices-changed', devices);
        }, MOCK_DEVICES);

        await window.getByTestId('nav-settings').click();
        await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 5000 });
        await expect(window.getByTestId('setting-remote-enabled')).toBeChecked();
        await expect(window.getByText('2 online · 2 paired')).toBeVisible({ timeout: 5000 });
    });

    test('opens Connected Devices modal showing device list', async ({ window }) => {
        await window.getByText('2 online · 2 paired').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        const deviceItems = window.locator('[class*="deviceItem"]');
        await expect(deviceItems).toHaveCount(2);
        await expect(window.getByText('iPhone', { exact: true })).toBeVisible();
        await expect(window.getByText('ios · Online', { exact: true })).toBeVisible();
        await expect(window.getByText('Windows PC', { exact: true })).toBeVisible();
        await expect(window.getByText('web · Online', { exact: true })).toBeVisible();
    });

    test('closes Connected Devices modal via close button', async ({ window }) => {
        await window.getByText('2 online · 2 paired').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        const closeButton = window.getByRole('heading', { name: 'Connected Devices' }).locator('xpath=..').getByRole('button');
        await closeButton.click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).not.toBeVisible({ timeout: 3000 });
    });

    test('revokes a paired device and refreshes the list', async ({ window }) => {
        await window.getByText('2 online · 2 paired').click();
        await expect(window.getByRole('heading', { name: 'Connected Devices' })).toBeVisible({ timeout: 5000 });

        await expect(window.getByTitle('Revoke pairing')).toHaveCount(2);
        await window.getByTitle('Revoke pairing').first().click();

        await expect(window.locator('[class*="deviceItem"]')).toHaveCount(1);
        await expect(window.getByText('iPhone', { exact: true })).toHaveCount(0);
        await expect(window.getByText('2 online · 1 paired')).toBeVisible();
    });
});
