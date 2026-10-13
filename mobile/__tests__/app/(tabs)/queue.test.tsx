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
        ChevronsDown: () => <Text>ChevronsDownIcon</Text>,
        ListX: () => <Text>ListXIcon</Text>,
        Import: () => <Text>ImportIcon</Text>,
        Upload: () => <Text>UploadIcon</Text>,
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
        desktopSocketConnected: false,
        desktopQueueAvailability: 'unknown',
        desktopQueueHandoffAvailable: false,
        desktopQueueHandoffCapabilityChecked: false,
        desktopQueueCurrentTrackAvailable: false,
        queueHandoff: { status: 'idle', direction: null, message: null },
        importDesktopQueue: jest.fn().mockResolvedValue('completed'),
        exportQueueToDesktop: jest.fn().mockResolvedValue('completed'),
        cancelQueueHandoff: jest.fn(),
    };

    beforeEach(() => {
        (useStore as unknown as jest.Mock).mockImplementation((selector) => {
            return selector(mockStore);
        });
        (useStore as any).getState = jest.fn(() => mockStore);
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

    it('shows import only for a connected compatible desktop with a known current track', () => {
        const availableStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId, rerender, queryByTestId } = render(<QueueScreen />);
        expect(getByTestId('import-desktop-queue')).toBeTruthy();

        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector({
            ...availableStore,
            desktopQueueAvailability: 'unknown',
        }));
        rerender(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeNull();

        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector({
            ...availableStore,
            desktopQueueCurrentTrackAvailable: false,
        }));
        rerender(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeNull();
    });

    it('keeps the scroll and clear controls when the phone queue is empty and desktop queue is available', () => {
        const availableStore = {
            ...mockStore,
            queue: { items: [], currentIndex: -1 },
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId, getByText } = render(<QueueScreen />);

        expect(getByText('ImportIcon')).toBeTruthy();
        expect(getByText('ChevronsDownIcon')).toBeTruthy();
        expect(getByText('ListXIcon')).toBeTruthy();
        expect(getByTestId('import-desktop-queue').props.accessibilityLabel).toBe('Import desktop queue to phone');
        for (const testID of ['import-desktop-queue', 'scroll-to-current-track', 'clear-phone-queue']) {
            expect(getByTestId(testID).props.accessibilityHint).toBeTruthy();
            expect(StyleSheet.flatten(getByTestId(testID).props.style)).toMatchObject({ width: 44, height: 44 });
        }
        expect(getByTestId('scroll-to-current-track').props.accessibilityState.disabled).toBe(true);
        expect(getByTestId('clear-phone-queue').props.accessibilityState.disabled).toBe(true);
        expect(getByText('Tap moves and pauses source · Hold leaves source playback unchanged')).toBeTruthy();
    });

    it('shows the active handoff spinner and disables both handoff icons while busy', () => {
        const preparingStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            queueHandoff: { status: 'running', direction: 'import', message: null },
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(preparingStore));
        const { getByTestId, queryByText, rerender } = render(<QueueScreen />);

        expect(getByTestId('import-handoff-loading-indicator')).toBeTruthy();
        expect(queryByText('ImportIcon')).toBeNull();
        expect(getByTestId('import-desktop-queue').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
        expect(getByTestId('export-phone-queue').props.accessibilityState).toMatchObject({ disabled: true, busy: true });

        const exportingStore = {
            ...preparingStore,
            queueHandoff: { status: 'running', direction: 'export', message: null },
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(exportingStore));
        rerender(<QueueScreen />);
        expect(getByTestId('export-handoff-loading-indicator')).toBeTruthy();
        expect(queryByText('UploadIcon')).toBeNull();
    });

    it('shows a direction and gesture specific confirmation before replacing the phone queue', async () => {
        const importDesktopQueue = jest.fn().mockResolvedValueOnce('confirmation-required').mockResolvedValueOnce('completed');
        const availableStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            queueHandoff: { status: 'awaiting-confirmation', direction: 'import', message: null },
            importDesktopQueue,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId, getByText } = render(<QueueScreen />);

        await act(async () => {
            fireEvent.press(getByTestId('import-desktop-queue'));
        });

        expect(importDesktopQueue).toHaveBeenCalledWith(true, false);
        expect(getByText('Move desktop playback to phone?')).toBeTruthy();
        expect(getByText(/replaces the phone queue.*pauses desktop playback/i)).toBeTruthy();
        expect(getByTestId('confirm-queue-handoff')).toBeTruthy();

        await act(async () => {
            fireEvent.press(getByTestId('confirm-queue-handoff'));
        });
        expect(importDesktopQueue).toHaveBeenLastCalledWith(true, true);
    });

    it('maps tap and long press to the corresponding handoff modes', async () => {
        const importDesktopQueue = jest.fn().mockResolvedValue('completed');
        const exportQueueToDesktop = jest.fn().mockResolvedValue('completed');
        const availableStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            importDesktopQueue,
            exportQueueToDesktop,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId } = render(<QueueScreen />);

        await act(async () => {
            fireEvent.press(getByTestId('import-desktop-queue'));
            fireEvent(getByTestId('export-phone-queue'), 'longPress');
        });

        expect(importDesktopQueue).toHaveBeenCalledTimes(1);
        expect(importDesktopQueue).toHaveBeenCalledWith(true, false);
        expect(exportQueueToDesktop).toHaveBeenCalledTimes(1);
        expect(exportQueueToDesktop).toHaveBeenCalledWith(false, false);
        expect(StyleSheet.flatten(getByTestId('export-phone-queue').props.style)).toMatchObject({ width: 44, height: 44 });
        expect(getByTestId('export-phone-queue').props.accessibilityActions.map((action: any) => action.label)).toEqual([
            'Move playback to desktop and pause phone',
            'Play on desktop and leave phone playback unchanged',
        ]);
    });

    it('allows a tap immediately after a completed long press', async () => {
        const exportQueueToDesktop = jest.fn().mockResolvedValue('completed');
        const availableStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueHandoffAvailable: true,
            exportQueueToDesktop,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId } = render(<QueueScreen />);

        await act(async () => {
            fireEvent(getByTestId('export-phone-queue'), 'longPress');
            fireEvent.press(getByTestId('export-phone-queue'));
        });

        expect(exportQueueToDesktop).toHaveBeenNthCalledWith(1, false, false);
        expect(exportQueueToDesktop).toHaveBeenNthCalledWith(2, true, false);
    });

    it('shows the play-on-both confirmation for a long-press export', async () => {
        const exportQueueToDesktop = jest.fn().mockResolvedValue('confirmation-required');
        const availableStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            queueHandoff: { status: 'awaiting-confirmation', direction: 'export', message: null },
            exportQueueToDesktop,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(availableStore));
        const { getByTestId, getByText } = render(<QueueScreen />);

        await act(async () => {
            fireEvent(getByTestId('export-phone-queue'), 'longPress');
        });

        expect(exportQueueToDesktop).toHaveBeenCalledWith(false, false);
        expect(getByText('Play phone queue on desktop too?')).toBeTruthy();
        expect(getByText(/phone playback stays as it is/i)).toBeTruthy();
        expect(getByText('Play on both')).toBeTruthy();
    });

    it('hides handoff actions and shows an update hint for an older desktop', () => {
        const oldDesktopStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(oldDesktopStore));
        const { getByTestId, queryByTestId } = render(<QueueScreen />);

        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();
        expect(getByTestId('desktop-handoff-update-hint')).toBeTruthy();
        expect(getByTestId('scroll-to-current-track')).toBeTruthy();
        expect(getByTestId('clear-phone-queue')).toBeTruthy();
    });

    it('waits for capability negotiation before showing an update hint', () => {
        const handshakeStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
            desktopQueueCurrentTrackAvailable: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(handshakeStore));
        const { getByTestId, queryByTestId, rerender } = render(<QueueScreen />);

        expect(queryByTestId('desktop-handoff-update-hint')).toBeNull();
        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();
        expect(getByTestId('scroll-to-current-track')).toBeTruthy();
        expect(getByTestId('clear-phone-queue')).toBeTruthy();

        const supportedStore = {
            ...handshakeStore,
            desktopQueueHandoffAvailable: true,
            desktopQueueHandoffCapabilityChecked: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(supportedStore));
        rerender(<QueueScreen />);

        expect(queryByTestId('desktop-handoff-update-hint')).toBeNull();
        expect(queryByTestId('import-desktop-queue')).toBeTruthy();
        expect(queryByTestId('export-phone-queue')).toBeTruthy();

        const unsupportedStore = {
            ...handshakeStore,
            desktopQueueHandoffCapabilityChecked: true,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(unsupportedStore));
        rerender(<QueueScreen />);

        expect(queryByTestId('desktop-handoff-update-hint')).toBeTruthy();
        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();
        expect(getByTestId('scroll-to-current-track')).toBeTruthy();
        expect(getByTestId('clear-phone-queue')).toBeTruthy();
    });

    it('hides handoff actions without a compatible desktop or a valid phone current track', () => {
        const noHandoffStore = {
            ...mockStore,
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueHandoffAvailable: false,
            desktopQueueCurrentTrackAvailable: false,
        };
        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector(noHandoffStore));
        const { queryByTestId, rerender } = render(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();

        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector({
            ...noHandoffStore,
            desktopSocketConnected: false,
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
        }));
        rerender(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();

        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector({
            ...noHandoffStore,
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            mode: 'remote',
        }));
        rerender(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeNull();
        expect(queryByTestId('export-phone-queue')).toBeNull();

        (useStore as unknown as jest.Mock).mockImplementation((selector) => selector({
            ...noHandoffStore,
            desktopQueueHandoffAvailable: true,
            desktopQueueCurrentTrackAvailable: true,
            queue: { ...mockQueue, currentIndex: -1 },
        }));
        rerender(<QueueScreen />);
        expect(queryByTestId('import-desktop-queue')).toBeTruthy();
        expect(queryByTestId('export-phone-queue')).toBeNull();
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
                viewPosition: 0,
            });
        });

        it('follows the track when it advances', () => {
            const { rerender } = renderAt(0);
            mockScrollSpy.scrollToIndex.mockClear();

            advanceTo(rerender, 2);

            expect(mockScrollSpy.scrollToIndex).toHaveBeenCalledWith({
                index: 2,
                animated: true,
                viewPosition: 0,
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
                viewPosition: 0,
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
