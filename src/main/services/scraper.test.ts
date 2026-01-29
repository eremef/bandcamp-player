import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScraperService } from './scraper.service';
import { AuthService } from './auth.service';
import { Collection } from '../../shared/types';
import axios from 'axios';

// Mock dependencies
vi.mock('axios');
vi.mock('./auth.service');

describe('ScraperService', () => {
    let scraper: ScraperService;
    let mockAuthService: any;
    let mockAxios: any;

    beforeEach(() => {
        // Setup mocks
        mockAuthService = {
            getUser: vi.fn(),
            getSessionCookies: vi.fn(),
        };
        (AuthService as any).mockImplementation(() => mockAuthService);

        mockAxios = {
            get: vi.fn(),
            post: vi.fn(),
            create: vi.fn().mockReturnThis(),
        };
        (axios.create as any).mockReturnValue(mockAxios);

        scraper = new ScraperService(mockAuthService);
    });

    describe('searchCollection', () => {
        it('should return empty collection if no cache', () => {
            const result = scraper.searchCollection('test');
            expect(result.items).toEqual([]);
            expect(result.totalCount).toBe(0);
        });

        it('should filter items based on query', () => {
            // Manually inject cached collection for testing private property/state
            // Since cachedCollection is private, we can't set it directly easily without cast
            const mockCollection: Collection = {
                items: [
                    {
                        id: '1',
                        type: 'album',
                        purchaseDate: '',
                        album: {
                            id: '1', title: 'Test Album', artist: 'Test Artist',
                            tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: ''
                        }
                    },
                    {
                        id: '2',
                        type: 'track',
                        purchaseDate: '',
                        track: {
                            id: '2', title: 'Test Track', artist: 'Another Artist', album: '',
                            duration: 100, artworkUrl: '', streamUrl: '', bandcampUrl: '', isCached: false
                        }
                    }
                ],
                totalCount: 2,
                lastUpdated: ''
            };

            (scraper as any).cachedCollection = mockCollection;

            const artistResult = scraper.searchCollection('Test Artist');
            expect(artistResult.items).toHaveLength(1);
            expect(artistResult.items[0].id).toBe('1');

            const trackResult = scraper.searchCollection('Track');
            expect(trackResult.items).toHaveLength(1);
            expect(trackResult.items[0].id).toBe('2');

            const caseInsensitive = scraper.searchCollection('test');
            expect(caseInsensitive.items).toHaveLength(2);
        });
    });

    describe('fetchCollection', () => {
        it('should throws if not authenticated', async () => {
            mockAuthService.getUser.mockReturnValue({ isAuthenticated: false });
            await expect(scraper.fetchCollection()).rejects.toThrow('User not authenticated');
        });

        it('should parse collection from page script', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser' }
            });
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const mockHtml = `
                <html>
                <script>
                    var collection_data = {
                        "items": [{
                            "item_type": "album",
                            "item_id": 101,
                            "item_title": "Mock Album",
                            "band_name": "Mock Band"
                        }]
                    };
                </script>
                </html>
            `;

            mockAxios.get.mockResolvedValue({ data: mockHtml });
            // Mock empty fetchMore response to avoid loops
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);

            expect(collection.items).toHaveLength(1);
            expect(collection.items[0].album?.title).toBe('Mock Album');
            expect(collection.items[0].album?.artist).toBe('Mock Band');
        });
    });
});
