import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlayerBar } from './PlayerBar';
import { useStore } from '../../store/store';
import React from 'react';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Play: () => <div data-testid="play-icon" />,
    Pause: () => <div data-testid="pause-icon" />,
    SkipBack: () => <div data-testid="skip-back-icon" />,
    SkipForward: () => <div data-testid="skip-forward-icon" />,
    Volume2: () => <div data-testid="volume-2-icon" />,
    Volume1: () => <div data-testid="volume-1-icon" />,
    VolumeX: () => <div data-testid="volume-x-icon" />,
    Repeat: () => <div data-testid="repeat-icon" />,
    Repeat1: () => <div data-testid="repeat-1-icon" />,
    Shuffle: () => <div data-testid="shuffle-icon" />,
    Cast: () => <div data-testid="cast-icon" />,
    Maximize2: () => <div data-testid="maximize-icon" />,
    Minimize2: () => <div data-testid="minimize-icon" />,
    MoreVertical: () => <div data-testid="more-icon" />,
    List: () => <div data-testid="list-icon" />,
}));

// Mock Zustand store
vi.mock('../../store/store', () => ({
    useStore: vi.fn(),
}));

describe('PlayerBar', () => {
    let mockStore: any;

    beforeEach(() => {
        mockStore = {
            player: {
                currentTrack: { title: 'Test Track', artist: 'Test Artist', duration: 100, streamUrl: 'http://example.com' },
                isPlaying: false,
                currentTime: 0,
                duration: 100,
                volume: 0.8,
                isShuffled: false,
                repeatMode: 'off',
                isMuted: false,
                isCasting: false,
                castDevice: null,
            },
            castDevices: [],
            isQueueVisible: false,
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
            startCastDiscovery: vi.fn(),
            stopCastDiscovery: vi.fn(),
            connectCast: vi.fn(),
            disconnectCast: vi.fn(),
        };
        (useStore as any).mockImplementation((selector?: any) => selector ? selector(mockStore) : mockStore);

        // Mock MediaSession
        (global.window as any).MediaMetadata = class MediaMetadata {
            constructor(metadata: any) { Object.assign(this, metadata); }
        };
        (global.navigator as any).mediaSession = {
            setActionHandler: vi.fn(),
            metadata: null,
            setPositionState: vi.fn(),
        };

        // Mock HTMLAudioElement
        window.HTMLAudioElement.prototype.play = vi.fn().mockResolvedValue(undefined);
        window.HTMLAudioElement.prototype.pause = vi.fn();
        window.HTMLAudioElement.prototype.load = vi.fn();

        // Mock electron bridge
        (window as any).electron = {
            player: {
                updateTime: vi.fn(),
                onSeek: vi.fn(() => () => { }),
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders track info', () => {
        render(<PlayerBar />);
        expect(screen.getByText('Test Track')).toBeInTheDocument();
        expect(screen.getByText('Test Artist')).toBeInTheDocument();
    });

    it('toggles playback', () => {
        render(<PlayerBar />);
        const playBtn = screen.getByTitle('Play');
        fireEvent.click(playBtn);
        expect(mockStore.togglePlay).toHaveBeenCalled();
    });

    it('handles volume wheel', () => {
        const { container } = render(<PlayerBar />);
        const volumeArea = container.querySelector('div[class*="volumeSlider"]');
        fireEvent.wheel(volumeArea!, { deltaY: -100 }); // Scroll up
        expect(mockStore.setVolume).toHaveBeenCalledWith(expect.closeTo(0.85, 5));
    });

    it('handles progress bar interaction', () => {
        const { container } = render(<PlayerBar />);
        const progressBar = container.querySelector('div[class*="progressBar"]');

        vi.spyOn(progressBar!, 'getBoundingClientRect').mockReturnValue({
            left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => { }
        } as DOMRect);

        // Click to seek
        fireEvent.click(progressBar!, { clientX: 50 });
        expect(mockStore.seek).toHaveBeenCalledWith(50);

        // Hover for tooltip
        fireEvent.mouseMove(progressBar!, { clientX: 30 });
        expect(screen.getByText('0:30')).toBeInTheDocument();

        // Mouse leave
        fireEvent.mouseLeave(progressBar!);
        expect(screen.queryByText('0:30')).not.toBeInTheDocument();
    });

    it('handles volume dragging', () => {
        const { container } = render(<PlayerBar />);
        const volumeSlider = container.querySelector('div[class*="volumeSlider"]');

        vi.spyOn(volumeSlider!, 'getBoundingClientRect').mockReturnValue({
            left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => { }
        } as DOMRect);

        // Mouse down starts dragging
        fireEvent.mouseDown(volumeSlider!, { clientX: 50 });
        expect(mockStore.setVolume).toHaveBeenCalledWith(0.5);

        // Global mouse move
        fireEvent.mouseMove(window, { clientX: 70 });
        expect(mockStore.setVolume).toHaveBeenCalledWith(0.7);

        // Global mouse up stops dragging
        fireEvent.mouseUp(window);
        fireEvent.mouseMove(window, { clientX: 90 });
        expect(mockStore.setVolume).not.toHaveBeenCalledWith(0.9);
    });

    it('handles audio element events', () => {
        const { container } = render(<PlayerBar />);
        const audio = container.querySelector('audio')!;

        // Time update
        Object.defineProperty(audio, 'duration', { value: 100, configurable: true });
        audio.currentTime = 10;
        fireEvent.timeUpdate(audio);
        expect(window.electron.player.updateTime).toHaveBeenCalledWith(10, 100);

        // Ended
        fireEvent.ended(audio);
        expect(mockStore.next).toHaveBeenCalled();

        // Error (non-critical)
        fireEvent.error(audio); // Should log console.error but not crash
    });

    it('handles Media Session API actions', () => {
        render(<PlayerBar />);

        // Find handlers registered in useEffect
        const handlers: Record<string, Function> = {};
        (navigator.mediaSession.setActionHandler as any).mock.calls.forEach(([action, handler]: [string, Function]) => {
            handlers[action] = handler;
        });

        handlers['play']();
        expect(mockStore.togglePlay).toHaveBeenCalled();

        handlers['nexttrack']();
        expect(mockStore.next).toHaveBeenCalled();

        handlers['previoustrack']();
        expect(mockStore.previous).toHaveBeenCalled();

        handlers['seekto']({ seekTime: 50 });
        expect(mockStore.seek).toHaveBeenCalledWith(50);
    });

    it('rotates repeat modes', () => {
        render(<PlayerBar />);
        const repeatBtn = screen.getByTitle('Repeat: off');
        fireEvent.click(repeatBtn);
        expect(mockStore.setRepeat).toHaveBeenCalledWith('all');

        mockStore.player.repeatMode = 'all';
        render(<PlayerBar />); // Rerender to update title
        const repeatBtnAll = screen.getByTitle('Repeat: all');
        fireEvent.click(repeatBtnAll);
        expect(mockStore.setRepeat).toHaveBeenCalledWith('one');
    });

    it('handles cast menu and click-outside', async () => {
        mockStore.castDevices = [{ id: 'd1', friendlyName: 'TV' }];
        render(<PlayerBar />);
        const castBtn = screen.getByTitle('Cast to Device');

        // Open menu
        fireEvent.click(castBtn);
        expect(mockStore.startCastDiscovery).toHaveBeenCalled();
        expect(await screen.findByText('TV')).toBeInTheDocument();

        // Click outside closes menu
        fireEvent.mouseDown(document.body);
        await waitFor(() => expect(screen.queryByText('TV')).not.toBeInTheDocument());

        // Re-open and click device
        fireEvent.click(castBtn);
        const deviceBtn = await screen.findByText('TV');
        fireEvent.click(deviceBtn);
        expect(mockStore.connectCast).toHaveBeenCalledWith('d1');
    });

    it('manages electron IPC seek events', () => {
        let seekCallback: Function | null = null;
        (window.electron.player.onSeek as any).mockImplementation((cb: Function) => {
            seekCallback = cb;
            return () => { };
        });

        // Single render
        const { container } = render(<PlayerBar />);
        const renderedAudio = container.querySelector('audio')!;

        expect(seekCallback).toBeDefined();

        // Simulate seek from main process
        seekCallback!(50);
        expect(renderedAudio.currentTime).toBe(50);
    });

    it('registers/unregisters audio listeners on unmount', () => {
        const { container, unmount } = render(<PlayerBar />);
        const audio = container.querySelector('audio')!;
        const removeSpy = vi.spyOn(audio, 'removeEventListener');
        unmount();
        expect(removeSpy).toHaveBeenCalledWith('timeupdate', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });
});
