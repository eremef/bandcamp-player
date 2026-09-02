import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '../../../theme';
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

// The global expo-router mock invokes useFocusEffect's callback during render, on every render,
// and drops its cleanup. Override it with real effect semantics so focus is deterministic here.
jest.mock('expo-router', () => ({
    useFocusEffect: (cb: any) => require('react').useEffect(cb, [cb]),
}));

// Mock react-native-draggable-flatlist
const dragEndRef = { current: null as any };
const mockListProps = { current: null as any };
const mockScrollSpy = { scrollToIndex: jest.fn(), scrollToOffset: jest.fn() };

jest.mock('react-native-draggable-flatlist', () => {
    const { FlatList } = jest.requireActual('react-native');
    const React = require('react');

    const DraggableFlatList = React.forwardRef(function DraggableFlatList(props: any, ref: any) {
        React.useEffect(() => {
            dragEndRef.current = props.onDragEnd;
            mockListProps.current = props;
        }, [props]);
        // Real FlatList.scrollToIndex is meaningless without layout, so hand the component a
        // spy handle while still rendering a real FlatList for the other assertions.
        React.useImperativeHandle(ref, () => mockScrollSpy);
        const { renderItem, data, onDragBegin, onViewableItemsChanged, ...rest } = props;
        void onDragBegin;
        void onViewableItemsChanged;
        return (
            <FlatList
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

        expect(mockStore.reorderQueue).toHaveBeenCalledWith(0, 2, mockQueue.items);
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

    describe('current-track highlight', () => {
        it('marks the current row with the accent bar and highlight tint', () => {
            const { getByTestId } = render(<QueueScreen />);
            const style = StyleSheet.flatten(getByTestId('queue-item-0').props.style);
            expect(style.backgroundColor).toBe(Colors.dark.highlight);
            expect(style.borderLeftColor).toBe(Colors.dark.accent);
        });

        it('leaves other rows unmarked', () => {
            const { getByTestId } = render(<QueueScreen />);
            const style = StyleSheet.flatten(getByTestId('queue-item-1').props.style);
            expect(style.backgroundColor).toBeUndefined();
            expect(style.borderLeftColor).toBe('transparent');
        });

        it('stays visible in the high-contrast theme', () => {
            (useStore as unknown as jest.Mock).mockImplementation((selector) =>
                selector({ ...mockStore, theme: 'high-contrast' })
            );
            const { getByTestId } = render(<QueueScreen />);
            const style = StyleSheet.flatten(getByTestId('queue-item-0').props.style);
            // Regression guard: `input` equals `background` in this palette, so reusing it made
            // the current row indistinguishable from the page.
            expect(style.backgroundColor).toBe(Colors['high-contrast'].highlight);
            expect(style.backgroundColor).not.toBe(Colors['high-contrast'].background);
        });
    });

    describe('auto-scroll', () => {
        const renderAt = (currentIndex: number) => {
            (useStore as unknown as jest.Mock).mockImplementation((selector) =>
                selector({ ...mockStore, queue: { ...mockQueue, currentIndex } })
            );
            return render(<QueueScreen />);
        };

        const advanceTo = (rerender: (ui: React.ReactElement) => void, currentIndex: number) => {
            (useStore as unknown as jest.Mock).mockImplementation((selector) =>
                selector({ ...mockStore, queue: { ...mockQueue, currentIndex } })
            );
            rerender(<QueueScreen />);
        };

        it('scrolls to the current track when the screen gains focus', () => {
            renderAt(1);
            expect(mockScrollSpy.scrollToIndex).toHaveBeenCalledWith({
                index: 1,
                animated: false,
                viewPosition: 0.5,
            });
        });

        it('follows the track when it advances', () => {
            const { rerender } = renderAt(0);
            mockScrollSpy.scrollToIndex.mockClear();

            advanceTo(rerender, 2);

            expect(mockScrollSpy.scrollToIndex).toHaveBeenCalledWith({
                index: 2,
                animated: true,
                viewPosition: 0.5,
            });
        });

        it('does not follow when the playing track has been scrolled out of view', () => {
            const { rerender } = renderAt(0);
            mockScrollSpy.scrollToIndex.mockClear();

            act(() => {
                mockListProps.current.onViewableItemsChanged({
                    viewableItems: [{ index: 2 }],
                    changed: [],
                });
            });
            advanceTo(rerender, 1);

            expect(mockScrollSpy.scrollToIndex).not.toHaveBeenCalled();
        });

        it('does not yank the list while a row is being dragged', () => {
            const { rerender } = renderAt(0);
            mockScrollSpy.scrollToIndex.mockClear();

            act(() => { mockListProps.current.onDragBegin(0); });
            advanceTo(rerender, 2);

            expect(mockScrollSpy.scrollToIndex).not.toHaveBeenCalled();
        });

        it('resumes following after a drag ends', () => {
            const { rerender } = renderAt(0);
            act(() => { mockListProps.current.onDragBegin(0); });
            act(() => { dragEndRef.current({ from: 0, to: 0, data: mockQueue.items }); });
            mockScrollSpy.scrollToIndex.mockClear();

            advanceTo(rerender, 2);

            expect(mockScrollSpy.scrollToIndex).toHaveBeenCalledWith({
                index: 2,
                animated: true,
                viewPosition: 0.5,
            });
        });

        it('does not scroll when nothing is playing', () => {
            const { rerender } = renderAt(0);
            mockScrollSpy.scrollToIndex.mockClear();

            advanceTo(rerender, -1);

            expect(mockScrollSpy.scrollToIndex).not.toHaveBeenCalled();
        });

        it('reports a row geometry matching the rendered row height', () => {
            renderAt(0);
            expect(mockListProps.current.getItemLayout(null, 3)).toEqual({
                length: 65,
                offset: 195,
                index: 3,
            });
        });
    });
});
