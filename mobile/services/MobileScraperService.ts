import * as cheerio from 'cheerio';
import { Collection, CollectionItem, Album, Track, RadioStation } from '@shared/types';
import { mobileAuthService } from './MobileAuthService';
import { mobileDatabase } from './MobileDatabase';
import { mobileSimulationService } from './MobileSimulationService';
import { remoteConfigService } from '@shared/remote-config.service';

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
        const config = remoteConfigService.get().cleaning;
        let cleaned = name.replace(new RegExp(config.artistCleanRegex, 'i'), '').trim();
        cleaned = cleaned.replace(new RegExp(config.artistPrefixCleanRegex, 'i'), '').trim();
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

        const config = remoteConfigService.get().cleaning;
        const dedupeMatch = title.match(new RegExp(config.dedupeRegex, 'i'));
        if (dedupeMatch) {
            return dedupeMatch[1].trim() || 'Untitled';
        }

        title = title.replace(new RegExp(config.titleCleanRegex, 'gi'), ' ').trim();

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
                    let parsedObject: any | null = null;
                    try {
                        parsedObject = JSON.parse(jsonString);
                    } catch {
                        try {
                            // Simplified JSON5-like parsing attempt for keys and quotes
                            const sanitizedValue = jsonString
                                .replace(/([{,])\s*([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":') // Quote keys
                                .replace(/'/g, '"'); // Replace single quotes
                            parsedObject = JSON.parse(sanitizedValue);
                        } catch (e) {
                            console.error(`[MobileScraper] Failed to parse extracted object for ${key}:`, e);
                        }
                    }

                    if (parsedObject && typeof parsedObject === 'object') {
                        return parsedObject;
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
    async fetchCollection(forceRefresh = false, isSimulated = false, onProgress?: (msg: string) => void): Promise<Collection> {
        const authState = await mobileAuthService.checkSession();
        if (!authState.isAuthenticated || !authState.user) {
            console.error('[MobileScraper] User not authenticated in fetchCollection');
            throw new Error('User not authenticated');
        }

        const userId = authState.user.id;
        const cacheId = isSimulated ? `${userId}_sim` : userId;

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

        const items: CollectionItem[] = [];

        try {
            if (isSimulated) {
                console.log('[MobileScraper] Starting simulation...');
                onProgress?.('Generating simulated items...');
                let simHasMore = true;
                let simLastToken: string | undefined;
                let simBatchCount = 0;
                let simRetryCount = 0;

                while (simHasMore && simBatchCount < 1000) {
                    try {
                        const batch = await mobileSimulationService.fetchBatch(simLastToken);
                        if (batch.length === 0) {
                            simHasMore = false;
                        } else {
                            items.push(...batch);
                            simLastToken = items[items.length - 1].token;
                            simBatchCount++;
                            simRetryCount = 0; // Reset on success
                            onProgress?.(`Loading simulated items: ${items.length}/5000`);
                        }
                    } catch (e) {
                        simRetryCount++;
                        console.warn(`[MobileScraper] Simulation error (retry ${simRetryCount}):`, e);
                        if (simRetryCount > 5) {
                            console.error('[MobileScraper] Simulation failed after 5 retries.');
                            break;
                        }
                        // Short delay before retry
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            } else {
                const cookies = await mobileAuthService.getCookies();
                const profileUrl = authState.user.profileUrl;

                const config = remoteConfigService.get();
                const response = await fetch(profileUrl, {
                    headers: {
                        'Cookie': cookies,
                        'User-Agent': config.userAgents.mobile
                    }
                });

                const html = await response.text();
                const $ = cheerio.load(html);

                // Parse initial page items using collection_data var
                const collectionScript = $('script').filter((_, el) => {
                    const text = $(el).html() || '';
                    return config.scriptKeys.collection.some(k => text.includes(k));
                }).first().html();

                if (collectionScript) {
                    const collectionData = this.extractJsonObject(collectionScript, config.scriptKeys.collection);
                    if (collectionData?.items) {
                        for (const item of collectionData.items) {
                            const parsed = this.parseCollectionItem(item);
                            if (parsed) items.push(parsed);
                        }
                    }
                }

                // Fallback to DOM parsing if script failed
                if (items.length === 0) {
                    $(`#collection-grid ${config.selectors.collection.itemContainer}`).each((_, el) => {
                        const parsed = this.parseCollectionItemFromDOM($, $(el));
                        if (parsed) items.push(parsed);
                    });
                }

                // Fetch more via API
                const pageFanId = this.extractFanId(html);
                const activeFanId = pageFanId ? String(pageFanId) : userId;

                let hasMore = items.length > 0;
                let batchCount = 0;
                let lastToken = items.length > 0 ? items[items.length - 1].token : undefined;

                if (items.length === 0) {
                    const initialBatch = await this.fetchMoreCollectionItems(activeFanId, undefined, cookies);
                    items.push(...initialBatch);
                    if (items.length > 0) lastToken = items[items.length - 1].token;
                }

                onProgress?.(`Loading collection...`);

                const scrapingConfig = remoteConfigService.get().scraping;
                while (hasMore && batchCount < scrapingConfig.maxBatches) {
                    if (!lastToken) break;
                    try {
                        const batch = await this.fetchMoreCollectionItems(activeFanId, lastToken, cookies);
                        if (batch.length === 0) {
                            hasMore = false;
                        } else {
                            const newItems = batch.filter(b => !items.some(e => e.id === b.id));
                            if (newItems.length === 0) {
                                hasMore = false;
                            } else {
                                items.push(...newItems);
                                lastToken = items[items.length - 1].token;
                                onProgress?.(`Loading collection: ${items.length} items...`);
                            }
                        }
                        batchCount++;
                    } catch (e) {
                        console.warn('[MobileScraper] Batch fetch error:', e);
                        break;
                    }
                }
            }

            console.log(`[MobileScraper] Finished fetching. Total items: ${items.length}. Consolidating...`);

            this.consolidateArtistIds(items);

            this.cachedCollection = {
                items,
                totalCount: items.length,
                lastUpdated: new Date().toISOString(),
                isSimulated: isSimulated,
            };

            await mobileDatabase.saveCollectionCache(userId, this.cachedCollection);
            await mobileDatabase.saveCollectionGranular(userId, items, onProgress);

            await this.extractAndSaveArtists(items, onProgress);

            onProgress?.(''); // Explicitly clear ONLY when EVERYTHING is done
            console.log(`[MobileScraper] Collection sync complete. ${items.length} items.`);
            return this.cachedCollection;

        } catch (error: any) {
            console.error('[MobileScraper] Collection fetch failed:', error);
            throw error;
        }
    }

    private async fetchMoreCollectionItems(fanId: string, lastToken: string | undefined, cookies: string): Promise<CollectionItem[]> {
        const config = remoteConfigService.get();
        const items: CollectionItem[] = [];
        const requestBody: any = {
            fan_id: parseInt(fanId, 10),
            count: config.scraping.batchSize,
        };
        if (lastToken) {
            requestBody.older_than_token = lastToken;
        }

        const response = await fetch(config.endpoints.collectionItemsApi, {
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
        const jitter = Math.floor(Math.random() * config.scraping.rateLimitJitter);
        await new Promise(r => setTimeout(r, config.scraping.rateLimitDelay + jitter));
        return items;
    }

    private parseCollectionItem(item: any): CollectionItem | null {
        try {
            const config = remoteConfigService.get();
            // Skip wishlist items if they accidentally appeared 
            if (item.is_wishlist || item.why === 'wishlist') {
                return null;
            }

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
                        artworkUrl: item.item_art_url || (item.art_id ? config.endpoints.artworkFormat.replace('{art_id}', item.art_id.toString()) : ''),
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
                        artworkUrl: item.item_art_url || (item.art_id ? config.endpoints.artworkFormat.replace('{art_id}', item.art_id.toString()) : ''),
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
            const config = remoteConfigService.get().selectors.collection;
            const artistDOM = $item.find(config.artist).text().replace('by ', '');
            const artist = this.cleanArtistName(artistDOM || config.fallbackArtist) || config.fallbackArtist;
            const titleDOM = $item.find(config.title).text();
            const title = this.cleanTitle(titleDOM || config.fallbackTitle, artist) || config.fallbackTitle;
            const url = $item.find(config.link).attr('href') || '';
            const artworkUrl = $item.find(config.artwork).attr('src') || '';
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

    private async extractAndSaveArtists(items: CollectionItem[], onProgress?: (msg: string) => void): Promise<void> {
        onProgress?.('Extracting artists...');
        const artistsMap = new Map<string, { id: string; name: string; url: string; image_url?: string }>();

        for (const item of items) {
            const data = item.type === 'album' ? item.album : item.track;
            if (!data) continue;

            const artistId = data.artistId || `name-${data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            let artistUrl = '';
            if (data.bandcampUrl) {
                const urlObj = new URL(data.bandcampUrl);
                artistUrl = `${urlObj.protocol}//${urlObj.host}`;
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
            const config = remoteConfigService.get();
            const response = await fetch(albumUrl, {
                headers: {
                    'Cookie': cookies,
                    'User-Agent': config.userAgents.mobile
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

            // Enhance tralbumData with DOM fallbacks if missing or generic
            let domArtist = '';
            for (const selector of config.selectors.album.artistDOM) {
                const text = $(selector).text().trim();
                if (text) {
                    domArtist = text.replace(/^by\s+/i, '');
                    break;
                }
            }

            // Aligned with desktop: prioritize tralbumData.artist but fallback to DOM if it's 'Unknown Artist'
            let rawArtist = tralbumData.artist || tralbumData.artist_name || tralbumData.band_name;
            if (!rawArtist || rawArtist === 'Unknown Artist') {
                rawArtist = domArtist;
            }

            const albumArtist = this.cleanArtistName(rawArtist || 'Unknown Artist');

            const tracks: Track[] = await Promise.all((tralbumData.trackinfo || []).map(async (trackInfo: any, index: number) => {
                let streamUrl = trackInfo.file?.['mp3-128'] || trackInfo.file?.['mp3-v0'] || '';

                // Fallback to Mobile API if stream URL is missing
                if (!streamUrl && tralbumData.band_id && trackInfo.track_id) {
                    try {
                        const mobileUrl = config.endpoints.mobileTralbumDetailsApi
                            .replace('{band_id}', tralbumData.band_id.toString())
                            .replace('{track_id}', trackInfo.track_id.toString());
                        const apiRes = await fetch(mobileUrl, {
                            headers: {
                                'Cookie': cookies,
                                'User-Agent': config.userAgents.mobile
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
                    artworkUrl: tralbumData.art_id ? config.endpoints.artworkFormat.replace('{art_id}', tralbumData.art_id.toString()) : '',
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
                artworkUrl: tralbumData.art_id ? config.endpoints.artworkFormat.replace('{art_id}', tralbumData.art_id.toString()) : '',
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

        const config = remoteConfigService.get();
        tralbumData = this.extractJsonObject(scriptContent, config.scriptKeys.album);

        // Validation for tralbumData
        if (tralbumData && (!tralbumData.trackinfo || !tralbumData.id)) {
            console.warn('[MobileScraper] Extracted album data failed validation (missing tracks or id)');
            return null;
        }

        return tralbumData;
    }

    /**
     * Get Bandcamp Radio stations
     */
    async getRadioStations(): Promise<RadioStation[]> {
        const config = remoteConfigService.get();
        try {
            const response = await fetch(config.endpoints.radioListApi, {
                headers: {
                    'User-Agent': config.userAgents.mobile
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
                        imageUrl: episode.image_id ? config.endpoints.radioImageFormat.replace('{image_id}', episode.image_id.toString()) : undefined,
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
                    streamUrl: config.endpoints.radioFallbackStream,
                },
            ];
        }
    }

    /**
     * Get fresh stream URL for a radio station show
     */
    async getStationStreamUrl(showId: string): Promise<{ streamUrl: string; duration: number }> {
        const config = remoteConfigService.get();
        try {
            console.log(`[MobileScraper] Fetching stream URL for show: ${showId}`);
            // 1. Fetch the show page
            const cookies = await mobileAuthService.getCookies();
            // Try root with show param first, then weekly path
            const urls = [
                config.endpoints.radioShowWeb.replace('{showId}', showId),
                config.endpoints.radioWeeklyWeb.replace('{showId}', showId)
            ];

            let html = '';
            for (const url of urls) {
                console.log(`[MobileScraper] Trying URL: ${url}`);
                const response = await fetch(url, {
                    headers: {
                        'Cookie': cookies,
                        'User-Agent': config.userAgents.desktop
                    }
                });
                if (!response.ok) continue;
                const text = await response.text();
                // Check if this page contains the expected show data or at least a player
                if (text && (text.includes('audioTrackId') || text.includes('track_id') || text.includes('ArchiveApp'))) {
                    html = text;
                    break;
                }
            }

            if (!html) {
                console.error('[MobileScraper] Failed to fetch radio page with valid show data');
                return { streamUrl: '', duration: 0 };
            }

            const $ = cheerio.load(html);

            // 2. Extract data blob from standard elements or any element containing it
            // We search for elements with data-blob and pick the one that looks like player data
            let dataBlob: string | undefined;

            $('[data-blob]').each((_, el) => {
                const blob = $(el).attr('data-blob');
                if (blob && (blob.includes('audioTrackId') || blob.includes('showId') || blob.includes('shows'))) {
                    dataBlob = blob;
                    return false; // found it
                }
            });

            if (!dataBlob) {
                // Fallback to specific IDs just in case
                for (const selector of config.selectors.radio.dataBlobElements) {
                    const blob = $(selector).attr('data-blob');
                    if (blob) {
                        dataBlob = blob;
                        break;
                    }
                }
            }

            if (!dataBlob) {
                console.log('[MobileScraper] No data-blob found in standard elements. Searching scripts...');
                // Fallback 1: Search scripts for data-blob attribute in a string
                const scripts = $('script').map((_, el) => $(el).html()).get();
                for (const script of scripts) {
                    if (script) {
                        for (const regexStr of config.selectors.radio.scriptRegexes) {
                            const regex = new RegExp(regexStr);
                            const match = script.match(regex);
                            if (match) {
                                dataBlob = match[1];
                                console.log(`[MobileScraper] Found data-blob in script via regex: ${regexStr}`);
                                break;
                            }
                        }
                        if (dataBlob) break;
                    }
                }
            }

            if (!dataBlob) {
                console.error('[MobileScraper] Still no data-blob found for radio station');
                return { streamUrl: '', duration: 0 };
            }

            try {
                // Determine if we need to decode entities. 
                // cheerio.attr() usually handles this, but regex fallback might not.
                let decoded = dataBlob;
                if (dataBlob.includes('&quot;')) {
                    const entities: Record<string, string> = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
                    decoded = dataBlob.replace(/&quot;|&amp;|&lt;|&gt;/g, (match) => entities[match]);
                }

                // If it still starts with <, it's definitely not JSON
                if (decoded.trim().startsWith('<')) {
                    console.error('[MobileScraper] Decoded data-blob starts with <, invalid JSON. Preview:', decoded.substring(0, 100));
                    return { streamUrl: '', duration: 0 };
                }

                let appData;
                try {
                    appData = JSON.parse(decoded);
                } catch (parseErr) {
                    console.error('[MobileScraper] JSON parse failed for data-blob. Preview:', decoded.substring(0, 100));
                    throw parseErr;
                }

                const shows = appData.appData?.shows || appData.shows || [];
                let show = shows.find((s: any) => {
                    const id = String(config.radioData.showIdKeys.reduce((acc: any, key: string) => acc || s[key], null as any) || '');
                    return id === showId;
                });

                // Fallback to current_show
                if (!show && (appData.appData?.current_show || appData.current_show)) {
                    const currentShow = appData.appData?.current_show || appData.current_show;
                    if (String(currentShow.showId || currentShow.id || currentShow.show_id) === showId) {
                        show = currentShow;
                    }
                }

                // Fallback: if data contains audioTrackId directly at root
                let audioTrackId = show?.audioTrackId || show?.track_id || appData.audioTrackId || appData.track_id;
                const bandId = show?.bandId || show?.band_id || appData.bandId || appData.band_id || 1;

                if (!audioTrackId) {
                    console.log('[MobileScraper] Track ID not found in standard paths. Performing recursive search...');

                    // Recursive search helper
                    const findId = (obj: any): any => {
                        if (!obj || typeof obj !== 'object') return null;

                        // Prefer specific radio track fields
                        if (obj.audioTrackId) return obj.audioTrackId;
                        if (obj.track_id && typeof obj.track_id === 'number') return obj.track_id;

                        for (const key in obj) {
                            // Avoid searching very deep or recursive references if any
                            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                const found = findId(obj[key]);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    // Try searching in likely candidates first
                    audioTrackId = findId(appData.tracklists) || findId(appData.item_cache) || findId(appData);
                }

                if (!audioTrackId) {
                    console.error('[MobileScraper] Could not find audioTrackId for radio station', {
                        showId,
                        foundShow: !!show,
                        availableShows: shows.length,
                        hasRootId: !!(appData.audioTrackId || appData.track_id),
                        dataKeys: Object.keys(appData).slice(0, 10)
                    });
                    return { streamUrl: '', duration: 0 };
                }

                console.log(`[MobileScraper] Found track ID: ${audioTrackId}`);

                // Fallback: Check if appData already contains the stream URL for this track
                const findStream = (obj: any): any => {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj.track_id === audioTrackId || obj.id === audioTrackId) {
                        const url = obj.file?.['mp3-128'] || obj.streaming_url?.['mp3-128'];
                        if (url) return { streamUrl: url, duration: obj.duration || 0 };
                    }
                    for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                            const found = findStream(obj[key]);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const directStream = findStream(appData);
                if (directStream && directStream.streamUrl) {
                    console.log('[MobileScraper] Found stream URL directly in page data');
                    return directStream;
                }

                console.log(`[MobileScraper] Fetching track details from API for ID: ${audioTrackId} (Band: ${bandId})`);

                // 3. Fetch track details from mobile API
                const mobileUrl = config.endpoints.mobileTralbumDetailsApi
                    .replace('{band_id}', bandId.toString())
                    .replace('{track_id}', audioTrackId.toString());
                const apiRes = await fetch(mobileUrl, {
                    headers: {
                        'Cookie': cookies,
                        'User-Agent': config.userAgents.mobileApi
                    }
                });

                const rawBody = await apiRes.text();

                if (!apiRes.ok) {
                    console.error(`[MobileScraper] API request failed with status ${apiRes.status}:`, rawBody.substring(0, 200));
                    return { streamUrl: '', duration: 0 };
                }

                let trackData;
                try {
                    trackData = JSON.parse(rawBody);
                } catch {
                    console.error('[MobileScraper] Failed to parse API response as JSON. Body starts with:', rawBody.substring(0, 100));
                    return { streamUrl: '', duration: 0 };
                }

                if (trackData && trackData.tracks && trackData.tracks.length > 0) {
                    const track = trackData.tracks[0];
                    const streamUrl = track.streaming_url?.['mp3-128'] || track.streaming_url?.['mp3-v0'];
                    const duration = track.duration || 0;
                    if (streamUrl) {
                        console.log('[MobileScraper] Successfully found stream URL via API');
                        return { streamUrl, duration };
                    }
                }
                console.error('[MobileScraper] No valid tracks or stream URLs found in API response');
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
