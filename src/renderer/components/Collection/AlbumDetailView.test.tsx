import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbumDetailView } from './AlbumDetailView';
import '@testing-library/jest-dom';

// Mock store
const mockUseStore = vi.fn();
vi.mock('../../store/store', () => ({
    useStore: () => mockUseStore()
}));

describe('AlbumDetailView', () => {
    const mockAlbum = {
        id: 'a1',
        title: 'Test Album',
        artist: 'Test Artist',
        artworkUrl: 'test.jpg',
        bandcampUrl: 'https://test.bandcamp.com/album/test',
        tracks: [
            { id: 't1', title: 'Track 1', duration: 120, artist: 'Test Artist', streamUrl: 'http://stream/1' },
            { id: 't2', title: 'Track 2', duration: 180, artist: 'Test Artist', streamUrl: 'http://stream/2' }
        ],
        trackCount: 2
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseStore.mockReturnValue({
            selectedAlbum: mockAlbum,
            setView: vi.fn(),
            play: vi.fn(),
            addAlbumToQueue: vi.fn(),
            addTracksToQueue: vi.fn(),
            clearQueue: vi.fn(),
            playQueueIndex: vi.fn(),
            getAlbumDetails: vi.fn().mockResolvedValue(mockAlbum),
            playlists: []
        });
    });

    it('renders album details and tracks', async () => {
        render(<AlbumDetailView />);

        expect(screen.getByText('Test Album')).toBeInTheDocument();
        expect(screen.getByText('Test Artist')).toBeInTheDocument();
        
        await waitFor(() => {
            expect(screen.getByText('Track 1')).toBeInTheDocument();
            expect(screen.getByText('Track 2')).toBeInTheDocument();
        });
        
        expect(screen.getByText(/2\s+tracks/)).toBeInTheDocument();
    });

    it('calls setView when back button is clicked', async () => {
        const setView = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            setView
        });
        render(<AlbumDetailView />);

        const backBtn = screen.getByText('Back').closest('button');
        fireEvent.click(backBtn!);

        expect(setView).toHaveBeenCalledWith('collection');
    });

    it('plays all tracks when Play button is clicked', async () => {
        const clearQueue = vi.fn();
        const addTracksToQueue = vi.fn();
        const playQueueIndex = vi.fn();
        
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            clearQueue,
            addTracksToQueue,
            playQueueIndex
        });
        
        render(<AlbumDetailView />);

        // Wait for tracks to load and button to be enabled
        const playBtn = await screen.findByText('Play');
        fireEvent.click(playBtn.closest('button')!);

        await waitFor(() => {
            expect(clearQueue).toHaveBeenCalled();
            expect(addTracksToQueue).toHaveBeenCalledWith(mockAlbum.tracks);
            expect(playQueueIndex).toHaveBeenCalledWith(0);
        });
    });

    it('adds album to queue when Add to Queue button is clicked', async () => {
        const addAlbumToQueue = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            addAlbumToQueue
        });
        
        render(<AlbumDetailView />);

        const queueBtn = await screen.findByText('Add to Queue');
        fireEvent.click(queueBtn.closest('button')!);

        expect(addAlbumToQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    });

    it('plays individual track when track play button is clicked', async () => {
        const clearQueue = vi.fn();
        const addTracksToQueue = vi.fn();
        const playQueueIndex = vi.fn();
        
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            clearQueue,
            addTracksToQueue,
            playQueueIndex
        });
        
        render(<AlbumDetailView />);

        await waitFor(() => expect(screen.queryByText('Track 1')).toBeInTheDocument());
        
        const trackPlayBtns = screen.getAllByTestId('play-track-btn');
        fireEvent.click(trackPlayBtns[0]);

        await waitFor(() => {
            expect(clearQueue).toHaveBeenCalled();
            expect(addTracksToQueue).toHaveBeenCalledWith(mockAlbum.tracks);
            expect(playQueueIndex).toHaveBeenCalledWith(0);
        });
    });

    it('shows empty state when no album is selected', () => {
        mockUseStore.mockReturnValue({
            selectedAlbum: null,
            setView: vi.fn()
        });

        render(<AlbumDetailView />);
        expect(screen.getByText('Album not found')).toBeInTheDocument();
    });

    it('fetches details if tracks are missing', async () => {
        const albumWithoutTracks = { ...mockAlbum, tracks: [] };
        const { getAlbumDetails } = mockUseStore();
        mockUseStore.mockReturnValue({
            selectedAlbum: albumWithoutTracks,
            setView: vi.fn(),
            getAlbumDetails: getAlbumDetails.mockResolvedValue(mockAlbum)
        });

        render(<AlbumDetailView />);
        
        expect(getAlbumDetails).toHaveBeenCalledWith(albumWithoutTracks.bandcampUrl);
        await waitFor(() => {
            expect(screen.getByText('Track 1')).toBeInTheDocument();
        });
    });
});
