import type { RemoteNetworkInterface } from '../../../shared/types';

export function formatPairingExpiration(expiresAt: string, now = Date.now()): string {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) return 'expired';

    const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
    if (remainingSeconds === 0) return 'expired';

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

export function isPairingInviteExpired(expiresAt: string, now = Date.now()): boolean {
    return formatPairingExpiration(expiresAt, now) === 'expired';
}

export function getOrderedRemoteInterfaceNames(
    interfaces: RemoteNetworkInterface[],
    recommendedAddress?: string | null,
): string[] {
    const recommendedName = interfaces.find((networkInterface) => networkInterface.address === recommendedAddress)?.name;
    const names = [...new Set(interfaces.map((networkInterface) => networkInterface.name))];
    return recommendedName ? [recommendedName, ...names.filter((name) => name !== recommendedName)] : names;
}

export function getSelectedRemoteInterfaceName(configuredName?: string, recommendedName?: string): string {
    return configuredName || recommendedName || '';
}
