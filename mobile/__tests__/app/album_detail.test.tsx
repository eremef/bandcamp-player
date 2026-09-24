import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AlbumDetailScreen from '../../app/album_detail';
import { useStore } from '../../store';
import { webSocketService } from '../../services/WebSocketService';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Mock Dependencies
jest.mock('expo-router', () => ({
    useRouter: jest.fn(),
    useLocalSearchParams: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react-native', () => ({
    ArrowLeft: () => 'ArrowLeft',
    Play: () => 'Play',
    MoreVertical: () => 'MoreVertical',
}));

jest.mock('../../services/WebSocketService', () => ({
    webSocketService: {
        send: jest.fn(),
        on: jest.fn(),
    },
}));

jest.mock('../../components/ActionSheet', () => ({
    ActionSheet: ({ visible }: any) => visible ? <></> : null,
}));

jest.mock('../../components/PlaylistSelectionModal', () => ({
    PlaylistSelectionModal: ({ visible }: any) => visible ? <></> : null,
}));

jest.mock('../../services/MobileDatabase', () => ({
    mobileDatabase: {
        getCacheEntriesByAlbum: jest.fn(),
        getAllCacheEntries: jest.fn(),
    },
}));

jest.mock('../../services/MobileCacheService', () => ({
    mobileCacheService: {
        isCached: jest.fn(),
    },
}));

jest.mock('../../store', () => {
    const mockPlayTrackFn = jest.fn();
    const mockPlayAlbumFn = jest.fn();
    const mockStoreState = {
        playTrack: mockPlayTrackFn,
        playAlbum: mockPlayAlbumFn,
        mode: 'remote',
        offlineMode: false,
        cachedTrackIds: new Set<string>(),
        artists: [],
        collection: null,
        addAlbumToQueue: jest.fn(),
        addTrackToQueue: jest.fn(),
        playlists: [],
        addTrackToPlaylist: jest.fn(),
        addAlbumToPlaylist: jest.fn(),
        createPlaylist: jest.fn(),
    };
    const useStoreMock: any = (selector: any) => {
        if (typeof selector === 'function') {
            return selector(mockStoreState);
        }
        return mockStoreState;
    };
    useStoreMock.getState = () => mockStoreState;
    useStoreMock.setState = (update: any) => Object.assign(
        mockStoreState,
        typeof update === 'function' ? update(mockStoreState) : update
    );
    return { useStore: useStoreMock, mockPlayTrackFn, mockPlayAlbumFn };
});

import { mobileDatabase } from '../../services/MobileDatabase';
import { mobileCacheService } from '../../services/MobileCacheService';

describe('AlbumDetailScreen', () => {
    const mockAlbum = {
        title: 'Test Album',
        artist: 'Test Artist',
        artworkUrl: 'http://art.com/1.jpg',
        bandcampUrl: 'http://bc.com/album/1',
        tracks: [
            { id: 't1', title: 'Track 1', duration: 120, streamUrl: 'http://bc.com/stream1.mp3', hasStream: true },
            { id: 't2', title: 'Track 2', duration: 180, streamUrl: 'http://bc.com/stream2.mp3', hasStream: true },
        ],
    };

    const mockRouter = {
        back: jest.fn(),
        push: jest.fn(),
    };

    let socketCallback: (album: any) => void;

    beforeEach(() => {
        const mockStoreState = useStore.getState() as any;
        mockStoreState.mode = 'remote';
        mockStoreState.offlineMode = false;
        mockStoreState.cachedTrackIds = new Set<string>();
        mockStoreState.artists = [];
        mockStoreState.collection = null;
        (useLocalSearchParams as jest.Mock).mockReturnValue({ url: 'http://bc.com/album/1' });
        (useRouter as jest.Mock).mockReturnValue(mockRouter);

        (webSocketService.on as jest.Mock).mockImplementation((event, cb) => {
            if (event === 'album-details') {
                socketCallback = cb;
            }
            return jest.fn(); // unsubscribe
        });

        jest.clearAllMocks();
    });

    it('renders loading state initially', () => {
        const { getByText } = render(<AlbumDetailScreen />);
        expect(getByText('Loading Album...')).toBeTruthy();
        expect(webSocketService.send).toHaveBeenCalledWith('get-album', 'http://bc.com/album/1');
    });

    it('renders album details when data arrives', () => {
        const { getByText, queryByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        expect(queryByText('Loading Album...')).toBeNull();
        expect(getByText('Test Album')).toBeTruthy();
        expect(getByText('Test Artist')).toBeTruthy();
        expect(getByText('Track 1')).toBeTruthy();
        expect(getByText('Track 2')).toBeTruthy();
    });

    it('navigates back when back button is pressed', () => {
        const { getByTestId } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        fireEvent.press(getByTestId('back-button'));
        expect(mockRouter.back).toHaveBeenCalled();
    });

    it('opens artist details when the album artist is in the collection', () => {
        (useStore.getState() as any).collection = {
            items: [{
                id: 'album-1',
                type: 'album',
                album: {
                    id: 'album-1',
                    artistId: 'artist-1',
                    artist: 'Test Artist',
                    title: 'Test Album',
                    artworkUrl: 'http://art.com/1.jpg',
                    bandcampUrl: 'http://bc.com/album/1',
                },
            }],
        };
        const { getByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        fireEvent.press(getByText('Test Artist'));
        expect(mockRouter.push).toHaveBeenCalledWith({
            pathname: '/artist/artist_detail',
            params: {
                id: 'artist-1',
                name: 'Test Artist',
                imageUrl: 'http://art.com/1.jpg',
                bandcampUrl: 'http://bc.com',
            },
        });
    });

    it('does not link to artist details when the artist is not in the database or collection', () => {
        const { queryByLabelText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        expect(queryByLabelText('View artist Test Artist')).toBeNull();
    });

    it('plays album when Play Album button is pressed', () => {
        const { getByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        fireEvent.press(getByText('Play Album'));
        expect(useStore.getState().playAlbum).toHaveBeenCalledWith(
            'http://bc.com/album/1',
            expect.objectContaining({ title: 'Test Album', artist: 'Test Artist' })
        );

    });

    it('plays track when track is pressed', () => {
        const { getByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        fireEvent.press(getByText('Track 1'));
        expect(useStore.getState().playTrack).toHaveBeenCalledWith(
            expect.objectContaining({ id: 't1', title: 'Track 1', artist: 'Test Artist' })
        );

    });

    it('loads and plays cached album tracks in offline mode', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({
            url: 'https://artist.bandcamp.com/album/test-album',
            albumId: 'album-1',
            artist: 'Test Artist',
            title: 'Test Album',
            artworkUrl: 'http://art.com/1.jpg',
        });
        const mockStoreState = useStore.getState() as any;
        mockStoreState.mode = 'standalone';
        mockStoreState.offlineMode = true;
        mockStoreState.cachedTrackIds = new Set<string>();
        (mobileDatabase.getCacheEntriesByAlbum as jest.Mock).mockResolvedValue([{
            track_id: 'cached-1',
            album_id: 'album-1',
            title: 'Cached Track',
            artist: 'Test Artist',
            album: 'Test Album',
            duration: 123,
            track_number: 1,
            artwork_url: 'http://art.com/1.jpg',
            file_path: 'file:///audio/cache/cached-1.mp3',
        }]);
        (mobileCacheService.isCached as jest.Mock).mockResolvedValue(true);

        const { getByText } = render(<AlbumDetailScreen />);
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(getByText('Cached Track')).toBeTruthy();
        fireEvent.press(getByText('Cached Track'));
        expect(useStore.getState().playTrack).toHaveBeenCalledWith(expect.objectContaining({
            id: 'cached-1',
            isCached: true,
            cachedPath: 'file:///audio/cache/cached-1.mp3',
        }));
        expect(webSocketService.send).not.toHaveBeenCalled();
    });
});
