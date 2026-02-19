import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CollectionScreen from '../../../app/(tabs)/collection';
import { useStore } from '../../../store';
import { webSocketService } from '../../../services/WebSocketService';
import { router } from 'expo-router';

// Mock Dependencies
jest.mock('expo-router', () => ({
    router: { push: jest.fn(), replace: jest.fn() },
}));

// Mock Lucide icons
jest.mock('lucide-react-native', () => ({
    RefreshCw: () => 'RefreshCw',
    MoreVertical: () => 'MoreVertical',
    Search: () => 'Search',
}));

// Mock WebSocketService
jest.mock('../../../services/WebSocketService', () => ({
    webSocketService: {
        send: jest.fn(),
    },
}));

// Mock ActionSheet
jest.mock('../../../components/ActionSheet', () => ({
    ActionSheet: ({ visible, title }: any) => {
        const { Text } = jest.requireActual('react-native');
        return visible ? <Text>{`ActionSheet: ${title}`}</Text> : null;
    },
}));

// Mock Store
jest.mock('../../../store', () => ({
    useStore: jest.fn(),
}));

describe('CollectionScreen', () => {
    const mockCollection = {
        items: [
            {
                id: '1',
                type: 'album',
                album: { title: 'Album One', artist: 'Artist A', artworkUrl: 'url1', bandcampUrl: 'burl1', trackCount: 1 },
            },
            {
                id: '2',
                type: 'track',
                track: { title: 'Track Two', artist: 'Artist B', artworkUrl: 'url2', bandcampUrl: 'burl2' },
            },
        ],
        totalCount: 2,
    };

    const mockStore = {
        collection: mockCollection,
        searchQuery: '',
        playAlbum: jest.fn().mockResolvedValue(undefined),
        playTrack: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
        playlists: [],
        addTrackToQueue: jest.fn().mockResolvedValue(undefined),
        addAlbumToQueue: jest.fn(),
        addTrackToPlaylist: jest.fn().mockResolvedValue(undefined),
        addAlbumToPlaylist: jest.fn().mockResolvedValue(undefined),
        createPlaylist: jest.fn(),
        refreshCollection: jest.fn().mockResolvedValue(undefined),
        loadMoreCollection: jest.fn().mockResolvedValue(undefined),
        isCollectionLoading: false,
        collectionLoadingStatus: null,
        collectionError: null,
    };

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            return selector(mockStore);
        });
        jest.clearAllMocks();
    });

    it('renders loading state when collection is null', () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, collection: null };
            return selector(state);
        });
        const { getByText } = render(<CollectionScreen />);
        expect(getByText('Loading Your Music')).toBeTruthy();
    });

    it('renders collection items', () => {
        const { getByText } = render(<CollectionScreen />);
        expect(getByText('Album One')).toBeTruthy();
        expect(getByText('Artist A')).toBeTruthy();
        expect(getByText('Track Two')).toBeTruthy();
        expect(getByText('Artist B')).toBeTruthy();
    });



    it('navigates to album detail on press if album has multiple tracks', () => {
        const multiTrackCollection = {
            items: [
                {
                    id: '1',
                    type: 'album',
                    album: { title: 'Album Multi', artist: 'Artist A', artworkUrl: 'url1', bandcampUrl: 'burl_multi', trackCount: 5 },
                }
            ],
            totalCount: 1
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, collection: multiTrackCollection };
            return selector(state);
        });

        const { getByText } = render(<CollectionScreen />);
        fireEvent.press(getByText('Album Multi'));

        expect(router.push).toHaveBeenCalledWith({
            pathname: '/album_detail',
            params: expect.objectContaining({ url: 'burl_multi', title: 'Album Multi' })
        });

    });

    it('plays item directly on press if it is a single track or single-track album', async () => {
        const { getByText } = render(<CollectionScreen />);

        // Album One is a single-track album (trackCount: 1)
        fireEvent.press(getByText('Album One'));
        expect(router.push).toHaveBeenCalledWith({
            pathname: '/album_detail',
            params: expect.objectContaining({ url: 'burl1', title: 'Album One' })
        });


        jest.clearAllMocks();

        // Track Two is a single track
        fireEvent.press(getByText('Track Two'));
        expect(mockStore.playTrack).toHaveBeenCalledWith(mockCollection.items[1].track);
    });

    it('shows context menu on long press', async () => {
        const { getByText, getByTestId } = render(<CollectionScreen />);
        fireEvent(getByTestId('item-1'), 'longPress');

        await waitFor(() => {
            expect(getByText('ActionSheet: Album One')).toBeTruthy();
        });
    });

    it('refreshes collection on pull to refresh', async () => {
        const { getByTestId } = render(<CollectionScreen />);
        const list = getByTestId('collection-list');
        const { refreshControl } = list.props;

        await act(async () => {
            refreshControl.props.onRefresh();
        });


        // Expects (reset: true, query: '', forceServerRefresh: true)
        expect(mockStore.refreshCollection).toHaveBeenCalledWith(true, '', true);
    });

    it('triggers search with debounce', async () => {
        const { getByPlaceholderText } = render(<CollectionScreen />);
        const searchInput = getByPlaceholderText('Search collection...');

        fireEvent.changeText(searchInput, 'New Search');

        // Should not be called immediately due to debounce
        expect(mockStore.refreshCollection).not.toHaveBeenCalledWith(true, 'New Search', false);

        await new Promise((r) => setTimeout(r, 600)); // Wait for debounce

        expect(mockStore.refreshCollection).toHaveBeenCalledWith(true, 'New Search', false);
    });
});
