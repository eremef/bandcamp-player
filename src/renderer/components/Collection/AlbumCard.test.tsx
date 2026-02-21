import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbumCard } from './AlbumCard';
import '@testing-library/jest-dom';

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
        trackCount: 0
    };

    const mockPlaylists = [
        { id: 'p1', name: 'My Playlist' }
    ];

    let storeMethods: any;

    beforeEach(() => {
        vi.clearAllMocks();
        storeMethods = {
            getAlbumDetails: vi.fn(),
            addAlbumToQueue: vi.fn(),
            playlists: mockPlaylists,
            addTracksToPlaylist: vi.fn(),
            downloadTrack: vi.fn(),
            clearQueue: vi.fn(),
            playQueueIndex: vi.fn(),
            selectAlbum: vi.fn()
        };
        mockUseStore.mockReturnValue(storeMethods);
        (mockUseStore as any).getState.mockReturnValue({ play: mockPlay });
    });

    it('shows context menu on right click and hides it on mouse leave', () => {
        render(<AlbumCard album={mockAlbum} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.contextMenu(card);
        expect(screen.getByText('Play Now')).toBeInTheDocument();

        fireEvent.mouseLeave(card);
        expect(screen.queryByText('Play Now')).not.toBeInTheDocument();
    });

    it('toggles context menu using the menu button', () => {
        render(<AlbumCard album={mockAlbum} />);
        const menuBtn = screen.getByTitle('More options');

        fireEvent.click(menuBtn);
        expect(screen.getByText('Play Now')).toBeInTheDocument();

        fireEvent.click(menuBtn);
        expect(screen.queryByText('Play Now')).not.toBeInTheDocument();
    });

    it('prevents default browser menu on right click', () => {
        render(<AlbumCard album={mockAlbum} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        fireEvent(card, event);
        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('opens album details when card is clicked (multi-track)', () => {
        const multiTrackAlbum = { ...mockAlbum, trackCount: 5 };
        render(<AlbumCard album={multiTrackAlbum} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.click(card);
        expect(storeMethods.selectAlbum).toHaveBeenCalledWith(multiTrackAlbum);
    });

    it('fetches album details when playing an album without tracks', async () => {
        const fullAlbum = { ...mockAlbum, trackCount: 3, tracks: [{ id: 't1', streamUrl: 'url1' }, { id: 't2', streamUrl: 'url2' }] } as any;
        storeMethods.getAlbumDetails.mockResolvedValue(fullAlbum);

        render(<AlbumCard album={mockAlbum} />);
        const playBtn = screen.getByTitle('Play');

        fireEvent.click(playBtn);

        await waitFor(() => {
            expect(storeMethods.getAlbumDetails).toHaveBeenCalledWith(mockAlbum.bandcampUrl);
            expect(storeMethods.clearQueue).toHaveBeenCalledWith(false);
            expect(storeMethods.addAlbumToQueue).toHaveBeenCalledWith(fullAlbum);
            expect(storeMethods.playQueueIndex).toHaveBeenCalledWith(0);
        });
    });

    it('plays immediately when single track card is clicked', async () => {
        const singleTrackAlbum = { ...mockAlbum, trackCount: 1, tracks: [{ id: 't1', streamUrl: 'url' }] } as any;
        render(<AlbumCard album={singleTrackAlbum} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.click(card);

        await waitFor(() => {
            expect(mockPlay).toHaveBeenCalledWith(singleTrackAlbum.tracks[0]);
        });
    });

    it('adds directly to queue via context menu', async () => {
        const albumWithTracks = { ...mockAlbum, trackCount: 2, tracks: [{ streamUrl: 'url1' }, { streamUrl: 'url2' }] } as any;
        render(<AlbumCard album={albumWithTracks} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.contextMenu(card);
        fireEvent.click(screen.getByText('Add to Queue'));

        await waitFor(() => {
            expect(storeMethods.addAlbumToQueue).toHaveBeenCalledWith(albumWithTracks);
        });
    });

    it('adds to playlist via context menu', async () => {
        const albumWithTracks = { ...mockAlbum, trackCount: 1, tracks: [{ streamUrl: 'url' }] } as any;
        render(<AlbumCard album={albumWithTracks} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.contextMenu(card);
        fireEvent.click(screen.getByText('My Playlist'));

        await waitFor(() => {
            expect(storeMethods.addTracksToPlaylist).toHaveBeenCalledWith('p1', albumWithTracks.tracks);
        });
    });

    it('downloads album via context menu', async () => {
        const albumWithTracks = { ...mockAlbum, trackCount: 2, tracks: [{ streamUrl: 'url1' }, { streamUrl: 'url2' }] } as any;
        render(<AlbumCard album={albumWithTracks} />);
        const card = screen.getByText('Test Album').closest('div')?.parentElement as HTMLElement;

        fireEvent.contextMenu(card);
        fireEvent.click(screen.getByText('Download for Offline'));

        await waitFor(() => {
            expect(storeMethods.downloadTrack).toHaveBeenCalledTimes(2);
            expect(storeMethods.downloadTrack).toHaveBeenCalledWith(albumWithTracks.tracks[0]);
            expect(storeMethods.downloadTrack).toHaveBeenCalledWith(albumWithTracks.tracks[1]);
        });
    });

    it('handles getAlbumDetails error gracefully during ensureAlbumTracks', async () => {
        storeMethods.getAlbumDetails.mockRejectedValue(new Error('Network error'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(<AlbumCard album={mockAlbum} />);
        const playBtn = screen.getByTitle('Play');

        fireEvent.click(playBtn);

        await waitFor(() => {
            expect(storeMethods.getAlbumDetails).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Error fetching album details:', expect.any(Error));
        });

        consoleSpy.mockRestore();
    });
});
