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
            fetchPlaylists: vi.fn()
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
});
