import { CollectionItem, SortKey, SortDirection } from '../types';

/**
 * Normalizes text for deduplication and sorting comparison by removing accents,
 * special characters, and extra whitespace.
 */
export function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extracts a normalized host and path from a Bandcamp URL for consistent comparison.
 */
export function getBandcampPath(url: string | undefined): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
    } catch {
        // Fallback for relative or malformed URLs
        return url.replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
    }
}

/**
 * Parses the purchase date of a collection item into a numeric timestamp.
 * Falls back to extracting a timestamp from the item's token if available.
 */
export function getSortDate(item: CollectionItem): number {
    if (item.purchaseDate) {
        const ts = Date.parse(item.purchaseDate);
        if (!isNaN(ts)) return ts;
    }
    
    // Fallback to token timestamp
    if (item.token) {
        const parts = item.token.split('::');
        const tokenTs = parseInt(parts[0], 10);
        // Valid Unix timestamp check (roughly after 2010)
        if (!isNaN(tokenTs) && tokenTs > 1262304000) {
            // Check if it's already in ms or in seconds
            return tokenTs > 10000000000 ? tokenTs : tokenTs * 1000;
        }
    }
    
    return 0; // Unknown/Oldest
}

// --- Deduplication ---

/**
 * Generates a unique key for deduplicating albums based on metadata, URL, or ID.
 */
export function getAlbumDedupeKey(item: CollectionItem): string | null {
    if (item.type !== 'album' || !item.album) {
        return null;
    }

    const artist = normalizeText(item.album.artist);
    const title = normalizeText(item.album.title);
    if (artist && title) {
        return `album-meta:${artist}::${title}`;
    }

    const bandcampPath = getBandcampPath(item.album.bandcampUrl);
    if (bandcampPath) {
        return `album-url:${bandcampPath}`;
    }

    if (item.album.id) {
        return `album-id:${item.album.id}`;
    }

    return null;
}

/**
 * Compares two duplicates and returns the one that is "better" (e.g. owned, has date, or newer index).
 */
export function choosePreferredDuplicate(current: CollectionItem, next: CollectionItem): CollectionItem {
    // 1. Prefer owned items over wishlist items
    if (current.isWishlist !== next.isWishlist) {
        return current.isWishlist ? next : current;
    }

    // 2. Prefer items with actual purchase dates over items without them
    if (current.purchaseDate && !next.purchaseDate) return current;
    if (!current.purchaseDate && next.purchaseDate) return next;

    // 3. Prefer items with tokens (usually API versions with better metadata)
    if (current.token && !next.token) return current;
    if (!current.token && next.token) return next;

    // 4. Use index as proxy for purchase date (smaller index is newer in Bandcamp's list)
    if (current.index !== undefined && next.index !== undefined) {
        if (current.index !== next.index) {
            return next.index < current.index ? next : current;
        }
    }

    // 5. If dates exist and are different, prefer the newer one
    const currentDate = current.purchaseDate ? Date.parse(current.purchaseDate) : 0;
    const nextDate = next.purchaseDate ? Date.parse(next.purchaseDate) : 0;
    
    if (!isNaN(currentDate) && !isNaN(nextDate) && currentDate !== nextDate) {
        return nextDate > currentDate ? next : current;
    }

    // 6. Tie-break with track count
    const currentScore = (current.album?.trackCount ?? 0);
    const nextScore = (next.album?.trackCount ?? 0);
    
    return nextScore > currentScore ? next : current;
}

/**
 * Removes duplicate albums from a list of collection items while preserving wishlist status.
 * Position-stable: The first appearance of an album determines its position in the list.
 */
export function dedupeCollectionItems(items: CollectionItem[]): CollectionItem[] {
    const preferredByKey = new Map<string, CollectionItem>();
    const firstAppearance = new Map<string, number>();

    // Pass 1: Find preferred versions and record first appearances
    items.forEach((item, idx) => {
        const key = getAlbumDedupeKey(item);
        if (!key) return;

        if (!firstAppearance.has(key)) {
            firstAppearance.set(key, idx);
        }

        const existing = preferredByKey.get(key);
        if (!existing) {
            preferredByKey.set(key, item);
        } else {
            const preferred = choosePreferredDuplicate(existing, item);
            
            // Ensure ownership is correctly merged: if ANY version is owned, the final is owned
            const finalIsWishlist = existing.isWishlist && item.isWishlist;
            
            if (preferred.isWishlist !== finalIsWishlist) {
                preferredByKey.set(key, { ...preferred, isWishlist: finalIsWishlist });
            } else {
                preferredByKey.set(key, preferred);
            }
        }
    });

    // Pass 2: Reconstruct list in original order
    const result: CollectionItem[] = [];
    const processedKeys = new Set<string>();

    items.forEach((item) => {
        const key = getAlbumDedupeKey(item);
        if (!key) {
            result.push(item);
            return;
        }

        if (!processedKeys.has(key)) {
            result.push(preferredByKey.get(key)!);
            processedKeys.add(key);
        }
    });

    return result;
}

// --- Sorting ---

/**
 * Map of comparators for different sort keys.
 * Standardized direction: 'asc' means Oldest/A/0 first, 'desc' means Newest/Z/Infinity first.
 * The sortCollectionItems function will flip these based on the requested direction.
 */
const comparators: Record<SortKey, (a: CollectionItem, b: CollectionItem) => number> = {
    artist: (a, b) => {
        const artistA = (a.type === 'album' ? a.album?.artist : a.track?.artist) || '';
        const artistB = (b.type === 'album' ? b.album?.artist : b.track?.artist) || '';
        const res = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
        
        if (res !== 0) return res;
        
        // Tie-break: Newest first (using index)
        if (a.index !== undefined && b.index !== undefined) {
            return a.index - b.index;
        }

        const dateA = getSortDate(a);
        const dateB = getSortDate(b);
        return dateB - dateA;
    },
    album: (a, b) => {
        const titleA = (a.type === 'album' ? a.album?.title : a.track?.title) || '';
        const titleB = (b.type === 'album' ? b.album?.title : b.track?.title) || '';
        const res = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
        
        if (res !== 0) return res;
        
        // Tie-break: Artist
        const artistA = (a.type === 'album' ? a.album?.artist : a.track?.artist) || '';
        const artistB = (b.type === 'album' ? b.album?.artist : b.track?.artist) || '';
        return artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
    },
    default: (a, b) => {
        const dateA = getSortDate(a);
        const dateB = getSortDate(b);

        // asc baseline: oldest first
        if (dateA !== dateB) return dateA - dateB;

        // Real purchase dates before token-only fallbacks
        const hasRealDateA = !!a.purchaseDate;
        const hasRealDateB = !!b.purchaseDate;
        if (hasRealDateA !== hasRealDateB) {
            return hasRealDateA ? -1 : 1;
        }

        // Original sequence index (smaller = newer in Bandcamp API)
        if (a.index !== undefined && b.index !== undefined) {
            if (a.index !== b.index) return b.index - a.index;
        }

        return a.id.localeCompare(b.id);
    },
};

/**
 * Sorts collection items based on a key and direction.
 */
export function sortCollectionItems(
    items: CollectionItem[],
    key: SortKey,
    direction: SortDirection,
    deduplicate = false
): CollectionItem[] {
    let processedItems = [...items];
    
    if (deduplicate) {
        processedItems = dedupeCollectionItems(processedItems);
    }

    const comparator = comparators[key] || comparators.default;

    if (key === 'default') {
        // Ownership grouping is direction-independent: owned always before wishlist.
        // Sort each group separately so negating direction doesn't flip ownership.
        const owned = processedItems.filter(i => !i.isWishlist);
        const wishlist = processedItems.filter(i => i.isWishlist);
        const sortGroup = (group: CollectionItem[]) =>
            group.sort((a, b) => {
                const res = comparator(a, b);
                return direction === 'asc' ? res : -res;
            });
        return [...sortGroup(owned), ...sortGroup(wishlist)];
    }

    return processedItems.sort((a, b) => {
        const res = comparator(a, b);
        return direction === 'asc' ? res : -res;
    });
}
