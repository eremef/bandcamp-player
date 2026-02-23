import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import QueueScreen from '../../../app/(tabs)/queue';
import { useStore } from '../../../store';

// Mock Lucide icons
jest.mock('lucide-react-native', () => {
    const { Text } = jest.requireActual('react-native');
    return {
        Play: () => <Text>PlayIcon</Text>,
        Trash2: () => <Text>TrashIcon</Text>,
    };
});


// Mock Store
jest.mock('../../../store', () => ({
    useStore: jest.fn(),
}));

describe('QueueScreen', () => {
    const mockTrack = {
        id: '1',
        title: 'Track One',
        artist: 'Artist One',
        artworkUrl: 'http://art.url',
        duration: 200,
        streamUrl: 'http://stream.url',
        bandcampUrl: 'http://bc.url',
        isCached: false,
    };

    const mockQueue = {
        items: [
            { id: 'q1', track: mockTrack, source: 'collection' },
            { id: 'q2', track: { ...mockTrack, id: '2', title: 'Track Two' }, source: 'collection' },
        ],
        currentIndex: 0,
    };

    const mockStore = {
        queue: mockQueue,
        isPlaying: true,
        playQueueIndex: jest.fn(),
        removeFromQueue: jest.fn(),
    };

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            return selector(mockStore);
        });
        jest.clearAllMocks();
    });

    it('renders empty queue state', () => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            return selector({ ...mockStore, queue: { items: [], currentIndex: -1 } });
        });

        const { getByText } = render(<QueueScreen />);
        expect(getByText('Queue is empty')).toBeTruthy();
    });

    it('renders queue items', () => {
        const { getByText } = render(<QueueScreen />);
        // Removed header check
        expect(getByText('Track One')).toBeTruthy();
        expect(getByText('Track Two')).toBeTruthy();
    });

    it('highlights current playing track', () => {
        const { getByText } = render(<QueueScreen />);
        // Usually we check styles, but RN testing library is better at content.
        // We can check if the Play icon is present for current item
        // The PlayIcon is only rendered for current && isPlaying
        expect(getByText('PlayIcon')).toBeTruthy();
    });

    it('calls playQueueIndex on item press', () => {
        const { getByText } = render(<QueueScreen />);
        fireEvent.press(getByText('Track Two'));
        expect(mockStore.playQueueIndex).toHaveBeenCalledWith(1);
    });

    it('calls removeFromQueue on remove button press', () => {
        const { getAllByText } = render(<QueueScreen />);
        // There are two TrashIcons
        const removeButtons = getAllByText('TrashIcon');
        fireEvent.press(removeButtons[0]); // Remove first item
        expect(mockStore.removeFromQueue).toHaveBeenCalledWith('q1');
    });
});
