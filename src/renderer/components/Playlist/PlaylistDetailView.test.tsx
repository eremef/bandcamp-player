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
        const play = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            play
        });
        
        render(<PlaylistDetailView />);
        
        const trackPlayBtns = screen.getAllByTestId('play-track-btn');
        fireEvent.click(trackPlayBtns[1]); // Play track 2

        expect(play).toHaveBeenCalledWith(mockPlaylist.tracks[1]);
    });

    it('calls removeTrackFromPlaylist when Remove from Playlist is clicked', async () => {
        const removeTrackFromPlaylist = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            removeTrackFromPlaylist
        });
        
        render(<PlaylistDetailView />);

        // Open context menu first
        const menuBtns = screen.getAllByRole('button').filter(btn => 
            btn.className.includes('menuBtn')
        );
        fireEvent.click(menuBtns[0]);

        const removeBtn = await screen.findByText('Remove from Playlist');
        fireEvent.click(removeBtn);

        expect(removeTrackFromPlaylist).toHaveBeenCalledWith('p1', 't1');
    });

    it('calls updatePlaylist when inline rename is submitted', async () => {
        const updatePlaylist = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            updatePlaylist
        });
        
        render(<PlaylistDetailView />);

        const renameBtn = screen.getByText('Rename');
        fireEvent.click(renameBtn.closest('button')!);

        // Title should be replaced by an input
        const input = screen.getByDisplayValue('Test Playlist');
        fireEvent.change(input, { target: { value: 'New Name' } });
        
        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

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