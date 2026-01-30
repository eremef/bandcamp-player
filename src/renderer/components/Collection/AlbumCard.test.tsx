import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbumCard } from './AlbumCard';
import '@testing-library/jest-dom'; // Fix toBeInTheDocument

// Mock store
const mockUseStore = vi.fn();
vi.mock('../../store/store', () => ({
    useStore: () => mockUseStore()
}));

describe('AlbumCard', () => {
    const mockAlbum = {
        id: '1',
        title: 'Test Album',
        artist: 'Test Artist',
        artworkUrl: 'test.jpg',
        bandcampUrl: 'https://test.bandcamp.com/album/test',
        tracks: [],
        trackCount: 0 // Added missing property
    };

    const mockPlaylists = [
        { id: 'p1', name: 'My Playlist' }
    ];

    beforeEach(() => {
        mockUseStore.mockReturnValue({
            getAlbumDetails: vi.fn(),
            addAlbumToQueue: vi.fn(),
            playlists: mockPlaylists,
            addTracksToPlaylist: vi.fn(),
            downloadTrack: vi.fn(),
            clearQueue: vi.fn(),
            playQueueIndex: vi.fn()
        });
    });

    it('shows menu on right click', () => {
        render(<AlbumCard album={mockAlbum} />);

        const card = screen.getByText('Test Album').closest('div')?.parentElement;
        expect(card).toBeInTheDocument();

        // Right click (contextmenu)
        fireEvent.contextMenu(card!);

        // Check for menu items
        expect(screen.getByText('Play Now')).toBeInTheDocument();
        expect(screen.getByText('Add to Queue')).toBeInTheDocument();
    });

    it('prevents default browser menu on right click', () => {
        render(<AlbumCard album={mockAlbum} />);

        const card = screen.getByText('Test Album').closest('div')?.parentElement;

        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        fireEvent(card!, event);

        expect(preventDefaultSpy).toHaveBeenCalled();
    });
});
