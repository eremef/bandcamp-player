// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScraperService } from "./scraper.service";
import { AuthService } from "./auth.service";
import { Collection } from "../../shared/types";
import { remoteConfigService } from "../../shared/remote-config.service";
import axios from "axios";

// Mock dependencies
vi.mock("axios");
vi.mock("./auth.service");

describe("ScraperService", () => {
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

    // Mock remote config
    vi.spyOn(remoteConfigService, 'get').mockReturnValue({
      selectors: {
        collection: {
          itemContainer: ".collection-item-container",
          artist: ".collection-item-artist",
          title: ".collection-item-title",
          link: "a.item-link",
          artwork: "img.collection-item-art",
          fallbackArtist: "Unknown Artist",
          fallbackTitle: "Untitled"
        },
        album: { artistDOM: [] },
        radio: { dataBlobElements: [], scriptRegexes: [] }
      },
      scriptKeys: {
        collection: ["collection_data", "CollectionData"],
        wishlist: ["wishlist_data", "WishlistData"],
        album: ["TralbumData"]
      },
      endpoints: {
        collectionItemsApi: "https://bandcamp.com/api/fancollection/1/collection_items",
        wishlistItemsApi: "https://bandcamp.com/api/fancollection/1/wishlist_items",
        mobileTralbumDetailsApi: "https://bandcamp.com/api/mobile/24/tralbum_details",
        radioListApi: "https://bandcamp.com/api/bcweekly/3/list",
        radioShowWeb: "https://bandcamp.com/?show={showId}",
        radioWeeklyWeb: "https://bandcamp.com/weekly?show={showId}",
        radioFallbackStream: "https://bandcamp.com/bcweekly",
        radioPlayerDataApi: "https://bandcamp.com/api/player/2/player_data_web",
        artworkFormat: "https://f4.bcbits.com/img/a{art_id}_10.jpg",
        radioImageFormat: "https://f4.bcbits.com/img/{image_id}_16.jpg",
        radioTrackArtworkFormat: "https://f4.bcbits.com/img/a{art_id}_2.jpg",
        radioTrackImageFormat: "https://f4.bcbits.com/img/a{image_id}_2.jpg"
      },
      userAgents: {
        desktop: "desktop-ua",
        mobile: "mobile-ua",
        mobileApi: "mobile-api-ua"
      },
      cleaning: {
        artistCleanRegex: "\\s*by\\s+.+$",
        artistPrefixCleanRegex: "^by\\s+",
        titleCleanRegex: "\\s*\\(gift given\\)\\s*",
        dedupeRegex: "^(.*?)\\s*\\(gift given\\)\\s*\\1$"
      },
      scraping: {
        batchSize: 100,
        maxBatches: 100,
        rateLimitDelay: 0,
        rateLimitJitter: 0
      },
      radioData: {
        showIdKeys: ["showId", "show_id", "itemId", "id"],
        trackIdKeys: ["audioTrackId", "track_id", "trackId"],
        fallbackTitle: "Unknown Title",
        fallbackArtist: "Unknown Artist",
        fallbackAlbum: "Bandcamp Radio",
        fallbackUrl: "https://bandcamp.com"
      }
    } as any);

    scraper = new ScraperService(mockAuthService);
  });

  describe("searchCollection", () => {
    it("should return empty collection if no cache", () => {
      const result = scraper.searchCollection("test");
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it("should filter items based on query", () => {
      // Manually inject cached collection for testing private property/state
      // Since cachedCollection is private, we can't set it directly easily without cast
      const mockCollection: Collection = {
        items: [
          {
            id: "1",
            type: "album",
            purchaseDate: "",
            token: "t1",
            album: {
              id: "1",
              title: "Test Album",
              artist: "Test Artist",
              tracks: [],
              trackCount: 1,
              artworkUrl: "",
              bandcampUrl: "",
            },
          },
          {
            id: "2",
            type: "track",
            purchaseDate: "",
            token: "t2",
            track: {
              id: "2",
              title: "Test Track",
              artist: "Another Artist",
              album: "",
              duration: 100,
              artworkUrl: "",
              streamUrl: "",
              bandcampUrl: "",
              isCached: false,
            },
          },
        ],
        totalCount: 2,
        lastUpdated: "",
      };

      (scraper as any).cachedCollection = mockCollection;

      const artistResult = scraper.searchCollection("Test Artist");
      expect(artistResult.items).toHaveLength(1);
      expect(artistResult.items[0].id).toBe("1");

      const trackResult = scraper.searchCollection("Track");
      expect(trackResult.items).toHaveLength(1);
      expect(trackResult.items[0].id).toBe("2");

      const caseInsensitive = scraper.searchCollection("test");
      expect(caseInsensitive.items).toHaveLength(2);
    });
  });

  describe("fetchCollection", () => {
    it("should throws if not authenticated", async () => {
      mockAuthService.getUser.mockReturnValue({ isAuthenticated: false });
      await expect(scraper.fetchCollection()).rejects.toThrow(
        "User not authenticated",
      );
    });

    it("should parse collection from page script", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");

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
      expect(collection.items[0].album?.title).toBe("Mock Album");
      expect(collection.items[0].album?.artist).toBe("Mock Band");
    });

    it("should fallback to DOM parsing if script parsing fails", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");

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
      expect(collection.items[0].track?.title).toBe("DOM Track");
      expect(collection.items[0].track?.artist).toBe("DOM Artist");
    });

    it("should handle pagination (fetchMoreCollectionItems)", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser", id: "999" },
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
        .mockResolvedValueOnce({
          // First API call (bootstrap/future token)
          data: { items: [] },
        })
        .mockResolvedValueOnce({
          // Second API call (pagination from token1)
          data: {
            items: [
              {
                item_type: "track",
                item_id: 102,
                item_title: "Page 2 Item",
                band_name: "Band B",
                token: "token2",
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          // Third API call (empty, stops loop)
          data: { items: [] },
        });

      const collection = await scraper.fetchCollection(true);

      // Should contain both initial item and paginated item
      expect(collection.items).toHaveLength(2);
      expect(collection.items[0].album?.title).toBe("Page 1 Item");
      expect(collection.items[1].track?.title).toBe("Page 2 Item");
    });
    it("should honor includeWishlistOverride", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
      });
      const mockHtml = `
                <html>
                <script>var collection_data = { "items": [] };</script>
                <script>var wishlist_data = { "items": [{"item_type": "album", "item_id": 777, "item_title": "Wishlist Item"}] };</script>
                </html>
            `;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      // Call with override true
      const collection = await scraper.fetchCollection(true, true);

      expect(collection.items.some(i => i.isWishlist)).toBe(true);
      expect(collection.items.find(i => i.isWishlist)?.album?.title).toBe("Wishlist Item");
    });
  });

  describe("getAlbumDetails", () => {
    it("should parse album details from TralbumData", async () => {
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

      const album = await scraper.getAlbumDetails(
        "https://artist.bandcamp.com/album/test",
      );

      expect(album).not.toBeNull();
      expect(album?.title).toBe("Full Album");
      expect(album?.tracks).toHaveLength(1);
      expect(album?.tracks[0].streamUrl).toBe("http://stream.url/1");
    });

    it("should fallback to Mobile API if stream URL is missing", async () => {
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
          tracks: [
            {
              streaming_url: { "mp3-128": "http://fallback.url/stream" },
            },
          ],
        },
      });

      const album = await scraper.getAlbumDetails(
        "https://artist.bandcamp.com/album/test",
      );

      expect(album?.tracks[0].streamUrl).toBe("http://fallback.url/stream");
    });
  });

  describe("getRadioStations", () => {
    it("should fetch and parse radio stations", async () => {
      const mockRadioData = {
        results: [
          { id: 1, title: "Weekly 1", subtitle: "Best music", image_id: 123 },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: mockRadioData });

      const stations = await scraper.getRadioStations();

      expect(stations).toHaveLength(1);
      expect(stations[0].name).toBe("Weekly 1");
      expect(stations[0].imageUrl).toContain("123");
    });

    it("should fallback to default station on error", async () => {
      mockAxios.get.mockRejectedValue(new Error("Network error"));

      const stations = await scraper.getRadioStations();

      expect(stations).toHaveLength(1);
      expect(stations[0].id).toBe("weekly");
    });
  });

  describe("getStationStreamUrl", () => {
    it("should extract radio stream URL from player_data_web API", async () => {
      // API fetch for track
      mockAxios.post.mockResolvedValueOnce({
        data: {
          tracklist: {
            compiledTrack: {
              streamUrl: "http://radio.stream/123",
              duration: 120
            }
          }
        },
      });

      const result = await scraper.getStationStreamUrl("100");
      expect(mockAxios.post).toHaveBeenCalledWith("https://bandcamp.com/api/player/2/player_data_web", { item_type: "radio", item_id: 100 });
      expect(result).toEqual({
        streamUrl: "http://radio.stream/123",
        duration: 120,
      });
    });

    it("should return empty string on error", async () => {
      mockAxios.post.mockRejectedValue(new Error("Failed"));
      const result = await scraper.getStationStreamUrl("100");
      expect(result).toEqual({ streamUrl: "", duration: 0 });
    });
  });

  describe('Title Cleaning Regression ("gift given" issue)', () => {
    it('should remove "(gift given)" suffix', async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");

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
      expect(collection.items[0].album?.title).toBe("Normal Title");
    });

    it('should deduplicate "Title (gift given) Title"', async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
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
      expect(collection.items[0].album?.title).toBe("Duplicated Title");
    });

    it("should handle aggressive whitespace and newlines", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: "https://bandcamp.com/testuser" },
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
      expect(collection.items[0].album?.title).toBe("Spaced Title");
    });
  });

  describe('Label catalog "Artist - Title" format parsing', () => {
    beforeEach(() => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { profileUrl: 'https://bandcamp.com/testuser' },
      });
      mockAuthService.getSessionCookies.mockResolvedValue('session=123');
    });

    it('should extract real artist from "Artist - Title" when band_name differs', async () => {
      const mockHtml = `<html><script>
        var collection_data = { "items": [{
          "item_type": "album", "item_id": 801,
          "item_title": "Mirt - Fold",
          "band_name": "John Lake", "band_id": 12345, "token": "t1"
        }] };
      </script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const collection = await scraper.fetchCollection(true);
      const album = collection.items[0].album!;
      expect(album.artist).toBe('Mirt');
      expect(album.title).toBe('Fold');
    });

    it('should NOT split on dash when prefix matches band_name', async () => {
      const mockHtml = `<html><script>
        var collection_data = { "items": [{
          "item_type": "album", "item_id": 802,
          "item_title": "Mirt - Fold",
          "band_name": "Mirt", "token": "t2"
        }] };
      </script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const collection = await scraper.fetchCollection(true);
      const album = collection.items[0].album!;
      // Band is already the artist - no label extraction
      expect(album.artist).toBe('Mirt');
      // Title still stripped of redundant prefix
      expect(album.title).toBe('Fold');
    });

    it('should NOT split when prefix is longer than 40 chars', async () => {
      const mockHtml = `<html><script>
        var collection_data = { "items": [{
          "item_type": "album", "item_id": 803,
          "item_title": "A Very Long Artist Name That Exceeds Limit - Album",
          "band_name": "SomeBand", "token": "t3"
        }] };
      </script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const collection = await scraper.fetchCollection(true);
      const album = collection.items[0].album!;
      // Prefix >40 chars so no split; artist stays as band_name
      expect(album.artist).toBe('SomeBand');
    });

    it('should NOT split when prefix contains parentheses (e.g. date range in title)', async () => {
      const mockHtml = `<html><script>
        var collection_data = { "items": [{
          "item_type": "album", "item_id": 804,
          "item_title": "Music From The Merch Desk (2016 - 2023)",
          "band_name": "Aphex Twin", "token": "t4"
        }] };
      </script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const collection = await scraper.fetchCollection(true);
      const album = collection.items[0].album!;
      expect(album.artist).toBe('Aphex Twin');
      expect(album.title).toBe('Music From The Merch Desk (2016 - 2023)');
    });

    it('should NOT split when prefix contains a 4-digit year', async () => {
      const mockHtml = `<html><script>
        var collection_data = { "items": [{
          "item_type": "album", "item_id": 805,
          "item_title": "Live 2019 - Amsterdam",
          "band_name": "Some Artist", "token": "t5"
        }] };
      </script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const collection = await scraper.fetchCollection(true);
      const album = collection.items[0].album!;
      expect(album.artist).toBe('Some Artist');
    });
  });



  describe("Caching Logic", () => {
    let mockDatabase: any;

    beforeEach(() => {
      mockDatabase = {
        getCollectionCache: vi.fn(),
        saveCollectionCache: vi.fn(),
        getRadioCache: vi.fn(),
        saveRadioCache: vi.fn(),
        replaceArtists: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ offlineMode: false }),
      };
      scraper = new ScraperService(mockAuthService, mockDatabase);
    });

    it("should load from database if cached and not forceRefresh", async () => {
      const mockCachedCollection = {
        items: [{ id: "cached" }],
        totalCount: 1,
        lastUpdated: "now",
      };
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1" },
      });
      mockDatabase.getCollectionCache.mockReturnValue({
        data: mockCachedCollection,
        cachedAt: new Date().toISOString(),
      });

      const result = await scraper.fetchCollection(false);

      expect(mockDatabase.getCollectionCache).toHaveBeenCalledWith("user1");
      expect(result).toEqual(mockCachedCollection);
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it("should trigger background refresh if cache is older than 24h", async () => {
      const mockCachedCollection = {
        items: [{ id: "old" }],
        totalCount: 1,
        lastUpdated: "old",
      };
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago

      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");
      mockDatabase.getCollectionCache.mockReturnValue({
        data: mockCachedCollection,
        cachedAt: oldDate.toISOString(),
      });

      // Mock successful scrape for background refresh
      mockAxios.get.mockResolvedValue({ data: "<html></html>" });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const result = await scraper.fetchCollection(false);

      // Should return cached data instantly
      expect(result).toEqual(mockCachedCollection);

      // The background refresh is fire-and-forget, so let its microtasks run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it("should not background refresh when the cache is fresh", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockDatabase.getCollectionCache.mockReturnValue({
        data: { items: [{ id: "fresh" }], totalCount: 1, lastUpdated: "now" },
        cachedAt: new Date().toISOString(),
      });

      await scraper.fetchCollection(false);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it("should run the staleness check on a warm memory cache", async () => {
      // This is the path the periodic refresh in main.ts takes: once the
      // in-memory cache is warm the DB is never consulted again, so the
      // staleness check has to be reachable from the memory hit too.
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2);

      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");
      mockDatabase.getCollectionCache.mockReturnValue({
        data: { items: [{ id: "old" }], totalCount: 1, lastUpdated: "old" },
        cachedAt: oldDate.toISOString(),
      });

      // First call warms the memory cache from the DB.
      await scraper.fetchCollection(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const callsAfterFirst = mockAxios.get.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThan(0);

      // Second call must be a memory hit (no further DB read) but still
      // evaluate staleness rather than short-circuiting silently.
      const dbCallsBefore = mockDatabase.getCollectionCache.mock.calls.length;
      await scraper.fetchCollection(false);
      expect(mockDatabase.getCollectionCache.mock.calls.length).toBe(
        dbCallsBefore,
      );
    });

    it("should fall back to the cookie fanId key when the userId key misses", async () => {
      const mockCachedCollection = {
        items: [{ id: "cached" }],
        totalCount: 1,
        lastUpdated: "now",
      };
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "band99", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getFanIdFromCookie = vi.fn().mockReturnValue("fan42");
      mockDatabase.getCollectionCache.mockImplementation((key: string) =>
        key === "fan42"
          ? { data: mockCachedCollection, cachedAt: new Date().toISOString() }
          : null,
      );

      const result = await scraper.fetchCollection(false);

      expect(result).toEqual(mockCachedCollection);
      expect(mockAxios.get).not.toHaveBeenCalled();
      // Self-heals so the next launch hits the primary key directly.
      expect(mockDatabase.saveCollectionCache).toHaveBeenCalledWith(
        "band99",
        "collection",
        mockCachedCollection,
      );
    });

    it("should never build a null_withWishlist cache key", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getFanIdFromCookie = vi.fn().mockReturnValue(null);
      mockDatabase.getSettings.mockReturnValue({
        offlineMode: false,
        includeWishlistInCollection: true,
      });
      mockDatabase.getCollectionCache.mockReturnValue(null);
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");
      mockAxios.get.mockResolvedValue({ data: "<html></html>" });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      await scraper.fetchCollection(false);

      const allKeys = [
        ...mockDatabase.getCollectionCache.mock.calls,
        ...mockDatabase.saveCollectionCache.mock.calls,
      ].map((call: any[]) => String(call[0]));
      expect(allKeys.length).toBeGreaterThan(0);
      for (const key of allKeys) {
        expect(key).not.toContain("null");
        expect(key).not.toContain("undefined");
      }
    });

    it("should save the collection to the db cache after a network fetch", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");

      const mockHtml = `<html><ol id="gallery">
        <li class="collection-item-container">
          <div class="collection-item-title">Cached Album</div>
          <div class="collection-item-artist">by Cached Artist</div>
          <a class="item-link" href="https://artist.bandcamp.com/album/cached"></a>
          <img class="collection-item-art" src="https://f4.bcbits.com/img/a1_16.jpg" />
        </li>
      </ol></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      await scraper.fetchCollection(true);

      expect(mockDatabase.saveCollectionCache).toHaveBeenCalledWith(
        "user1",
        "collection",
        expect.objectContaining({
          items: expect.arrayContaining([expect.anything()]),
        }),
      );
    });

    it("should not start a second scrape while one is in flight", async () => {
      mockAuthService.getUser.mockReturnValue({
        isAuthenticated: true,
        user: { id: "user1", profileUrl: "https://bandcamp.com/testuser" },
      });
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");
      mockDatabase.getCollectionCache.mockReturnValue(null);

      let resolveGet: (v: any) => void = () => {};
      mockAxios.get.mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
      );
      mockAxios.post.mockResolvedValue({ data: { items: [] } });

      const first = scraper.fetchCollection(true);
      const second = scraper.fetchCollection(true);
      resolveGet({ data: "<html></html>" });
      await Promise.all([first, second]);

      // Count only profile-page requests — a successful fetch also kicks off a
      // radio-station refresh through the same axios mock.
      const profileCalls = mockAxios.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("bandcamp.com/testuser"),
      );
      expect(profileCalls).toHaveLength(1);
    });
  });

  describe("Album Detail Cache", () => {
    let mockDatabase: any;
    const albumUrl = "https://artist.bandcamp.com/album/test";

    const cachedAlbum = (overrides: any = {}) => ({
      id: "a1",
      title: "Cached Album",
      artist: "Cached Artist",
      artistId: "band1",
      artworkUrl: "",
      bandcampUrl: albumUrl,
      trackCount: 2,
      tracks: [
        {
          id: "t1",
          title: "One",
          streamUrl: "http://old/1.mp3",
          hasStream: true,
          albumId: "a1",
        },
        {
          id: "t2",
          title: "Two",
          streamUrl: "http://old/2.mp3",
          hasStream: true,
          albumId: "a1",
        },
      ],
      ...overrides,
    });

    beforeEach(() => {
      mockDatabase = {
        getCollectionCache: vi.fn(),
        saveCollectionCache: vi.fn(),
        getAlbumCache: vi.fn().mockReturnValue(null),
        saveAlbumCache: vi.fn(),
        getRadioCache: vi.fn(),
        saveRadioCache: vi.fn(),
        replaceArtists: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ offlineMode: false }),
      };
      mockAuthService.getSessionCookies.mockResolvedValue("session=123");
      scraper = new ScraperService(mockAuthService, mockDatabase);
    });

    it("returns album details from cache without fetching the album page", async () => {
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: new Date().toISOString(),
      });

      const result = await scraper.getAlbumDetails(albumUrl, "a1");

      expect(mockDatabase.getAlbumCache).toHaveBeenCalledWith("a1");
      expect(result?.tracks).toHaveLength(2);
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it("ignores the cache when no album id is supplied", async () => {
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: new Date().toISOString(),
      });
      mockAxios.get.mockResolvedValue({ data: "<html></html>" });

      await scraper.getAlbumDetails(albumUrl);

      expect(mockDatabase.getAlbumCache).not.toHaveBeenCalled();
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it("always re-scrapes a cached pre-order album", async () => {
      // Pre-order tracks gain stream URLs at release, so a cached pre-order
      // would otherwise stay unplayable forever.
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum({ isPreorder: true }),
        cachedAt: new Date().toISOString(),
      });
      mockAxios.get.mockResolvedValue({ data: "<html></html>" });

      await scraper.getAlbumDetails(albumUrl, "a1");

      expect(mockAxios.get).toHaveBeenCalledWith(
        albumUrl,
        expect.anything(),
      );
    });

    it("refreshes stream urls via one mobile api call past the stream TTL", async () => {
      const stale = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: stale,
      });
      mockAxios.get.mockResolvedValue({
        data: {
          tracks: [
            { track_id: "t1", streaming_url: { "mp3-128": "http://new/1.mp3" } },
            { track_id: "t2", streaming_url: { "mp3-128": "http://new/2.mp3" } },
          ],
        },
      });

      const result = await scraper.getAlbumDetails(albumUrl, "a1");

      // One mobile API request, and crucially NOT the album page.
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      expect(String(mockAxios.get.mock.calls[0][0])).not.toBe(albumUrl);
      expect(result?.tracks[0].streamUrl).toBe("http://new/1.mp3");
      expect(result?.tracks[1].streamUrl).toBe("http://new/2.mp3");
      expect(mockDatabase.saveAlbumCache).toHaveBeenCalled();
    });

    it("blanks streamUrl but keeps hasStream when the bulk refresh fails", async () => {
      const stale = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: stale,
      });
      mockAxios.get.mockRejectedValue(new Error("mobile api down"));

      const result = await scraper.getAlbumDetails(albumUrl, "a1");

      // Blank rather than stale: PlayerService resolves an empty streamUrl on
      // demand, so the first play recovers instead of failing outright.
      expect(result?.tracks.every((t) => t.streamUrl === "")).toBe(true);
      expect(result?.tracks.every((t) => t.hasStream === true)).toBe(true);
    });

    it("ignores a cache entry older than the metadata TTL", async () => {
      const ancient = new Date(
        Date.now() - 40 * 24 * 60 * 60 * 1000,
      ).toISOString();
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: ancient,
      });
      mockAxios.get.mockResolvedValue({ data: "<html></html>" });

      await scraper.getAlbumDetails(albumUrl, "a1");

      expect(mockAxios.get).toHaveBeenCalledWith(albumUrl, expect.anything());
    });

    it("writes the album to the cache after a successful scrape", async () => {
      const mockHtml = `<html><script data-tralbum='${JSON.stringify({
        id: 55,
        item_type: "album",
        band_id: 99,
        album_title: "Scraped Album",
        artist: "Scraped Artist",
        url: albumUrl,
        trackinfo: [
          {
            track_id: 1,
            title: "First",
            duration: 100,
            track_num: 1,
            file: { "mp3-128": "http://stream/1.mp3" },
          },
        ],
      })}'></script></html>`;
      mockAxios.get.mockResolvedValue({ data: mockHtml });

      await scraper.getAlbumDetails(albumUrl, "55");

      expect(mockDatabase.saveAlbumCache).toHaveBeenCalledWith(
        expect.objectContaining({ id: "55", title: "Scraped Album" }),
      );
    });
    it("reports a cache hit as source 'cache' without any HTTP request", async () => {
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: new Date().toISOString(),
      });

      const result = await scraper.getAlbumDetailsWithSource(albumUrl, "a1");

      expect(result.source).toBe("cache");
      expect(result.album).not.toBeNull();
      // Filter by URL rather than asserting a total: other paths share this mock
      const albumCalls = mockAxios.get.mock.calls.filter(
        (c: any[]) => c[0] === albumUrl,
      );
      expect(albumCalls).toHaveLength(0);
    });

    it("reports a cache miss as source 'network'", async () => {
      mockDatabase.getAlbumCache.mockReturnValue(null);
      mockAxios.get.mockResolvedValueOnce({
        data: `<html><head><script data-tralbum='{"id": 77, "artist": "A", "album_title": "T", "band_id": 9, "trackinfo": [{"track_id": 1, "title": "One", "duration": 100, "file": {"mp3-128": "https://audio/1"}}]}'></script></head></html>`,
      });

      const result = await scraper.getAlbumDetailsWithSource(albumUrl, "a1");

      expect(result.source).toBe("network");
      expect(result.album?.tracks).toHaveLength(1);
    });

    it("does not call beforeNetwork on a pure cache hit", async () => {
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: new Date().toISOString(),
      });
      const beforeNetwork = vi.fn().mockResolvedValue(undefined);

      await scraper.getAlbumDetailsWithSource(albumUrl, "a1", { beforeNetwork });

      // A warm cache hit must cost no rate-limit budget
      expect(beforeNetwork).not.toHaveBeenCalled();
    });

    it("awaits beforeNetwork before fetching the album page", async () => {
      mockDatabase.getAlbumCache.mockReturnValue(null);
      const callOrder: string[] = [];
      const beforeNetwork = vi.fn(async () => {
        callOrder.push("gate");
      });
      mockAxios.get.mockImplementation(async () => {
        callOrder.push("http");
        return {
          data: `<html><head><script data-tralbum='{"id": 77, "artist": "A", "album_title": "T", "band_id": 9, "trackinfo": []}'></script></head></html>`,
        };
      });

      await scraper.getAlbumDetailsWithSource(albumUrl, "a1", { beforeNetwork });

      expect(beforeNetwork).toHaveBeenCalled();
      expect(callOrder[0]).toBe("gate");
      expect(callOrder).toContain("http");
    });

    it("calls beforeNetwork for the stream-URL refresh path too", async () => {
      // Older than the 6h stream TTL but within the metadata TTL
      const staleAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum({ artistId: "band1" }),
        cachedAt: staleAt,
      });
      mockAxios.get.mockResolvedValue({ data: { tracks: [] } });
      const beforeNetwork = vi.fn().mockResolvedValue(undefined);

      await scraper.getAlbumDetailsWithSource(albumUrl, "a1", { beforeNetwork });

      expect(beforeNetwork).toHaveBeenCalled();
    });

    it("passes the abort signal through to the HTTP client", async () => {
      mockDatabase.getAlbumCache.mockReturnValue(null);
      const controller = new AbortController();
      mockAxios.get.mockResolvedValueOnce({
        data: `<html><head><script data-tralbum='{"id": 77, "artist": "A", "album_title": "T", "band_id": 9, "trackinfo": []}'></script></head></html>`,
      });

      await scraper.getAlbumDetailsWithSource(albumUrl, "a1", {
        signal: controller.signal,
      });

      const call = mockAxios.get.mock.calls.find((c: any[]) => c[0] === albumUrl);
      expect(call?.[1]?.signal).toBe(controller.signal);
    });

    it("returns a null album without throwing when the request is aborted", async () => {
      mockDatabase.getAlbumCache.mockReturnValue(null);
      const controller = new AbortController();
      controller.abort();
      mockAxios.get.mockRejectedValueOnce(new Error("canceled"));

      const result = await scraper.getAlbumDetailsWithSource(albumUrl, "a1", {
        signal: controller.signal,
      });

      expect(result.album).toBeNull();
      expect(result.source).toBe("none");
    });

    it("getAlbumDetails still returns a bare album (refactor guard)", async () => {
      mockDatabase.getAlbumCache.mockReturnValue({
        data: cachedAlbum(),
        cachedAt: new Date().toISOString(),
      });

      const album = await scraper.getAlbumDetails(albumUrl, "a1");

      expect(album).not.toBeNull();
      expect(album).toHaveProperty("tracks");
      expect(album).not.toHaveProperty("source");
    });
  });

  describe("Pre-order Album Support", () => {
    it("should correctly identify pre-order albums and flag unstreamable tracks", async () => {
      const mockAlbumHtml = `
        <html>
          <head>
            <script data-tralbum='{"id": 8888, "is_preorder": true, "has_audio": false, "artist": "The Odyssey Cult", "album_title": "Vol. 3", "art_id": 12345, "band_id": 99, "trackinfo": [{"track_id": 101, "title": "Track 1 Released", "duration": 180, "file": {"mp3-128": "https://audio.bc.com/stream1"}}, {"track_id": 102, "title": "Track 2 Unreleased", "duration": 0, "file": null}]}'></script>
          </head>
        </html>
      `;

      mockAxios.get.mockResolvedValueOnce({ data: mockAlbumHtml });

      const album = await scraper.getAlbumDetails("https://theodysseycult.bandcamp.com/album/vol-3");

      expect(album).not.toBeNull();
      expect(album?.isPreorder).toBe(true);
      expect(album?.tracks).toHaveLength(2);

      // Streamable released track
      expect(album?.tracks[0].hasStream).toBe(true);
      expect(album?.tracks[0].isPreorderTrack).toBe(false);

      // Unreleased track
      expect(album?.tracks[1].hasStream).toBe(false);
      expect(album?.tracks[1].isPreorderTrack).toBe(true);
      expect(album?.tracks[1].streamUrl).toBe("");
    });
  });
});
