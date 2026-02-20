import { MobileSimulationService } from '../services/MobileSimulationService';

describe('MobileSimulationService', () => {
    let service: MobileSimulationService;

    beforeEach(() => {
        service = new MobileSimulationService();
    });

    it('should return initial batch of items with correct size', async () => {
        const items = await service.fetchBatch(undefined);
        expect(items.length).toBe(50);
        expect(items[0].id).toBe('sim-1');
        expect(items[49].id).toBe('sim-50');
    });

    it('should parse lastToken and return next batch properly', async () => {
        const items = await service.fetchBatch('sim-50');
        expect(items.length).toBe(50);
        expect(items[0].id).toBe('sim-51');
        expect(items[49].id).toBe('sim-100');
    });

    it('should correctly assign album type to every 5th item', async () => {
        const items = await service.fetchBatch(undefined);

        // Items are 1-indexed for id: 'sim-1', 'sim-2', etc.
        // itemId % 5 === 0 means itemId 5, 10, 15 are albums.
        // Array index 4 corresponds to itemId 5.

        expect(items[4].type).toBe('album');
        expect(items[4].album).toBeDefined();
        expect(items[4].track).toBeUndefined();

        expect(items[0].type).toBe('track');
        expect(items[0].track).toBeDefined();
        expect(items[0].album).toBeUndefined();
    });

    it('should return empty array when reaching SIMULATION_TARGET', async () => {
        // SIMULATION_TARGET is 5000
        const items = await service.fetchBatch('sim-5000');
        expect(items).toEqual([]);
    });

    it('should generate final partial batch if close to target', async () => {
        const items = await service.fetchBatch('sim-4980');
        expect(items.length).toBe(20); // 5000 - 4980 = 20
        expect(items[19].id).toBe('sim-5000');
    });
});
