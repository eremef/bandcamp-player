import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import PlaylistsScreen from '../../app/(tabs)/playlists';
import { useStore } from '../../store';
import { Alert } from 'react-native';

const mockPlaylists = [
    {
        id: 'pl-1',
        name: 'Chill Vibes',
        trackCount: 15,
        totalDuration: 3600, // 1h 0m
        artworkUrl: 'https://example.com/chill.jpg',
        tracks: []
    },
    {
        id: 'pl-2',
        name: 'Workout Mix',
        trackCount: 20,
        totalDuration: 1800, // 30 min
        artworkUrl: '',
        tracks: []
    }
];

describe('PlaylistsScreen', () => {
    let mockPlayPlaylist: jest.Mock;
    let mockCreatePlaylist: jest.Mock;
    let mockRenamePlaylist: jest.Mock;
    let mockDeletePlaylist: jest.Mock;
    let mockRefreshPlaylists: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPlayPlaylist = jest.fn();
        mockCreatePlaylist = jest.fn();
        mockRenamePlaylist = jest.fn();
        mockDeletePlaylist = jest.fn();
        mockRefreshPlaylists = jest.fn();

        jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
            if (buttons && buttons.length > 1) {
                // Find the destructive button (delete)
                const deleteBtn = buttons.find(b => b.style === 'destructive');
                if (deleteBtn && deleteBtn.onPress) {
                    deleteBtn.onPress();
                }
            }
        });

        useStore.setState({
            playlists: mockPlaylists as any,
            playPlaylist: mockPlayPlaylist,
            createPlaylist: mockCreatePlaylist,
            renamePlaylist: mockRenamePlaylist,
            deletePlaylist: mockDeletePlaylist,
            refreshPlaylists: mockRefreshPlaylists,
        } as any);
    });

    it('renders list of playlists correctly', () => {
        const { getByText } = render(<PlaylistsScreen />);

        expect(getByText('Chill Vibes')).toBeTruthy();
        expect(getByText(/1h 0m/)).toBeTruthy(); // formatDuration check

        expect(getByText('Workout Mix')).toBeTruthy();
        expect(getByText(/30 min/)).toBeTruthy(); // formatDuration check
    });

    it('shows empty state when no playlists', () => {
        useStore.setState({ playlists: [] } as any);
        const { getByText } = render(<PlaylistsScreen />);
        expect(getByText('No playlists found')).toBeTruthy();
        expect(getByText('Create Playlist')).toBeTruthy();
    });

    it('creates a playlist from empty state', () => {
        useStore.setState({ playlists: [] } as any);
        const { getByText, getByPlaceholderText } = render(<PlaylistsScreen />);

        fireEvent.press(getByText('Create Playlist'));

        const input = getByPlaceholderText('Playlist Name');
        fireEvent.changeText(input, 'My First Playlist');
        fireEvent.press(getByText('Create'));

        expect(mockCreatePlaylist).toHaveBeenCalledWith('My First Playlist');
    });

    it('calls playPlaylist on press', () => {
        const { getByText } = render(<PlaylistsScreen />);
        fireEvent.press(getByText('Chill Vibes'));
        expect(mockPlayPlaylist).toHaveBeenCalledWith('pl-1');
    });

    it('long press opens ActionSheet', () => {
        const { getByText } = render(<PlaylistsScreen />);
        fireEvent(getByText('Chill Vibes'), 'onLongPress');

        expect(getByText('Rename')).toBeTruthy();
        expect(getByText('Delete')).toBeTruthy();
        expect(getByText('Cancel')).toBeTruthy();
    });

    it('handles pull to refresh', async () => {
        const { UNSAFE_getByType } = render(<PlaylistsScreen />);
        const flatList = UNSAFE_getByType(require('react-native').FlatList);

        await act(async () => {
            flatList.props.refreshControl.props.onRefresh();
        });

        expect(mockRefreshPlaylists).toHaveBeenCalled();
    });

    it('renames a playlist', async () => {
        jest.useFakeTimers();
        const { getByText, getByPlaceholderText } = render(<PlaylistsScreen />);

        // Open action sheet
        fireEvent(getByText('Chill Vibes'), 'onLongPress');
        // Select rename
        fireEvent.press(getByText('Rename'));

        act(() => {
            jest.runAllTimers(); // Advance timers to open modal (setTimeout)
        });

        const input = getByPlaceholderText('Playlist Name');
        fireEvent.changeText(input, 'Super Chill');
        fireEvent.press(getByText('Save'));

        expect(mockRenamePlaylist).toHaveBeenCalledWith('pl-1', 'Super Chill');
        jest.useRealTimers();
    });

    it('deletes a playlist', async () => {
        jest.useFakeTimers();
        const { getByText } = render(<PlaylistsScreen />);

        fireEvent(getByText('Chill Vibes'), 'onLongPress');
        fireEvent.press(getByText('Delete'));

        act(() => {
            jest.runAllTimers(); // Advance setTimeout before Alert
        });

        expect(Alert.alert).toHaveBeenCalled();
        expect(mockDeletePlaylist).toHaveBeenCalledWith('pl-1');
        jest.useRealTimers();
    });
});
