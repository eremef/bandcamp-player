import { CollectionItem } from '../../shared/types';

function getSortDate(item: CollectionItem): number {
  const timestamp = Date.parse(item.purchaseDate);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function normalizeDedupeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getBandcampPath(url: string | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function getAlbumDedupeKey(item: CollectionItem): string | null {
  if (item.type !== 'album' || !item.album) {
    return null;
  }

  const artist = normalizeDedupeText(item.album.artist);
  const title = normalizeDedupeText(item.album.title);
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

export function choosePreferredDuplicate(current: CollectionItem, next: CollectionItem): CollectionItem {
  const currentDate = getSortDate(current);
  const nextDate = getSortDate(next);
  if (nextDate !== currentDate) {
    return nextDate > currentDate ? next : current;
  }

  const currentScore =
    (current.album?.trackCount ?? 0) + (current.token ? 1 : 0);
  const nextScore = (next.album?.trackCount ?? 0) + (next.token ? 1 : 0);
  return nextScore > currentScore ? next : current;
}

export function dedupeCollectionItems(items: CollectionItem[]): CollectionItem[] {
  const preferredByKey = new Map<string, CollectionItem>();

  for (const item of items) {
    const key = getAlbumDedupeKey(item);
    if (!key) {
      continue;
    }

    const existing = preferredByKey.get(key);
    if (!existing) {
      preferredByKey.set(key, item);
      continue;
    }

    const preferred = choosePreferredDuplicate(existing, item);
    // Preserve the wishlist flag if either duplicate is in the wishlist
    if (existing.isWishlist || item.isWishlist) {
      preferred.isWishlist = true;
    }
    preferredByKey.set(key, preferred);
  }

  return items.filter((item) => {
    const key = getAlbumDedupeKey(item);
    if (!key) {
      return true;
    }

    return preferredByKey.get(key) === item;
  });
}
