import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionView } from "./CollectionView";
import { useStore } from "../../store/store";
import type { BulkJobProgress } from "../../../shared/types";

vi.mock("../../store/store", () => ({
  useStore: vi.fn(),
}));

vi.mock("../../hooks/useIntersectionObserver", () => ({
  useIntersectionObserver: vi.fn().mockReturnValue({ current: null }),
}));

// ItemsGrid is mocked with a render counter *and* wrapped in memo, mirroring the
// real component. The whole point of moving bulk progress out of CollectionView's
// state is that progress ticks must not re-render the (unvirtualized) grid — which
// only holds if CollectionView hands it referentially stable props.
let gridRenderCount = 0;
const gridProps: any[] = [];
vi.mock("./ItemsGrid", async () => {
  const { memo } = await import("react");
  return {
    ItemsGrid: memo((props: any) => {
      gridRenderCount++;
      gridProps.push(props);
      return <div data-testid="items-grid" />;
    }),
  };
});

vi.mock("../Playlist/AddToPlaylistModal", () => ({
  AddToPlaylistModal: ({ isOpen, onSelectPlaylist }: any) =>
    isOpen ? (
      <button
        data-testid="pick-playlist"
        onClick={() => onSelectPlaylist("pl-1")}
      />
    ) : null,
}));

vi.mock("lucide-react", () => ({
  Search: () => <span />,
  X: () => <span />,
  RefreshCw: ({ className }: any) => (
    <span data-testid="icon-refresh" className={className} />
  ),
  ArrowUpDown: () => <span />,
  List: () => <span />,
  SkipForward: () => <span />,
  Play: () => <span />,
  Music: () => <span />,
  MoreHorizontal: () => <span data-testid="icon-more" />,
  Download: () => <span />,
  WifiOff: () => <span />,
  SlidersHorizontal: () => <span />,
  Check: () => <span />,
  Disc: () => <span />,
  Heart: () => <span />,
  Calendar: () => <span />,
  Drum: () => <span />,
  Quote: () => <span />,
  ArrowUp: () => <span />,
  ArrowDown: () => <span />,
  Disc3: () => <span />,
  LayoutGrid: () => <span />,
  Rows3: () => <span />,
  Rows2: () => <span />,
  Grid3X3: () => <span />,
  Grid2X2: () => <span />,
  Square: () => <span />,
  Maximize2: () => <span />,
}));

const album = (id: string) => ({
  id,
  type: "album" as const,
  album: {
    id,
    title: `Album ${id}`,
    artist: "Artist",
    artworkUrl: "",
    bandcampUrl: `https://bc/${id}`,
    tracks: [],
    trackCount: 2,
  },
});

describe("CollectionView bulk actions", () => {
  const startBulkAction = vi.fn();
  const cancelBulkAction = vi.fn();

  const baseStore: any = {
    collection: { items: [album("1"), album("2"), album("3")], totalCount: 3 },
    isLoadingCollection: false,
    isRefreshingCollection: false,
    collectionError: null,
    fetchCollection: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    getAlbumDetails: vi.fn(),
    settings: { offlineMode: false },
    collection_sort_key: "default",
    collection_sort_direction: "desc",
    collectionFilterAlbums: true,
    collectionFilterTracks: true,
    collectionFilterWishlist: true,
    collectionFilterDownloaded: false,
    setCollectionSortKey: vi.fn(),
    setCollectionSortDirection: vi.fn(),
    setCollectionFilterAlbums: vi.fn(),
    setCollectionFilterTracks: vi.fn(),
    setCollectionFilterWishlist: vi.fn(),
    setCollectionFilterDownloaded: vi.fn(),
    collection_view_mode: "grid",
    collection_cover_size: "medium",
    setCollectionViewMode: vi.fn(),
    setCollectionCoverSize: vi.fn(),
    cachedAlbumIds: new Set<string>(),
    cachedTrackIds: new Set<string>(),
    playlists: [],
    bulkJob: null,
    startBulkAction,
    cancelBulkAction,
  };

  const setStore = (overrides: any = {}) => {
    const state = { ...baseStore, ...overrides };
    (useStore as any).mockImplementation((selector?: (s: any) => unknown) =>
      selector ? selector(state) : state,
    );
    return state;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gridRenderCount = 0;
    gridProps.length = 0;
    setStore();
  });

  const openBulkMenu = () => {
    fireEvent.click(screen.getByTitle("Bulk actions for current view"));
  };

  it("dispatches a bulk job with the sorted items and does not await", () => {
    // A pending promise would hang the handler if it were awaited
    startBulkAction.mockReturnValue(new Promise(() => { }));
    render(<CollectionView />);

    openBulkMenu();
    fireEvent.click(screen.getByText(/Add to Queue/));

    expect(startBulkAction).toHaveBeenCalledTimes(1);
    const request = startBulkAction.mock.calls[0][0];
    expect(request.action).toBe("addToQueue");
    expect(request.items).toHaveLength(3);
    expect(request.label).toBe("Collection");
    // The menu closed synchronously, proving the handler returned
    expect(screen.queryByText(/Add to Queue/)).not.toBeInTheDocument();
  });

  it("maps each menu entry to its action", () => {
    render(<CollectionView />);

    openBulkMenu();
    fireEvent.click(screen.getByText(/Play All/));
    expect(startBulkAction.mock.calls[0][0].action).toBe("play");

    openBulkMenu();
    fireEvent.click(screen.getByText(/Play Next/));
    expect(startBulkAction.mock.calls[1][0].action).toBe("playNext");

    openBulkMenu();
    fireEvent.click(screen.getByText(/Download All/));
    expect(startBulkAction.mock.calls[2][0].action).toBe("download");
  });

  it("passes the chosen playlist id through for addToPlaylist", () => {
    render(<CollectionView />);

    openBulkMenu();
    fireEvent.click(screen.getByText(/Add to Playlist/));
    fireEvent.click(screen.getByTestId("pick-playlist"));

    const request = startBulkAction.mock.calls[0][0];
    expect(request.action).toBe("addToPlaylist");
    expect(request.playlistId).toBe("pl-1");
  });

  it("hides the download entry in offline mode", () => {
    setStore({ settings: { offlineMode: true } });
    render(<CollectionView />);

    openBulkMenu();
    expect(screen.queryByText(/Download All/)).not.toBeInTheDocument();
    expect(screen.getByText(/Add to Queue/)).toBeInTheDocument();
  });

  it("shows progress instead of the menu trigger while a job runs", () => {
    const job: BulkJobProgress = {
      id: "bulk-1",
      action: "addToQueue",
      total: 3,
      completed: 1,
      failed: 0,
      tracksQueued: 2,
      status: "running",
    };
    setStore({ bulkJob: job });
    render(<CollectionView />);

    expect(screen.getByTestId("bulk-progress")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(
      screen.queryByTitle("Bulk actions for current view"),
    ).not.toBeInTheDocument();
  });

  it("does not re-render the item grid when bulk progress advances", () => {
    const makeJob = (completed: number): BulkJobProgress => ({
      id: "bulk-1",
      action: "addToQueue",
      total: 100,
      completed,
      failed: 0,
      tracksQueued: completed * 2,
      status: "running",
    });

    setStore({ bulkJob: makeJob(1) });
    const { rerender } = render(<CollectionView />);
    const afterFirstRender = gridRenderCount;
    expect(afterFirstRender).toBeGreaterThan(0);

    // Simulate a burst of progress ticks
    for (let i = 2; i <= 8; i++) {
      setStore({ bulkJob: makeJob(i) });
      rerender(<CollectionView />);
    }

    // CollectionView subscribes to the whole store so it re-renders, but the
    // memoized grid must not: its props are referentially unchanged.
    expect(gridRenderCount).toBe(afterFirstRender);
  });

  it("hands the grid referentially stable props across progress ticks", () => {
    const makeJob = (completed: number): BulkJobProgress => ({
      id: "bulk-1",
      action: "addToQueue",
      total: 100,
      completed,
      failed: 0,
      tracksQueued: completed,
      status: "running",
    });

    setStore({ bulkJob: makeJob(1) });
    const { rerender } = render(<CollectionView />);
    const first = gridProps[0];

    setStore({ bulkJob: makeJob(2) });
    rerender(<CollectionView />);

    // Even if the grid did re-render, these must not be fresh identities —
    // an inline arrow for onItemClick would defeat the memo entirely.
    const last = gridProps[gridProps.length - 1];
    expect(last.onItemClick).toBe(first.onItemClick);
    expect(last.items).toBe(first.items);
  });
});
