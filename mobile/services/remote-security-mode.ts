import AsyncStorage from '@react-native-async-storage/async-storage';

export type RemoteSecurityMode = 'safe' | 'unsafe';

const SECURITY_MODE_KEY = 'remote_security_mode';

export async function loadRemoteSecurityMode(): Promise<RemoteSecurityMode> {
    const savedMode = await AsyncStorage.getItem(SECURITY_MODE_KEY);
    if (savedMode === 'safe' || savedMode === 'unsafe') return savedMode;
    if (savedMode !== null) return 'safe';

    const lastIp = await AsyncStorage.getItem('last_ip');
    const recentIpsJson = lastIp ? null : await AsyncStorage.getItem('recent_ips');
    let recentIp: string | undefined;
    if (recentIpsJson) {
        try {
            const recentIps: unknown = JSON.parse(recentIpsJson);
            if (Array.isArray(recentIps) && typeof recentIps[0] === 'string') recentIp = recentIps[0];
        } catch {
            recentIp = undefined;
        }
    }

    const host = lastIp || recentIp;
    if (!host) return 'safe';

    const legacyKey = `remote_security_mode_${host.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const legacyMode = await AsyncStorage.getItem(legacyKey);
    if (legacyMode === 'safe' || legacyMode === 'unsafe') {
        await saveRemoteSecurityMode(legacyMode);
        return legacyMode;
    }
    return 'safe';
}

export async function saveRemoteSecurityMode(mode: RemoteSecurityMode): Promise<void> {
    await AsyncStorage.setItem(SECURITY_MODE_KEY, mode);
}