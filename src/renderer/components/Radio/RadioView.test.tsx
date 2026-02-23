import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RadioView } from './RadioView';
import '@testing-library/jest-dom';

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock store
const mockUseStore = vi.fn();
vi.mock('../../store/store', () => ({
    useStore: () => mockUseStore()
}));

describe('RadioView', () => {
    const mockStations = [
        {
            id: 'station-1',
            name: 'Test Station',
            description: 'A test station',
            imageUrl: 'test.jpg'
        }
    ];

    const mockPlaylists = [
        { id: 'p1', name: 'My Playlist' }
    ];

    beforeEach(() => {
        mockUseStore.mockReturnValue({
            radioStations: mockStations,
            fetchRadioStations: vi.fn(),
            playRadioStation: vi.fn(),
            radioState: { isActive: false },
            stopRadio: vi.fn(),
            addRadioToQueue: vi.fn(),
            addRadioToPlaylist: vi.fn(),
            playlists: mockPlaylists,
            fetchPlaylists: vi.fn(),
            radioSearchQuery: '',
            setRadioSearchQuery: vi.fn()
        });
    });

    it('renders the menu button on station cards', () => {
        render(<RadioView />);

        const menuButton = screen.getByTitle('More options');
        expect(menuButton).toBeInTheDocument();
    });

    it('opens context menu when menu button is clicked', () => {
        render(<RadioView />);

        const menuButton = screen.getByTitle('More options');
        fireEvent.click(menuButton);

        expect(screen.getByText('Play Now')).toBeInTheDocument();
        expect(screen.getByText('Play Next')).toBeInTheDocument();
        expect(screen.getByText('Add to Queue')).toBeInTheDocument();
    });

    it('triggers actions from context menu', async () => {
        const mockAddRadioToQueue = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            addRadioToQueue: mockAddRadioToQueue
        });

        render(<RadioView />);

        // Open menu
        const menuButton = screen.getByTitle('More options');
        fireEvent.click(menuButton);

        // Click action
        fireEvent.click(screen.getByText('Add to Queue'));

        expect(mockAddRadioToQueue).toHaveBeenCalledWith(mockStations[0], false);

        // Wait for state update to complete to avoid act warning
        await waitFor(() => {
            expect(screen.queryByText('Add to Queue')).not.toBeInTheDocument();
        });
    });

    it('filters stations based on search query', () => {
        const mockSetRadioSearchQuery = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            radioSearchQuery: 'weekly',
            setRadioSearchQuery: mockSetRadioSearchQuery,
            radioStations: [
                { id: '1', name: 'Bandcamp Weekly', description: 'Curated' },
                { id: '2', name: 'Hip Hop', description: 'Beats' }
            ]
        });

        render(<RadioView />);

        // Should focus on filtered list logic.
        // The implementation uses useMemo to filter radioStations based on radioSearchQuery.
        // Since we mocked radioSearchQuery as 'weekly', it should only show 'Bandcamp Weekly'.
        expect(screen.getByText('Bandcamp Weekly')).toBeInTheDocument();
        expect(screen.queryByText('Hip Hop')).not.toBeInTheDocument();

        // Check search input value
        const searchInput = screen.getByPlaceholderText('Search radio shows...');
        expect(searchInput).toHaveValue('weekly');

        // Test changing search query
        fireEvent.change(searchInput, { target: { value: 'beats' } });
        expect(mockSetRadioSearchQuery).toHaveBeenCalledWith('beats');
    });
});
