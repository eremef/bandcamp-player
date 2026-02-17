import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import { simulationService } from './simulation.service';
import { Database } from '../database/database';
import type { Track, Album, Collection, CollectionItem, RadioStation } from '../../shared/types';
import { EventEmitter } from 'events';
// ============================================================================
// Bandcamp Scraper Service
// ============================================================================

const ONE_YEAR_SECONDS = 31536000; // 1 year

export class ScraperService extends EventEmitter {
    private authService: AuthService;
    private database?: Database;
    private http: AxiosInstance;
    private cachedCollection: Collection | null = null;

    constructor(authService: AuthService, database?: Database) {
        super();
        this.authService = authService;
        this.database = database;
        this.http = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
    }

    /**
     * Clean artist name by removing "by Artist" suffix patterns
     * Bandcamp data sometimes includes formats like "Artistby Artist" or "Artist by Artist"
     */
    private cleanArtistName(name: string | undefined | null): string {
        if (!name) return '';
        // Remove " by Artist" or "by Artist" suffix
        let cleaned = name.replace(/\s*by\s+.+$/i, '').trim();
        // Also strip leading "by " if present
        cleaned = cleaned.replace(/^by\s+/i, '').trim();
        return cleaned;
    }

    /**
     * Clean album/track title by removing suffixes and "gift given" infix
     */
    private cleanTitle(rawTitle: string, artist?: string): string {
        if (!rawTitle) return 'Untitled';

        let title = rawTitle.trim();

        // 1. Remove " by Artist" suffix if present
        if (artist && title.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) {
            title = title.slice(0, -` by ${artist}`.length);
        }

        // 2. Remove "(gift given)" infix/suffix
        // Enhanced regex to capture the part before " (gift given)" for deduplication
        // Matches: "Title (gift given) Title" -> captures "Title"
        const dedupeMatch = title.match(/^(.*?)\s*\(gift given\)\s*\1$/i);
        if (dedupeMatch) {
            return dedupeMatch[1].trim() || 'Untitled';
        }

        // Fallback: just remove "(gift given)" from anywhere
        title = title.replace(/\s*\(gift given\)\s*/gi, ' ').trim();

        // 3. General deduplication check (e.g. "Title Title")
        if (title.length > 0) {
            const parts = title.split(/\s+/);
            if (parts.length % 2 === 0) {
                const halfCount = parts.length / 2;
                const firstPart = parts.slice(0, halfCount).join(' ');
                const secondPart = parts.slice(halfCount).join(' ');
                if (firstPart === secondPart) {
                    title = firstPart;
                }
            }
        }

        return title.trim() || 'Untitled';
    }

    /**
     * Helper to robustly extract a JSON object from a string starting with a variable assignment
     * e.g. "var foo = { ... };"
     * Handles nested braces correctly unlike simple regex checks.
     */
    private extractJsonObject(content: string, keys: string[]): any | null {
        // Find one of the keys followed by assignment
        for (const key of keys) {
            // Look for "key =" or "key:" or "var key ="
            // We use a simplified search to find the start index
            // Escape key for regex
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?:var|let|const)?\\s*${escapedKey}\\s*[:=]\\s*`);

            const match = content.match(regex);
            if (match && match.index !== undefined) {
                const startSearchIndex = match.index + match[0].length;
                // Find the first '{'
                const openBraceIndex = content.indexOf('{', startSearchIndex);
                if (openBraceIndex === -1) continue;

                let closeBraceIndex = -1;

                // Simpler approach: Use a stack or counter, treating " and ' as string delimiters
                // Reset indices

                let stack = 0;
                let quoteChar: string | null = null;

                for (let i = openBraceIndex; i < content.length; i++) {
                    const char = content[i];

                    // Handle escaping
                    if (i > 0 && content[i - 1] === '\\' && content[i - 2] !== '\\') {
                        // Escaped character, ignore
                        continue;
                    }

                    if (quoteChar) {
                        if (char === quoteChar) {
                            quoteChar = null; // End string
                        }
                    } else {
                        if (char === '"' || char === "'") {
                            quoteChar = char;
                        } else if (char === '{') {
                            stack++;
                        } else if (char === '}') {
                            stack--;
                            if (stack === 0) {
                                closeBraceIndex = i;
                                break;
                            }
                        }
                    }
                }

                if (closeBraceIndex !== -1) {
                    const jsonString = content.substring(openBraceIndex, closeBraceIndex + 1);
                    try {
                        // Try standard parse
                        return JSON.parse(jsonString);
                    } catch {
                        // Try relax parse (e.g. key: value instead of "key": "value")
                        try {
                            // Simple sanitization for keys
                            const sanitized = jsonString
                                .replace(/(\w+)\s*:/g, '"$1":')
                                .replace(/'/g, '"');
                            return JSON.parse(sanitized);
                        } catch (e2) {
                            // Last resort: eval (if safe context? Using Function is safer than eval, but still risky if remote content)
                            // For a desktop app scraping specific trusted site sections, it's a trade-off.
                            // We used eval-like approach in extractTralbumData before.
                            try {
                                return new Function(`return ${jsonString}`)();
                            } catch (e3) {
                                console.error(`[Scraper] Failed to parse extracted object for ${key}:`, e3);
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Fetch user's collection (purchased music)
     */
    private fetchPromise: Promise<Collection> | null = null;

    /**
     * Fetch user's collection (purchased music)
     */
    async fetchCollection(forceRefresh = false): Promise<Collection> {
        if (this.fetchPromise && !forceRefresh) {
            return this.fetchPromise;
        }

        if (this.cachedCollection && !forceRefresh) {
            return this.cachedCollection;
        }

        const user = this.authService.getUser();
        const userId = user.user?.id;
        const isSimulating = simulationService.shouldSimulate();

        // Use a different cache ID for simulation to avoid clobbering real data
        const cacheId = isSimulating ? `${userId}_sim` : (userId || 'anonymous');

        // Try to load from database first if not forcing refresh
        if (!forceRefresh && this.database && userId) {
            const cached = this.database.getCollectionCache(cacheId);

            if (cached) {
                const hasMissingArtwork = isSimulating && cached.data.items.length > 0 &&
                    !cached.data.items.some((item: any) => (item.track?.artworkUrl || item.album?.artworkUrl));

                if (hasMissingArtwork) {
                    console.log('[Scraper] Cached simulation is missing artwork, forcing refresh...');
                } else {
                    console.log(`[Scraper] Loaded ${isSimulating ? 'simulated ' : ''}collection from cache for ${userId}`);
                    this.cachedCollection = cached.data;

                    // Consolidate IDs even from cache to fix existing data
                    this.consolidateArtistIds(this.cachedCollection!.items);

                    this.extractAndSaveArtists(cached.data.items, isSimulating);

                    // Background refresh for real collections if stale
                    if (!isSimulating) {
                        const lastUpdated = new Date(cached.cachedAt).getTime();
                        const now = Date.now();
                        if (now - lastUpdated > 24 * 60 * 60 * 1000) {
                            console.log('[Scraper] Real cache is stale, refreshing in background...');
                            this.fetchCollection(true).catch(e => console.error('[Scraper] Background refresh failed:', e));
                        }
                    }

                    return this.cachedCollection!;
                }
            }
        }

        this.fetchPromise = (async () => {
            try {
                const { isAuthenticated, user } = this.authService.getUser();
                if (!isSimulating && (!isAuthenticated || !user)) {
                    throw new Error('User not authenticated');
                }

                const cookies = isSimulating ? '' : await this.authService.getSessionCookies();
                const profileUrl = isSimulating ? '' : user?.profileUrl || '';
                const items: CollectionItem[] = [];

                if (!isSimulating) {
                    // Real scraping flow
                    const response = await this.http.get(profileUrl, { headers: { Cookie: cookies } });
                    const $ = cheerio.load(response.data);

                    // Parse initial page items
                    const collectionScript = $('script').filter((_, el) => {
                        const text = $(el).html() || '';
                        return text.includes('CollectionData') || text.includes('collection_data');
                    }).first().html();

                    if (collectionScript) {
                        const collectionData = this.extractJsonObject(collectionScript, ['collection_data', 'CollectionData']);
                        if (collectionData?.items) {
                            for (const item of collectionData.items) {
                                const parsed = this.parseCollectionItem(item);
                                if (parsed) items.push(parsed);
                            }
                        }
                    }

                    if (items.length === 0) {
                        $('.collection-item-container').each((_, el) => {
                            const parsed = this.parseCollectionItemFromDOM($, $(el));
                            if (parsed) items.push(parsed);
                        });
                    }

                    // Fetch more via API
                    const pageFanId = this.extractFanId(response.data);
                    const activeFanId = pageFanId ? String(pageFanId) : user!.id;

                    // Initial API fetch
                    const initialBatch = await this.fetchMoreCollectionItems(activeFanId, undefined, cookies);
                    for (const item of initialBatch) {
                        if (!items.some(existing => existing.id === item.id)) items.push(item);
                    }

                    // Iterative fetch with retry logic
                    let hasMore = items.length > 0;
                    let batchCount = 0;
                    let retryCount = 0;
                    const MAX_RETRIES = 3;

                    while (hasMore && batchCount < 1000) {
                        const lastItem = items[items.length - 1];
                        if (!lastItem?.token) break;

                        try {
                            const batch = await this.fetchMoreCollectionItems(activeFanId, lastItem.token, cookies);
                            if (batch.length === 0) {
                                hasMore = false;
                            } else {
                                const newItems = batch.filter(b => !items.some(e => e.id === b.id));
                                if (newItems.length === 0) {
                                    hasMore = false;
                                } else {
                                    items.push(...newItems);
                                    retryCount = 0; // Reset on success
                                }
                            }
                            batchCount++;
                        } catch (error) {
                            retryCount++;
                            if (retryCount > MAX_RETRIES) {
                                console.error(`[Scraper] Max retries reached for batch ${batchCount}, stopping.`);
                                break;
                            }
                            console.warn(`[Scraper] Error fetching batch ${batchCount}, retry ${retryCount}/${MAX_RETRIES}...`);
                            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                        }
                    }
                } else {
                    // Simulation Flow with retries
                    console.log('[Scraper] Starting large collection simulation...');
                    let hasMore = true;
                    let lastToken: string | undefined = undefined;
                    let retryCount = 0;
                    const MAX_RETRIES = 5;

                    while (hasMore) {
                        try {
                            const batch = await simulationService.fetchBatch(lastToken);
                            if (batch.length === 0) {
                                hasMore = false;
                            } else {
                                items.push(...batch);
                                lastToken = batch[batch.length - 1].token;
                                retryCount = 0; // Reset on success
                            }
                        } catch (error) {
                            retryCount++;
                            if (retryCount > MAX_RETRIES) {
                                console.error('[Scraper] Simulation failed repeatedly, stopping.');
                                break;
                            }
                            console.warn(`[Scraper] Simulation error (retry ${retryCount}/${MAX_RETRIES})...`);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                }

                this.consolidateArtistIds(items);

                this.cachedCollection = {
                    items,
                    totalCount: items.length,
                    lastUpdated: new Date().toISOString(),
                    isSimulated: isSimulating,
                };

                this.emit('collection-updated', this.cachedCollection);

                if (this.database && userId && items.length > 0) {
                    this.database.saveCollectionCache(cacheId, 'collection', this.cachedCollection);
                    console.log(`[Scraper] Saved ${isSimulating ? 'simulated ' : ''}collection to cache (${items.length} items)`);
                    this.extractAndSaveArtists(items, isSimulating);
                }

                return this.cachedCollection;
            } catch (error: any) {
                console.error('[Scraper] Collection fetch failed:', error.message);
                throw error;
            } finally {
                this.fetchPromise = null;
            }
        })();

        return this.fetchPromise;
    }

    private extractFanId(html: string): number | null {
        const $ = cheerio.load(html);
        const dataBlob = $('#pagedata').attr('data-blob');
        if (dataBlob) {
            try {
                const entities: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
                const decoded = dataBlob.replace(/&quot;|&amp;|&lt;|&gt;/g, (match) => entities[match]);
                const pd = JSON.parse(decoded);
                return pd.fan_stats?.fan_id || pd.fan_id || null;
            } catch (e) {
                console.error('[Scraper] Failed to parse #pagedata:', e);
            }
        }
        return null;
    }

    /**
     * Extract unique artists from collection items and save to database
     */
    private extractAndSaveArtists(items: CollectionItem[], isSimulated = false): void {
        if (!this.database) return;

        const artistsMap = new Map<string, { id: string; name: string; url: string; imageUrl?: string }>();

        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;

            // Use aristId if available, fallback to a name-based ID if missing
            // This ensures artists with singles or limited DOM info still appear
            const artistId = data.artistId || `name-${data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

            if (!artistsMap.has(artistId)) {
                // Try to extract artist URL from item URL
                let artistUrl = '';
                if (data.bandcampUrl) {
                    try {
                        const urlObj = new URL(data.bandcampUrl);
                        artistUrl = `${urlObj.protocol}//${urlObj.host}`;
                    } catch (e) {
                        // ignore invalid urls
                    }
                }

                artistsMap.set(artistId, {
                    id: artistId,
                    name: data.artist,
                    url: artistUrl,
                    imageUrl: data.artworkUrl || undefined
                });
            }
        }

        const artists = Array.from(artistsMap.values());
        if (artists.length > 0) {
            this.database.replaceArtists(artists, isSimulated);
            console.log(`[Scraper] Replaced ${artists.length} artists in database (isSimulated: ${isSimulated})`);
        }
    }



    /**
     * Fetch additional collection items via Bandcamp's API
     */
    private async fetchMoreCollectionItems(
        fanId: string,
        lastToken: string | undefined,
        cookies: string
    ): Promise<CollectionItem[]> {
        // Check for simulation mode
        if (simulationService.shouldSimulate()) {
            return simulationService.fetchBatch(lastToken);
        }

        const items: CollectionItem[] = [];
        const batchSize = 100;

        const requestBody: any = {
            fan_id: parseInt(fanId, 10),
            count: batchSize,
        };
        if (lastToken) {
            requestBody.older_than_token = lastToken;
        }

        const response = await this.http.post(
            'https://bandcamp.com/api/fancollection/1/collection_items',
            requestBody,
            {
                headers: {
                    Cookie: cookies,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.items) {
            for (const item of response.data.items) {
                const collectionItem = this.parseCollectionItem(item);
                if (collectionItem) {
                    items.push(collectionItem);
                }
            }
        }

        // Rate limiting - slightly increased from 200ms to 300ms + jitter
        // to be nicer to the API and avoid rate limits
        const jitter = Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, 100 + jitter));

        return items;
    }

    /**
     * Parse a collection item from API response
     */
    private parseCollectionItem(item: any): CollectionItem | null {
        try {
            const isAlbum = item.item_type === 'album' || item.tralbum_type === 'a';
            const id = String(item.item_id || item.tralbum_id);
            const artist = this.cleanArtistName(item.band_name);

            // Use shared helper for title cleaning
            const title = this.cleanTitle(item.album_title || item.item_title || '', artist);

            if (isAlbum) {
                return {
                    id,
                    type: 'album',
                    token: item.token || item.sale_token, // Capture token
                    album: {
                        id,
                        title,
                        artist,
                        artistId: String(item.band_id),
                        artworkUrl: item.item_art_url || (item.art_id ? `https://f4.bcbits.com/img/a${item.art_id}_10.jpg` : ''),
                        bandcampUrl: item.item_url || item.bandcamp_url,
                        tracks: [],
                        trackCount: item.num_tracks || 0,
                    },
                    purchaseDate: item.purchased || item.added || new Date().toISOString(),
                };
            } else {
                // Also clean track title using shared helper
                const trackTitle = this.cleanTitle(item.item_title || item.track_title || '', artist);

                return {
                    id,
                    type: 'track',
                    token: item.token || item.sale_token, // Capture token
                    track: {
                        id,
                        title: trackTitle,
                        artist,
                        artistId: item.band_id ? String(item.band_id) : undefined,
                        album: item.album_title || '',
                        duration: item.duration || 0,
                        artworkUrl: item.item_art_url || (item.art_id ? `https://f4.bcbits.com/img/a${item.art_id}_10.jpg` : ''),
                        streamUrl: '', // Will be fetched separately
                        bandcampUrl: item.item_url || '',
                        isCached: false,
                    },
                    purchaseDate: item.purchased || item.added || new Date().toISOString(),
                };
            }
        } catch (error) {
            console.error('Error parsing collection item:', error);
            return null;
        }
    }

    /**
     * Parse collection item from DOM element
     */
    private parseCollectionItemFromDOM($: cheerio.CheerioAPI, $item: cheerio.Cheerio<any>): CollectionItem | null {
        try {
            const artist = this.cleanArtistName($item.find('.collection-item-artist').text().replace('by ', ''));
            const title = this.cleanTitle($item.find('.collection-item-title').text(), artist);
            const url = $item.find('a.item-link').attr('href') || '';
            const artworkUrl = $item.find('img.collection-item-art').attr('src') || '';
            const id = $item.attr('data-tralbumid') || url.split('/').pop() || String(Date.now());
            const artistId = $item.attr('data-bandid');
            const type = ($item.attr('data-itemtype') === 'track') ? 'track' : 'album';
            const token = $item.attr('data-token');

            if (type === 'album') {
                return {
                    id,
                    type: 'album',
                    token,
                    album: {
                        id,
                        title,
                        artist,
                        artistId,
                        artworkUrl: artworkUrl.replace('_9.jpg', '_10.jpg'),
                        bandcampUrl: url,
                        tracks: [],
                        trackCount: 0,
                    },
                    purchaseDate: new Date().toISOString(),
                };
            } else {
                return {
                    id,
                    type: 'track',
                    token,
                    track: {
                        id,
                        title,
                        artist,
                        artistId,
                        album: '', // DOM doesn't always have album name for tracks easily accessible
                        duration: 0,
                        artworkUrl: artworkUrl.replace('_9.jpg', '_10.jpg'),
                        streamUrl: '',
                        bandcampUrl: url,
                        isCached: false,
                    },
                    purchaseDate: new Date().toISOString(),
                };
            }
        } catch (error) {
            console.error('Error parsing DOM collection item:', error);
            return null;
        }
    }

    /**
     * Get full album details including tracks and stream URLs
     */
    async getAlbumDetails(albumUrl: string): Promise<Album | null> {
        try {
            const cookies = await this.authService.getSessionCookies();
            const response = await this.http.get(albumUrl, {
                headers: { Cookie: cookies },
            });

            const $ = cheerio.load(response.data);

            // Extract album data from embedded JSON
            const tralbumData = this.extractTralbumData($);
            if (!tralbumData) {
                console.error('Could not find album data in page');
                return null;
            }

            const tracks: Track[] = await Promise.all((tralbumData.trackinfo || []).map(async (trackInfo: any, index: number) => {
                let streamUrl = trackInfo.file?.['mp3-128'] || trackInfo.file?.['mp3-v0'] || '';

                // Fallback to Mobile API if stream URL is missing
                if (!streamUrl && tralbumData.band_id && trackInfo.track_id) {
                    try {
                        console.log(`[ScraperService] Fetching fallback stream for ${trackInfo.title} via Mobile API...`);
                        const mobileUrl = `https://bandcamp.com/api/mobile/24/tralbum_details?band_id=${tralbumData.band_id}&tralbum_type=t&tralbum_id=${trackInfo.track_id}`;
                        const response = await this.http.get(mobileUrl, { headers: { Cookie: cookies } });

                        if (response.data && response.data.tracks && response.data.tracks.length > 0) {
                            const mobileTrack = response.data.tracks[0];
                            streamUrl = mobileTrack.streaming_url?.['mp3-128'] || mobileTrack.streaming_url?.['mp3-v0'] || '';
                        }
                    } catch (e: any) {
                        console.error('[ScraperService] Mobile API fallback failed:', e.message);
                    }
                }

                if (!streamUrl) {
                    console.warn(`[ScraperService] No stream URL found for track ${trackInfo.title} (ID: ${trackInfo.track_id})`);
                }

                return {
                    id: String(trackInfo.track_id || `${tralbumData.id}-${index}`),
                    title: trackInfo.title,
                    artist: this.cleanArtistName(tralbumData.artist),
                    artistId: String(tralbumData.band_id),
                    album: tralbumData.current?.title || tralbumData.album_title,
                    albumId: String(tralbumData.id),
                    duration: trackInfo.duration || 0,
                    trackNumber: trackInfo.track_num || index + 1,
                    artworkUrl: tralbumData.art_id ? `https://f4.bcbits.com/img/a${tralbumData.art_id}_10.jpg` : '',
                    streamUrl,
                    bandcampUrl: trackInfo.title_link ? `${tralbumData.url}${trackInfo.title_link}` : albumUrl,
                    isCached: false,
                };
            }));

            return {
                id: String(tralbumData.id),
                title: tralbumData.current?.title || tralbumData.album_title,
                artist: this.cleanArtistName(tralbumData.artist),
                artistId: String(tralbumData.band_id),
                artworkUrl: tralbumData.art_id ? `https://f4.bcbits.com/img/a${tralbumData.art_id}_10.jpg` : '',
                bandcampUrl: albumUrl,
                releaseDate: tralbumData.current?.release_date,
                tracks,
                trackCount: tracks.length,
            };
        } catch (error) {
            console.error('Error fetching album details:', error);
            return null;
        }
    }

    /**
     * Extract tralbum data from page scripts
     */
    private extractTralbumData($: cheerio.CheerioAPI): any {
        // Try data attribute first
        const dataAttr = $('script[data-tralbum]').attr('data-tralbum');
        if (dataAttr) {
            try {
                return JSON.parse(dataAttr);
            } catch (e) {
                console.error('Error parsing data-tralbum:', e);
            }
        }

        // Try to find in inline scripts
        let tralbumData = null;
        const scriptContent = $('script').map((_, el) => $(el).html()).get().join('\n');

        tralbumData = this.extractJsonObject(scriptContent, ['TralbumData']);

        return tralbumData;
    }

    /**
     * Get Bandcamp Radio stations
     */
    async getRadioStations(): Promise<RadioStation[]> {
        try {
            const response = await this.http.get('https://bandcamp.com/api/bcweekly/3/list');
            const stations: RadioStation[] = [];

            if (response.data.results) {
                // Fetch all available episodes
                for (const episode of response.data.results) {
                    stations.push({
                        id: String(episode.show_id || episode.id),
                        name: episode.title || `Bandcamp Weekly ${episode.id}`,
                        description: episode.subtitle || episode.desc,
                        imageUrl: episode.image_id ? `https://f4.bcbits.com/img/${episode.image_id}_16.jpg` : undefined,
                        streamUrl: '', // Will be fetched on demand
                        date: episode.published_date ? new Date(episode.published_date).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                        }) : undefined,
                    });
                }
            }

            this.emit('radio-stations-updated', stations);
            return stations;
        } catch (error) {
            console.error('Error fetching radio stations:', error);
            // Return some default stations
            return [
                {
                    id: 'weekly',
                    name: 'Bandcamp Weekly',
                    description: 'The best new music on Bandcamp',
                    streamUrl: 'https://bandcamp.com/bcweekly',
                },
            ];
        }
    }

    /**
     * Search within collection
     */
    searchCollection(query: string): Collection {
        if (!this.cachedCollection) {
            return { items: [], totalCount: 0, lastUpdated: new Date().toISOString() };
        }

        const lowerQuery = query.toLowerCase();
        const filteredItems = this.cachedCollection.items.filter(item => {
            if (item.type === 'album' && item.album) {
                return (
                    item.album.title.toLowerCase().includes(lowerQuery) ||
                    item.album.artist.toLowerCase().includes(lowerQuery)
                );
            }
            if (item.type === 'track' && item.track) {
                return (
                    item.track.title.toLowerCase().includes(lowerQuery) ||
                    item.track.artist.toLowerCase().includes(lowerQuery)
                );
            }
            return false;
        });

        return {
            items: filteredItems,
            totalCount: filteredItems.length,
            lastUpdated: this.cachedCollection.lastUpdated,
        };
    }

    /**
     * Consolidate artist IDs across collection items
     * Ensures that if we have found a numeric ID for an artist anywhere,
     * we apply it to all items by that artist (fixing "doubled artist" issue)
     */
    private consolidateArtistIds(items: CollectionItem[]): void {
        const artistMap = new Map<string, string>(); // Name -> Best ID

        // Pass 1: Find best ID for each artist name
        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;

            const name = data.artist.toLowerCase();
            const currentBest = artistMap.get(name);
            const id = data.artistId;

            if (id) {
                // If we don't have a best ID yet, use this one
                if (!currentBest) {
                    artistMap.set(name, id);
                }
                // If we have a non-numeric ID and found a numeric one, upgrade
                else if (!/^\d+$/.test(currentBest) && /^\d+$/.test(id)) {
                    artistMap.set(name, id);
                }
            }
        }

        // Pass 2: Apply best IDs
        let updatedCount = 0;
        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;

            const name = data.artist.toLowerCase();
            const bestId = artistMap.get(name);

            if (bestId && data.artistId !== bestId) {
                // console.log(`[Scraper] Updating artist ID for "${data.artist}": ${data.artistId} -> ${bestId}`);
                data.artistId = bestId;
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            console.log(`[Scraper] Consolidated artist IDs for ${updatedCount} items`);
        }
    }
    /**
     * Get stream URL for a specific radio station/episode
     */
    async getStationStreamUrl(showId: string): Promise<{ streamUrl: string; duration: number }> {
        try {
            // 1. Fetch the show page
            const response = await this.http.get(`https://bandcamp.com/?show=${showId}`);
            const $ = cheerio.load(response.data);

            // 2. Extract data blob from ArchiveApp div
            const dataBlob = $('#ArchiveApp').attr('data-blob');
            if (!dataBlob) {
                console.error('No data-blob found in ArchiveApp div');
                return { streamUrl: '', duration: 0 };
            }

            try {
                const appData = JSON.parse(dataBlob);
                // Find the show in the shows list
                const show = appData.appData?.shows?.find((s: any) => String(s.showId) === showId);

                if (!show || !show.audioTrackId) {
                    console.error('Show or audioTrackId not found in data blob');
                    return { streamUrl: '', duration: 0 };
                }

                const audioTrackId = show.audioTrackId;

                // 3. Fetch track details from mobile API
                // Using band_id=1 as generic system ID often works for radio
                const trackResponse = await this.http.get(`https://bandcamp.com/api/mobile/24/tralbum_details?band_id=1&tralbum_type=t&tralbum_id=${audioTrackId}`);

                if (trackResponse.data && trackResponse.data.tracks && trackResponse.data.tracks.length > 0) {
                    const track = trackResponse.data.tracks[0];
                    const streamUrl = track.streaming_url?.['mp3-128'];
                    const duration = track.duration || 0;
                    if (streamUrl) {
                        return { streamUrl, duration };
                    }
                } else {
                    // No tracks found
                }
                console.error('Stream URL not found in API response');
                return { streamUrl: '', duration: 0 };
            } catch (e) {
                console.error('Error parsing radio page data:', e);
                return { streamUrl: '', duration: 0 };
            }
        } catch (error) {
            console.error(`Error fetching station stream URL for ${showId}:`, error);
            return { streamUrl: '', duration: 0 };
        }
    }

    /**
     * Get fresh stream URL for a track
     */
    async getTrackStreamUrl(track: Track): Promise<string> {
        // Radio tracks
        if (track.id.startsWith('radio-')) {
            const { streamUrl } = await this.getStationStreamUrl(track.id.replace('radio-', ''));
            return streamUrl || track.streamUrl;
        }

        // Normal tracks
        if (!track.artistId || !track.id) return track.streamUrl;

        try {
            console.log(`[ScraperService] Refreshing stream URL for ${track.title} (ID: ${track.id})...`);
            const mobileUrl = `https://bandcamp.com/api/mobile/24/tralbum_details?band_id=${track.artistId}&tralbum_type=t&tralbum_id=${track.id}`;
            const cookies = await this.authService.getSessionCookies();
            const response = await this.http.get(mobileUrl, { headers: { Cookie: cookies } });

            if (response.data && response.data.tracks && response.data.tracks.length > 0) {
                const mobileTrack = response.data.tracks[0];
                const freshUrl = mobileTrack.streaming_url?.['mp3-128'] || mobileTrack.streaming_url?.['mp3-v0'];
                if (freshUrl) {
                    console.log('[ScraperService] Successfully refreshed stream URL');
                    return freshUrl;
                }
            }
        } catch (e) {
            console.error('[ScraperService] Error refreshing track stream URL:', e);
        }

        return track.streamUrl;
    }
}
