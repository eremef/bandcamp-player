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
        GripVertical: () => <Text>GripIcon</Text>,
        ListX: () => <Text>ListXIcon</Text>,
    };
});

// Mock react-native-draggable-flatlist
const dragEndRef = { current: null as any };

jest.mock('react-native-draggable-flatlist', () => {
    const { FlatList } = jest.requireActual('react-native');
    const React = require('react');

    const DraggableFlatList = React.forwardRef(function DraggableFlatList(props: any, ref: any) {
        React.useEffect(() => {
            dragEndRef.current = props.onDragEnd;
        }, [props.onDragEnd]);
        const { renderItem, data, ...rest } = props;
        return (
            <FlatList
                ref={ref}
                data={data}
                renderItem={({ item, index }: any) =>
                    renderItem({
                        item,
                        getIndex: () => index,
                        drag: jest.fn(),
                        isActive: false,
                    })
                }
                {...rest}
            />
        );
    });

    return {
        __esModule: true,
        default: DraggableFlatList,
        ScaleDecorator: ({ children }: any) => children,
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
            { id: 'q3', track: { ...mockTrack, id: '3', title: 'Track Three' }, source: 'collection' },
        ],
        currentIndex: 0,
    };

    const mockStore = {
        queue: mockQueue,
        mode: 'standalone',
        isPlaying: true,
        playQueueIndex: jest.fn(),
        removeFromQueue: jest.fn(),
        reorderQueue: jest.fn(),
        refreshQueue: jest.fn(),
        clearQueue: jest.fn(),
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
        expect(getByText('Track One')).toBeTruthy();
        expect(getByText('Track Two')).toBeTruthy();
    });

    it('highlights current playing track', () => {
        const { getByText } = render(<QueueScreen />);
        expect(getByText('PlayIcon')).toBeTruthy();
    });

    it('calls playQueueIndex on item press', () => {
        const { getByText } = render(<QueueScreen />);
        fireEvent.press(getByText('Track Two'));
        expect(mockStore.playQueueIndex).toHaveBeenCalledWith(1);
    });

    it('calls removeFromQueue on remove button press', () => {
        const { getAllByText } = render(<QueueScreen />);
        const removeButtons = getAllByText('TrashIcon');
        fireEvent.press(removeButtons[0]);
        expect(mockStore.removeFromQueue).toHaveBeenCalledWith('q1');
    });

    it('renders drag handle icons', () => {
        const { getAllByText } = render(<QueueScreen />);
        const gripIcons = getAllByText('GripIcon');
        expect(gripIcons.length).toBe(3);
    });

    it('calls reorderQueue when drag ends', () => {
        render(<QueueScreen />);

        expect(dragEndRef.current).toBeDefined();
        dragEndRef.current({ from: 0, to: 2, data: mockQueue.items });

        expect(mockStore.reorderQueue).toHaveBeenCalledWith(0, 2);
    });

    it('does not call reorderQueue when drag ends at same position', () => {
        render(<QueueScreen />);

        dragEndRef.current({ from: 1, to: 1, data: mockQueue.items });

        expect(mockStore.reorderQueue).not.toHaveBeenCalled();
    });

    it('renders unique position numbers for all items', () => {
        const { getAllByText } = render(<QueueScreen />);
        expect(getAllByText('1.').length).toBe(1);
        expect(getAllByText('2.').length).toBe(1);
        expect(getAllByText('3.').length).toBe(1);
    });

    it('updates position numbers correctly after queue reorder without duplicates', () => {
        const { rerender, getAllByText } = render(<QueueScreen />);

        // Simulate the store reflecting a reordered queue (q3 moved to front)
        const reorderedQueue = {
            items: [
                { id: 'q3', track: { ...mockTrack, id: '3', title: 'Track Three' }, source: 'collection' },
                { id: 'q1', track: mockTrack, source: 'collection' },
                { id: 'q2', track: { ...mockTrack, id: '2', title: 'Track Two' }, source: 'collection' },
            ],
            currentIndex: 1,
        };

        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            return selector({ ...mockStore, queue: reorderedQueue });
        });

        rerender(<QueueScreen />);

        // Each position number must appear exactly once (no doubles)
        expect(getAllByText('1.').length).toBe(1);
        expect(getAllByText('2.').length).toBe(1);
        expect(getAllByText('3.').length).toBe(1);
    });
});
