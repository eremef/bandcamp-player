import { describe, it, expect } from 'vitest';
import { dedupeCollectionItems, sortCollectionItems } from './collection-utils';
import { CollectionItem } from '../../shared/types';

describe('dedupeCollectionItems', () => {
  it('should remove duplicate albums with the same ID', () => {
    const items: Partial<CollectionItem>[] = [
      {
        id: 'item1',
        type: 'album',
        purchaseDate: '2024-01-01',
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      },
      {
        id: 'item2',
        type: 'album',
        purchaseDate: '2024-01-02',
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      }
    ];

    const result = dedupeCollectionItems(items as CollectionItem[]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item2'); // Latest purchase date preferred
  });

  it('should remove duplicate albums with matching artist and title (case-insensitive)', () => {
    const items: Partial<CollectionItem>[] = [
      {
        id: 'item1',
        type: 'album',
        purchaseDate: '2024-01-01',
        album: { id: 'id1', title: 'Great Album', artist: 'Cool Artist', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      },
      {
        id: 'item2',
        type: 'album',
        purchaseDate: '2024-01-02',
        album: { id: 'id2', title: 'great album ', artist: ' COOL artist', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      }
    ];

    const result = dedupeCollectionItems(items as CollectionItem[]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item2');
  });

  it('should preserve unique tracks', () => {
    const items: Partial<CollectionItem>[] = [
      {
        id: 'item1',
        type: 'album',
        purchaseDate: '2024-01-01',
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      },
      {
        id: 'item3',
        type: 'track',
        purchaseDate: '2024-01-03',
        track: { id: 'track1', title: 'Track 1', artist: 'Artist 1', album: 'Album 1', artworkUrl: '', bandcampUrl: '', duration: 1, streamUrl: '', isCached: false }
      }
    ];

    const result = dedupeCollectionItems(items as CollectionItem[]);
    expect(result).toHaveLength(2);
  });

  it('should prefer owned status over wishlist status', () => {
    const items: Partial<CollectionItem>[] = [
      {
        id: 'item1',
        type: 'album',
        purchaseDate: '2024-01-01',
        isWishlist: true,
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      },
      {
        id: 'item2',
        type: 'album',
        purchaseDate: '2024-01-02',
        isWishlist: false,
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 10, artworkUrl: '', bandcampUrl: '' }
      }
    ];

    const result = dedupeCollectionItems(items as CollectionItem[]);
    expect(result).toHaveLength(1);
    expect(result[0].isWishlist).toBe(false); // Owned status preferred
  });

  it('should choose item with more tracks if purchase dates are same', () => {
    const items: Partial<CollectionItem>[] = [
      {
        id: 'item1',
        type: 'album',
        purchaseDate: '2024-01-01',
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 5, artworkUrl: '', bandcampUrl: '' }
      },
      {
        id: 'item2',
        type: 'album',
        purchaseDate: '2024-01-01',
        album: { id: 'album1', title: 'Album 1', artist: 'Artist 1', tracks: [], trackCount: 12, artworkUrl: '', bandcampUrl: '' }
      }
    ];

    const result = dedupeCollectionItems(items as CollectionItem[]);
    expect(result).toHaveLength(1);
    expect(result[0].album?.trackCount).toBe(12);
  });
});

describe('sortCollectionItems', () => {
  const items: Partial<CollectionItem>[] = [
    {
      id: 'z',
      type: 'album',
      purchaseDate: '2024-01-01',
      album: { title: 'Zzz', artist: 'Artist A', id: 'a1', tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: '' }
    },
    {
      id: 'a',
      type: 'album',
      purchaseDate: '2024-01-02',
      album: { title: 'Aaa', artist: 'Artist Z', id: 'a2', tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: '' }
    },
    {
      id: 'm',
      type: 'track',
      purchaseDate: '2024-01-03',
      track: { title: 'Mmm', artist: 'Artist M', album: 'Album M', id: 't1', duration: 1, streamUrl: '', isCached: false, artworkUrl: '', bandcampUrl: '' }
    }
  ];

  it('should sort by default desc (purchase date, newest first)', () => {
    const result = sortCollectionItems(items as CollectionItem[], 'default', 'desc');
    expect(result[0].id).toBe('m'); // 2024-01-03 newest
    expect(result[1].id).toBe('a'); // 2024-01-02
    expect(result[2].id).toBe('z'); // 2024-01-01 oldest
  });

  it('should sort by default asc (purchase date, oldest first)', () => {
    const result = sortCollectionItems(items as CollectionItem[], 'default', 'asc');
    expect(result[0].id).toBe('z'); // 2024-01-01 oldest
    expect(result[1].id).toBe('a'); // 2024-01-02
    expect(result[2].id).toBe('m'); // 2024-01-03 newest
  });

  it('should use index as tie-break for default sort when dates match', () => {
    const indexedItems: Partial<CollectionItem>[] = [
      { id: 'oldest', index: 2, purchaseDate: '2024-01-01' },
      { id: 'newest', index: 0, purchaseDate: '2024-01-01' },
      { id: 'middle', index: 1, purchaseDate: '2024-01-01' }
    ];
    const result = sortCollectionItems(indexedItems as CollectionItem[], 'default', 'asc');
    expect(result[0].id).toBe('oldest');  // index 2
    expect(result[1].id).toBe('middle');  // index 1
    expect(result[2].id).toBe('newest');  // index 0
  });

  it('should always group owned items before wishlist items regardless of date', () => {
    const mixed: Partial<CollectionItem>[] = [
      { id: 'wishlist-new', type: 'album', isWishlist: true, purchaseDate: '2025-01-01',
        album: { id: 'w1', title: 'W', artist: 'A', tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: '' } },
      { id: 'owned-old', type: 'album', isWishlist: false, purchaseDate: '2020-01-01',
        album: { id: 'o1', title: 'O', artist: 'B', tracks: [], trackCount: 1, artworkUrl: '', bandcampUrl: '' } },
    ];
    const result = sortCollectionItems(mixed as CollectionItem[], 'default', 'desc');
    expect(result[0].id).toBe('owned-old');    // owned always first
    expect(result[1].id).toBe('wishlist-new'); // wishlist always last
  });

  it('should sort by artist (A-Z)', () => {
    const result = sortCollectionItems(items as CollectionItem[], 'artist', 'asc');
    expect(result[0].album?.artist).toBe('Artist A');
    expect(result[1].track?.artist).toBe('Artist M');
    expect(result[2].album?.artist).toBe('Artist Z');
  });

  it('should sort by album/title (Z-A)', () => {
    const result = sortCollectionItems(items as CollectionItem[], 'album', 'desc');
    expect(result[0].id).toBe('z'); // Zzz
    expect(result[1].id).toBe('m'); // Mmm
    expect(result[2].id).toBe('a'); // Aaa
  });
});
