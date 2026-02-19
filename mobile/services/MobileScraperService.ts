import * as cheerio from 'cheerio';
import { Collection, CollectionItem, Album, Track, RadioStation } from '@shared/types';
import { mobileAuthService } from './MobileAuthService';
import { mobileDatabase } from './MobileDatabase';

// ============================================================================
// Mobile Bandcamp Scraper Service
// ============================================================================

export class MobileScraperService {
    private cachedCollection: Collection | null = null;

    /**
     * Clean artist name by removing "by Artist" suffix patterns
     */
    private cleanArtistName(name: string | undefined | null): string {
        if (!name) return '';
        // Special case: if it's literally "Unknown Artist", return it as is if it bypasses cleaning
        if (name === 'Unknown Artist') return name;
        let cleaned = name.replace(/\s*by\s+.+$/i, '').trim();
        cleaned = cleaned.replace(/^by\s+/i, '').trim();
        // Remove duplicate spaces or control characters if any
        cleaned = cleaned.replace(/\s+/g, ' ');
        return cleaned.trim();
    }

    /**
     * Clean album/track title
     */
    private cleanTitle(rawTitle: string, artist?: string): string {
        if (!rawTitle) return 'Untitled';
        let title = rawTitle.trim();

        if (artist && title.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) {
            title = title.slice(0, -` by ${artist}`.length);
        }

        const dedupeMatch = title.match(/^(.*?)\s*\(gift given\)\s*\1$/i);
        if (dedupeMatch) {
            return dedupeMatch[1].trim() || 'Untitled';
        }

        title = title.replace(/\s*\(gift given\)\s*/gi, ' ').trim();

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
     * Extract JSON object from string
     */
    private extractJsonObject(content: string, keys: string[]): any | null {
        for (const key of keys) {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?:var|let|const)?\\s*${escapedKey}\\s*[:=]\\s*`);

            const match = content.match(regex);
            if (match && match.index !== undefined) {
                const startSearchIndex = match.index + match[0].length;
                const openBraceIndex = content.indexOf('{', startSearchIndex);
                if (openBraceIndex === -1) continue;

                let stack = 0;
                let quoteChar: string | null = null;
                let closeBraceIndex = -1;

                for (let i = openBraceIndex; i < content.length; i++) {
                    const char = content[i];

                    if (i > 0 && content[i - 1] === '\\' && content[i - 2] !== '\\') {
                        continue;
                    }

                    if (quoteChar) {
                        if (char === quoteChar) {
                            quoteChar = null;
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
                        return JSON.parse(jsonString);
                    } catch {
                        try {
                            const sanitized = jsonString
                                .replace(/(\w+)\s*:/g, '"$1":')
                                .replace(/'/g, '"');
                            return JSON.parse(sanitized);
                        } catch (e2) {
                            // Desktop uses new Function fallback. We'll try to be robust with the sanitized JSON first.
                            // If we really need to match desktop, we can use new Function, but usually sanitized JSON handles unquoted keys.
                        }
                    }
                }

            }
        }
        return null;
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
                console.warn('[MobileScraper] Failed to parse #pagedata:', e);
            }
        }
        return null;
    }

    /**
     * Fetch user's collection
     */
    async fetchCollection(forceRefresh = false): Promise<Collection> {
        const authState = await mobileAuthService.checkSession();
        if (!authState.isAuthenticated || !authState.user) {
            console.error('[MobileScraper] User not authenticated in fetchCollection');
            throw new Error('User not authenticated');
        }

        const userId = authState.user.id;
        // console.log('[MobileScraper] Fetching for user:', userId);
        const cacheId = userId;

        // Try to load from database first
        if (!forceRefresh) {
            const cached = await mobileDatabase.getCollectionCache(cacheId);
            if (cached) {
                console.log(`[MobileScraper] Loaded collection from cache for ${userId} (${cached.data.items?.length} items)`);
                this.cachedCollection = cached.data;

                // Helper to re-save artists just in case
                await this.extractAndSaveArtists(cached.data.items);

                return this.cachedCollection!;
            }
        }

        try {
            const cookies = await mobileAuthService.getCookies();
            const profileUrl = authState.user.profileUrl;

            const response = await fetch(profileUrl, {
                headers: {
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                }
            });

            // console.log('[MobileScraper] Profile response status:', response.status);

            const html = await response.text();
            const $ = cheerio.load(html);
            const items: CollectionItem[] = [];

            // Parse initial page items using collection_data var
            const collectionScript = $('script').filter((_, el) => {
                const text = $(el).html() || '';
                return text.includes('CollectionData') || text.includes('collection_data');
            }).first().html();

            if (collectionScript) {
                // console.log('[MobileScraper] Found collection script, extracting JSON...');
                const collectionData = this.extractJsonObject(collectionScript, ['collection_data', 'CollectionData']);
                if (collectionData?.items) {
                    // console.log(`[MobileScraper] Found ${collectionData.items.length} items in initial script.`);
                    for (const item of collectionData.items) {
                        const parsed = this.parseCollectionItem(item);
                        if (parsed) items.push(parsed);
                    }
                } else {
                    console.log('[MobileScraper] Collection data object found but no items? Keys:', Object.keys(collectionData || {}));
                }
            } else {
                console.log('[MobileScraper] Collection script NOT found in HTML.');
            }

            // Fallback to DOM parsing if script failed
            if (items.length === 0) {
                $('.collection-item-container').each((_, el) => {
                    const parsed = this.parseCollectionItemFromDOM($, $(el));
                    if (parsed) items.push(parsed);
                });
            }

            // Fetch more via API
            const pageFanId = this.extractFanId(html);
            const activeFanId = pageFanId ? String(pageFanId) : userId;

            // Initial API fetch (using keys from desktop logic)
            // Note: Desktop logic does a complex check for "has more".
            // We'll simplify: just fetch "more" until done.

            // First batch of API items
            // We need the last token from initial items to continue?
            // Bandcamp's initial page load usually has the first ~20-40 items.
            // Then we use the token from the last item to get more.

            let hasMore = items.length > 0;
            let batchCount = 0;

            // If we have items, use the last one's token
            let lastToken = items.length > 0 ? items[items.length - 1].token : undefined;

            // However, sometimes we need to just ask for the *first* batch via API if we are not sure
            // But usually the page has the first batch.
            // Let's force at least one API call if we found items, to ensure we get everything.
            // If we didn't find items on page (empty?), maybe we should try API with no token?

            if (items.length === 0) {
                // Try fetching scratch
                const initialBatch = await this.fetchMoreCollectionItems(activeFanId, undefined, cookies);
                items.push(...initialBatch);
                if (items.length > 0) lastToken = items[items.length - 1].token;
            }

            while (hasMore && batchCount < 200) { // Increased limit to ~20k items
                if (!lastToken) break;

                // console.log(`[MobileScraper] Fetching batch ${batchCount + 1}...`);
                try {
                    const batch = await this.fetchMoreCollectionItems(activeFanId, lastToken, cookies);
                    if (batch.length === 0) {
                        hasMore = false;
                    } else {
                        // Filter duplicates
                        const newItems = batch.filter(b => !items.some(e => e.id === b.id));
                        if (newItems.length === 0) {
                            hasMore = false;
                        } else {
                            items.push(...newItems);
                            lastToken = items[items.length - 1].token;
                        }
                    }
                    batchCount++;
                } catch (e) {
                    console.warn('[MobileScraper] Batch fetch error:', e);
                    break;
                }
            }

            console.log(`[MobileScraper] Finished fetching. Total items: ${items.length}. Consolidating...`);

            this.consolidateArtistIds(items);

            this.cachedCollection = {
                items,
                totalCount: items.length,
                lastUpdated: new Date().toISOString(),
                isSimulated: false,
            };

            await mobileDatabase.saveCollectionCache(userId, this.cachedCollection);
            // console.log('[MobileScraper] Saved to database.');

            await this.extractAndSaveArtists(items);

            console.log(`[MobileScraper] Collection sync complete.${items.length} items.`);
            return this.cachedCollection;

        } catch (error: any) {
            console.error('[MobileScraper] Collection fetch failed:', error);
            throw error;
        }
    }

    private async fetchMoreCollectionItems(fanId: string, lastToken: string | undefined, cookies: string): Promise<CollectionItem[]> {
        const items: CollectionItem[] = [];
        const requestBody: any = {
            fan_id: parseInt(fanId, 10),
            count: 100, // Match desktop batch size
        };
        if (lastToken) {
            requestBody.older_than_token = lastToken;
        }

        const response = await fetch('https://bandcamp.com/api/fancollection/1/collection_items', {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (data.items) {
            for (const item of data.items) {
                const parsed = this.parseCollectionItem(item);
                if (parsed) items.push(parsed);
            }
        }

        // slight delay
        await new Promise(r => setTimeout(r, 100));
        return items;
    }

    private parseCollectionItem(item: any): CollectionItem | null {
        try {
            const isAlbum = item.item_type === 'album' || item.tralbum_type === 'a';
            const id = String(item.item_id || item.tralbum_id);
            // Aligned with desktop: use band_name, with fallbacks for mobile API variations
            const artist = this.cleanArtistName(item.band_name || item.artist || item.artist_name) || 'Unknown Artist';

            // Aligned with desktop: for tracks use item_title or track_title
            const rawTitle = isAlbum ? (item.album_title || item.item_title || '') : (item.item_title || item.track_title || item.title || '');
            const title = this.cleanTitle(rawTitle, artist);

            if (isAlbum) {
                return {
                    id,
                    type: 'album',
                    token: item.token || item.sale_token,
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
                const trackTitle = this.cleanTitle(item.item_title || item.track_title || '', artist);
                return {
                    id,
                    type: 'track',
                    token: item.token || item.sale_token,
                    track: {
                        id,
                        title: trackTitle,
                        artist,
                        artistId: item.band_id ? String(item.band_id) : undefined,
                        album: item.album_title || '',
                        duration: typeof item.duration === 'number' ? item.duration : parseFloat(item.duration || '0'),
                        artworkUrl: item.item_art_url || (item.art_id ? `https://f4.bcbits.com/img/a${item.art_id}_10.jpg` : ''),
                        streamUrl: '',
                        bandcampUrl: item.item_url || '',
                        isCached: false,
                    },
                    purchaseDate: item.purchased || item.added || new Date().toISOString(),
                };
            }
        } catch (e) {
            console.error('[MobileScraper] Error parsing item:', e);
            return null;
        }
    }

    private parseCollectionItemFromDOM($: cheerio.CheerioAPI, $item: cheerio.Cheerio<any>): CollectionItem | null {
        try {
            const artist = this.cleanArtistName($item.find('.collection-item-artist').text().replace('by ', '')) || 'Unknown Artist';
            const title = this.cleanTitle($item.find('.collection-item-title').text(), artist) || 'Untitled';
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
                        artistId: artistId || '',
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
                        artistId: artistId || '',
                        album: '',
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
            return null;
        }
    }

    private consolidateArtistIds(items: CollectionItem[]): void {
        const artistMap = new Map<string, string>();
        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;
            const name = data.artist.toLowerCase();
            const id = data.artistId;
            if (id) {
                if (!artistMap.has(name) || (/^\d+$/.test(id) && !/^\d+$/.test(artistMap.get(name)!))) {
                    artistMap.set(name, id);
                }
            }
        }
        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;
            const bestId = artistMap.get(data.artist.toLowerCase());
            if (bestId) data.artistId = bestId;
        }
    }

    private async extractAndSaveArtists(items: CollectionItem[]): Promise<void> {
        const artistsMap = new Map<string, { id: string; name: string; url: string; image_url?: string }>();

        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;

            const artistId = data.artistId || `name-${data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            let artistUrl = '';
            if (data.bandcampUrl) {
                try {
                    const urlObj = new URL(data.bandcampUrl);
                    artistUrl = `${urlObj.protocol}//${urlObj.host}`;
                } catch (e) { }
            }

            const existing = artistsMap.get(artistId);
            if (existing) {
                // Merge better data
                if (!existing.image_url && data.artworkUrl) {
                    existing.image_url = data.artworkUrl;
                }
                if (!existing.url && artistUrl) {
                    existing.url = artistUrl;
                }
            } else {
                artistsMap.set(artistId, {
                    id: artistId,
                    name: data.artist,
                    url: artistUrl,
                    image_url: data.artworkUrl // Note: MobileDatabase expects image_url (snake_case)
                });
            }
        }

        const artists = Array.from(artistsMap.values());
        console.log(`[MobileScraper] Extracted ${artists.length} unique artists.`);
        if (artists.length > 0) {
            await mobileDatabase.replaceArtists(artists);
        }
    }

    /**
     * Search within collection
     */
    searchCollection(query: string): Collection {
        if (!this.cachedCollection) {
            return { items: [], totalCount: 0, lastUpdated: new Date().toISOString(), isSimulated: false };
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
            isSimulated: this.cachedCollection.isSimulated
        };
    }
    /**
     * Get full album details including tracks and stream URLs
     */
    async getAlbumDetails(albumUrl: string): Promise<Album | null> {
        try {
            const cookies = await mobileAuthService.getCookies();
            const response = await fetch(albumUrl, {
                headers: {
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            // Extract album data from embedded JSON
            const tralbumData = this.extractTralbumData($);
            if (!tralbumData) {
                console.error('[MobileScraper] Could not find album data in page');
                return null;
            }

            // Enhance tralbumData with DOM fallbacks if missing
            const domArtist = $('span[itemprop="byArtist"]').text().trim() ||
                $('#name-section h3').text().trim().replace(/^by\s+/i, '') ||
                $('h3.album-artist').text().trim() ||
                $('header h2').text().trim().split('by ')[1];

            // Aligned with desktop: prioritize tralbumData.artist
            const albumArtist = this.cleanArtistName(tralbumData.artist || tralbumData.artist_name || tralbumData.band_name || domArtist || 'Unknown Artist');

            const tracks: Track[] = await Promise.all((tralbumData.trackinfo || []).map(async (trackInfo: any, index: number) => {
                let streamUrl = trackInfo.file?.['mp3-128'] || trackInfo.file?.['mp3-v0'] || '';

                // Fallback to Mobile API if stream URL is missing
                if (!streamUrl && tralbumData.band_id && trackInfo.track_id) {
                    try {
                        const mobileUrl = `https://bandcamp.com/api/mobile/24/tralbum_details?band_id=${tralbumData.band_id}&tralbum_type=t&tralbum_id=${trackInfo.track_id}`;
                        const apiRes = await fetch(mobileUrl, {
                            headers: {
                                'Cookie': cookies,
                                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                            }
                        });
                        const data = await apiRes.json();

                        if (data && data.tracks && data.tracks.length > 0) {
                            const mobileTrack = data.tracks[0];
                            streamUrl = mobileTrack.streaming_url?.['mp3-128'] || mobileTrack.streaming_url?.['mp3-v0'] || '';
                        }
                    } catch (e: any) {
                        console.error('[MobileScraper] Mobile API fallback failed:', e.message);
                    }
                }

                return {
                    id: String(trackInfo.track_id || `${tralbumData.id}-${index}`),
                    title: trackInfo.title,
                    artist: albumArtist,
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
                artist: albumArtist,
                artistId: String(tralbumData.band_id),
                artworkUrl: tralbumData.art_id ? `https://f4.bcbits.com/img/a${tralbumData.art_id}_10.jpg` : '',
                bandcampUrl: albumUrl,
                releaseDate: tralbumData.current?.release_date,
                tracks,
                trackCount: tracks.length,
            };
        } catch (error) {
            console.error('[MobileScraper] Error fetching album details:', error);
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
                console.error('[MobileScraper] Error parsing data-tralbum:', e);
            }
        }

        // Try to find in inline scripts
        let tralbumData = null;
        const scriptContent = $('script').map((_, el) => $(el).html()).get().join('\n');

        tralbumData = this.extractJsonObject(scriptContent, ['TralbumData', 'tralbum_data', 'BandData', 'EmbedData']);

        return tralbumData;
    }

    /**
     * Get Bandcamp Radio stations
     */
    async getRadioStations(): Promise<RadioStation[]> {
        try {
            const response = await fetch('https://bandcamp.com/api/bcweekly/3/list', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                }
            });
            const data = await response.json();
            const stations: RadioStation[] = [];

            if (data.results) {
                for (const episode of data.results) {
                    let formattedDate = undefined;
                    if (episode.published_date) {
                        try {
                            const dateObj = new Date(episode.published_date);
                            if (!isNaN(dateObj.getTime())) {
                                formattedDate = dateObj.toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                });
                            } else {
                                // Fallback: try parsing YYYYMMDD or DD MMM YYYY if needed
                                formattedDate = episode.published_date;
                            }
                        } catch (e) {
                            formattedDate = String(episode.published_date);
                        }
                    }

                    stations.push({
                        id: String(episode.show_id || episode.id),
                        name: episode.title || `Bandcamp Weekly ${episode.id}`,
                        description: episode.subtitle || episode.desc,
                        imageUrl: episode.image_id ? `https://f4.bcbits.com/img/${episode.image_id}_16.jpg` : undefined,
                        streamUrl: '', // Will be fetched on demand
                        date: formattedDate,
                    });
                }
            }

            return stations;
        } catch (error) {
            console.error('[MobileScraper] Error fetching radio stations:', error);
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
     * Get fresh stream URL for a radio station show
     */
    async getStationStreamUrl(showId: string): Promise<{ streamUrl: string; duration: number }> {
        try {
            console.log(`[MobileScraper] Fetching stream URL for show: ${showId}`);
            // 1. Fetch the show page
            const cookies = await mobileAuthService.getCookies();
            // Try both root with show param and weekly path
            const urls = [
                `https://bandcamp.com/?show=${showId}`,
                `https://bandcamp.com/weekly?show=${showId}`
            ];

            let html = '';
            for (const url of urls) {
                const response = await fetch(url, {
                    headers: {
                        'Cookie': cookies,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' // Use desktop UA for better parsing
                    }
                });
                html = await response.text();
                if (html.includes('id="ArchiveApp"')) break;
            }

            const $ = cheerio.load(html);

            // 2. Extract data blob from ArchiveApp div
            let dataBlob = $('#ArchiveApp').attr('data-blob');
            if (!dataBlob) {
                console.error('[MobileScraper] No data-blob found in ArchiveApp div. Trying scripts...');
                // Fallback to searching scripts
                const scripts = $('script').map((_, el) => $(el).html()).get();
                for (const script of scripts) {
                    if (script && script.includes('data-blob')) {
                        const match = script.match(/data-blob="([^"]+)"/);
                        if (match) {
                            dataBlob = match[1];
                            break;
                        }
                    }
                }
            }

            if (!dataBlob) {
                console.error('[MobileScraper] Still no data-blob found for radio station');
                return { streamUrl: '', duration: 0 };
            }

            try {
                // Decode HTML entities (Bandcamp often encodes " as &quot; in data attributes)
                const entities: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
                const decoded = dataBlob.replace(/&quot;|&amp;|&lt;|&gt;/g, (match) => entities[match]);

                // If it still starts with <, it's definitely not JSON
                if (decoded.trim().startsWith('<')) {
                    console.error('[MobileScraper] Decoded data-blob starts with <, invalid JSON');
                    return { streamUrl: '', duration: 0 };
                }

                const appData = JSON.parse(decoded);
                const shows = appData.appData?.shows || appData.shows || [];
                const show = shows.find((s: any) => String(s.showId || s.id) === showId);

                if (!show || !show.audioTrackId) {
                    console.error('[MobileScraper] Show or audioTrackId not found in data blob', {
                        foundShow: !!show,
                        hasTrackId: !!show?.audioTrackId
                    });
                    return { streamUrl: '', duration: 0 };
                }

                const audioTrackId = show.audioTrackId;

                // 3. Fetch track details from mobile API
                const apiRes = await fetch(`https://bandcamp.com/api/mobile/24/tralbum_details?band_id=1&tralbum_type=t&tralbum_id=${audioTrackId}`, {
                    headers: {
                        'Cookie': cookies,
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                    }
                });
                const trackData = await apiRes.json();

                if (trackData && trackData.tracks && trackData.tracks.length > 0) {
                    const track = trackData.tracks[0];
                    const streamUrl = track.streaming_url?.['mp3-128'];
                    const duration = track.duration || 0;
                    if (streamUrl) {
                        return { streamUrl, duration };
                    }
                }
                console.error('[MobileScraper] Stream URL not found in API response');
                return { streamUrl: '', duration: 0 };
            } catch (e) {
                console.error('[MobileScraper] Error parsing radio page data:', e);
                return { streamUrl: '', duration: 0 };
            }
        } catch (error) {
            console.error(`[MobileScraper] Error fetching station stream URL for ${showId}:`, error);
            return { streamUrl: '', duration: 0 };
        }
    }
}

export const mobileScraperService = new MobileScraperService();
