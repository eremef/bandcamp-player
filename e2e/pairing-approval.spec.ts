import { test, expect } from './fixtures';
import type { RemoteControlStatus, RemotePairingRequest } from '../src/shared/types';

const MOBILE_REQUEST: RemotePairingRequest = {
    id: 'mobile-request',
    name: 'Pixel Phone',
    platform: 'android',
    appVersion: '1.0.0',
    device: 'Pixel',
    ip: '192.168.1.50',
    requestedAt: '2026-10-01T10:00:00.000Z',
};

const WEB_REQUEST: RemotePairingRequest = {
    ...MOBILE_REQUEST,
    id: 'web-request',
    name: 'Web Browser',
    platform: 'web',
    ip: '192.168.1.60',
};

const REMOTE_STATUS: RemoteControlStatus = {
    isRunning: true,
    port: 9999,
    ip: '192.168.1.100',
    url: 'https://192.168.1.100:9999',
    connections: 0,
    securityMode: 'safe',
    pairingRequests: [],
};

test.describe('Pairing approval modal', () => {
    test.beforeEach(async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, status) => {
            let requests = status.pairingRequests;
            ipcMain.removeHandler('remote:get-status');
            ipcMain.handle('remote:get-status', async () => ({ ...status, pairingRequests: requests }));
            ipcMain.on('e2e:set-pairing-requests', (_event, pendingRequests) => {
                requests = pendingRequests;
            });
            for (const decision of ['approve', 'reject']) {
                ipcMain.removeHandler(`remote:${decision}-pairing`);
                ipcMain.handle(`remote:${decision}-pairing`, async (event, requestId) => {
                    if (!requests.some((request) => request.id === requestId)) return false;
                    requests = requests.filter((request) => request.id !== requestId);
                    event.sender.send('remote:on-pairing-requests-changed', requests);
                    return true;
                });
            }
        }, REMOTE_STATUS);

        const loginButton = window.getByRole('button', { name: 'Login with Bandcamp' });
        if (await loginButton.isVisible()) {
            await loginButton.click();
        }
        await expect(window.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 });
    });

    test('shows incoming requests above Settings and resolves mobile and web requests in order', async ({ electronApp, window }, testInfo) => {
        await window.getByTestId('nav-settings').click();
        await expect(window.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
        await expect(window.getByRole('dialog', { name: 'Approve pairing?' })).toHaveCount(0);

        await electronApp.evaluate(({ ipcMain, BrowserWindow }, requests) => {
            ipcMain.emit('e2e:set-pairing-requests', {}, requests);
            BrowserWindow.getAllWindows()[0]?.webContents.send('remote:on-pairing-requests-changed', requests);
        }, [MOBILE_REQUEST, WEB_REQUEST]);

        const dialog = window.getByRole('dialog', { name: 'Approve pairing?' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Pixel Phone', { exact: true })).toBeVisible();
        await expect(dialog.getByText('android · 192.168.1.50', { exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeFocused();
        await window.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toBeFocused();
        await window.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeFocused();
        await window.screenshot({ path: testInfo.outputPath('pairing-approval.png') });

        await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
        await expect(dialog.getByText('Web Browser', { exact: true })).toBeVisible();
        await expect(dialog.getByText('web · 192.168.1.60', { exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(window.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    });

    test('shows an existing request when Settings opens and rejects it with Escape', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, requests) => {
            ipcMain.emit('e2e:set-pairing-requests', {}, requests);
        }, [WEB_REQUEST]);

        await window.getByTestId('nav-settings').click();
        const dialog = window.getByRole('dialog', { name: 'Approve pairing?' });
        await expect(dialog.getByText('Web Browser', { exact: true })).toBeVisible();
        await window.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(window.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
        const settingsHeading = window.getByRole('heading', { name: 'Settings', exact: true });
        await window.locator('header').filter({ has: settingsHeading }).getByRole('button').click();
        await window.getByTestId('nav-settings').click();
        await expect(settingsHeading).toBeVisible();
        await expect(dialog).toHaveCount(0);
    });

    test('closes when a request expires without closing Settings', async ({ electronApp, window }) => {
        await window.getByTestId('nav-settings').click();
        await electronApp.evaluate(({ ipcMain, BrowserWindow }, requests) => {
            ipcMain.emit('e2e:set-pairing-requests', {}, requests);
            BrowserWindow.getAllWindows()[0]?.webContents.send('remote:on-pairing-requests-changed', requests);
        }, [MOBILE_REQUEST]);
        const dialog = window.getByRole('dialog', { name: 'Approve pairing?' });
        await expect(dialog).toBeVisible();

        await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
            ipcMain.emit('e2e:set-pairing-requests', {}, []);
            BrowserWindow.getAllWindows()[0]?.webContents.send('remote:on-pairing-requests-changed', []);
        });
        await expect(dialog).toHaveCount(0);
        await expect(window.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    });

    test('keeps the request open on an IPC failure and allows rejection', async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }, requests) => {
            ipcMain.emit('e2e:set-pairing-requests', {}, requests);
            ipcMain.removeHandler('remote:approve-pairing');
            ipcMain.handle('remote:approve-pairing', async () => {
                throw new Error('Approval failed');
            });
        }, [MOBILE_REQUEST]);
        await window.getByTestId('nav-settings').click();
        const dialog = window.getByRole('dialog', { name: 'Approve pairing?' });
        await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
        await expect(dialog.getByRole('alert')).toHaveText('Could not respond to the pairing request. Please try again.');
        await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
        await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
        await expect(dialog).toHaveCount(0);
    });
});
