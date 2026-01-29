import { DiscoveryService } from './discovery.service';
import * as Network from 'expo-network';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
jest.mock('expo-network');

describe('DiscoveryService', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        (Network.getIpAddressAsync as any).mockResolvedValue('192.168.1.50');
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    it('should get local IP', async () => {
        const ip = await DiscoveryService.getLocalIp();
        expect(ip).toBe('192.168.1.50');
    });

    it('should find server IP when probe succeeds', async () => {
        const targetIp = '192.168.1.100';

        // Mock fetch to succeed only for targetIp
        global.fetch = jest.fn((url: any) => {
            if (url.toString().includes(targetIp)) {
                return Promise.resolve({
                    ok: true,
                    status: 200
                } as Response);
            }
            return Promise.reject('Connection refused');
        }) as any;

        const result = await DiscoveryService.scanNetwork();
        expect(result).toBe(targetIp);
    });

    it('should return null if scanning fails', async () => {
        global.fetch = jest.fn(() => Promise.reject('No connection')) as any;

        const result = await DiscoveryService.scanNetwork();
        expect(result).toBeNull();
    });

    it('should report progress', async () => {
        global.fetch = jest.fn(() => Promise.reject('No connection')) as any;
        const onProgress = jest.fn();

        await DiscoveryService.scanNetwork(onProgress);

        expect(onProgress).toHaveBeenCalled();
        // Since we scan 254 IPs in chunks, progress should be called multiple times
    });
});
