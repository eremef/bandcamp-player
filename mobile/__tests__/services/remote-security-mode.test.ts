import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRemoteSecurityMode, saveRemoteSecurityMode } from '../../services/remote-security-mode';

describe('remote security mode preference', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it('defaults to secure mode without a saved choice', async () => {
        expect(await loadRemoteSecurityMode()).toBe('safe');
    });

    it('stores and restores either choice without requiring a host', async () => {
        await saveRemoteSecurityMode('unsafe');
        expect(await loadRemoteSecurityMode()).toBe('unsafe');

        await saveRemoteSecurityMode('safe');
        expect(await loadRemoteSecurityMode()).toBe('safe');
    });

    it('migrates the last connected host choice', async () => {
        await AsyncStorage.setItem('last_ip', '192.168.1.10');
        await AsyncStorage.setItem('remote_security_mode_192_168_1_10', 'unsafe');

        expect(await loadRemoteSecurityMode()).toBe('unsafe');
        expect(await AsyncStorage.getItem('remote_security_mode')).toBe('unsafe');
    });

    it('migrates the most recent host after disconnect', async () => {
        await AsyncStorage.setItem('recent_ips', JSON.stringify(['192.168.1.20']));
        await AsyncStorage.setItem('remote_security_mode_192_168_1_20', 'unsafe');

        expect(await loadRemoteSecurityMode()).toBe('unsafe');
    });

    it('keeps the app choice when another host has a different legacy choice', async () => {
        await saveRemoteSecurityMode('safe');
        await AsyncStorage.setItem('last_ip', '192.168.1.10');
        await AsyncStorage.setItem('remote_security_mode_192_168_1_10', 'unsafe');

        expect(await loadRemoteSecurityMode()).toBe('safe');
    });

    it('uses secure mode for an invalid saved value', async () => {
        await AsyncStorage.setItem('remote_security_mode', 'invalid');

        expect(await loadRemoteSecurityMode()).toBe('safe');
    });
});