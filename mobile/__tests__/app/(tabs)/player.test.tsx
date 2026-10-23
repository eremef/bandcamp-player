import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, cleanup, act } from '@testing-library/react-native';

// Mock Dependencies
jest.mock('expo-router', () => ({
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: jest.fn((callback) => callback()),
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('lucide-react-native', () => {
    const { Text } = jest.requireActual('react-native');
    const createIcon = (name: string) => function Icon() { return <Text>{name}</Text>; };
    return {
        Play: createIcon('PlayIcon'),
        Pause: createIcon('PauseIcon'),
        SkipBack: createIcon('SkipBackIcon'),
        SkipForward: createIcon('SkipForwardIcon'),
        Shuffle: createIcon('ShuffleIcon'),
        Repeat: createIcon('RepeatIcon'),
        MoreVertical: createIcon('MoreVerticalIcon'),
        Volume2: createIcon('Volume2Icon'),
        Moon: createIcon('MoonIcon'),
        Sun: createIcon('SunIcon'),
        Monitor: createIcon('MonitorIcon'),
        Check: createIcon('CheckIcon'),
        Globe: createIcon('GlobeIcon'),
        Wifi: createIcon('WifiIcon'),
        ArrowLeftRight: createIcon('ArrowLeftRightIcon'),
        Settings: createIcon('SettingsIcon'),
        Info: createIcon('InfoIcon'),
        LogOut: createIcon('LogOutIcon'),
        X: createIcon('XIcon'),
        Coffee: createIcon('CoffeeIcon'),
        ListPlus: createIcon('ListPlusIcon'),
        FileText: createIcon('FileTextIcon'),
    };
});

// Mock LogsModal
jest.mock('../../../components/LogsModal', () => ({
    LogsModal: ({ visible }: any) => {
        const { View, Text } = jest.requireActual('react-native');
        return visible ? (
            <View>
                <Text>LogsModal</Text>
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
                <TouchableOpacity onPress={() => onSubmit('New Playlist')}>
                    <Text>Create</Text>
                </TouchableOpacity>
            </View>
        ) : null;
    },
}));

// Mock Store
jest.mock('../../../store', () => ({
    useStore: jest.fn(),
}));

jest.mock('../../../theme', () => ({
    useTheme: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: jest.fn(),
}));

import PlayerScreen from '../../../app/(tabs)/player';
import { useStore } from '../../../store';
import { router } from 'expo-router';
import { useTheme } from '../../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@shared/types';

describe('PlayerScreen', () => {
    let mockStore: any;
    let mockColors: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockStore = {
            currentTrack: {
                id: '1',
                title: 'Test Song',
                artist: 'Test Artist',
                artistId: 'band-1',
                album: 'Test Album',
                albumId: 'album-1',
                bandcampUrl: 'https://artist.bandcamp.com/track/test-song',
                artworkUrl: 'http://art.com/1.jpg',
            },
            isPlaying: false,
            duration: 120,
            currentTime: 0,
            play: jest.fn(),
            pause: jest.fn(),
            next: jest.fn(),
            previous: jest.fn(),
            seek: jest.fn(),
            toggleShuffle: jest.fn(),
            setRepeat: jest.fn(),
            repeatMode: 'off',
            isShuffled: false,
            disconnect: jest.fn(),
            volume: 0.8,
            setVolume: jest.fn(),
            hostIp: '192.168.1.10',
            theme: 'dark' as Theme,
            setTheme: jest.fn(),
            mode: 'standalone',
            artists: [{ id: 'name-test-artist', name: 'Test Artist', bandcampUrl: 'https://artist.bandcamp.com' }],
            collection: {
                items: [{
                    id: 'album-1',
                    type: 'album',
                    album: {
                        id: 'album-1',
                        title: 'Test Album',
                        artist: 'Test Artist',
                        bandcampUrl: 'https://artist.bandcamp.com/album/test-album',
                        artworkUrl: 'http://art.com/1.jpg',
                    },
                }],
            },
            setMode: jest.fn(),
            logoutBandcamp: jest.fn(),
            playlists: [],
            addTrackToPlaylist: jest.fn(),
            createPlaylist: jest.fn(),
        };

        mockColors = {
            background: '#000',
            text: '#fff',
            textSecondary: '#888',
            accent: '#0896afff',
            card: '#1e1e1e',
            border: '#333',
            input: '#222',
        };

        (useStore as unknown as jest.Mock).mockReturnValue(mockStore);
        (useTheme as jest.Mock).mockReturnValue(mockColors);
        (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
        jest.spyOn(Alert, 'alert').mockImplementation(() => { });
    });

    afterEach(async () => {
        await cleanup();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('renders track info correctly', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        expect(getByText('Test Song')).toBeTruthy();
        expect(getByText('Test Artist')).toBeTruthy();
        expect(getByText('Test Album')).toBeTruthy();
        await unmount();
    });

    it('opens the current artist details from the artist name', async () => {
        const { getByText } = await render(<PlayerScreen />);

        await fireEvent.press(getByText('Test Artist'));

        expect(router.push).toHaveBeenCalledWith({
            pathname: '/artist/artist_detail',
            params: {
                id: 'name-test-artist',
                name: 'Test Artist',
                imageUrl: 'http://art.com/1.jpg',
                bandcampUrl: 'https://artist.bandcamp.com',
            },
        });
    });

    it('opens album details using the matching collection album URL', async () => {
        const { getByText } = await render(<PlayerScreen />);

        await fireEvent.press(getByText('Test Album'));

        expect(router.push).toHaveBeenCalledWith({
            pathname: '/album_detail',
            params: {
                url: 'https://artist.bandcamp.com/album/test-album',
                albumId: 'album-1',
                artist: 'Test Artist',
                title: 'Test Album',
                artworkUrl: 'http://art.com/1.jpg',
            },
        });
    });

    it('uses the current track artist ID when the collection confirms the artist', async () => {
        mockStore.mode = 'remote';
        mockStore.artists = [];
        const { getByText } = await render(<PlayerScreen />);

        await fireEvent.press(getByText('Test Artist'));

        expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
            pathname: '/artist/artist_detail',
            params: expect.objectContaining({ id: 'band-1' }),
        }));
    });

    it('does not link to artist details when the artist is not in the database or collection', async () => {
        mockStore.artists = [];
        mockStore.collection = { items: [] };
        const { queryByLabelText } = await render(<PlayerScreen />);

        expect(queryByLabelText('View artist Test Artist')).toBeNull();
    });

    it('renders placeholder when no track', async () => {
        (useStore as unknown as jest.Mock).mockReturnValue({ ...mockStore, currentTrack: null });
        const { getByText, unmount } = await render(<PlayerScreen />);
        expect(getByText('No Track')).toBeTruthy();
        await unmount();
    });

    it('calls play when button is pressed while paused', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('PlayIcon'));
        expect(mockStore.play).toHaveBeenCalled();
        await unmount();
    });

    it('calls pause when button is pressed while playing', async () => {
        mockStore.isPlaying = true;
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('PauseIcon'));
        expect(mockStore.pause).toHaveBeenCalled();
        await unmount();
    });

    it('Toggles shuffle', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('ShuffleIcon'));
        expect(mockStore.toggleShuffle).toHaveBeenCalled();
        await unmount();
    });

    it('cycles repeat mode', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('RepeatIcon'));
        expect(mockStore.setRepeat).toHaveBeenCalledWith('one');
        await unmount();
    });



    it('opens the playlist modal from the artwork button', async () => {
        mockStore.playlists = [{ id: 'p1', name: 'Late Drives', tracks: [] }];
        const { getByTestId, getByText, queryByText, unmount } = await render(<PlayerScreen />);

        expect(queryByText('PlaylistSelectionModal')).toBeNull();
        await fireEvent.press(getByTestId('player-add-to-playlist-btn'));
        expect(getByText('PlaylistSelectionModal')).toBeTruthy();

        await fireEvent.press(getByText('Late Drives'));
        expect(mockStore.addTrackToPlaylist).toHaveBeenCalledWith('p1', mockStore.currentTrack);
        await unmount();
    });

    it('hides the artwork button when no track is playing', async () => {
        (useStore as unknown as jest.Mock).mockReturnValue({ ...mockStore, currentTrack: null });
        const { queryByTestId, unmount } = await render(<PlayerScreen />);
        expect(queryByTestId('player-add-to-playlist-btn')).toBeNull();
        await unmount();
    });

    it('creates a playlist from the selection modal', async () => {
        const { getByTestId, getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByTestId('player-add-to-playlist-btn'));
        await fireEvent.press(getByText('Create New'));
        await fireEvent.press(getByText('Create'));
        expect(mockStore.createPlaylist).toHaveBeenCalledWith('New Playlist');
        await unmount();
    });

    it('handles volume modal', async () => {
        const { getByText, getAllByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('Volume2Icon'));
        expect(getAllByText('80%').length).toBeGreaterThan(0);
        await unmount();
    });

    it('switches mode to remote', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('Standalone'));
        expect(mockStore.setMode).toHaveBeenCalledWith('remote');
        await unmount();
    });

    it('switches mode back to standalone', async () => {
        mockStore.mode = 'remote';
        const { getByText, unmount } = await render(<PlayerScreen />);
        expect(getByText('Remote')).toBeTruthy();
        await fireEvent.press(getByText('Remote'));
        expect(mockStore.setMode).toHaveBeenCalledWith('standalone');
        await unmount();
    });

    it('handles disconnect', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('MoreVerticalIcon'));
        await fireEvent.press(getByText('Exit'));
        expect(mockStore.disconnect).toHaveBeenCalled();
        await unmount();
    });

    it('handles logout with confirmation', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('MoreVerticalIcon'));
        await fireEvent.press(getByText('Logout'));

        await act(async () => {
            jest.runAllTimers();
        });

        expect(Alert.alert).toHaveBeenCalled();

        const alertCalls = (Alert.alert as jest.Mock).mock.calls;
        const logoutBtn = alertCalls[0][2]?.find((b: any) => b.text === 'Logout');
        await act(async () => {
            await logoutBtn?.onPress();
        });
        expect(mockStore.logoutBandcamp).toHaveBeenCalled();
        await unmount();
    });

    it('navigates to settings', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('MoreVerticalIcon'));
        await fireEvent.press(getByText('SettingsIcon'));
        expect(router.push).toHaveBeenCalledWith('/settings');
        await unmount();
    });

    it('navigates to about', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('MoreVerticalIcon'));
        await fireEvent.press(getByText('About'));
        expect(router.push).toHaveBeenCalledWith('/about');
        await unmount();
    });

    it('opens logs modal from 3-dots menu', async () => {
        const { getByText, unmount } = await render(<PlayerScreen />);
        await fireEvent.press(getByText('MoreVerticalIcon'));
        await fireEvent.press(getByText('Logs'));
        expect(getByText('LogsModal')).toBeTruthy();
        await unmount();
    });
});
