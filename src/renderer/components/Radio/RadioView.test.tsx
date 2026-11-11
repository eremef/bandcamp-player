import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RadioView } from './RadioView';
import '@testing-library/jest-dom';

const observerCallbacks: IntersectionObserverCallback[] = [];
class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];

    constructor(callback: IntersectionObserverCallback) {
        observerCallbacks.push(callback);
    }

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
}

window.IntersectionObserver = MockIntersectionObserver;

// Mock store
const mockUseStore = vi.fn();
vi.mock('../../store/store', () => ({
    useStore: () => mockUseStore()
}));

type RadioStationFixture = {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    date?: string;
    duration?: number;
};

type RadioStoreMock = {
    radioStations: RadioStationFixture[];
    fetchRadioStations: ReturnType<typeof vi.fn>;
    refreshRadioStations: ReturnType<typeof vi.fn>;
    isLoadingRadioStations: boolean;
    playRadioStation: ReturnType<typeof vi.fn>;
    radioState: { isActive: boolean; currentStation?: RadioStationFixture };
    stopRadio: ReturnType<typeof vi.fn>;
    addRadioToQueue: ReturnType<typeof vi.fn>;
    addRadioToPlaylist: ReturnType<typeof vi.fn>;
    extractRadioToPlaylist: ReturnType<typeof vi.fn>;
    playlists: { id: string; name: string }[];
    fetchPlaylists: ReturnType<typeof vi.fn>;
    radioSearchQuery: string;
    setRadioSearchQuery: ReturnType<typeof vi.fn>;
    playQueueIndex: ReturnType<typeof vi.fn>;
    clearQueue: ReturnType<typeof vi.fn>;
    selectRadioStation: ReturnType<typeof vi.fn>;
    radio_view_mode: 'grid' | 'list';
    radio_cover_size: 'small' | 'medium' | 'large';
    setRadioViewMode: ReturnType<typeof vi.fn>;
    setRadioCoverSize: ReturnType<typeof vi.fn>;
};

const mockStations: RadioStationFixture[] = [
    {
        id: 'station-1',
        name: 'Test Station',
        description: 'A test station',
        imageUrl: 'test.jpg',
        date: 'Oct 28, 2026',
        duration: 3720,
    },
];

const createMockStore = (): RadioStoreMock => ({
    radioStations: mockStations,
    fetchRadioStations: vi.fn(),
    refreshRadioStations: vi.fn(),
    isLoadingRadioStations: false,
    playRadioStation: vi.fn(),
    radioState: { isActive: false },
    stopRadio: vi.fn(),
    addRadioToQueue: vi.fn(),
    addRadioToPlaylist: vi.fn(),
    extractRadioToPlaylist: vi.fn(),
    playlists: [{ id: 'p1', name: 'My Playlist' }],
    fetchPlaylists: vi.fn(),
    radioSearchQuery: '',
    setRadioSearchQuery: vi.fn(),
    playQueueIndex: vi.fn(),
    clearQueue: vi.fn(),
    selectRadioStation: vi.fn(),
    radio_view_mode: 'grid',
    radio_cover_size: 'medium',
    setRadioViewMode: vi.fn(),
    setRadioCoverSize: vi.fn(),
});

describe('RadioView', () => {
    let store: RadioStoreMock;

    beforeEach(() => {
        vi.clearAllMocks();
        observerCallbacks.length = 0;
        store = createMockStore();
        mockUseStore.mockReturnValue(store);
    });

    it('renders the menu button on station cards', () => {
        render(<RadioView />);

        const menuButton = screen.getByTitle('More options');
        expect(menuButton).toBeInTheDocument();
    });

    it('opens context menu when menu button is clicked', () => {
        render(<RadioView />);

        const menuButton = screen.getByTitle('More options');
        fireEvent.click(menuButton);

        expect(screen.getAllByText('Play').length).toBeGreaterThan(0);
        expect(screen.getByText('Play Next')).toBeInTheDocument();
        expect(screen.getAllByText('Add to Queue').length).toBeGreaterThan(0);
    });

    it('triggers actions from context menu', async () => {
        const mockAddRadioToQueue = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            addRadioToQueue: mockAddRadioToQueue
        });

        render(<RadioView />);

        // Open menu
        const menuButton = screen.getByTitle('More options');
        fireEvent.click(menuButton);

        // Click action
        fireEvent.click(screen.getAllByText('Add to Queue')[0]);

        expect(mockAddRadioToQueue).toHaveBeenCalledWith(mockStations[0], false);

        // Wait for state update to complete to avoid act warning
        await waitFor(() => {
            expect(screen.queryByText('Play Next')).not.toBeInTheDocument();
        });
    });

    it('filters stations based on search query', () => {
        const mockSetRadioSearchQuery = vi.fn();
        mockUseStore.mockReturnValue({
            ...mockUseStore(),
            radioSearchQuery: 'weekly',
            setRadioSearchQuery: mockSetRadioSearchQuery,
            radioStations: [
                { id: '1', name: 'Bandcamp Weekly', description: 'Curated' },
                { id: '2', name: 'Hip Hop', description: 'Beats' }
            ]
        });

        render(<RadioView />);

        // Should focus on filtered list logic.
        // The implementation uses useMemo to filter radioStations based on radioSearchQuery.
        // Since we mocked radioSearchQuery as 'weekly', it should only show 'Bandcamp Weekly'.
        expect(screen.getByText('Bandcamp Weekly')).toBeInTheDocument();
        expect(screen.queryByText('Hip Hop')).not.toBeInTheDocument();

        // Check search input value
        const searchInput = screen.getByPlaceholderText('Search radio shows...');
        expect(searchInput).toHaveValue('weekly');

        // Test changing search query
        fireEvent.change(searchInput, { target: { value: 'beats' } });
        expect(mockSetRadioSearchQuery).toHaveBeenCalledWith('beats');
    });

    it.each([
        ['grid', 'small'],
        ['grid', 'medium'],
        ['grid', 'large'],
        ['list', 'small'],
        ['list', 'medium'],
        ['list', 'large'],
    ] as const)('renders %s layout with %s cards', (mode, size) => {
        mockUseStore.mockReturnValue({
            ...store,
            radio_view_mode: mode,
            radio_cover_size: size,
        });

        render(<RadioView />);

        const layout = screen.getByTestId('radio-layout');
        expect(layout).toHaveAttribute('data-layout', mode);
        expect(layout).toHaveAttribute('data-size', size);
        fireEvent.click(screen.getByTestId('radio-view-toggle-btn'));
        expect(screen.getByTestId(`radio-view-${mode}-btn`)).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId(`radio-cover-${size}-btn`)).toHaveAttribute('aria-pressed', 'true');
    });

    it('uses radio preference setters without fetching or restarting playback', () => {
        render(<RadioView />);

        fireEvent.click(screen.getByTestId('radio-view-toggle-btn'));
        fireEvent.click(screen.getByTestId('radio-view-list-btn'));
        expect(store.setRadioViewMode).toHaveBeenCalledWith('list');

        fireEvent.click(screen.getByTestId('radio-view-toggle-btn'));
        fireEvent.click(screen.getByTestId('radio-cover-small-btn'));
        expect(store.setRadioCoverSize).toHaveBeenCalledWith('small');
        expect(store.fetchRadioStations).not.toHaveBeenCalled();
        expect(store.playRadioStation).not.toHaveBeenCalled();
    });

    it('keeps metadata, placeholder artwork, and active station state', () => {
        mockUseStore.mockReturnValue({
            ...store,
            radioStations: [
                ...mockStations,
                { id: 'station-2', name: 'No Art Station', description: 'No artwork or date' },
            ],
            radioState: { isActive: true, currentStation: mockStations[0] },
        });

        render(<RadioView />);

        expect(screen.getByText('Oct 28, 2026 • 1h 2m')).toBeInTheDocument();
        expect(screen.getByText('A test station')).toBeInTheDocument();
        expect(screen.getByText('No Art Station')).toBeInTheDocument();
        expect(screen.getByText('No artwork or date')).toBeInTheDocument();
        expect(screen.getAllByTestId('radio-card')[0]).toHaveClass(/active/);
    });

    it('keeps primary and external actions separate from station selection', () => {
        render(<RadioView />);

        fireEvent.click(screen.getByTitle('Play Mix'));
        expect(store.playRadioStation).toHaveBeenCalledWith(mockStations[0]);
        fireEvent.click(screen.getByTitle('Play Tracks'));
        expect(window.electron.radio.extractTracks).toHaveBeenCalledWith(mockStations[0], false);
        fireEvent.click(screen.getByTitle('View on Bandcamp'));
        expect(window.electron.system.openExternal).toHaveBeenCalledWith(
            'https://bandcamp.com/?show=station-1',
        );
        expect(store.selectRadioStation).not.toHaveBeenCalled();
    });

    it('supports keyboard activation on station cards without activating from child controls', () => {
        render(<RadioView />);

        const station = screen.getByTestId('radio-card');
        station.focus();
        fireEvent.keyDown(station, { key: 'Enter' });
        expect(store.selectRadioStation).toHaveBeenCalledWith(mockStations[0]);

        store.selectRadioStation.mockClear();
        fireEvent.keyDown(screen.getByTitle('Play Mix'), { key: 'Enter' });
        expect(store.selectRadioStation).not.toHaveBeenCalled();
    });

    it('continues loading radio results beyond twenty and stops at the final batch', async () => {
        const stations = Array.from({ length: 45 }, (_, index) => ({
            id: `station-${index + 1}`,
            name: `Station ${index + 1}`,
            description: 'Long list fixture',
            imageUrl: '',
        }));
        mockUseStore.mockReturnValue({ ...store, radioStations: stations });

        render(<RadioView />);
        expect(screen.getAllByTestId('radio-card')).toHaveLength(20);
        expect(screen.getByTestId('radio-load-more-sentinel')).toBeInTheDocument();

        const triggerIntersection = () => {
            const callback = observerCallbacks.at(-1);
            expect(callback).toBeDefined();
            act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
        };

        triggerIntersection();
        await waitFor(() => expect(screen.getAllByTestId('radio-card')).toHaveLength(40));
        triggerIntersection();
        await waitFor(() => expect(screen.getAllByTestId('radio-card')).toHaveLength(45));
        expect(screen.queryByTestId('radio-load-more-sentinel')).not.toBeInTheDocument();
        expect(store.fetchRadioStations).not.toHaveBeenCalled();
    });
});
