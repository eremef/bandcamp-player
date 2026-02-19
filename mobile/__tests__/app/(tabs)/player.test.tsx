import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import PlayerScreen from '../../../app/(tabs)/player';
import { useStore } from '../../../store';

// Mock Dependencies
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
    router: { replace: mockReplace, push: jest.fn() },
    useFocusEffect: (cb: any) => cb(),
}));



jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('lucide-react-native', () => {
    const { Text } = jest.requireActual('react-native');
    return {
        Play: () => <Text>Play</Text>,
        Pause: () => <Text>Pause</Text>,
        SkipBack: () => <Text>SkipBack</Text>,
        SkipForward: () => <Text>SkipForward</Text>,
        Shuffle: () => <Text>Shuffle</Text>,
        Repeat: () => <Text>Repeat</Text>,
        MoreVertical: () => <Text>MoreVertical</Text>,
        Volume2: () => <Text>Volume2</Text>,
        Moon: () => <Text>Moon</Text>,
        Sun: () => <Text>Sun</Text>,
        Monitor: () => <Text>Monitor</Text>,
        Check: () => <Text>Check</Text>,
        Globe: () => <Text>Globe</Text>,
        Wifi: () => <Text>Wifi</Text>,
        ArrowLeftRight: () => <Text>ArrowLeftRight</Text>,
    };

});

// Mock Store
jest.mock('../../../store', () => ({
    useStore: jest.fn(),
}));

describe('PlayerScreen', () => {
    const mockStore = {
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
        hostIp: '192.168.1.100',
        theme: 'dark',
        setTheme: jest.fn(),
        mode: 'standalone',
        setMode: jest.fn().mockResolvedValue(undefined),
        logoutBandcamp: jest.fn().mockResolvedValue(undefined),
        connectionStatus: 'disconnected',
    };

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockReturnValue(mockStore);
        jest.clearAllMocks();
    });

    it('renders track info correctly', () => {
        const { getByText } = render(<PlayerScreen />);

        expect(getByText('Now Playing')).toBeTruthy();
        expect(getByText('Test Song')).toBeTruthy();
        expect(getByText('Test Artist')).toBeTruthy();
        expect(getByText('Test Album')).toBeTruthy();
    });

    it('renders placeholder when no track', () => {
        (useStore as unknown as jest.Mock).mockReturnValue({
            ...mockStore,
            currentTrack: null,
        });

        const { getByText } = render(<PlayerScreen />);
        expect(getByText('No Track')).toBeTruthy();
        expect(getByText('Not Playing')).toBeTruthy();
    });

    it('calls play/pause when button is pressed', () => {
        render(<PlayerScreen />);

        fireEvent.press(render(<PlayerScreen />).getByText('Play'));
        expect(mockStore.play).toHaveBeenCalled();

        (useStore as unknown as jest.Mock).mockReturnValue({
            ...mockStore,
            isPlaying: true,
        });

        fireEvent.press(render(<PlayerScreen />).getByText('Pause'));
        expect(mockStore.pause).toHaveBeenCalled();
    });

    it('calls next/previous', () => {
        const { getByText } = render(<PlayerScreen />);

        fireEvent.press(getByText('SkipForward'));
        expect(mockStore.next).toHaveBeenCalled();

        fireEvent.press(getByText('SkipBack'));
        expect(mockStore.previous).toHaveBeenCalled();
    });

    it('toggles shuffle', () => {
        const { getByText } = render(<PlayerScreen />);
        fireEvent.press(getByText('Shuffle'));
        expect(mockStore.toggleShuffle).toHaveBeenCalled();
    });

    it('cycles repeat mode', () => {
        const { getByText } = render(<PlayerScreen />);
        fireEvent.press(getByText('Repeat'));
        // Current is 'off', next should be 'one'
        expect(mockStore.setRepeat).toHaveBeenCalledWith('one');
    });

    it('shows volume modal when volume button is pressed', () => {
        const { getByText, getAllByText } = render(<PlayerScreen />);

        // Press volume button (Volume2 icon)
        fireEvent.press(getByText('Volume2'));

        expect(getAllByText('80%').length).toBeGreaterThan(0);
    });

    it('switches to remote mode when mode badge is pressed', async () => {
        // User is in standalone mode
        (useStore as unknown as jest.Mock).mockReturnValue({
            ...mockStore,
            mode: 'standalone',
            connectionStatus: 'disconnected',
        });

        const { getByText } = render(<PlayerScreen />);

        // Press the mode badge (shows "Standalone" text when in standalone mode)
        fireEvent.press(getByText('Standalone'));

        await waitFor(() => {
            expect(mockStore.setMode).toHaveBeenCalledWith('remote');
        });
    });
});

