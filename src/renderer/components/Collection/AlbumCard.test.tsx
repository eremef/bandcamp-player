import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbumCard } from './AlbumCard';
import '@testing-library/jest-dom'; // Fix toBeInTheDocument

// Mock store
const { mockUseStore, mockPlay } = vi.hoisted(() => {
    const mockPlay = vi.fn();
    const mockUseStore = vi.fn();
    (mockUseStore as any).getState = vi.fn().mockReturnValue({ play: mockPlay });
    return { mockUseStore, mockPlay };
});

vi.mock('../../store/store', () => ({
    useStore: mockUseStore
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
        vi.clearAllMocks();
        mockUseStore.mockReturnValue({
            getAlbumDetails: vi.fn(),
            addAlbumToQueue: vi.fn(),
            playlists: mockPlaylists,
            addTracksToPlaylist: vi.fn(),
            downloadTrack: vi.fn(),
            clearQueue: vi.fn(),
            playQueueIndex: vi.fn(),
            selectAlbum: vi.fn()
        });
        (mockUseStore as any).getState.mockReturnValue({ play: mockPlay });
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

    it('opens album details when clicked if it has multiple tracks', () => {
        const multiTrackAlbum = { ...mockAlbum, trackCount: 5, tracks: [{}, {}, {}, {}, {}] } as any;
        const { selectAlbum } = mockUseStore();
        
        render(<AlbumCard album={multiTrackAlbum} />);
        
        const card = screen.getByText('Test Album').closest('div')?.parentElement;
        fireEvent.click(card!);
        
        expect(selectAlbum).toHaveBeenCalledWith(multiTrackAlbum);
    });

    it('plays immediately when clicked if it has only one track', async () => {
        const singleTrackAlbum = { ...mockAlbum, trackCount: 1, tracks: [{ streamUrl: 'url', id: 't1' }] } as any;
        
        render(<AlbumCard album={singleTrackAlbum} />);
        
        const card = screen.getByText('Test Album').closest('div')?.parentElement;
        fireEvent.click(card!);
        
        // Wait for async play logic
        await vi.waitFor(() => {
            expect(mockPlay).toHaveBeenCalledWith(singleTrackAlbum.tracks[0]);
        });
    });
});
