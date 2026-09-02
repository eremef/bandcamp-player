import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { QueuePanel } from './QueuePanel';
import { useStore } from '../../store/store';

// The real Virtuoso can never report a scroll under happy-dom: its scroll callback early-returns
// while the scroller's offsetHeight is 0. So this file mocks react-virtuoso to expose the handle
// and the props QueuePanel drives, and QueuePanel.test.tsx keeps exercising the real one.
const scrollToIndexSpy = vi.hoisted(() => vi.fn());
const virtuosoPropsRef = vi.hoisted(() => ({ current: null as any }));

vi.mock('react-virtuoso', () => {
    const VirtuosoStub = forwardRef(function VirtuosoStub(props: any, ref) {
        useImperativeHandle(ref, () => ({ scrollToIndex: scrollToIndexSpy }));
        // Captured in an effect rather than during render; render() flushes effects, so the
        // props are available to assertions and to tests that drive rangeChanged directly.
        useEffect(() => { virtuosoPropsRef.current = props; });
        const { List, Item } = props.components;
        return (
            <List>
                {props.data.map((item: any, i: number) => (
                    <Item key={i} data-index={i} context={props.context}>
                        {props.itemContent(i, item, props.context)}
                    </Item>
                ))}
            </List>
        );
    });
    return { Virtuoso: VirtuosoStub };
});

vi.mock('../../store/store', () => ({ useStore: vi.fn() }));

vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-x" />,
    Play: () => <span data-testid="icon-play" />,
    Trash2: () => <span data-testid="icon-trash" />,
    ChevronsDownIcon: () => <span data-testid="icon-chevrons-down" />,
    ListX: () => <span data-testid="icon-list-x" />,
}));

const items = Array.from({ length: 8 }, (_, i) => ({
    id: `q${i}`,
    track: { title: `Track ${i}`, artist: `Artist ${i}`, artworkUrl: `art${i}.jpg` },
}));

const baseStore = {
    player: { isPlaying: true },
    playQueueIndex: vi.fn(),
    removeFromQueue: vi.fn(),
    clearQueue: vi.fn(),
    toggleQueue: vi.fn(),
    reorderQueue: vi.fn(),
    knownArtists: new Set(),
    knownAlbums: new Set(),
};

const withIndex = (currentIndex: number) => ({
    ...baseStore,
    queue: { items, currentIndex },
});

describe('QueuePanel auto-scroll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        virtuosoPropsRef.current = null;
    });

    it('opens scrolled to the current track without an imperative scroll', () => {
        (useStore as any).mockReturnValue(withIndex(3));
        render(<QueuePanel />);

        // Mount-time positioning is the prop's job, not scrollToIndex's.
        expect(virtuosoPropsRef.current.initialTopMostItemIndex).toBe(3);
        expect(scrollToIndexSpy).not.toHaveBeenCalled();
    });

    it('trims the initial window so it cannot run past the end of a short queue', () => {
        (useStore as any).mockReturnValue(withIndex(7));
        render(<QueuePanel />);

        const { initialTopMostItemIndex, initialItemCount } = virtuosoPropsRef.current;
        expect(initialTopMostItemIndex + initialItemCount).toBeLessThanOrEqual(items.length);
    });

    it('follows the track when it advances', () => {
        (useStore as any).mockReturnValue(withIndex(0));
        const { rerender } = render(<QueuePanel />);

        (useStore as any).mockReturnValue(withIndex(1));
        rerender(<QueuePanel />);

        expect(scrollToIndexSpy).toHaveBeenCalledWith({
            index: 1,
            align: 'center',
            behavior: 'smooth',
        });
    });

    it('does not follow when the user has scrolled the playing track out of view', () => {
        (useStore as any).mockReturnValue(withIndex(0));
        const { rerender } = render(<QueuePanel />);

        act(() => { virtuosoPropsRef.current.rangeChanged({ startIndex: 5, endIndex: 7 }); });

        (useStore as any).mockReturnValue(withIndex(1));
        rerender(<QueuePanel />);

        expect(scrollToIndexSpy).not.toHaveBeenCalled();
    });

    it('follows again once the playing track is back in view', () => {
        (useStore as any).mockReturnValue(withIndex(0));
        const { rerender } = render(<QueuePanel />);

        act(() => { virtuosoPropsRef.current.rangeChanged({ startIndex: 5, endIndex: 7 }); });
        act(() => { virtuosoPropsRef.current.rangeChanged({ startIndex: 0, endIndex: 4 }); });

        (useStore as any).mockReturnValue(withIndex(2));
        rerender(<QueuePanel />);

        expect(scrollToIndexSpy).toHaveBeenCalledWith({
            index: 2,
            align: 'center',
            behavior: 'smooth',
        });
    });

    it('does not yank the list while a row is being dragged', () => {
        (useStore as any).mockReturnValue(withIndex(0));
        const { container, rerender } = render(<QueuePanel />);

        fireEvent.dragStart(container.querySelectorAll('li')[0]);

        (useStore as any).mockReturnValue(withIndex(1));
        rerender(<QueuePanel />);

        expect(scrollToIndexSpy).not.toHaveBeenCalled();
    });

    it('does not scroll when nothing is playing', () => {
        (useStore as any).mockReturnValue(withIndex(0));
        const { rerender } = render(<QueuePanel />);

        (useStore as any).mockReturnValue(withIndex(-1));
        rerender(<QueuePanel />);

        expect(scrollToIndexSpy).not.toHaveBeenCalled();
    });
});
