import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArtistsView } from './ArtistsView';
import { useStore } from '../store/store';
import type { CollectionItem, CollectionViewMode, CoverSize } from '../../shared/types';

vi.mock('../store/store', () => ({
    useStore: vi.fn(),
}));

vi.mock('./Collection/ItemsGrid', () => ({
    ItemsGrid: ({ items, viewMode, coverSize }: {
        items: CollectionItem[];
        viewMode?: CollectionViewMode;
        coverSize?: CoverSize;
    }) => (
        <div
            data-testid="artist-detail-items-grid"
            data-view-mode={viewMode ?? 'default'}
            data-cover-size={coverSize ?? 'default'}
        >
            {items.length} items
        </div>
    ),
}));

vi.mock('./Playlist/AddToPlaylistModal', () => ({
    AddToPlaylistModal: ({ isOpen, onSelectPlaylist }: {
        isOpen: boolean;
        onSelectPlaylist: (playlistId: string) => void | Promise<void>;
    }) => isOpen ? (
        <button onClick={() => { void onSelectPlaylist('playlist-1'); }}>Choose playlist</button>
    ) : null,
}));

function makeTrackItem(id: string, artist: string, title: string, artworkUrl = '') {
    return {
        id: `item-${id}`,
        type: 'track' as const,
        track: {
            id,
            title,
            artist,
            artistId: `artist-${id}`,
            album: 'Test album',
            duration: 180,
            artworkUrl,
            streamUrl: `https://stream.test/${id}.mp3`,
            bandcampUrl: '',
            isCached: false,
        },
    };
}

const collectionItems = [
    makeTrackItem('aster', 'Aster', 'Aster track'),
    makeTrackItem('alpine', 'Alpine', 'Alpine track', 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='),
    makeTrackItem('beacon', 'Beacon', 'Beacon track'),
    makeTrackItem('seven', '7 Wonders', 'Seven track'),
];

function makeStore(overrides: Record<string, unknown> = {}) {
    const store = {
        collection: { items: collectionItems },
        selectedArtistId: null,
        selectArtist: vi.fn(),
        getAlbumDetails: vi.fn(),
        clearQueue: vi.fn(),
        addTracksToQueue: vi.fn(),
        playQueueIndex: vi.fn(),
        addTracksToPlaylist: vi.fn(),
        downloadTrack: vi.fn(),
        cachedTrackIds: new Set(['beacon']),
        cachedAlbumIds: new Set<string>(),
        downloadingTracks: new Set(['seven']),
        downloadingAlbumIds: new Set<string>(),
        artists_view_mode: 'grid',
        artists_cover_size: 'medium',
        setArtistsViewMode: vi.fn(),
        setArtistsCoverSize: vi.fn(),
        settings: { offlineMode: false, deduplicateCollection: false },
        goBack: vi.fn(),
        ...overrides,
    };
    vi.mocked(useStore).mockReturnValue(store as never);
    return store;
}

describe('ArtistsView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        makeStore();
    });

    it.each([
        ['grid', 'small'],
        ['grid', 'medium'],
        ['grid', 'large'],
        ['list', 'small'],
        ['list', 'medium'],
        ['list', 'large'],
    ] as const)('renders all artist groups in %s/%s mode', (viewMode, coverSize) => {
        makeStore({ artists_view_mode: viewMode, artists_cover_size: coverSize });
        render(<ArtistsView />);

        const layouts = screen.getAllByTestId('artists-layout');
        expect(layouts).toHaveLength(3);
        for (const layout of layouts) {
            expect(layout).toHaveAttribute('data-layout', viewMode);
            expect(layout).toHaveAttribute('data-size', coverSize);
            expect(layout.className).toMatch(viewMode === 'grid' ? /grid/ : /list/);
            expect(layout.className).toMatch(new RegExp(`size${coverSize[0].toUpperCase()}${coverSize.slice(1)}`));
        }
        expect(screen.getAllByTestId('artists-card')).toHaveLength(4);

        fireEvent.click(screen.getByTestId('artists-view-toggle-btn'));
        expect(screen.getByTestId(`artists-view-${viewMode}-btn`)).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId(`artists-cover-${coverSize}-btn`)).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps alphabetical groups, supports search, and reports no matches', () => {
        render(<ArtistsView />);

        expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['A', 'B', '#']);
        fireEvent.change(screen.getByPlaceholderText('Search..'), { target: { value: 'beac' } });
        expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['B']);
        expect(screen.getByTestId('artists-card')).toHaveAttribute('data-artist-id', 'name-beacon');

        fireEvent.change(screen.getByPlaceholderText('Search..'), { target: { value: 'nothing here' } });
        expect(screen.getByText('No artists found')).toBeInTheDocument();
    });

    it('keeps placeholder artwork and offline/download badges', () => {
        render(<ArtistsView />);

        expect(screen.getByText('A', { selector: 'div' })).toBeInTheDocument();
        expect(screen.getByTitle('All content available offline')).toBeInTheDocument();
        expect(screen.getByTitle('Downloading…')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Alpine' })).toHaveAttribute('loading', 'lazy');
    });

    it('navigates by card click or keyboard, while action controls do not select the artist', async () => {
        const store = makeStore();
        render(<ArtistsView />);
        const asterCard = screen.getByRole('group', { name: 'Aster, 1 item' });

        fireEvent.click(asterCard);
        expect(store.selectArtist).toHaveBeenCalledWith('name-aster');
        store.selectArtist.mockClear();

        fireEvent.keyDown(asterCard, { key: 'Enter' });
        expect(store.selectArtist).toHaveBeenCalledWith('name-aster');
        store.selectArtist.mockClear();

        fireEvent.click(screen.getByRole('button', { name: 'More options for Aster' }));
        expect(store.selectArtist).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Play Now' }));

        await waitFor(() => expect(store.playQueueIndex).toHaveBeenCalledWith(0));
        expect(store.clearQueue).toHaveBeenCalledWith(false);
        expect(store.addTracksToQueue).toHaveBeenCalledWith([collectionItems[0].track]);
        expect(store.selectArtist).not.toHaveBeenCalled();
    });

    it('preserves playlist and download actions from the artist menu', async () => {
        const store = makeStore();
        render(<ArtistsView />);

        fireEvent.click(screen.getByRole('button', { name: 'More options for Aster' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add to Playlist' }));
        fireEvent.click(screen.getByRole('button', { name: 'Choose playlist' }));
        await waitFor(() => expect(store.addTracksToPlaylist).toHaveBeenCalledWith('playlist-1', [collectionItems[0].track]));

        fireEvent.click(screen.getByRole('button', { name: 'More options for Aster' }));
        fireEvent.click(screen.getByRole('button', { name: 'Download for Offline' }));
        await waitFor(() => expect(store.downloadTrack).toHaveBeenCalledWith(collectionItems[0].track));
        expect(store.selectArtist).not.toHaveBeenCalled();
    });

    it('keeps the inline play action available in list mode without selecting the card', async () => {
        const store = makeStore({ artists_view_mode: 'list' });
        render(<ArtistsView />);

        fireEvent.click(screen.getByRole('button', { name: 'Play Aster' }));
        await waitFor(() => expect(store.playQueueIndex).toHaveBeenCalledWith(0));
        expect(store.selectArtist).not.toHaveBeenCalled();
    });

    it('keeps artist detail ItemsGrid on its existing defaults', () => {
        makeStore({ selectedArtistId: 'name-aster', artists_view_mode: 'list', artists_cover_size: 'large' });
        render(<ArtistsView />);

        expect(screen.getByRole('heading', { level: 1, name: 'Aster' })).toBeInTheDocument();
        expect(screen.getByTestId('artist-detail-items-grid')).toHaveAttribute('data-view-mode', 'default');
        expect(screen.getByTestId('artist-detail-items-grid')).toHaveAttribute('data-cover-size', 'default');
        expect(screen.queryByTestId('artists-view-toggle-btn')).not.toBeInTheDocument();
    });
});
