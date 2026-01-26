import * as Network from 'expo-network';

export class DiscoveryService {
    private static PORT = 9999;
    private static TIMEOUT = 500; // ms per probe

    static async getLocalIp(): Promise<string | null> {
        try {
            return await Network.getIpAddressAsync();
        } catch (e) {
            console.error('Failed to get local IP', e);
            return null;
        }
    }

    static async scanNetwork(onProgress?: (progress: number) => void): Promise<string | null> {
        const localIp = await this.getLocalIp();
        if (!localIp) return null;

        const parts = localIp.split('.');
        const subnet = parts.slice(0, 3).join('.');

        // Parallel scan in chunks to be faster but not overwhelm OS
        const chunkSize = 20;
        const scanRange = 254;

        for (let i = 1; i <= scanRange; i += chunkSize) {
            const promises = [];
            for (let j = 0; j < chunkSize && (i + j) <= scanRange; j++) {
                const targetIp = `${subnet}.${i + j}`;
                // Skip own IP if running on desktop? No, we are on mobile. 
                // Skip router usage (usually .1), but sometimes servers are .1 so keep it.

                promises.push(this.probe(targetIp));
            }

            const results = await Promise.all(promises);
            const found = results.find(ip => ip !== null);

            if (found) return found;

            if (onProgress) {
                onProgress(Math.min((i + chunkSize) / scanRange, 1));
            }
        }

        return null;
    }

    private static probe(ip: string): Promise<string | null> {
        return new Promise((resolve) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

            fetch(`http://${ip}:${this.PORT}/`, {
                method: 'HEAD',
                signal: controller.signal
            })
                .then(response => {
                    clearTimeout(timeoutId);
                    // If we get any response, even 404, something is listening. 
                    // Our server returns 200 for /, so we expect 200.
                    if (response.ok || response.status === 200) {
                        resolve(ip);
                    } else {
                        resolve(null);
                    }
                })
                .catch(() => {
                    resolve(null);
                });
        });
    }
}
