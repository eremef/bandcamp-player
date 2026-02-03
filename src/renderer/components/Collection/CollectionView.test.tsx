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
    Search: () => <span data-testid="icon-search" />,
    X: () => <span data-testid="icon-x" />,
    RefreshCw: () => <span data-testid="icon-refresh" />,
}));

describe('CollectionView', () => {
    const mockStore = {
        collection: {
            items: [
                {
                    id: '1',
                    type: 'album',
                    album: { id: '1', title: 'Album 1', artist: 'Artist 1', artworkUrl: '', bandcampUrl: '' }
                },
                {
                    id: '2',
                    type: 'track',
                    track: { id: '2', title: 'Track 1', artist: 'Artist 2', artworkUrl: '', bandcampUrl: '' }
                }
            ],
            totalCount: 2
        },
        isLoadingCollection: false,
        collectionError: null,
        fetchCollection: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
    };

    beforeEach(() => {
        (useStore as any).mockReturnValue(mockStore);
        vi.clearAllMocks();
    });

    it('renders collection items', () => {
        render(<CollectionView />);
        expect(screen.getByText('Your Collection')).toBeInTheDocument();
        expect(screen.getByText('2 albums & tracks')).toBeInTheDocument();
        expect(screen.getAllByTestId('album-card')).toHaveLength(2);
        expect(screen.getByText('Album 1')).toBeInTheDocument();
        expect(screen.getByText('Track 1')).toBeInTheDocument();
    });

    it('shows loading state', () => {
        (useStore as any).mockReturnValue({ ...mockStore, isLoadingCollection: true });
        render(<CollectionView />);
        expect(screen.getByText('Loading your collection...')).toBeInTheDocument();
    });

    it('shows error state and allows retry', () => {
        (useStore as any).mockReturnValue({ ...mockStore, collectionError: 'Network Error' });
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
        const input = screen.getByPlaceholderText('Search your collection...');
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
        const refreshBtn = screen.getByTitle('Refresh');
        fireEvent.click(refreshBtn);
        expect(mockStore.fetchCollection).toHaveBeenCalledWith(true);
    });

    it('shows empty state when no items match search', () => {
        (useStore as any).mockReturnValue({ ...mockStore, searchQuery: 'nothing' });
        render(<CollectionView />);
        // Wait for filter effect? Since it's inside the component, 
        // and we mocked the store, we need to make sure the mocked store state matches what the component expects.
        // Actually the component does its own filtering.
        // We need to re-render with updated store if we want to test search filtering properly if it was store-driven,
        // but here it is component-local `filteredItems` derived from `collection` and `searchQuery`.
        expect(screen.getByText(/No results for "nothing"/)).toBeInTheDocument();
    });
});
