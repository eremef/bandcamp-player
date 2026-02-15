import { CollectionItem } from '../../shared/types';

export class SimulationService {
    private readonly SIMULATION_TARGET = 5000;
    private readonly BATCH_SIZE = 20;
    private readonly ERROR_RATE = 0.10; // 10% chance of error

    shouldSimulate(): boolean {
        return process.argv.includes('--simulate-large-collection');
    }

    async fetchBatch(lastToken: string | undefined): Promise<CollectionItem[]> {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 100));

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
            dummyItems.push({
                id: `sim-${itemId}`,
                type: 'track',
                token: `sim-${itemId}:track::`, // Current item token pointing to this offset
                track: {
                    id: `sim-${itemId}`,
                    title: `Simulated Track ${itemId}`,
                    artist: 'Simulated Artist',
                    album: `Simulated Album ${Math.floor(itemId / 10)}`,
                    duration: 180,
                    artworkUrl: '',
                    streamUrl: '',
                    bandcampUrl: '',
                    isCached: false,
                },
                purchaseDate: new Date().toISOString(),
            });
        }

        console.log(`[SIMULATION] Generated batch starting at ${currentIndex + 1}`);
        return dummyItems;
    }
}

export const simulationService = new SimulationService();
