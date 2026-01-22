import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import type { Track, Album, Collection, CollectionItem, RadioStation } from '../../shared/types';

// ============================================================================
// Bandcamp Scraper Service
// ============================================================================

export class ScraperService {
    private authService: AuthService;
    private http: AxiosInstance;
    private cachedCollection: Collection | null = null;

    constructor(authService: AuthService) {
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
     * Fetch user's collection (purchased music)
     */
    async fetchCollection(forceRefresh = false): Promise<Collection> {
        if (this.cachedCollection && !forceRefresh) {
            return this.cachedCollection;
        }

        const authState = this.authService.getUser();
        if (!authState.isAuthenticated || !authState.user) {
            throw new Error('User not authenticated');
        }

        const cookies = await this.authService.getSessionCookies();
        const profileUrl = authState.user.profileUrl;

        try {
            // Fetch the collection page
            const response = await this.http.get(profileUrl, {
                headers: { Cookie: cookies },
            });

            const $ = cheerio.load(response.data);
            const items: CollectionItem[] = [];

            // Extract collection data from the page
            // Bandcamp embeds collection data in a script tag
            const pageDataScript = $('script[data-tralbum]').attr('data-tralbum');
            const collectionScript = $('script').filter((_, el) => {
                const text = $(el).html() || '';
                return text.includes('CollectionData') || text.includes('collection_data');
            }).first().html();

            if (collectionScript) {
                // Parse collection data from script
                const collectionMatch = collectionScript.match(/collection_data\s*[:=]\s*(\{[\s\S]*?\})\s*[,;]/);
                if (collectionMatch) {
                    try {
                        const collectionData = JSON.parse(collectionMatch[1]);
                        // Process collection data
                        if (collectionData.items) {
                            for (const item of collectionData.items) {
                                const collectionItem = this.parseCollectionItem(item);
                                if (collectionItem) {
                                    items.push(collectionItem);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing collection data:', e);
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

            // Fetch more items via API if there's pagination
            const totalCount = parseInt($('.collection-count').text().replace(/\D/g, '')) || items.length;

            // If we have fewer items than total, fetch more via the collection API
            if (items.length < totalCount) {
                const moreItems = await this.fetchMoreCollectionItems(authState.user.id, items.length, totalCount, cookies);
                items.push(...moreItems);
            }

            this.cachedCollection = {
                items,
                totalCount: items.length,
                lastUpdated: new Date().toISOString(),
            };

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
        }
    }

    /**
     * Fetch additional collection items via Bandcamp's API
     */
    private async fetchMoreCollectionItems(
        fanId: string,
        offset: number,
        total: number,
        cookies: string
    ): Promise<CollectionItem[]> {
        const items: CollectionItem[] = [];
        const batchSize = 20;
        let currentOffset = offset;

        while (currentOffset < total) {
            try {
                const response = await this.http.post(
                    'https://bandcamp.com/api/fancollection/1/collection_items',
                    {
                        fan_id: fanId,
                        older_than_token: `${Date.now()}:0:a`,
                        count: batchSize,
                    },
                    {
                        headers: {
                            Cookie: cookies,
                            'Content-Type': 'application/json',
                        },
                    }
                );

                console.log(`Fetch more items response status: ${response.status}`);
                if (typeof response.data === 'string' && response.data.startsWith('HTTP/')) {
                    console.error('Received raw HTTP response as data!', response.data.substring(0, 100));
                }

                if (response.data.items) {
                    for (const item of response.data.items) {
                        const collectionItem = this.parseCollectionItem(item);
                        if (collectionItem) {
                            items.push(collectionItem);
                        }
                    }
                }

                currentOffset += batchSize;

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error('Error fetching more collection items:', error);
                break;
            }
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

            if (isAlbum) {
                return {
                    id,
                    type: 'album',
                    album: {
                        id,
                        title: item.album_title || item.item_title,
                        artist: item.band_name,
                        artistId: String(item.band_id),
                        artworkUrl: item.item_art_url || item.art_id ? `https://f4.bcbits.com/img/a${item.art_id}_10.jpg` : '',
                        bandcampUrl: item.item_url || item.bandcamp_url,
                        tracks: [],
                        trackCount: item.num_tracks || 0,
                    },
                    purchaseDate: item.purchased || item.added || new Date().toISOString(),
                };
            } else {
                return {
                    id,
                    type: 'track',
                    track: {
                        id,
                        title: item.item_title || item.track_title,
                        artist: item.band_name,
                        album: item.album_title || '',
                        duration: item.duration || 0,
                        artworkUrl: item.item_art_url || '',
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
            const title = $item.find('.collection-item-title').text().trim();
            const artist = $item.find('.collection-item-artist').text().replace('by ', '').trim();
            const url = $item.find('a.item-link').attr('href') || '';
            const artworkUrl = $item.find('img.collection-item-art').attr('src') || '';
            const id = $item.attr('data-tralbumid') || url.split('/').pop() || String(Date.now());

            return {
                id,
                type: 'album', // Assume album by default
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

            const tracks: Track[] = (tralbumData.trackinfo || []).map((trackInfo: any, index: number) => ({
                id: String(trackInfo.track_id || `${tralbumData.id}-${index}`),
                title: trackInfo.title,
                artist: tralbumData.artist,
                artistId: String(tralbumData.band_id),
                album: tralbumData.current?.title || tralbumData.album_title,
                albumId: String(tralbumData.id),
                duration: trackInfo.duration || 0,
                trackNumber: trackInfo.track_num || index + 1,
                artworkUrl: tralbumData.art_id ? `https://f4.bcbits.com/img/a${tralbumData.art_id}_10.jpg` : '',
                streamUrl: trackInfo.file?.['mp3-128'] || '',
                bandcampUrl: trackInfo.title_link ? `${tralbumData.url}${trackInfo.title_link}` : albumUrl,
                isCached: false,
            }));

            return {
                id: String(tralbumData.id),
                title: tralbumData.current?.title || tralbumData.album_title,
                artist: tralbumData.artist,
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
        $('script').each((_, script) => {
            const content = $(script).html() || '';
            const match = content.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});/);
            if (match) {
                try {
                    // Clean the JSON (handle JS syntax)
                    let jsonStr = match[1]
                        .replace(/'/g, '"')
                        .replace(/(\w+):/g, '"$1":')
                        .replace(/,\s*}/g, '}')
                        .replace(/,\s*]/g, ']');
                    tralbumData = JSON.parse(jsonStr);
                } catch (e) {
                    // Try eval-based approach (safer alternative)
                    try {
                        tralbumData = new Function(`return ${match[1]}`)();
                    } catch (e2) {
                        console.error('Error parsing TralbumData:', e2);
                    }
                }
            }
        });

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
                for (const episode of response.data.results.slice(0, 20)) {
                    stations.push({
                        id: String(episode.show_id || episode.id),
                        name: episode.title || `Bandcamp Weekly ${episode.id}`,
                        description: episode.subtitle || episode.desc,
                        imageUrl: episode.image_id ? `https://f4.bcbits.com/img/${episode.image_id}_16.jpg` : undefined,
                        streamUrl: '', // Will be fetched on demand
                    });
                }
            }

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
    async getStationStreamUrl(showId: string): Promise<string> {
        try {
            console.log(`Fetching stream URL for radio show ${showId}...`);
            // 1. Fetch the show page
            const response = await this.http.get(`https://bandcamp.com/?show=${showId}`);
            const $ = cheerio.load(response.data);

            // 2. Extract data blob from ArchiveApp div
            const dataBlob = $('#ArchiveApp').attr('data-blob');
            if (!dataBlob) {
                console.error('No data-blob found in ArchiveApp div');
                return '';
            }

            try {
                const appData = JSON.parse(dataBlob);
                // Find the show in the shows list
                const show = appData.appData?.shows?.find((s: any) => String(s.showId) === showId);

                if (!show || !show.audioTrackId) {
                    console.error('Show or audioTrackId not found in data blob');
                    return '';
                }

                const audioTrackId = show.audioTrackId;
                console.log(`Found audioTrackId: ${audioTrackId} for show ${showId}`);

                // 3. Fetch track details from mobile API
                // Using band_id=1 as generic system ID often works for radio
                const trackResponse = await this.http.get(`https://bandcamp.com/api/mobile/24/tralbum_details?band_id=1&tralbum_type=t&tralbum_id=${audioTrackId}`);

                if (trackResponse.data && trackResponse.data.tracks && trackResponse.data.tracks.length > 0) {
                    const streamUrl = trackResponse.data.tracks[0].streaming_url?.['mp3-128'];
                    if (streamUrl) {
                        console.log('Successfully retrieved radio stream URL');
                        return streamUrl;
                    }
                }

                console.error('Stream URL not found in API response');
                return '';
            } catch (e) {
                console.error('Error parsing radio page data:', e);
                return '';
            }
        } catch (error) {
            console.error(`Error fetching station stream URL for ${showId}:`, error);
            return '';
        }
    }
}
