import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaylistsView } from './PlaylistsView';
import { useStore } from '../../store/store';

// Mock the store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Check: () => <span data-testid="icon-check" />,
    X: () => <span data-testid="icon-x" />,
    Plus: () => <span data-testid="icon-plus" />,
    ListMusic: () => <span data-testid="icon-list-music" />,
    Music: () => <span data-testid="icon-music" />,
    Play: () => <span data-testid="icon-play" />,
    Trash2: () => <span data-testid="icon-trash" />,
    Pencil: () => <span data-testid="icon-pencil" />,
}));

describe('PlaylistsView', () => {
    const mockStore = {
        playlists: [
            { id: '1', name: 'Chill', trackCount: 5, totalDuration: 600, artworkUrl: null, description: 'Cool' },
            { id: '2', name: 'Workout', trackCount: 10, totalDuration: 3600, artworkUrl: 'art.jpg' }
        ],
        selectPlaylist: vi.fn(),
        createPlaylist: vi.fn(),
        deletePlaylist: vi.fn(),
        updatePlaylist: vi.fn(),
        playPlaylist: vi.fn(),
    };

    beforeEach(() => {
        (useStore as any).mockReturnValue(mockStore);
        vi.clearAllMocks();
        // Mock window.confirm
        window.confirm = vi.fn().mockReturnValue(true);
    });

    it('renders playlists', () => {
        render(<PlaylistsView />);
        expect(screen.getByText('Playlists')).toBeInTheDocument();
        expect(screen.getByText('2 playlists')).toBeInTheDocument();
        expect(screen.getByText('Chill')).toBeInTheDocument();
        expect(screen.getByText('Workout')).toBeInTheDocument();
        expect(screen.getByText(/5 tracks • 10 min/)).toBeInTheDocument();
        expect(screen.getByText(/10 tracks • 1h 0m/)).toBeInTheDocument();
    });

    it('shows empty state when no playlists', () => {
        (useStore as any).mockReturnValue({ ...mockStore, playlists: [] });
        render(<PlaylistsView />);
        expect(screen.getByText('No playlists yet')).toBeInTheDocument();
    });

    it('opens create form and submits new playlist', () => {
        render(<PlaylistsView />);
        const createBtn = screen.getByText('Create Playlist');
        fireEvent.click(createBtn);

        const input = screen.getByPlaceholderText('Playlist Name');
        fireEvent.change(input, { target: { value: 'New List' } });
        
        const saveBtn = screen.getByTitle('Save');
        fireEvent.click(saveBtn);

        expect(mockStore.createPlaylist).toHaveBeenCalledWith('New List');
    });

    it('cancels creation', () => {
        render(<PlaylistsView />);
        fireEvent.click(screen.getByText('Create Playlist'));
        
        const cancelBtn = screen.getByTitle('Cancel');
        fireEvent.click(cancelBtn);

        expect(screen.queryByPlaceholderText('Playlist Name')).not.toBeInTheDocument();
    });

    it('selects playlist on click', () => {
        render(<PlaylistsView />);
        fireEvent.click(screen.getByText('Chill'));
        expect(mockStore.selectPlaylist).toHaveBeenCalledWith('1');
    });

    it('calls updatePlaylist when inline rename is submitted', () => {
        render(<PlaylistsView />);
        const renameBtn = screen.getAllByTitle('Rename playlist')[0];
        fireEvent.click(renameBtn);

        const input = screen.getByDisplayValue('Chill');
        fireEvent.change(input, { target: { value: 'Super Chill' } });
        
        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

        expect(mockStore.updatePlaylist).toHaveBeenCalledWith('1', 'Super Chill');
    });

    it('deletes playlist after confirmation', () => {
        render(<PlaylistsView />);
        const deleteBtns = screen.getAllByTitle('Delete playlist');
        fireEvent.click(deleteBtns[0]);

        expect(window.confirm).toHaveBeenCalled();
        expect(mockStore.deletePlaylist).toHaveBeenCalledWith('1');
    });
});
