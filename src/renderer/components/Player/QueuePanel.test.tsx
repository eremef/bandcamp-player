import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuePanel } from './QueuePanel';
import { useStore } from '../../store/store';

// Mock the store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-x" />,
    Play: () => <span data-testid="icon-play" />,
    Trash2: () => <span data-testid="icon-trash" />,
}));

describe('QueuePanel', () => {
    const mockStore = {
        queue: {
            items: [
                { id: 'q1', track: { title: 'Track 1', artist: 'Artist 1', artworkUrl: 'art1.jpg' } },
                { id: 'q2', track: { title: 'Track 2', artist: 'Artist 2', artworkUrl: 'art2.jpg' } }
            ],
            currentIndex: 0
        },
        player: { isPlaying: true },
        playQueueIndex: vi.fn(),
        removeFromQueue: vi.fn(),
        clearQueue: vi.fn(),
        toggleQueue: vi.fn(),
    };

    beforeEach(() => {
        (useStore as any).mockReturnValue(mockStore);
        vi.clearAllMocks();
    });

    it('renders queue items', () => {
        render(<QueuePanel />);
        expect(screen.getByText('Queue')).toBeInTheDocument();
        expect(screen.getByText('Track 1')).toBeInTheDocument();
        expect(screen.getByText('Track 2')).toBeInTheDocument();
        expect(screen.getByText('2 tracks')).toBeInTheDocument();
    });

    it('shows empty state', () => {
        (useStore as any).mockReturnValue({ ...mockStore, queue: { items: [], currentIndex: -1 } });
        render(<QueuePanel />);
        expect(screen.getByText('Queue is empty')).toBeInTheDocument();
    });

    it('calls playQueueIndex on item click', () => {
        render(<QueuePanel />);
        const playBtns = screen.getAllByTitle('Play');
        fireEvent.click(playBtns[1]);
        expect(mockStore.playQueueIndex).toHaveBeenCalledWith(1);
    });

    it('calls removeFromQueue on trash icon click', () => {
        render(<QueuePanel />);
        const removeBtns = screen.getAllByTitle('Remove');
        fireEvent.click(removeBtns[0]);
        expect(mockStore.removeFromQueue).toHaveBeenCalledWith('q1');
    });

    it('calls clearQueue on Clear button click', () => {
        render(<QueuePanel />);
        const clearBtn = screen.getByText('Clear');
        fireEvent.click(clearBtn);
        expect(mockStore.clearQueue).toHaveBeenCalled();
    });

    it('calls toggleQueue on Close button click', () => {
        render(<QueuePanel />);
        const closeBtn = screen.getByTitle('Close');
        fireEvent.click(closeBtn);
        expect(mockStore.toggleQueue).toHaveBeenCalled();
    });

    it('highlights current track', () => {
        const { container } = render(<QueuePanel />);
        const items = container.querySelectorAll('li');
        // Index 0 is current
        expect(items[0].className).toContain('current');
        // Should show play icon for current track if playing
        expect(screen.getByTestId('icon-play')).toBeInTheDocument();
    });
});
