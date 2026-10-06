import { describe, expect, it } from 'vitest';
import { formatPairingExpiration, getOrderedRemoteInterfaceNames, getSelectedRemoteInterfaceName, isPairingInviteExpired } from './pairing-utils';

describe('getOrderedRemoteInterfaceNames', () => {
    it('puts the recommended interface first and removes duplicate interface names', () => {
        expect(getOrderedRemoteInterfaceNames([
            { name: 'eth0', address: '192.168.1.10' },
            { name: 'wlan0', address: '192.168.1.20' },
            { name: 'wlan0', address: '192.168.1.21' },
        ], '192.168.1.20')).toEqual(['wlan0', 'eth0']);
    });
});

describe('getSelectedRemoteInterfaceName', () => {
    it('uses the recommended interface when no interface has been configured', () => {
        expect(getSelectedRemoteInterfaceName(undefined, 'wlan0')).toBe('wlan0');
    });

    it('preserves a configured interface', () => {
        expect(getSelectedRemoteInterfaceName('eth0', 'wlan0')).toBe('eth0');
    });
});

describe('formatPairingExpiration', () => {
    const now = Date.parse('2026-10-06T12:00:00.000Z');

    it('formats remaining minutes and seconds', () => {
        expect(formatPairingExpiration('2026-10-06T12:01:34.000Z', now)).toBe('1 min 34 s');
    });

    it('formats durations under a minute as seconds', () => {
        expect(formatPairingExpiration('2026-10-06T12:00:34.000Z', now)).toBe('34 s');
    });

    it('reports expired invites', () => {
        expect(formatPairingExpiration('2026-10-06T11:59:59.000Z', now)).toBe('expired');
    });

    it('detects when an invite has expired', () => {
        expect(isPairingInviteExpired('2026-10-06T11:59:59.000Z', now)).toBe(true);
        expect(isPairingInviteExpired('2026-10-06T12:00:01.000Z', now)).toBe(false);
    });
});
