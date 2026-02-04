import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistDetailView } from './PlaylistDetailView';
import '@testing-library/jest-dom';

// Mock store
const mockUseStore = vi.fn();
vi.mock('../../store/store', () => ({
    useStore: () => mockUseStore()
}));

// Mock window.prompt if it doesn't exist in the test environment
if (typeof window.prompt === 'undefined') {
    window.prompt = vi.fn();
}

describe('PlaylistDetailView', () => {
    const mockPlaylist = {
        id: 'p1',
        name: 'Test Playlist',
        description: 'Test Description',
        artworkUrl: 'test.jpg',
        tracks: [
            { id: 't1', title: 'Track 1', duration: 120, artist: 'Artist 1', streamUrl: 'http://stream/1' },
            { id: 't2', title: 'Track 2', duration: 180, artist: 'Artist 2', streamUrl: 'http://stream/2' }
        ],
        trackCount: 2,
        totalDuration: 300
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseStore.mockReturnValue({
            selectedPlaylist: mockPlaylist,
            setView: vi.fn(),
            play: vi.fn(),
            addToQueue: vi.fn(),
            removeTrackFromPlaylist: vi.fn(),
            updatePlaylist: vi.fn(),
            clearQueue: vi.fn(),
            addTracksToQueue: vi.fn(),
            playQueueIndex: vi.fn(),
        });
    });

    it('renders playlist details and tracks', () => {
        render(<PlaylistDetailView />);

        expect(screen.getByText('Test Playlist')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
        expect(screen.getByText('Track 1')).toBeInTheDocument();
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
        expect(screen.getByText('Track 2')).toBeInTheDocument();
        expect(screen.getByText('Artist 2')).toBeInTheDocument();
        expect(screen.getByText(/2\s+tracks/)).toBeInTheDocument();
    });

    it('plays all tracks when Play All button is clicked', async () => {
        const clearQueue = vi.fn();
        const addTracksToQueue = vi.fn();
        const playQueueIndex = vi.fn();
        
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            clearQueue,
            addTracksToQueue,
            playQueueIndex
        });
        
        render(<PlaylistDetailView />);

        const playBtn = screen.getByText('Play All');
        fireEvent.click(playBtn.closest('button')!);

        await waitFor(() => {
            expect(clearQueue).toHaveBeenCalled();
            expect(addTracksToQueue).toHaveBeenCalledWith(mockPlaylist.tracks);
            expect(playQueueIndex).toHaveBeenCalledWith(0);
        });
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
        
        render(<PlaylistDetailView />);
        
        const trackPlayBtns = screen.getAllByTestId('play-track-btn');
        fireEvent.click(trackPlayBtns[1]); // Play track 2

        await waitFor(() => {
            expect(clearQueue).toHaveBeenCalled();
            expect(addTracksToQueue).toHaveBeenCalledWith(mockPlaylist.tracks);
            expect(playQueueIndex).toHaveBeenCalledWith(1);
        });
    });

    it('calls removeTrackFromPlaylist when trash icon is clicked', () => {
        const removeTrackFromPlaylist = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            removeTrackFromPlaylist
        });
        
        render(<PlaylistDetailView />);

        const removeBtns = screen.getAllByTitle('Remove from playlist');
        fireEvent.click(removeBtns[0]);

        expect(removeTrackFromPlaylist).toHaveBeenCalledWith('p1', 't1');
    });

    it('calls updatePlaylist when Rename button is clicked', () => {
        const updatePlaylist = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            updatePlaylist
        });
        
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New Name');
        
        render(<PlaylistDetailView />);

        const renameBtn = screen.getByText('Rename');
        fireEvent.click(renameBtn.closest('button')!);

        expect(promptSpy).toHaveBeenCalled();
        expect(updatePlaylist).toHaveBeenCalledWith('p1', 'New Name');
    });

    it('shows empty state when no playlist is selected', () => {
        mockUseStore.mockReturnValue({
            selectedPlaylist: null,
            setView: vi.fn()
        });

        render(<PlaylistDetailView />);
        expect(screen.getByText('Playlist not found')).toBeInTheDocument();
    });
});