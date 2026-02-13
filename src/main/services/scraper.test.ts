// @vitest-environment node
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
                        token: 't1',
                        album: {
                            id: '1', title: 'Test Album', artist: 'Test Artist',
                            tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: ''
                        }
                    },
                    {
                        id: '2',
                        type: 'track',
                        purchaseDate: '',
                        token: 't2',
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
                            "band_name": "Mock Band",
                            "token": "token1"
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

        it('should fallback to DOM parsing if script parsing fails', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser' }
            });
            mockAuthService.getSessionCookies.mockResolvedValue('session=123');

            const mockHtml = `
                <html>
                <div class="collection-item-container" data-tralbumid="202" data-itemtype="track">
                    <div class="collection-item-title">DOM Track</div>
                    <div class="collection-item-artist">by DOM Artist</div>
                    <a class="item-link" href="https://example.com/track"></a>
                    <img class="collection-item-art" src="image_9.jpg">
                </div>
                </html>
            `;

            mockAxios.get.mockResolvedValue({ data: mockHtml });
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);

            expect(collection.items).toHaveLength(1);
            expect(collection.items[0].track?.title).toBe('DOM Track');
            expect(collection.items[0].track?.artist).toBe('DOM Artist');
        });

        it('should handle pagination (fetchMoreCollectionItems)', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser', id: '999' }
            });

            // Initial page response with one item
            const mockHtml = `
                <html>
                <script>
                    var collection_data = {
                        "items": [{
                            "item_type": "album",
                            "item_id": 101,
                            "item_title": "Page 1 Item",
                            "band_name": "Band A",
                            "token": "token1"
                        }]
                    };
                    var pagedata = { fan_id: 12345 };
                </script>
                </html>
            `;
            mockAxios.get.mockResolvedValue({ data: mockHtml });

            // Mock subsequent API calls
            mockAxios.post
                .mockResolvedValueOnce({ // First API call (bootstrap/future token)
                    data: { items: [] }
                })
                .mockResolvedValueOnce({ // Second API call (pagination from token1)
                    data: {
                        items: [{
                            item_type: 'track',
                            item_id: 102,
                            item_title: 'Page 2 Item',
                            band_name: 'Band B',
                            token: 'token2'
                        }]
                    }
                })
                .mockResolvedValueOnce({ // Third API call (empty, stops loop)
                    data: { items: [] }
                });

            const collection = await scraper.fetchCollection(true);

            // Should contain both initial item and paginated item
            expect(collection.items).toHaveLength(2);
            expect(collection.items[0].album?.title).toBe('Page 1 Item');
            expect(collection.items[1].track?.title).toBe('Page 2 Item');
        });
    });

    describe('getAlbumDetails', () => {
        it('should parse album details from TralbumData', async () => {
            const mockHtml = `
                <html>
                <script>
                    var TralbumData = {
                        id: 202,
                        album_title: "Full Album",
                        artist: "Great Artist",
                        band_id: 303,
                        art_id: 404,
                        trackinfo: [
                            { track_id: 1, title: "Song 1", duration: 120, file: { "mp3-128": "http://stream.url/1" } }
                        ]
                    };
                </script>
                </html>
            `;
            mockAxios.get.mockResolvedValue({ data: mockHtml });

            const album = await scraper.getAlbumDetails('https://artist.bandcamp.com/album/test');

            expect(album).not.toBeNull();
            expect(album?.title).toBe('Full Album');
            expect(album?.tracks).toHaveLength(1);
            expect(album?.tracks[0].streamUrl).toBe('http://stream.url/1');
        });

        it('should fallback to Mobile API if stream URL is missing', async () => {
            const mockHtml = `
                <html>
                <script>
                    var TralbumData = {
                        id: 202,
                        album_title: "No Stream Album",
                        artist: "Artist",
                        band_id: 303,
                        trackinfo: [
                            { track_id: 99, title: "Missing Stream", duration: 120, file: null }
                        ]
                    };
                </script>
                </html>
            `;
            mockAxios.get.mockResolvedValueOnce({ data: mockHtml }); // Page fetch

            // Mobile API response
            mockAxios.get.mockResolvedValueOnce({
                data: {
                    tracks: [{
                        streaming_url: { 'mp3-128': 'http://fallback.url/stream' }
                    }]
                }
            });

            const album = await scraper.getAlbumDetails('https://artist.bandcamp.com/album/test');

            expect(album?.tracks[0].streamUrl).toBe('http://fallback.url/stream');
        });
    });

    describe('getRadioStations', () => {
        it('should fetch and parse radio stations', async () => {
            const mockRadioData = {
                results: [
                    { id: 1, title: 'Weekly 1', subtitle: 'Best music', image_id: 123 }
                ]
            };
            mockAxios.get.mockResolvedValue({ data: mockRadioData });

            const stations = await scraper.getRadioStations();

            expect(stations).toHaveLength(1);
            expect(stations[0].name).toBe('Weekly 1');
            expect(stations[0].imageUrl).toContain('123');
        });

        it('should fallback to default station on error', async () => {
            mockAxios.get.mockRejectedValue(new Error('Network error'));

            const stations = await scraper.getRadioStations();

            expect(stations).toHaveLength(1);
            expect(stations[0].id).toBe('weekly');
        });
    });

    describe('getStationStreamUrl', () => {
        it('should extract radio stream URL from page blob and mobile API', async () => {
            const mockPageHtml = `
                <html>
                <div id="ArchiveApp" data-blob='{"appData":{"shows":[{"showId":100,"audioTrackId":555}]}}'></div>
                </html>
            `;

            mockAxios.get.mockResolvedValueOnce({ data: mockPageHtml }); // Page fetch

            // Mobile API fetch for track
            mockAxios.get.mockResolvedValueOnce({
                data: {
                    tracks: [{
                        streaming_url: { 'mp3-128': 'http://radio.stream/123' }
                    }]
                }
            });

            const result = await scraper.getStationStreamUrl('100');
            expect(result).toEqual({ streamUrl: 'http://radio.stream/123', duration: 0 });
        });

        it('should return empty string on error', async () => {
            mockAxios.get.mockRejectedValue(new Error('Failed'));
            const result = await scraper.getStationStreamUrl('100');
            expect(result).toEqual({ streamUrl: '', duration: 0 });
        });
    });

    describe('Title Cleaning Regression ("gift given" issue)', () => {
        it('should remove "(gift given)" suffix', async () => {
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
                            "item_id": 901,
                            "item_title": "Normal Title (gift given)",
                            "band_name": "Artist",
                            "token": "token1"
                        }]
                    };
                </script>
                </html>
            `;
            mockAxios.get.mockResolvedValue({ data: mockHtml });
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);
            expect(collection.items[0].album?.title).toBe('Normal Title');
        });

        it('should deduplicate "Title (gift given) Title"', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser' }
            });

            const mockHtml = `
                <html>
                <script>
                    var collection_data = {
                        "items": [{
                            "item_type": "album",
                            "item_id": 902,
                            "item_title": "Duplicated Title (gift given) Duplicated Title",
                            "band_name": "Artist",
                            "token": "token2"
                        }]
                    };
                </script>
                </html>
            `;
            mockAxios.get.mockResolvedValue({ data: mockHtml });
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);
            expect(collection.items[0].album?.title).toBe('Duplicated Title');
        });

        it('should handle aggressive whitespace and newlines', async () => {
            mockAuthService.getUser.mockReturnValue({
                isAuthenticated: true,
                user: { profileUrl: 'https://bandcamp.com/testuser' }
            });

            const mockHtml = `
                <html>
                <div class="collection-item-container" data-tralbumid="903" data-itemtype="album">
                    <div class="collection-item-title">
                        Spaced Title (gift given) Spaced Title
                    </div>
                    <div class="collection-item-artist">by Artist</div>
                </div>
                </html>
            `;
            mockAxios.get.mockResolvedValue({ data: mockHtml });
            mockAxios.post.mockResolvedValue({ data: { items: [] } });

            const collection = await scraper.fetchCollection(true);
            expect(collection.items[0].album?.title).toBe('Spaced Title');
        });
    });
});

