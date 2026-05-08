import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollectionView } from './CollectionView';
import { useStore } from '../../store/store';

// Mock the store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

// Mock hooks
vi.mock('../../hooks/useIntersectionObserver', () => ({
    useIntersectionObserver: vi.fn().mockReturnValue({ current: null }),
}));

// Mock components
vi.mock('./AlbumCard', () => ({
    AlbumCard: ({ album }: any) => <div data-testid="album-card">{album.title}</div>,
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Search: ({ className }: any) => <span data-testid="icon-search" className={className} />,
    X: ({ className }: any) => <span data-testid="icon-x" className={className} />,
    RefreshCw: ({ className }: any) => <span data-testid="icon-refresh" className={className} />,
    ArrowUpDown: ({ className }: any) => <span data-testid="icon-sort" className={className} />,
    List: () => <span />,
    SkipForward: () => <span />,
    Play: () => <span />,
    Music: () => <span />,
    MoreHorizontal: () => <span />,
    Download: () => <span />,
    WifiOff: () => <span />,
    SlidersHorizontal: () => <span />,
    Check: () => <span />,
    Disc: () => <span />,
    Heart: () => <span />,
}));

describe('CollectionView', () => {
    const mockStore = {
        collection: {
            items: [
                {
                    id: 'album-1',
                    type: 'album',
                    purchaseDate: '2024-03-03T10:00:00.000Z',
                    album: {
                        id: '1',
                        title: 'Zeta Album',
                        artist: 'Beta Artist',
                        artworkUrl: '',
                        bandcampUrl: '',
                        tracks: [],
                        trackCount: 0,
                    },
                },
                {
                    id: 'track-1',
                    type: 'track',
                    purchaseDate: '2024-01-01T10:00:00.000Z',
                    track: {
                        id: '2',
                        title: 'Alpha Track',
                        artist: 'Gamma Artist',
                        album: 'Echo Album',
                        artworkUrl: '',
                        bandcampUrl: '',
                    },
                },
                {
                    id: 'album-2',
                    type: 'album',
                    purchaseDate: '2024-02-01T10:00:00.000Z',
                    album: {
                        id: '3',
                        title: 'Beta Album',
                        artist: 'Alpha Artist',
                        artworkUrl: '',
                        bandcampUrl: '',
                        tracks: [],
                        trackCount: 0,
                    },
                },
            ],
            totalCount: 3,
        },
        isLoadingCollection: false,
        collectionError: null,
        fetchCollection: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
        getAlbumDetails: vi.fn(),
        clearQueue: vi.fn(),
        addTracksToQueue: vi.fn(),
        playQueueIndex: vi.fn(),
        addTracksToPlaylist: vi.fn(),
        playlists: [],
        downloadTrack: vi.fn(),
        settings: { offlineMode: false },
        isOnline: true,
        cachedTrackIds: new Set<string>(),
        cachedAlbumIds: new Set<string>(),
        collection_sort_key: 'default',
        collection_sort_direction: 'desc',
        collectionFilterAlbums: true,
        collectionFilterTracks: true,
        collectionFilterWishlist: true,
        setCollectionSortKey: vi.fn(),
        setCollectionSortDirection: vi.fn(),
        setCollectionFilterAlbums: vi.fn(),
        setCollectionFilterTracks: vi.fn(),
        setCollectionFilterWishlist: vi.fn(),
    };

    beforeEach(() => {
        (useStore as any).mockReturnValue(mockStore);
        vi.clearAllMocks();
    });

    it('renders collection items', () => {
        render(<CollectionView />);
        expect(screen.getByText('Collection')).toBeInTheDocument();
        expect(screen.getByText('3 items')).toBeInTheDocument();
        expect(screen.getAllByTestId('album-card')).toHaveLength(3);
        expect(screen.getByText('Zeta Album')).toBeInTheDocument();
        expect(screen.getByText('Alpha Track')).toBeInTheDocument();
    });

    it('shows loading state when collection is empty', () => {
        (useStore as any).mockReturnValue({ ...mockStore, collection: null, isLoadingCollection: true });
        render(<CollectionView />);
        expect(screen.getByText('Loading your collection...')).toBeInTheDocument();
    });

    it('shows non-blocking loading state when refreshing', () => {
        (useStore as any).mockReturnValue({ ...mockStore, isLoadingCollection: true });
        render(<CollectionView />);
        expect(screen.queryByText('Loading your collection...')).not.toBeInTheDocument();
        const refreshBtn = screen.getByTitle('Refresh collection');
        expect(refreshBtn).toBeDisabled();
        const icon = screen.getByTestId('icon-refresh');
        expect(icon.className).toContain('spinning');
    });

    it('shows error state when collection is empty', () => {
        (useStore as any).mockReturnValue({ ...mockStore, collection: null, collectionError: 'Network Error' });
        render(<CollectionView />);
        expect(screen.getByText('Failed to load collection')).toBeInTheDocument();
        expect(screen.getByText('Network Error')).toBeInTheDocument();

        const retryBtn = screen.getByText('Retry');
        fireEvent.click(retryBtn);
        expect(mockStore.fetchCollection).toHaveBeenCalledWith(true);
    });

    it('calls fetchCollection on mount if collection is missing', () => {
        (useStore as any).mockReturnValue({ ...mockStore, collection: null });
        render(<CollectionView />);
        expect(mockStore.fetchCollection).toHaveBeenCalled();
    });

    it('updates search query on input', () => {
        render(<CollectionView />);
        const input = screen.getByPlaceholderText('Search your music...');
        fireEvent.change(input, { target: { value: 'test' } });
        expect(mockStore.setSearchQuery).toHaveBeenCalledWith('test');
    });

    it('clears search when X is clicked', () => {
        (useStore as any).mockReturnValue({ ...mockStore, searchQuery: 'test' });
        render(<CollectionView />);
        const clearBtn = screen.getByTestId('icon-x').parentElement;
        fireEvent.click(clearBtn!);
        expect(mockStore.setSearchQuery).toHaveBeenCalledWith('');
    });

    it('refreshes collection on button click', () => {
        render(<CollectionView />);
        const refreshBtn = screen.getByTitle('Refresh collection');
        fireEvent.click(refreshBtn);
        expect(mockStore.fetchCollection).toHaveBeenCalledWith(true);
    });

    it('shows empty state when no items match search', () => {
        (useStore as any).mockReturnValue({ ...mockStore, searchQuery: 'nothing' });
        render(<CollectionView />);
        expect(screen.getByText(/No results for "nothing"/)).toBeInTheDocument();
    });

    it('sorts mixed items by artist ascending', () => {
        (useStore as any).mockReturnValue({
            ...mockStore,
            collection_sort_key: 'artist',
            collection_sort_direction: 'asc',
        });
        render(<CollectionView />);

        const orderedTitles = screen
            .getAllByTestId('album-card')
            .map((element) => element.textContent);
        expect(orderedTitles).toEqual(['Beta Album', 'Zeta Album', 'Alpha Track']);
    });


    it('sorts by purchase date newest first (default)', () => {
        (useStore as any).mockReturnValue({
            ...mockStore,
            collection_sort_key: 'default',
            collection_sort_direction: 'desc',
        });
        render(<CollectionView />);

        const orderedTitles = screen
            .getAllByTestId('album-card')
            .map((element) => element.textContent);
        // Newest (Zeta 03-03), Middle (Beta 02-01), Oldest (Alpha 01-01)
        expect(orderedTitles).toEqual(['Zeta Album', 'Beta Album', 'Alpha Track']);
    });

    it('sorts by purchase date oldest first when direction is ascending', () => {
        (useStore as any).mockReturnValue({
            ...mockStore,
            collection_sort_key: 'default',
            collection_sort_direction: 'asc',
        });
        render(<CollectionView />);

        const orderedTitles = screen
            .getAllByTestId('album-card')
            .map((element) => element.textContent);
        // Oldest (Alpha 01-01), Middle (Beta 02-01), Newest (Zeta 03-03)
        expect(orderedTitles).toEqual(['Alpha Track', 'Beta Album', 'Zeta Album']);
    });

    it('calls setCollectionSortKey when a sort option is selected', () => {
        render(<CollectionView />);
        // Open sort dropdown
        fireEvent.click(screen.getByTitle('Sort collection'));
        // Click Artist Name option
        fireEvent.click(screen.getByText('Artist Name'));
        expect(mockStore.setCollectionSortKey).toHaveBeenCalledWith('artist');
    });

    it('toggles sort direction when a direction option is selected in the dropdown', () => {
        (useStore as any).mockReturnValue({
            ...mockStore,
            collection_sort_key: 'artist',
            collection_sort_direction: 'asc',
        });
        render(<CollectionView />);
        // Open sort dropdown
        fireEvent.click(screen.getByTitle('Sort collection'));
        // Click Descending option
        fireEvent.click(screen.getByText('Descending (Z-A)'));
        expect(mockStore.setCollectionSortDirection).toHaveBeenCalledWith('desc');
    });

    it('deduplicates album entries and keeps the latest purchase copy', () => {
        const duplicatedStore = {
            ...mockStore,
            collection: {
                items: [
                    {
                        id: 'old-purchase',
                        type: 'album',
                        purchaseDate: '2024-01-01T10:00:00.000Z',
                        album: {
                            id: 'dup-album-id',
                            title: 'Duplicate Album',
                            artist: 'Same Artist',
                            artworkUrl: '',
                            bandcampUrl: '',
                            tracks: [],
                            trackCount: 8,
                        },
                    },
                    {
                        id: 'new-purchase',
                        type: 'album',
                        purchaseDate: '2024-04-01T10:00:00.000Z',
                        album: {
                            id: 'dup-album-id',
                            title: 'Duplicate Album',
                            artist: 'Same Artist',
                            artworkUrl: '',
                            bandcampUrl: '',
                            tracks: [],
                            trackCount: 8,
                        },
                    },
                    {
                        id: 'track-unique',
                        type: 'track',
                        purchaseDate: '2024-03-01T10:00:00.000Z',
                        track: {
                            id: 'track-unique',
                            title: 'Unique Track',
                            artist: 'Track Artist',
                            album: 'Track Album',
                            artworkUrl: '',
                            bandcampUrl: '',
                        },
                    },
                ],
                totalCount: 3,
            },
        };

        (useStore as any).mockReturnValue({
            ...duplicatedStore,
            settings: { ...mockStore.settings, deduplicateCollection: true },
        });
        render(<CollectionView />);

        expect(screen.getByText('2 items')).toBeInTheDocument();
        const renderedTitles = screen.getAllByTestId('album-card').map((el) => el.textContent);
        // With desc (newest first): new-purchase (Apr) before Unique Track (Mar)
        expect(renderedTitles).toEqual(['Duplicate Album', 'Unique Track']);
    });

    it('deduplicates albums with different ids when artist and title match', () => {
        const duplicatedMetaStore = {
            ...mockStore,
            collection: {
                items: [
                    {
                        id: 'album-copy-1',
                        type: 'album',
                        purchaseDate: '2024-02-01T10:00:00.000Z',
                        album: {
                            id: 'id-111',
                            title: 'Disco Inferno',
                            artist: 'Baaba',
                            artworkUrl: '',
                            bandcampUrl: 'https://baaba.bandcamp.com/album/disco-inferno',
                            tracks: [],
                            trackCount: 9,
                        },
                    },
                    {
                        id: 'album-copy-2',
                        type: 'album',
                        purchaseDate: '2024-05-01T10:00:00.000Z',
                        album: {
                            id: 'id-222',
                            title: 'Disco Inferno',
                            artist: 'Baaba',
                            artworkUrl: '',
                            bandcampUrl: 'https://baaba.bandcamp.com/album/disco-inferno?from=discog',
                            tracks: [],
                            trackCount: 9,
                        },
                    },
                ],
                totalCount: 2,
            },
        };

        (useStore as any).mockReturnValue({
            ...duplicatedMetaStore,
            settings: { ...mockStore.settings, deduplicateCollection: true },
        });
        render(<CollectionView />);

        expect(screen.getByText('1 item')).toBeInTheDocument();
        expect(screen.getAllByTestId('album-card')).toHaveLength(1);
        expect(screen.getByText('Disco Inferno')).toBeInTheDocument();
    });
});
