import { test, expect } from './fixtures';
import type { CastDevice } from '../src/shared/types';

const CAST_DEVICE: CastDevice = {
    id: 'device1',
    name: 'Living Room TV',
    host: '192.168.1.20',
    friendlyName: 'Living Room TV',
    type: 'Chromecast',
    status: 'disconnected',
};

test.describe('Chromecast Integration', () => {
    test.beforeEach(async ({ window }) => {
        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionButton = window.getByRole('button', { name: 'Collection', exact: true });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(collectionButton).toBeVisible({ timeout: 15000 });
    });

    test('shows devices discovered through IPC', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ BrowserWindow }, device) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('cast:on-devices-updated', [device]);
        }, CAST_DEVICE);

        await window.getByTitle('Cast to Device').click();
        await expect(window.getByRole('heading', { name: 'Cast to device', level: 3 })).toBeVisible();
        await expect(window.getByText('Living Room TV', { exact: true })).toBeVisible();
    });

    test('connects to a discovered device from the cast menu', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain, BrowserWindow }, device) => {
            ipcMain.removeHandler('cast:connect');
            ipcMain.handle('cast:connect', async () => {
                BrowserWindow.getAllWindows()[0]?.webContents.send('cast:on-status-changed', {
                    status: 'connected',
                    device: { ...device, status: 'connected' },
                });
            });
            BrowserWindow.getAllWindows()[0]?.webContents.send('cast:on-devices-updated', [device]);
        }, CAST_DEVICE);

        await window.getByTitle('Cast to Device').click();
        await window.getByText('Living Room TV', { exact: true }).click();
        await expect(window.getByTitle('Cast to Device')).toHaveClass(/active/);

        await window.getByTitle('Cast to Device').click();
        await expect(window.getByText('Disconnect', { exact: true })).toBeVisible();
    });
});
