import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import CollectionScreen from '../../../app/(tabs)/collection';
import { useStore } from '../../../store';
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
    ListEnd: () => 'ListEnd',
    ListPlus: () => 'ListPlus',
    ListMusic: () => 'ListMusic',
    Play: () => 'Play',
    MoreHorizontal: () => 'MoreHorizontal',
    ArrowUpDown: () => 'ArrowUpDown',
    Check: () => 'Check',
    SlidersHorizontal: () => 'SlidersHorizontal',
    Disc: () => 'Disc',
    Music: () => 'Music',
    Heart: () => 'Heart',
}));

// Mock WebSocketService
jest.mock('../../../services/WebSocketService', () => ({
    webSocketService: {
        send: jest.fn(),
    },
}));

// Mock ActionSheet
jest.mock('../../../components/ActionSheet', () => ({
    ActionSheet: ({ visible, title, actions }: any) => {
        const { View, Text, TouchableOpacity } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>{`ActionSheet: ${title}`}</Text>
                {actions.map((a: any) => (
                    <TouchableOpacity key={a.text} onPress={a.onPress}>
                        <Text>{a.text}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        ) : null;
    },
}));

// Mock PlaylistSelectionModal
jest.mock('../../../components/PlaylistSelectionModal', () => ({
    PlaylistSelectionModal: ({ visible, onSelect, onCreateNew, playlists }: any) => {
        const { View, Text, TouchableOpacity } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>PlaylistSelectionModal</Text>
                {playlists.map((p: any) => (
                    <TouchableOpacity key={p.id} onPress={() => onSelect(p.id)}>
                        <Text>{p.name}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={onCreateNew}>
                    <Text>Create New</Text>
                </TouchableOpacity>
            </View>
        ) : null;
    },
}));

// Mock InputModal
jest.mock('../../../components/InputModal', () => ({
    InputModal: ({ visible, onSubmit, title }: any) => {
        const { View, Text, TouchableOpacity, TextInput } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>{title}</Text>
                <TextInput placeholder="Playlist Name" />
                <TouchableOpacity onPress={() => onSubmit('Super Hits')}>
                    <Text>Create</Text>
                </TouchableOpacity>
            </View>
        ) : null;
    },
}));

// Mock CollectionGridItem
jest.mock('../../../components/CollectionGridItem', () => ({
    CollectionGridItem: ({ item, onPress, onLongPress, testID }: any) => {
        const { TouchableOpacity, Text } = jest.requireActual('react-native');
        const title = item.type === 'album' ? item.album.title : item.track.title;
        const artist = item.type === 'album' ? item.album.artist : item.track.artist;
        return (
            <TouchableOpacity
                testID={testID}
                onPress={() => onPress(item)}
                onLongPress={() => onLongPress(item)}
            >
                <Text>{title}</Text>
                <Text>{artist}</Text>
            </TouchableOpacity>
        );
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
                album: { title: 'Album One', artist: 'Artist A', artworkUrl: 'url1', bandcampUrl: 'burl1', trackCount: 1, tracks: [] },
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
        queue: { currentIndex: -1, tracks: [] },
        clearQueue: jest.fn(),
        playQueueIndex: jest.fn(),
        collectionFilterAlbums: true,
        collectionFilterTracks: true,
        collectionFilterWishlist: true,
        setCollectionFilterAlbums: jest.fn(),
        setCollectionFilterTracks: jest.fn(),
        setCollectionFilterWishlist: jest.fn(),
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
            expect(getByText('ActionSheet: Album One - Artist A')).toBeTruthy();
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

        await act(async () => {
            await new Promise((r) => setTimeout(r, 600)); // Wait for debounce
        });

        expect(mockStore.refreshCollection).toHaveBeenCalledWith(true, 'New Search', false);
    });

    it('renders error state and handles retry', () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, collection: null, collectionError: 'Network Error' };
            return selector(state);
        });

        const { getByText } = render(<CollectionScreen />);
        expect(getByText('Error: Network Error')).toBeTruthy();

        fireEvent.press(getByText('Retry'));
        expect(mockStore.refreshCollection).toHaveBeenCalledWith(true, '', true);
    });

    it('renders loading status if available', () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, collection: null, collectionLoadingStatus: 'Fetching items...' };
            return selector(state);
        });

        const { getByText } = render(<CollectionScreen />);
        expect(getByText('Fetching items...')).toBeTruthy();
    });

    it('prompts before refresh if collection is large', () => {
        const largeCollection = { ...mockCollection, totalCount: 2000 };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, collection: largeCollection };
            return selector(state);
        });

        const { getByTestId } = render(<CollectionScreen />);
        const list = getByTestId('collection-list');

        const { Alert } = require('react-native');
        const alertSpy = jest.spyOn(Alert, 'alert');

        act(() => {
            list.props.refreshControl.props.onRefresh();
        });

        expect(alertSpy).toHaveBeenCalledWith(
            "Large Collection Sync",
            expect.stringContaining("2000 items"),
            expect.any(Array)
        );

        // Trigger Proceed
        const proceedButton = (alertSpy.mock.calls[0][2] as any[])?.[1];
        act(() => {
            proceedButton?.onPress?.();
        });
        expect(mockStore.refreshCollection).toHaveBeenCalledWith(true, '', true);
        alertSpy.mockRestore();
    });

    it('calls loadMoreCollection on end reached', () => {
        const { getByTestId } = render(<CollectionScreen />);
        const list = getByTestId('collection-list');

        fireEvent(list, 'onEndReached');
        expect(mockStore.loadMoreCollection).toHaveBeenCalled();
    });

    it('handles "Play Next" from context menu', async () => {
        const { getByTestId, getByText } = render(<CollectionScreen />);

        // Long press first item (Album One)
        fireEvent(getByTestId('item-1'), 'longPress');

        await waitFor(() => expect(getByText('Play Next')).toBeTruthy());

        fireEvent.press(getByText('Play Next'));
        expect(mockStore.addAlbumToQueue).toHaveBeenCalledWith('burl1', true, expect.any(Array), expect.any(String));
    });

    it('handles "Add to Playlist" and selection', async () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = { ...mockStore, playlists: [{ id: 'p1', name: 'My Playlist' }] };
            return selector(state);
        });

        const { getByTestId, getByText } = render(<CollectionScreen />);

        // Long press first item
        fireEvent(getByTestId('item-1'), 'longPress');

        await waitFor(() => expect(getByText('Add to Playlist')).toBeTruthy());
        fireEvent.press(getByText('Add to Playlist'));

        // Modal should appear (we mock PlaylistSelectionModal or check its content)
        await waitFor(() => expect(getByText('My Playlist')).toBeTruthy());

        fireEvent.press(getByText('My Playlist'));
        expect(mockStore.addAlbumToPlaylist).toHaveBeenCalledWith('p1', 'burl1');
    });

    it('handles track context menu actions', async () => {
        const { getByTestId, getByText } = render(<CollectionScreen />);

        // Long press second item (Track Two)
        fireEvent(getByTestId('item-2'), 'longPress');

        await waitFor(() => expect(getByText('Play Next')).toBeTruthy());
        fireEvent.press(getByText('Play Next'));
        expect(mockStore.addTrackToQueue).toHaveBeenCalledWith(mockCollection.items[1].track, true);

        // Re-open for Add to Queue
        fireEvent(getByTestId('item-2'), 'longPress');
        await waitFor(() => expect(getByText('Add to Queue')).toBeTruthy());
        fireEvent.press(getByText('Add to Queue'));
        expect(mockStore.addTrackToQueue).toHaveBeenCalledWith(mockCollection.items[1].track, false);
    });

    it('handles create playlist from modal', async () => {
        const { getByTestId, getByText, getByPlaceholderText } = render(<CollectionScreen />);

        fireEvent(getByTestId('item-1'), 'longPress');
        await waitFor(() => expect(getByText('Add to Playlist')).toBeTruthy());
        fireEvent.press(getByText('Add to Playlist'));

        await waitFor(() => expect(getByText('Create New')).toBeTruthy());
        fireEvent.press(getByText('Create New'));

        const input = getByPlaceholderText('Playlist Name');
        fireEvent.changeText(input, 'Super Hits');
        fireEvent.press(getByText('Create'));

        expect(mockStore.createPlaylist).toHaveBeenCalledWith('Super Hits');
    });

    describe('Sorting', () => {
        const sortingCollection = {
            items: [
                {
                    id: '1',
                    type: 'album',
                    purchaseDate: '2024-02-01T10:00:00.000Z',
                    album: { title: 'Beta Album', artist: 'Artist B', artworkUrl: 'url1' },
                },
                {
                    id: '2',
                    type: 'album',
                    purchaseDate: '2024-03-01T10:00:00.000Z',
                    album: { title: 'Alpha Album', artist: 'Artist C', artworkUrl: 'url2' },
                },
                {
                    id: '3',
                    type: 'album',
                    purchaseDate: '2024-01-01T10:00:00.000Z',
                    album: { title: 'Zeta Album', artist: 'Artist A', artworkUrl: 'url3' },
                },
            ],
            totalCount: 3,
        };

        const setupSortingStore = (key: string, direction: string) => {
            (useStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    ...mockStore,
                    collection: sortingCollection,
                    collectionSortKey: key,
                    collectionSortDirection: direction,
                    setCollectionSortKey: jest.fn(),
                    setCollectionSortDirection: jest.fn(),
                };
                return selector(state);
            });
        };

        it('sorts by Purchase Date (Newest First) by default', () => {
            setupSortingStore('default', 'desc');
            const { getAllByText } = render(<CollectionScreen />);
            const items = getAllByText(/Album/).filter(el => el.props.children !== 'Album' && el.props.children !== 'Albums');
            // Dates DESC: 03-01 (Alpha), 02-01 (Beta), 01-01 (Zeta)
            expect(items[0].props.children).toBe('Alpha Album');
            expect(items[1].props.children).toBe('Beta Album');
            expect(items[2].props.children).toBe('Zeta Album');
        });

        it('sorts by Artist Name', () => {
            setupSortingStore('artist', 'asc');
            const { getByTestId } = render(<CollectionScreen />);
            const list = getByTestId('collection-list');
            const items = within(list).getAllByText(/Artist/);
            // Artists: Artist A (Zeta), Artist B (Beta), Artist C (Alpha)
            expect(items[0].props.children).toBe('Artist A');
            expect(items[1].props.children).toBe('Artist B');
            expect(items[2].props.children).toBe('Artist C');
        });

        it('sorts by Album Title', () => {
            setupSortingStore('album', 'asc');
            const { getByTestId } = render(<CollectionScreen />);
            const list = getByTestId('collection-list');
            const items = within(list).getAllByText(/Album/);
            // Titles: Alpha Album, Beta Album, Zeta Album
            expect(items[0].props.children).toBe('Alpha Album');
            expect(items[1].props.children).toBe('Beta Album');
            expect(items[2].props.children).toBe('Zeta Album');
        });

        it('reverses order when direction is desc', () => {
            setupSortingStore('album', 'desc');
            const { getByTestId } = render(<CollectionScreen />);
            const list = getByTestId('collection-list');
            const items = within(list).getAllByText(/Album/);
            // Titles DESC: Zeta Album, Beta Album, Alpha Album
            expect(items[0].props.children).toBe('Zeta Album');
            expect(items[1].props.children).toBe('Beta Album');
            expect(items[2].props.children).toBe('Alpha Album');
        });

        it('toggles direction via ActionSheet option', async () => {
            const setDirection = jest.fn();
            (useStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    ...mockStore,
                    collectionSortKey: 'default',
                    collectionSortDirection: 'asc',
                    setCollectionSortDirection: setDirection,
                };
                return selector(state);
            });

            const { getByText, getByTestId } = render(<CollectionScreen />);
            
            // Open ActionSheet
            fireEvent.press(getByTestId('sort-button'));

            await waitFor(() => expect(getByText('ActionSheet: Sort Options')).toBeTruthy());

            // Press Descending option
            fireEvent.press(getByText('Descending (Z-A)'));
            expect(setDirection).toHaveBeenCalledWith('desc');
        });
    });
});
