import { describe, it, expect } from 'vitest';
import { dedupeCollectionItems } from './dedupe';
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

  it('should preserve wishlist flag from duplicates', () => {
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
    expect(result[0].isWishlist).toBe(true);
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
