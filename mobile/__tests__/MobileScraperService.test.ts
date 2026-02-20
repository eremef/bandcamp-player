import { mobileScraperService } from '../services/MobileScraperService';
import { mobileAuthService } from '../services/MobileAuthService';
import { mobileDatabase } from '../services/MobileDatabase';
import { mobileSimulationService } from '../services/MobileSimulationService';

jest.mock('../services/MobileAuthService');
jest.mock('../services/MobileDatabase');
jest.mock('../services/MobileSimulationService');

describe('MobileScraperService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();

        // Reset internal cache
        (mobileScraperService as any).cachedCollection = null;
    });

    describe('fetchCollection', () => {
        it('should throw if not authenticated', async () => {
            (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: false });
            await expect(mobileScraperService.fetchCollection()).rejects.toThrow('User not authenticated');
        });

        it('should return from database cache if available and not forced', async () => {
            const mockCollection = { items: [{ id: '1', type: 'track', track: { artist: 'Artist', title: 'Song' } }] };
            (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: true, user: { id: 'user1' } });
            (mobileDatabase.getCollectionCache as jest.Mock).mockResolvedValue({ data: mockCollection });

            const result = await mobileScraperService.fetchCollection(false);

            expect(mobileDatabase.getCollectionCache).toHaveBeenCalledWith('user1');
            expect(result).toEqual(mockCollection);
            expect(mobileDatabase.replaceArtists).toHaveBeenCalled(); // Since it re-extracts artists
        });

        it('should use simulation service if isSimulated is true', async () => {
            (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: true, user: { id: 'user1' } });
            (mobileSimulationService.fetchBatch as jest.Mock)
                .mockResolvedValueOnce([{ id: 'sim1', type: 'album', token: 't1', album: { artist: 'Art1', title: 'T1' } }])
                .mockResolvedValueOnce([]); // end

            const result = await mobileScraperService.fetchCollection(true, true);

            expect(mobileSimulationService.fetchBatch).toHaveBeenCalledTimes(2);
            expect(result.items.length).toBe(1);
            expect(result.isSimulated).toBe(true);
            expect(mobileDatabase.saveCollectionCache).toHaveBeenCalledWith('user1', expect.objectContaining({ isSimulated: true }));
        });

        it('should fetch from network using embedded script', async () => {
            (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: true, user: { id: 'user1', profileUrl: 'http://profile' } });
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookie');
            (mobileDatabase.getCollectionCache as jest.Mock).mockResolvedValue(null);

            const mockHtml = `
                <html>
                    <body>
                        <script>
                            var collection_data = {
                                items: [
                                    { item_id: 1, item_type: "album", band_name: "Artist", item_title: "Title by Artist" }
                                ]
                            };
                        </script>
                    </body>
                </html>
            `;

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ text: jest.fn().mockResolvedValue(mockHtml) }) // Profile page
                .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ items: [] }) }); // No more items

            const result = await mobileScraperService.fetchCollection(true); // force network

            expect(global.fetch).toHaveBeenCalledWith('http://profile', expect.any(Object));
            expect(result.items.length).toBe(1);
            expect(result.items[0].album?.artist).toBe('Artist');
            expect(result.items[0].album?.title).toBe('Title'); // Cleaned suffix
        });

        it('should fallback to DOM parsing if script fails', async () => {
            (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: true, user: { id: 'user1', profileUrl: 'http://profile' } });
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookie');
            (mobileDatabase.getCollectionCache as jest.Mock).mockResolvedValue(null);

            const mockHtml = `
                 <html>
                     <body>
                         <div id="collection-grid">
                             <div class="collection-item-container" data-itemtype="track" data-tralbumid="123" data-bandid="456">
                                 <div class="collection-item-artist">by Artist</div>
                                 <div class="collection-item-title">Track Title</div>
                             </div>
                         </div>
                     </body>
                 </html>
             `;

            (global.fetch as jest.Mock).mockResolvedValueOnce({ text: jest.fn().mockResolvedValue(mockHtml) });

            const result = await mobileScraperService.fetchCollection(true);

            expect(result.items.length).toBe(1);
            expect(result.items[0].type).toBe('track');
            expect(result.items[0].track?.title).toBe('Track Title');
            expect(result.items[0].track?.artist).toBe('Artist'); // "by " cleaned
        });
    });

    describe('searchCollection', () => {
        it('should return empty if cache is missing', () => {
            const result = mobileScraperService.searchCollection('query');
            expect(result.items).toHaveLength(0);
        });

        it('should filter cached collection items', () => {
            (mobileScraperService as any).cachedCollection = {
                items: [
                    { type: 'album', album: { title: 'Apple', artist: 'Beatles' } },
                    { type: 'track', track: { title: 'Banana', artist: 'Monkeys' } }
                ]
            };

            const res1 = mobileScraperService.searchCollection('apple');
            expect(res1.items).toHaveLength(1);

            const res2 = mobileScraperService.searchCollection('Monkey');
            expect(res2.items).toHaveLength(1);
        });
    });

    describe('getAlbumDetails', () => {
        it('should return null on fetch failure', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
            const result = await mobileScraperService.getAlbumDetails('url');
            expect(result).toBeNull();
        });

        it('should parse album data from data-tralbum', async () => {
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookie');
            const mockHtml = `
                <html>
                    <body>
                        <script data-tralbum='{"id": 1, "band_id": 2, "album_title": "Album T", "artist": "Artist", "trackinfo": [{"title": "Trk1", "file": {"mp3-128": "url"}}]}'></script>
                    </body>
                </html>
            `;
            (global.fetch as jest.Mock).mockResolvedValueOnce({ text: jest.fn().mockResolvedValue(mockHtml) });

            const result = await mobileScraperService.getAlbumDetails('http://album');

            expect(result).not.toBeNull();
            expect(result?.title).toBe('Album T');
            expect(result?.tracks.length).toBe(1);
            expect(result?.tracks[0].streamUrl).toBe('url');
        });

        it('should fallback to mobile API if streamUrl is missing in page script', async () => {
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookie');
            const mockHtml = `
                 <html>
                     <body>
                         <script data-tralbum='{"id": 1, "band_id": 2, "album_title": "Album T", "artist": "Artist", "trackinfo": [{"track_id": 99, "title": "Trk1"}]}'></script>
                     </body>
                 </html>
             `;
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ text: jest.fn().mockResolvedValue(mockHtml) }) // main page
                .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ tracks: [{ streaming_url: { 'mp3-128': 'mobile_api_url' } }] }) }); // mobile api fallback

            const result = await mobileScraperService.getAlbumDetails('http://album');

            expect(result?.tracks[0].streamUrl).toBe('mobile_api_url');
        });
    });

    describe('getRadioStations', () => {
        it('should fetch stations from api', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    results: [
                        { id: 1, title: 'Show 1', published_date: '2024-01-01' }
                    ]
                })
            });

            const stations = await mobileScraperService.getRadioStations();
            expect(stations.length).toBe(1);
            expect(stations[0].name).toBe('Show 1');
            expect(stations[0].date).toBeDefined();
        });

        it('should return fallback on error', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fail'));

            const stations = await mobileScraperService.getRadioStations();
            expect(stations.length).toBe(1);
            expect(stations[0].id).toBe('weekly');
        });
    });

    describe('getStationStreamUrl', () => {
        it('should find stream url from data-blob', async () => {
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookies');

            const mockBlob = JSON.stringify({
                audioTrackId: 100,
                track_id: 100,
                file: { 'mp3-128': 'direct_stream' }
            });

            const mockHtml = `
                <html><body>
                <div data-blob='${mockBlob.replace(/"/g, '&quot;')}'></div>
                </body></html>
            `;
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(mockHtml) })
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue('{}') });

            const result = await mobileScraperService.getStationStreamUrl('50');
            expect(result.streamUrl).toBe('direct_stream');
        });

        it('should fallback to api if trackId found but no direct stream url', async () => {
            (mobileAuthService.getCookies as jest.Mock).mockResolvedValue('cookies');

            const mockBlob = JSON.stringify({
                audioTrackId: 100,
            });

            const mockHtml = `
                 <html><body>
                 <div data-blob='${mockBlob.replace(/"/g, '&quot;')}'></div>
                 </body></html>
             `;
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(mockHtml) })
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(JSON.stringify({ tracks: [{ streaming_url: { 'mp3-128': 'api_stream' } }] })) });

            const result = await mobileScraperService.getStationStreamUrl('50');
            expect(result.streamUrl).toBe('api_stream');
        });

        it('should return empty if fetch fails entirely', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
            const result = await mobileScraperService.getStationStreamUrl('50');
            expect(result.streamUrl).toBe('');
        });
    });
});
