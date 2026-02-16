import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArtistDetailScreen from '../../app/artist/artist_detail';
import { useStore } from '../../store';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Mock external dependencies
jest.mock('../../store', () => ({
    useStore: jest.fn(),
}));

jest.mock('expo-router', () => ({
    useLocalSearchParams: jest.fn(),
    useRouter: jest.fn(),
    Stack: { Screen: jest.fn(() => null) },
}));

jest.mock('lucide-react-native', () => ({
    X: 'X',
    Play: 'Play',
    ArrowLeft: 'ArrowLeft',
    MoreVertical: 'MoreVertical',
    Search: 'Search',
    RefreshCw: 'RefreshCw',
}));

jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: any) => <>{children}</>,
}));

describe('ArtistDetailScreen', () => {
    const mockPlayAlbum = jest.fn();
    const mockPlayTrack = jest.fn();
    const mockRouterBack = jest.fn();
    const mockRouterReplace = jest.fn();
    const mockRouterPush = jest.fn();
    const mockCanGoBack = jest.fn();
    const mockAddAlbumToQueue = jest.fn();
    const mockAddTrackToQueue = jest.fn();
    const mockAddAlbumToPlaylist = jest.fn();
    const mockAddTrackToPlaylist = jest.fn();
    const mockRefreshArtistCollection = jest.fn();

    const mockArtist = { id: 'a1', name: 'Test Artist', imageUrl: 'http://img.com' };
    const mockCollectionItems = [
        {
            id: '1',
            type: 'album',
            album: { artistId: 'a1', title: 'Album 1', bandcampUrl: 'url1', artworkUrl: 'art1', tracks: [] }
        },
        {
            id: '2',
            type: 'track',
            track: { artistId: 'a1', title: 'Track 1', streamUrl: 'url2', artworkUrl: 'art2', bandcampUrl: 'trackUrl1' }
        },
    ];

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockReturnValue({
            artists: [mockArtist],
            playAlbum: mockPlayAlbum,
            playTrack: mockPlayTrack,
            addAlbumToQueue: mockAddAlbumToQueue,
            addTrackToQueue: mockAddTrackToQueue,
            addAlbumToPlaylist: mockAddAlbumToPlaylist,
            addTrackToPlaylist: mockAddTrackToPlaylist,
            refreshArtistCollection: mockRefreshArtistCollection,
            artistCollection: { items: mockCollectionItems },
            isArtistCollectionLoading: false,
            connectionStatus: 'connected',
            playlists: [{ id: 'p1', name: 'Playlist 1' }],
        });
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'a1' });
        (useRouter as jest.Mock).mockReturnValue({
            back: mockRouterBack,
            replace: mockRouterReplace,
            push: mockRouterPush,
            canGoBack: mockCanGoBack
        });
        mockCanGoBack.mockReturnValue(true);
        jest.clearAllMocks();
    });

    it('renders correctly', () => {
        const { getByText, getAllByText } = render(<ArtistDetailScreen />);
        expect(getAllByText('Test Artist')).toBeTruthy();
        expect(getByText('Album 1')).toBeTruthy();
        expect(getByText('Track 1')).toBeTruthy();
        expect(mockRefreshArtistCollection).toHaveBeenCalledWith('a1');
    });

    it('handles interaction with album - navigates to detail', () => {
        const { getByText } = render(<ArtistDetailScreen />);
        fireEvent.press(getByText('Album 1'));
        expect(mockRouterPush).toHaveBeenCalledWith({
            pathname: '/album_detail',
            params: { url: 'url1' }
        });
    });

    it('handles interaction with track - plays album url', () => {
        const { getByText } = render(<ArtistDetailScreen />);
        fireEvent.press(getByText('Track 1'));
        expect(mockPlayAlbum).toHaveBeenCalledWith('trackUrl1');
    });

    it('shows action sheet on long press', async () => {
        const { getByText } = render(<ArtistDetailScreen />);

        // Long press on album title
        fireEvent(getByText('Album 1'), 'longPress');

        // Action sheet options should appear
        expect(getByText('Play Next')).toBeTruthy();
        expect(getByText('Add to Queue')).toBeTruthy();
        expect(getByText('Add to Playlist')).toBeTruthy();
    });

    it('adds to queue from action sheet', () => {
        const { getByText } = render(<ArtistDetailScreen />);

        fireEvent(getByText('Album 1'), 'longPress');
        fireEvent.press(getByText('Add to Queue'));

        expect(mockAddAlbumToQueue).toHaveBeenCalled();
    });
});
