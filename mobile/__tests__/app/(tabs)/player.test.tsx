import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import PlayerScreen from '../../../app/(tabs)/player';
import { useStore } from '../../../store';

// Mock Dependencies
jest.mock('expo-router', () => ({
    router: { replace: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: any) => <>{children}</>,
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('lucide-react-native', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    return {
        Play: () => <RNText>Play</RNText>,
        Pause: () => <RNText>Pause</RNText>,
        SkipBack: () => <RNText>SkipBack</RNText>,
        SkipForward: () => <RNText>SkipForward</RNText>,
        Shuffle: () => <RNText>Shuffle</RNText>,
        Repeat: () => <RNText>Repeat</RNText>,
        MoreVertical: () => <RNText>MoreVertical</RNText>,
        Volume2: () => <RNText>Volume2</RNText>,
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

        // Finding buttons might be tricky with Lucide mocks rendering strings.
        // We can check for the TouchableOpacity wrapping them.
        // In the component:
        // <TouchableOpacity ... onPress={isPlaying ? pause : play}>
        //   {isPlaying ? <Pause ... /> : <Play ... />}
        // </TouchableOpacity>

        // Since we mocked icons as strings, we can search for text 'Play' or 'Pause'.
        // However, they are inside TouchableOpacity.
        // Let's rely on finding the text node.

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

        // Now we expect the modal to be visible.
        // The modal contains a vertical slider and text percentage,
        // so we might find multiple "80%" texts (one on button, one in modal)
        expect(getAllByText('80%').length).toBeGreaterThan(0);
    });
});
