import { CollectionItem } from '../../shared/types';

export class SimulationService {
    private readonly SIMULATION_TARGET = 5000;
    private readonly BATCH_SIZE = 20;
    private readonly ERROR_RATE = 0.10; // 10% chance of error

    shouldSimulate(): boolean {
        const hasFlag = process.argv.includes('--simulate-large-collection');
        const hasEnv = process.env.SIMULATE_LARGE_COLLECTION === 'true';
        if (hasFlag || hasEnv) {
            console.log(`[SIMULATION] Simulation mode active (Flag: ${hasFlag}, Env: ${hasEnv})`);
            return true;
        }
        return false;
    }

    async fetchBatch(lastToken: string | undefined): Promise<CollectionItem[]> {
        // Simulate network latency (reduced for faster loading while still simulating async)
        await new Promise(resolve => setTimeout(resolve, 20));

        // Simulate network error
        if (Math.random() < this.ERROR_RATE) {
            console.log('[SIMULATION] Simulating network error...');
            throw new Error('Simulated network error');
        }

        // Parse index from token
        let currentIndex = 0;
        if (lastToken && lastToken.startsWith('sim-')) {
            currentIndex = parseInt(lastToken.split('-')[1], 10);
        }

        if (currentIndex >= this.SIMULATION_TARGET) {
            console.log('[SIMULATION] Reached target size, stopping.');
            return [];
        }

        const dummyItems: CollectionItem[] = [];
        for (let i = 0; i < this.BATCH_SIZE; i++) {
            const itemId = currentIndex + i + 1;
            const isAlbum = itemId % 5 === 0; // Every 5th item is an album
            const type = isAlbum ? 'album' : 'track';

            // Use Picsum for varied artwork
            const artworkUrl = `https://picsum.photos/seed/bc-${itemId}/300/300`;

            const item: CollectionItem = {
                id: `sim-${itemId}`,
                type,
                token: `sim-${itemId}:${type}::`,
                purchaseDate: new Date(Date.now() - (itemId * 3600000)).toISOString(), // Older dates for higher IDs
            };

            if (isAlbum) {
                item.album = {
                    id: `sim-${itemId}`,
                    title: `Simulated Album ${itemId}`,
                    artist: `Artist ${Math.floor(itemId / 20)}`,
                    artistId: `artist-${Math.floor(itemId / 20)}`,
                    artworkUrl,
                    bandcampUrl: 'https://bandcamp.com',
                    tracks: [],
                    trackCount: 10,
                };
            } else {
                item.track = {
                    id: `sim-${itemId}`,
                    title: `Simulated Track ${itemId}`,
                    artist: `Artist ${Math.floor(itemId / 20)}`,
                    artistId: `artist-${Math.floor(itemId / 20)}`,
                    album: `Simulated Album ${Math.floor(itemId / 10)}`,
                    duration: 180 + (itemId % 60),
                    artworkUrl,
                    streamUrl: '',
                    bandcampUrl: 'https://bandcamp.com',
                    isCached: false,
                };
            }

            dummyItems.push(item);
        }

        console.log(`[SIMULATION] Generated batch starting at ${currentIndex + 1}`);
        return dummyItems;
    }
}

export const simulationService = new SimulationService();
