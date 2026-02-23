import { sha256 } from 'js-sha256';

export interface RemoteConfig {
    version: string;
    selectors: {
        collection: {
            itemContainer: string;
            artist: string;
            title: string;
            link: string;
            artwork: string;
            fallbackArtist: string;
            fallbackTitle: string;
        };
        album: {
            artistDOM: string[];
        };
        radio: {
            dataBlobElements: string[];
            scriptRegexes: string[];
        };
    };
    scriptKeys: {
        collection: string[];
        album: string[];
    };
    endpoints: {
        collectionItemsApi: string;
        mobileTralbumDetailsApi: string;
        radioListApi: string;
        radioShowWeb: string;
        radioWeeklyWeb: string;
        radioFallbackStream: string;
        artworkFormat: string;
        radioImageFormat: string;
    };
    userAgents: {
        desktop: string;
        mobile: string;
        mobileApi: string;
    };
    cleaning: {
        artistCleanRegex: string;
        artistPrefixCleanRegex: string;
        titleCleanRegex: string;
        dedupeRegex: string;
    };
    scraping: {
        batchSize: number;
        maxBatches: number;
        rateLimitDelay: number;
        rateLimitJitter: number;
    };
    radioData: {
        showIdKeys: string[];
        trackIdKeys: string[];
    };
}

// Fallback baked-in config
let DefaultConfig: any;
try {
    // 1. Try mobile-specific path first if likely in React Native
    // Metro will resolve this relative to the shared file
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DefaultConfig = require('../../mobile/assets/remote-config.json');
} catch {
    try {
        // 2. Desktop production (app root) and Desktop/Mobile dev (project root)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        DefaultConfig = require('../../remote-config.json');
    } catch (e) {
        console.error('[RemoteConfig] Failed to load bundled config from all locations:', e);
        // Minimal emergency fallback
        DefaultConfig = { version: "0.0.0", selectors: { collection: { itemContainer: "" }, album: { artistDOM: [] }, radio: { dataBlobElements: [], scriptRegexes: [] } }, endpoints: { collectionItemsApi: "" }, userAgents: { desktop: "", mobile: "", mobileApi: "" }, cleaning: { artistCleanRegex: "" }, scraping: { batchSize: 100 }, radioData: { showIdKeys: [] } };
    }
}

const CONFIG_URL = 'https://raw.githubusercontent.com/eremef/bandcamp-player/main/remote-config.json';
const HASH_URL = `${CONFIG_URL}.hash`;

export class RemoteConfigService {
    private static instance: RemoteConfigService;
    private config: RemoteConfig = DefaultConfig as RemoteConfig;
    private isFetching = false;
    private lastFetchTime = 0;
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    private constructor() {
        // Automatically fetch on instantiation if not done recently
        this.fetchLatestConfig().catch(e => console.error('[RemoteConfig] Initial fetch failed:', e));
    }

    public static getInstance(): RemoteConfigService {
        if (!RemoteConfigService.instance) {
            RemoteConfigService.instance = new RemoteConfigService();
        }
        return RemoteConfigService.instance;
    }

    public get(): RemoteConfig {
        // Trigger background refresh if stale
        if (Date.now() - this.lastFetchTime > this.CACHE_TTL && !this.isFetching) {
            this.fetchLatestConfig().catch(e => console.warn('[RemoteConfig] Background refresh failed:', e));
        }
        return this.config;
    }

    public async fetchLatestConfig(): Promise<void> {
        if (this.isFetching) return;
        this.isFetching = true;

        try {
            // 1. Fetch the hash and the config in parallel
            const [configRes, hashRes] = await Promise.all([
                fetch(CONFIG_URL, { headers: { 'Cache-Control': 'no-cache' } }),
                fetch(HASH_URL, { headers: { 'Cache-Control': 'no-cache' } })
            ]);

            if (!configRes.ok || !hashRes.ok) {
                console.warn(`[RemoteConfig] Failed to fetch. Config: ${configRes.status}, Hash: ${hashRes.status}`);
                return;
            }

            const configText = (await configRes.text()).replace(/\r\n/g, '\n');
            const expectedHash = (await hashRes.text()).trim();
            const actualHash = sha256(configText);

            // 2. Integrity Check
            if (actualHash !== expectedHash) {
                console.error('[RemoteConfig] Integrity check failed! Potential tampering or sync issue.');
                console.error(`[RemoteConfig] Expected: ${expectedHash}, Actual: ${actualHash}`);
                return;
            }

            // 3. Schema Validation
            const data = JSON.parse(configText);
            if (this.validateSchema(data)) {
                console.log(`[RemoteConfig] Verified and loaded remote config v${data.version}`);
                this.config = data;
                this.lastFetchTime = Date.now();
            } else {
                console.error('[RemoteConfig] Remote config schema validation failed. Using fallback.');
            }
        } catch (error) {
            console.warn('[RemoteConfig] Error fetching remote config:', error);
        } finally {
            this.isFetching = false;
        }
    }

    private validateSchema(data: any): data is RemoteConfig {
        // Basic schema validation to prevent injection or crashes
        try {
            if (!data.version || typeof data.version !== 'string') return false;
            if (!data.selectors || !data.selectors.collection || !data.selectors.album || !data.selectors.radio) return false;
            if (!data.scriptKeys || !data.scriptKeys.collection || !data.scriptKeys.album) return false;
            if (!data.endpoints || !data.endpoints.collectionItemsApi) return false;
            if (!data.userAgents || !data.userAgents.desktop || !data.userAgents.mobile) return false;
            if (!data.cleaning || !data.cleaning.artistCleanRegex) return false;
            if (!data.scraping || typeof data.scraping.batchSize !== 'number') return false;
            if (!data.radioData || !Array.isArray(data.radioData.showIdKeys)) return false;

            return true;
        } catch {
            return false;
        }
    }
}

export const remoteConfigService = RemoteConfigService.getInstance();
