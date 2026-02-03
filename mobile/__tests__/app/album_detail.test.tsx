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

jest.mock('../../store', () => {
    const mockStore = {
        playTrack: jest.fn(),
        playAlbum: jest.fn(),
    };
    const useStoreMock: any = (selector: any) => selector ? selector(mockStore) : mockStore;
    useStoreMock.getState = () => mockStore;
    return { useStore: useStoreMock };
});

describe('AlbumDetailScreen', () => {
    const mockAlbum = {
        title: 'Test Album',
        artist: 'Test Artist',
        artworkUrl: 'http://art.com/1.jpg',
        bandcampUrl: 'http://bc.com/album/1',
        tracks: [
            { id: 't1', title: 'Track 1', duration: 120 },
            { id: 't2', title: 'Track 2', duration: 180 },
        ],
    };

    const mockRouter = {
        back: jest.fn(),
    };

    let socketCallback: (album: any) => void;

    beforeEach(() => {
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

    it('plays album when Play Album button is pressed', () => {
        const { getByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        const { useStore } = require('../../store');
        const mockStore = useStore.getState();

        fireEvent.press(getByText('Play Album'));
        expect(mockStore.playAlbum).toHaveBeenCalledWith('http://bc.com/album/1');
    });

    it('plays track when track is pressed', () => {
        const { getByText } = render(<AlbumDetailScreen />);

        act(() => {
            socketCallback(mockAlbum);
        });

        const { useStore } = require('../../store');
        const mockStore = useStore.getState();

        fireEvent.press(getByText('Track 1'));
        expect(mockStore.playTrack).toHaveBeenCalledWith(mockAlbum.tracks[0]);
    });
});
