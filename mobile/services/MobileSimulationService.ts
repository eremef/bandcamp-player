import { CollectionItem } from '@shared/types';

export class MobileSimulationService {
    private readonly SIMULATION_TARGET = 5000;
    private readonly BATCH_SIZE = 50;
    private readonly ERROR_RATE = 0.05; // 5% chance of error for mobile testing

    async fetchBatch(lastToken: string | undefined): Promise<CollectionItem[]> {
        // Simulate minor network latency
        await new Promise(resolve => setTimeout(resolve, 10));

        // Disable network error for stability during debugging
        if (false && Math.random() < this.ERROR_RATE) {
            console.log('[MOBILE-SIMULATION] Simulating network error...');
            throw new Error('Simulated network error');
        }

        // Parse index from token
        let currentIndex = 0;
        if (lastToken && lastToken.startsWith('sim-')) {
            currentIndex = parseInt(lastToken.split('-')[1], 10);
        }

        if (currentIndex >= this.SIMULATION_TARGET) {
            console.log('[MOBILE-SIMULATION] Reached target size, stopping.');
            return [];
        }

        const dummyItems: CollectionItem[] = [];
        for (let i = 0; i < this.BATCH_SIZE; i++) {
            const itemId = currentIndex + i + 1;
            if (itemId > this.SIMULATION_TARGET) break;

            const isAlbum = itemId % 5 === 0; // Every 5th item is an album
            const type = isAlbum ? 'album' : 'track';

            // Use Picsum for varied artwork
            const artworkUrl = `https://picsum.photos/seed/bc-mob-${itemId}/300/300`;

            const item: CollectionItem = {
                id: `sim-${itemId}`,
                type,
                token: `sim-${itemId}`,
                purchaseDate: new Date(Date.now() - (itemId * 3600000)).toISOString(),
            };

            if (isAlbum) {
                item.album = {
                    id: `sim-${itemId}`,
                    title: `Simulated Album ${itemId}`,
                    artist: `Sim Artist ${Math.floor(itemId / 20)}`,
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
                    artist: `Sim Artist ${Math.floor(itemId / 20)}`,
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

        console.log(`[MOBILE-SIMULATION] Generated batch starting at ${currentIndex + 1}`);
        return dummyItems;
    }
}

export const mobileSimulationService = new MobileSimulationService();
