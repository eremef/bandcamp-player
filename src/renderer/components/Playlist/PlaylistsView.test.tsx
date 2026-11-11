import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaylistsView } from './PlaylistsView';
import { useStore } from '../../store/store';

// Mock the store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return {
        ...actual,
        Check: () => <span data-testid="icon-check" />,
        X: () => <span data-testid="icon-x" />,
        Plus: () => <span data-testid="icon-plus" />,
        Upload: () => <span data-testid="icon-upload" />,
        Download: () => <span data-testid="icon-download" />,
        ListMusic: () => <span data-testid="icon-list-music" />,
        Music: () => <span data-testid="icon-music" />,
        Play: () => <span data-testid="icon-play" />,
        Trash2: () => <span data-testid="icon-trash" />,
        Pencil: () => <span data-testid="icon-pencil" />,
        RefreshCw: () => <span data-testid="icon-refresh-cw" />,
    };
});

describe('PlaylistsView', () => {
    const mockStore = {
        playlists: [
            { id: '1', name: 'Chill', trackCount: 5, totalDuration: 600, artworkUrl: null, description: 'Cool' },
            { id: '2', name: 'Workout', trackCount: 10, totalDuration: 3600, artworkUrl: 'art.jpg' }
        ],
        bandcampPlaylists: [],
        isLoadingBandcampPlaylists: false,
        loadingBandcampPlaylistId: null,
        fetchBandcampPlaylists: vi.fn(),
        selectPlaylist: vi.fn(),
        createPlaylist: vi.fn(),
        deletePlaylist: vi.fn(),
        updatePlaylist: vi.fn(),
        playPlaylist: vi.fn(),
        playlistsViewMode: 'grid',
        playlistsCoverSize: 'medium',
        setPlaylistsViewMode: vi.fn(),
        setPlaylistsCoverSize: vi.fn(),
        importPlaylist: vi.fn(),
        exportPlaylist: vi.fn(),
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
        expect(screen.getByTestId('icon-music')).toBeInTheDocument();
    });

    it('shows empty state when no playlists', () => {
        (useStore as any).mockReturnValue({ ...mockStore, playlists: [] });
        render(<PlaylistsView />);
        expect(screen.getByText('No playlists yet')).toBeInTheDocument();
        expect(screen.getByTestId('playlists-view-toggle-btn')).toBeInTheDocument();
    });

    it.each([
        ['grid', 'small'],
        ['grid', 'medium'],
        ['grid', 'large'],
        ['list', 'small'],
        ['list', 'medium'],
        ['list', 'large'],
    ] as const)('applies %s/%s to local and Bandcamp playlists', (mode, size) => {
        (useStore as any).mockReturnValue({
            ...mockStore,
            bandcampPlaylists: [
                { id: 'bc-1', name: 'BC List', trackCount: 7, isBandcampPlaylist: true, bandcampUrl: 'https://bandcamp.com/list' },
            ],
            playlistsViewMode: mode,
            playlistsCoverSize: size,
        });

        render(<PlaylistsView />);

        const layouts = screen.getAllByTestId('playlists-layout');
        expect(layouts).toHaveLength(2);
        for (const layout of layouts) {
            expect(layout).toHaveAttribute('data-layout', mode);
            expect(layout).toHaveAttribute('data-size', size);
        }
        expect(screen.getAllByTestId('playlists-card')).toHaveLength(3);
        expect(screen.getByText('Bandcamp Playlists')).toBeInTheDocument();
    });

    it('persists layout and cover size choices through the playlist control', () => {
        render(<PlaylistsView />);

        fireEvent.click(screen.getByTestId('playlists-view-toggle-btn'));
        fireEvent.click(screen.getByTestId('playlists-view-list-btn'));
        expect(mockStore.setPlaylistsViewMode).toHaveBeenCalledWith('list');
        expect(screen.queryByTestId('playlists-view-list-btn')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('playlists-view-toggle-btn'));
        fireEvent.click(screen.getByTestId('playlists-cover-large-btn'));
        expect(mockStore.setPlaylistsCoverSize).toHaveBeenCalledWith('large');
    });

    it('keeps create and rename input values mounted while changing layout', () => {
        const { rerender } = render(<PlaylistsView />);
        fireEvent.click(screen.getByText('Create Playlist'));
        const createInput = screen.getByPlaceholderText('Playlist Name');
        fireEvent.change(createInput, { target: { value: 'Draft name' } });
        fireEvent.click(screen.getByTestId('playlists-view-toggle-btn'));
        fireEvent.click(screen.getByTestId('playlists-view-list-btn'));
        expect(screen.getByPlaceholderText('Playlist Name')).toHaveValue('Draft name');

        fireEvent.click(screen.getByTitle('Cancel'));
        fireEvent.click(screen.getAllByTitle('Rename playlist')[0]);
        const renameInput = screen.getByDisplayValue('Chill');
        fireEvent.change(renameInput, { target: { value: 'Draft rename' } });
        rerender(<PlaylistsView />);
        expect(screen.getByDisplayValue('Draft rename')).toBeInTheDocument();
    });

    it('does not let delayed input focus dismiss the layout popover', async () => {
        vi.useFakeTimers();
        try {
            render(<PlaylistsView />);
            fireEvent.click(screen.getByText('Create Playlist'));
            const input = screen.getByPlaceholderText('Playlist Name');
            expect(input).toHaveFocus();

            fireEvent.click(screen.getByTestId('playlists-view-toggle-btn'));
            const gridOption = screen.getByTestId('playlists-view-grid-btn');
            expect(gridOption).toHaveFocus();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            expect(screen.getByRole('group', { name: 'Layout' })).toBeInTheDocument();
            expect(gridOption).toHaveFocus();
            fireEvent.click(screen.getByTestId('playlists-view-list-btn'));
            expect(mockStore.setPlaylistsViewMode).toHaveBeenCalledWith('list');
            expect(input).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('opens create form and submits new playlist', async () => {
        render(<PlaylistsView />);
        const createBtn = screen.getByText('Create Playlist');
        fireEvent.click(createBtn);

        const input = screen.getByPlaceholderText('Playlist Name');
        fireEvent.change(input, { target: { value: 'New List' } });

        const saveBtn = screen.getByTitle('Save');
        await act(async () => {
            fireEvent.click(saveBtn);
        });

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

    it('opens a playlist card with Enter and Space', async () => {
        render(<PlaylistsView />);
        const card = screen.getByRole('button', { name: 'Open playlist Chill' });
        const user = userEvent.setup();
        card.focus();

        await user.keyboard('{Enter}');
        await user.keyboard(' ');

        expect(mockStore.selectPlaylist).toHaveBeenNthCalledWith(1, '1');
        expect(mockStore.selectPlaylist).toHaveBeenNthCalledWith(2, '1');
    });

    it('keeps play, rename, and export actions from selecting the card', () => {
        render(<PlaylistsView />);

        fireEvent.click(screen.getAllByTitle('Play')[0]);
        fireEvent.click(screen.getAllByTitle('Rename playlist')[0]);
        fireEvent.click(screen.getAllByTitle('Export playlist')[0]);

        expect(mockStore.playPlaylist).toHaveBeenCalledWith('1');
        expect(mockStore.exportPlaylist).toHaveBeenCalledWith('1');
        expect(mockStore.selectPlaylist).not.toHaveBeenCalled();
    });

    it('calls updatePlaylist when inline rename is submitted', async () => {
        render(<PlaylistsView />);
        const renameBtn = screen.getAllByTitle('Rename playlist')[0];
        fireEvent.click(renameBtn);

        const input = screen.getByDisplayValue('Chill');
        fireEvent.change(input, { target: { value: 'Super Chill' } });

        const saveBtn = screen.getByText('Save');
        await act(async () => {
            fireEvent.click(saveBtn);
        });

        expect(mockStore.updatePlaylist).toHaveBeenCalledWith('1', 'Super Chill');
    });

    describe('Bandcamp playlist loading indicators', () => {
        const bcPlaylist = {
            id: 'bc-1',
            name: 'BC List',
            trackCount: 7,
            isBandcampPlaylist: true,
            bandcampUrl: 'https://bandcamp.com/list'
        };

        it('shows a loading placeholder while Bandcamp playlists are being fetched', () => {
            (useStore as any).mockReturnValue({
                ...mockStore,
                bandcampPlaylists: [],
                isLoadingBandcampPlaylists: true
            });
            render(<PlaylistsView />);

            expect(screen.getByText('Bandcamp Playlists')).toBeInTheDocument();
            expect(screen.getByTestId('bandcamp-playlists-loading')).toBeInTheDocument();
            expect(screen.getByText('Loading…')).toBeInTheDocument();
        });

        it('hides the Bandcamp section entirely when idle with no playlists', () => {
            render(<PlaylistsView />);
            expect(screen.queryByText('Bandcamp Playlists')).not.toBeInTheDocument();
            expect(screen.queryByTestId('bandcamp-playlists-loading')).not.toBeInTheDocument();
        });

        it('disables the refresh button while the store is fetching', () => {
            (useStore as any).mockReturnValue({
                ...mockStore,
                isLoadingBandcampPlaylists: true
            });
            render(<PlaylistsView />);
            expect(screen.getByTitle('Refresh Bandcamp playlists')).toBeDisabled();
        });

        it('shows a per-card spinner for the playlist whose tracks are loading', () => {
            (useStore as any).mockReturnValue({
                ...mockStore,
                playlists: [],
                bandcampPlaylists: [bcPlaylist],
                loadingBandcampPlaylistId: 'bc-1'
            });
            render(<PlaylistsView />);

            expect(screen.getByTestId('playlist-loading-bc-1')).toBeInTheDocument();
            expect(screen.getByText('Loading tracks…')).toBeInTheDocument();
            // The play overlay is replaced by the spinner while loading
            expect(screen.queryByTitle('Play')).not.toBeInTheDocument();
        });

        it('shows the track count and play button when not loading', () => {
            (useStore as any).mockReturnValue({
                ...mockStore,
                playlists: [],
                bandcampPlaylists: [bcPlaylist]
            });
            render(<PlaylistsView />);

            expect(screen.queryByTestId('playlist-loading-bc-1')).not.toBeInTheDocument();
            expect(screen.getByText('7 tracks')).toBeInTheDocument();
            expect(screen.getByTitle('Play')).toBeInTheDocument();
            fireEvent.click(screen.getByTitle('Play'));
            expect(mockStore.playPlaylist).toHaveBeenCalledWith('bc-1');
            expect(mockStore.selectPlaylist).not.toHaveBeenCalled();
        });
    });

    it('deletes playlist after confirmation', async () => {
        render(<PlaylistsView />);
        const deleteBtns = screen.getAllByTitle('Delete playlist');

        await act(async () => {
            fireEvent.click(deleteBtns[0]);
        });

        expect(window.confirm).toHaveBeenCalled();
        expect(mockStore.deletePlaylist).toHaveBeenCalledWith('1');
    });
});
