import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import { simulationService } from './simulation.service';
import type { Track, Album, Collection, CollectionItem, RadioStation } from '../../shared/types';
import { EventEmitter } from 'events';
// ============================================================================
// Bandcamp Scraper Service
// ============================================================================

const ONE_YEAR_SECONDS = 31536000; // 1 year

export class ScraperService extends EventEmitter {
    private authService: AuthService;
    private http: AxiosInstance;
    private cachedCollection: Collection | null = null;

    constructor(authService: AuthService) {
        super();
        this.authService = authService;
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

                // Balance braces
                let braceCount = 0;
                let inString = false;
                let inEscape = false;
                let closeBraceIndex = -1;

                for (let i = openBraceIndex; i < content.length; i++) {
                    const char = content[i];

                    if (inEscape) {
                        inEscape = false;
                        continue;
                    }

                    if (char === '\\') {
                        inEscape = true;
                        continue;
                    }

                    if (char === '"' || char === "'") {
                        // Simple string toggle - this assumes standard JSON/JS string behavior
                        // (Technically quote styles matter, but for this purpose assume matching quotes isn't critical 
                        // if we just toggle inString. However, mixing ' and " might be an issue. 
                        // For now, simple toggle is better than regex.)
                        // Actually, sticking to checking if it matches the *starting* quote is better.
                        // But for simplicity, let's assume valid JS/JSON doesn't nest unescaped quotes improperly.
                        // Let's implement a slightly smarter string check.
                        // We can skip this complexity for now and assume the content is reasonably well-formed.
                        // Or better: just count braces unless we are strictly sure we are in a string.
                        // Given the complexity of full JS parsing, let's try a standard brace counter that ignores braces in quotes.
                        // Standard simple implementation:
                    }
                }

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

        this.fetchPromise = (async () => {
            try {
                const authState = this.authService.getUser();
                if (!authState.isAuthenticated || !authState.user) {
                    throw new Error('User not authenticated');
                }

                const cookies = await this.authService.getSessionCookies();
                const profileUrl = authState.user.profileUrl;

                // Fetch the collection page
                const response = await this.http.get(profileUrl, {
                    headers: { Cookie: cookies },
                });

                const $ = cheerio.load(response.data);
                const items: CollectionItem[] = [];

                // Extract collection data from the page
                // Bandcamp embeds collection data in a script tag
                // const pageDataScript = $('script[data-tralbum]').attr('data-tralbum');
                const collectionScript = $('script').filter((_, el) => {
                    const text = $(el).html() || '';
                    return text.includes('CollectionData') || text.includes('collection_data');
                }).first().html();

                if (!collectionScript) {
                    console.warn('[Scraper] Collection script NOT found in page.');
                }

                let collectionData: any = null; // Declare here

                if (collectionScript) {
                    // Parse collection data from script
                    // Try robust extraction first
                    collectionData = this.extractJsonObject(collectionScript, ['collection_data', 'CollectionData']);

                    if (collectionData) {
                        try {
                            // Process collection data
                            if (collectionData.items) {
                                for (const item of collectionData.items) {
                                    const collectionItem = this.parseCollectionItem(item);
                                    if (collectionItem) {
                                        items.push(collectionItem);
                                    }
                                }
                            }
                        } catch (__e) {
                            console.error('Error processing collection data:', __e);
                        }
                    }
                }

                // Also try to parse from DOM if script parsing fails
                if (items.length === 0) {
                    $('.collection-item-container').each((_, element) => {
                        const $item = $(element);
                        const collectionItem = this.parseCollectionItemFromDOM($, $item);
                        if (collectionItem) {
                            items.push(collectionItem);
                        }
                    });
                }

                // Extract fan_id from the page to be sure we have the correct one
                let pageFanId: number | null = null;

                // Strategy 1: <div id="pagedata" data-blob="...">
                // This seems to be the new standard for Bandcamp pages
                const $pagedata = $('#pagedata');
                const dataBlob = $pagedata.attr('data-blob');
                if (dataBlob) {
                    try {
                        // It's usually HTML encoded (e.g. &quot;)
                        // Use a single regex with a replacement map to avoid double-unescaping (CodeQL fix)
                        const entities: Record<string, string> = {
                            '&quot;': '"',
                            '&amp;': '&',
                            '&lt;': '<',
                            '&gt;': '>'
                        };
                        const decoded = dataBlob.replace(/&quot;|&amp;|&lt;|&gt;/g, (match) => entities[match]);

                        const pd = JSON.parse(decoded);
                        if (pd.fan_stats && pd.fan_stats.fan_id) {
                            pageFanId = Number(pd.fan_stats.fan_id);
                        } else if (pd.fan_id) {
                            pageFanId = Number(pd.fan_id);
                        }
                    } catch (e) {
                        console.error('[Scraper] Failed to parse #pagedata data-blob:', e);
                    }
                }

                // Strategy 2: Legacy Script Variable (Backup)
                if (!pageFanId) {
                    const pd = this.extractJsonObject(response.data, ['pagedata']);
                    if (pd && pd.fan_id) {
                        pageFanId = Number(pd.fan_id);
                    }
                }

                // Strategy 3: Loose Regex (Backup)
                const fanDataMatch = response.data.match(/["']?fan_id["']?\s*:\s*(\d+)/);
                if (fanDataMatch) {
                    pageFanId = parseInt(fanDataMatch[1], 10);
                }

                if (!pageFanId) {
                    const dataBlobId = response.data.match(/data-fan-id="(\d+)"/);
                    if (dataBlobId) {
                        pageFanId = parseInt(dataBlobId[1], 10);
                    }
                }

                const activeFanId = pageFanId ? String(pageFanId) : authState.user.id;

                // Fetch more items via API
                // ...

                const futureToken = String(Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS);
                try {
                    const apiItems = await this.fetchMoreCollectionItems(activeFanId, futureToken, cookies);

                    if (apiItems.length > 0) {
                        // Merge and dedup
                        const newItems = apiItems.filter(newI => !items.some(existing => existing.id === newI.id));
                        items.push(...newItems);
                    }
                } catch (e) {
                    console.error('Bootstrap failed:', e);
                }

                let hasMore = items.length > 0;
                // Limit to avoid infinite loops in case of error
                // Increased from 100 to 1000 to support collections up to ~20k items
                const MAX_FETCHES = 1000;
                let fetchCount = 0;
                let retryCount = 0;
                const MAX_RETRIES = 5;

                while (hasMore && fetchCount < MAX_FETCHES) {
                    // Find method to get next token
                    // 1. Try last item from the list (which now includes API items)
                    const lastItem = items[items.length - 1];

                    if (!lastItem || !lastItem.token) {
                        break;
                    }

                    try {
                        // Try full token
                        let moreItems = await this.fetchMoreCollectionItems(activeFanId, lastItem.token, cookies);

                        // FALLBACK: If 0 items, try using just the timestamp from the token
                        // This is often required if the full token format (timestamp:id:type::) is too strict for the API context
                        if (moreItems.length === 0 && lastItem.token.includes(':')) {
                            const timestamp = lastItem.token.split(':')[0];
                            moreItems = await this.fetchMoreCollectionItems(activeFanId, timestamp, cookies);
                        }

                        if (moreItems.length === 0) {
                            hasMore = false;
                        } else {
                            // Avoid duplicates
                            const newItems = moreItems.filter(newI => !items.some(existing => existing.id === newI.id));
                            if (newItems.length === 0) {
                                hasMore = false;
                            } else {
                                items.push(...newItems);
                                // Reset retry count on success
                                retryCount = 0;
                            }
                        }
                        fetchCount++;
                    } catch (error) {
                        console.error(`Error fetching batch ${fetchCount + 1}:`, error);
                        retryCount++;
                        if (retryCount > MAX_RETRIES) {
                            console.error(`Max retries (${MAX_RETRIES}) reached. Stopping fetch.`);
                            break;
                        }
                        // Wait longer before retry
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    }
                }


                this.cachedCollection = {
                    items,
                    totalCount: items.length,
                    lastUpdated: new Date().toISOString(),
                };

                this.emit('collection-updated', this.cachedCollection);
                return this.cachedCollection;
            } catch (error: any) {
                console.error('Error fetching collection:', error.message);
                if (error.response) {
                    console.error('Axios error details:', {
                        status: error.response.status,
                        data: typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : 'non-string data'
                    });
                }
                throw error;
            } finally {
                this.fetchPromise = null;
            }
        })();

        return this.fetchPromise;
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

        try {
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
        } catch (error) {
            // Propagate error to allow retry logic in main loop
            throw error;
        }

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
}
