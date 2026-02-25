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
    };
});

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
                album: 'Test Album',
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

    afterEach(() => {
        cleanup();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('renders track info correctly', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        expect(getByText('Test Song')).toBeTruthy();
        expect(getByText('Test Artist')).toBeTruthy();
        expect(getByText('Test Album')).toBeTruthy();
        unmount();
    });

    it('renders placeholder when no track', () => {
        (useStore as unknown as jest.Mock).mockReturnValue({ ...mockStore, currentTrack: null });
        const { getByText, unmount } = render(<PlayerScreen />);
        expect(getByText('No Track')).toBeTruthy();
        unmount();
    });

    it('calls play when button is pressed while paused', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('PlayIcon'));
        expect(mockStore.play).toHaveBeenCalled();
        unmount();
    });

    it('calls pause when button is pressed while playing', () => {
        mockStore.isPlaying = true;
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('PauseIcon'));
        expect(mockStore.pause).toHaveBeenCalled();
        unmount();
    });

    it('Toggles shuffle', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('ShuffleIcon'));
        expect(mockStore.toggleShuffle).toHaveBeenCalled();
        unmount();
    });

    it('cycles repeat mode', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('RepeatIcon'));
        expect(mockStore.setRepeat).toHaveBeenCalledWith('one');
        unmount();
    });

    it('opens menu and handles theme selection', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('MoreVerticalIcon'));

        expect(getByText('Appearance')).toBeTruthy();
        expect(getByText('Dark')).toBeTruthy();

        fireEvent.press(getByText('Light'));
        expect(mockStore.setTheme).toHaveBeenCalledWith('light');
        unmount();
    });

    it('handles volume modal', () => {
        const { getByText, getAllByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('Volume2Icon'));
        expect(getAllByText('80%').length).toBeGreaterThan(0);
        unmount();
    });

    it('switches mode to remote', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('Standalone'));
        expect(mockStore.setMode).toHaveBeenCalledWith('remote');
        unmount();
    });

    it('switches mode back to standalone', () => {
        mockStore.mode = 'remote';
        const { getByText, unmount } = render(<PlayerScreen />);
        expect(getByText('Remote')).toBeTruthy();
        fireEvent.press(getByText('Remote'));
        expect(mockStore.setMode).toHaveBeenCalledWith('standalone');
        unmount();
    });

    it('handles disconnect', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('MoreVerticalIcon'));
        fireEvent.press(getByText('Exit'));
        expect(mockStore.disconnect).toHaveBeenCalled();
        unmount();
    });

    it('handles logout with confirmation', async () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('MoreVerticalIcon'));
        fireEvent.press(getByText('Logout'));

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
        unmount();
    });

    it('navigates to settings', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('MoreVerticalIcon'));
        fireEvent.press(getByText('SettingsIcon'));
        expect(router.push).toHaveBeenCalledWith('/settings');
        unmount();
    });

    it('navigates to about', () => {
        const { getByText, unmount } = render(<PlayerScreen />);
        fireEvent.press(getByText('MoreVerticalIcon'));
        fireEvent.press(getByText('About'));
        expect(router.push).toHaveBeenCalledWith('/about');
        unmount();
    });
});
