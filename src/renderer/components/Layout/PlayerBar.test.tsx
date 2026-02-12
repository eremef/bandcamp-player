import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlayerBar } from './PlayerBar';
import { useStore } from '../../store/store';

// Mock the store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Shuffle: () => <span data-testid="icon-shuffle" />,
    SkipBack: () => <span data-testid="icon-skip-back" />,
    Play: () => <span data-testid="icon-play" />,
    Pause: () => <span data-testid="icon-pause" />,
    SkipForward: () => <span data-testid="icon-skip-forward" />,
    Repeat: () => <span data-testid="icon-repeat" />,
    Repeat1: () => <span data-testid="icon-repeat-1" />,
    VolumeX: () => <span data-testid="icon-volume-x" />,
    Volume1: () => <span data-testid="icon-volume-1" />,
    Volume2: () => <span data-testid="icon-volume-2" />,
    List: () => <span data-testid="icon-list" />,
    Minimize2: () => <span data-testid="icon-minimize-2" />,
    Cast: () => <span data-testid="icon-cast" />,
}));

// Mock electron
const mockUpdatePlayerTime = vi.fn();
const mockOnSeek = vi.fn(() => () => { });

Object.defineProperty(window, 'electron', {
    value: {
        player: {
            updateTime: mockUpdatePlayerTime,
            onSeek: mockOnSeek,
        },
        cast: {
            startDiscovery: vi.fn(),
            stopDiscovery: vi.fn(),
            getDevices: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            onDevicesUpdated: vi.fn(() => () => { }),
            onStatusChanged: vi.fn(() => () => { }),
        },
    },
    writable: true,
});

describe('PlayerBar', () => {
    const mockStore = {
        player: {
            isPlaying: false,
            currentTrack: null,
            currentTime: 0,
            duration: 0,
            volume: 0.8,
            isMuted: false,
            repeatMode: 'off',
            isShuffled: false,
            isCasting: false,
            castDevice: undefined,
        },
        togglePlay: vi.fn(),
        next: vi.fn(),
        previous: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        toggleMute: vi.fn(),
        toggleShuffle: vi.fn(),
        setRepeat: vi.fn(),
        toggleQueue: vi.fn(),
        toggleMiniPlayer: vi.fn(),
        isQueueVisible: false,
        castDevices: [],
        castStatus: { status: 'disconnected' },
        startCastDiscovery: vi.fn(),
        stopCastDiscovery: vi.fn(),
        connectCast: vi.fn(),
        disconnectCast: vi.fn(),
    };

    beforeEach(() => {
        (useStore as any).mockReturnValue(mockStore);
        vi.clearAllMocks();
    });

    it('renders without crashing', () => {
        render(<PlayerBar />);
        expect(screen.getByText('No track playing')).toBeInTheDocument();
    });

    it('displays track info when track is playing', () => {
        const trackStore = {
            ...mockStore,
            player: {
                ...mockStore.player,
                currentTrack: {
                    title: 'Test Song',
                    artist: 'Test Artist',
                    artworkUrl: 'http://test.com/art.jpg',
                },
            },
        };
        (useStore as any).mockReturnValue(trackStore);

        render(<PlayerBar />);
        expect(screen.getByText('Test Song')).toBeInTheDocument();
        expect(screen.getByText('Test Artist')).toBeInTheDocument();
    });

    it('calls togglePlay when play button is clicked', () => {
        render(<PlayerBar />);
        const playBtn = screen.getByTitle('Play');
        fireEvent.click(playBtn);
        expect(mockStore.togglePlay).toHaveBeenCalled();
    });

    it('calls next/previous when buttons are clicked', () => {
        render(<PlayerBar />);
        const nextBtn = screen.getByTitle('Next');
        const prevBtn = screen.getByTitle('Previous');

        fireEvent.click(nextBtn);
        expect(mockStore.next).toHaveBeenCalled();

        fireEvent.click(prevBtn);
        expect(mockStore.previous).toHaveBeenCalled();
    });

    it('calls toggleShuffle when shuffle button is clicked', () => {
        render(<PlayerBar />);
        const shuffleBtn = screen.getByTitle('Shuffle');
        fireEvent.click(shuffleBtn);
        expect(mockStore.toggleShuffle).toHaveBeenCalled();
    });

    it('toggles repeat mode when repeat button is clicked', () => {
        render(<PlayerBar />);
        const repeatBtn = screen.getByTitle('Repeat: off');
        fireEvent.click(repeatBtn);
        // Logic inside component handles rotation, but we mock the store function
        // The component calls setRepeat('all') if current is 'off'
        expect(mockStore.setRepeat).toHaveBeenCalledWith('all');
    });

    it('toggles queue visibility', () => {
        render(<PlayerBar />);
        const queueBtn = screen.getByTitle('Queue');
        fireEvent.click(queueBtn);
        expect(mockStore.toggleQueue).toHaveBeenCalled();
    });

    it('seeks when progress bar is clicked', () => {
        const trackStore = {
            ...mockStore,
            player: { ...mockStore.player, duration: 200, currentTime: 50 },
        };
        (useStore as any).mockReturnValue(trackStore);

        const { container } = render(<PlayerBar />);

        // Find the progress bar container (using class selector as it might not have role)
        // Note: In a real app we might want to add data-testid to the progress bar
        const progressBar = container.querySelector('div[class*="progressBar"]');
        expect(progressBar).toBeInTheDocument();

        if (progressBar) {
            // Mock getBoundingClientRect
            vi.spyOn(progressBar, 'getBoundingClientRect').mockReturnValue({
                left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => { }
            });

            // Click at 50% width
            fireEvent.click(progressBar, { clientX: 50 });

            // 50% of 200s = 100s
            // The component calls audio.currentTime = seekTime AND seek(seekTime)
            expect(mockStore.seek).toHaveBeenCalledWith(100);
        }
    });

    it('changes volume when volume slider is clicked', () => {
        const { container } = render(<PlayerBar />);
        const volumeSlider = container.querySelector('div[class*="volumeSlider"]');
        expect(volumeSlider).toBeInTheDocument();

        if (volumeSlider) {
            vi.spyOn(volumeSlider, 'getBoundingClientRect').mockReturnValue({
                left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => { }
            });

            // Click at 25% width
            fireEvent.mouseDown(volumeSlider, { clientX: 25 });

            expect(mockStore.setVolume).toHaveBeenCalledWith(0.25);
        }
    });
});
