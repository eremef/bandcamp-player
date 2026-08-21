import { create } from "zustand";
import type {
  Track,
  Album,
  Playlist,
  Collection,
  PlayerState,
  AuthState,
  LastfmState,
  CacheStats,
  AppSettings,
  ViewType,
  RadioStation,
  RadioState,
  Queue,
  RemoteClient,
  CastDevice,
  CastStatus,
  Artist,
  SortKey,
  SortDirection,
  CollectionViewMode,
  CoverSize,
  BulkQueueRequest,
  BulkJobProgress,
} from "../../shared/types";
import { RemoteConfig } from "../../shared/remote-config.service";

// ============================================================================
// Store Types
// ============================================================================

interface AuthSlice {
  auth: AuthState;
  setAuth: (auth: AuthState) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

interface PlayerSlice {
  player: PlayerState;
  setPlayerState: (state: Partial<PlayerState>) => void;
  play: (track?: Track) => Promise<void>;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (time: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setRepeat: (mode: "off" | "one" | "all") => Promise<void>;
}

interface QueueSlice {
  queue: Queue;
  addToQueue: (track: Track, playNext?: boolean) => Promise<void>;
  addAlbumToQueue: (album: Album, playNext?: boolean) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  clearQueue: (keepCurrent?: boolean) => Promise<void>;
  reorderQueue: (from: number, to: number) => Promise<void>;
  playQueueIndex: (index: number) => Promise<void>;
  addTracksToQueue: (tracks: Track[], playNext?: boolean) => Promise<void>;
}

interface BulkJobSlice {
  /** The in-flight bulk queue job, or null. Owned by the main process. */
  bulkJob: BulkJobProgress | null;
  startBulkAction: (request: BulkQueueRequest) => Promise<void>;
  cancelBulkAction: () => Promise<void>;
}

interface CollectionSlice {
  collection: Collection | null;
  selectedAlbum: Album | null;
  isLoadingCollection: boolean;
  /** A network scrape is in flight while cached data stays on screen. */
  isRefreshingCollection: boolean;
  collectionError: string | null;
  knownArtists: Set<string>;
  knownAlbums: Set<string>;
  collection_sort_key: SortKey;
  collection_sort_direction: "asc" | "desc";
  collectionFilterAlbums: boolean;
  collectionFilterTracks: boolean;
  collectionFilterWishlist: boolean;
  collectionFilterDownloaded: boolean;
  collection_view_mode: CollectionViewMode;
  collection_cover_size: CoverSize;
  setCollectionSortKey: (key: SortKey) => void;
  setCollectionSortDirection: (dir: "asc" | "desc") => void;
  setCollectionFilterAlbums: (show: boolean) => void;
  setCollectionFilterTracks: (show: boolean) => void;
  setCollectionFilterWishlist: (show: boolean) => void;
  setCollectionFilterDownloaded: (show: boolean) => void;
  setCollectionViewMode: (mode: CollectionViewMode) => void;
  setCollectionCoverSize: (size: CoverSize) => void;
  fetchCollection: (forceRefresh?: boolean) => Promise<void>;
  selectAlbum: (album: Album) => void;
  updateAlbumInCollection: (album: Album) => void;
  searchCollection: (query: string) => Promise<Collection>;
  getAlbumDetails: (url: string, albumId?: string) => Promise<Album | null>;
  navigateToAlbumFromTrack: (track: Track) => void;
}

interface PlaylistSlice {
  playlists: Playlist[];
  selectedPlaylist: Playlist | null;
  fetchPlaylists: () => Promise<void>;
  selectPlaylist: (id: string) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  updatePlaylist: (
    id: string,
    name?: string,
    description?: string,
  ) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  removeTrackFromPlaylist: (
    playlistId: string,
    trackId: string,
  ) => Promise<void>;
  reorderPlaylistTracks: (
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) => Promise<void>;
  playPlaylist: (id: string) => Promise<void>;
  bandcampPlaylists: Playlist[];
  isLoadingBandcampPlaylists: boolean;
  /** Id of the Bandcamp playlist whose tracks are currently being scraped. */
  loadingBandcampPlaylistId: string | null;
  fetchBandcampPlaylists: () => Promise<void>;
  getBandcampPlaylistTracks: (url: string) => Promise<Track[]>;
  exportPlaylist: (playlistId: string) => Promise<boolean>;
  importPlaylist: () => Promise<Playlist | null>;
}

interface RadioSlice {
  radioStations: RadioStation[];
  radioState: RadioState;
  isLoadingRadioStations: boolean;
  fetchRadioStations: () => Promise<void>;
  refreshRadioStations: () => Promise<void>;
  playRadioStation: (station: RadioStation) => Promise<void>;
  stopRadio: () => Promise<void>;
  addRadioToQueue: (station: RadioStation, playNext?: boolean) => Promise<void>;
  addRadioStationsToQueue: (
    stations: RadioStation[],
    playNext?: boolean,
  ) => Promise<void>;
  addRadioToPlaylist: (
    playlistId: string,
    station: RadioStation,
  ) => Promise<void>;
  extractRadioToPlaylist: (
    playlistId: string,
    station: RadioStation,
  ) => Promise<void>;
  selectedRadioStation: RadioStation | null;
  selectRadioStation: (station: RadioStation) => void;
}

interface CacheSlice {
  cacheStats: CacheStats | null;
  cachedTrackIds: Set<string>;
  cachedAlbumIds: Set<string>;
  downloadingTracks: Set<string>;
  downloadingAlbumIds: Set<string>;
  cachedTracksDetailed: Track[];
  downloadTrack: (track: Track) => Promise<void>;
  downloadAlbum: (album: Album) => Promise<void>;
  deleteFromCache: (trackId: string) => Promise<void>;
  deleteAlbum: (albumId: string) => Promise<void>;
  clearCache: () => Promise<void>;
  fetchCacheStats: () => Promise<void>;
  fetchCachedTrackIds: () => Promise<void>;
  fetchCachedTracksDetailed: () => Promise<void>;
}

interface ScrobblerSlice {
  lastfm: LastfmState;
  connectLastfm: () => Promise<void>;
  disconnectLastfm: () => Promise<void>;
}

interface SettingsSlice {
  settings: AppSettings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

interface RemoteSlice {
  remoteStatus: {
    isRunning: boolean;
    port: number;
    ip: string;
    url: string;
    connections: number;
  } | null;
  connectedDevices: RemoteClient[];
  fetchRemoteStatus: () => Promise<void>;
  startRemote: () => Promise<void>;
  stopRemote: () => Promise<void>;
  fetchConnectedDevices: () => Promise<void>;
  disconnectDevice: (clientId: string) => Promise<void>;
}

interface UpdateSlice {
  updateStatus: {
    status:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
    info?: any;
    progress?: any;
    error?: string;
  };
  checkForUpdates: (isManual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
}

interface CastSlice {
  castDevices: CastDevice[];
  castStatus: CastStatus;
  startCastDiscovery: () => Promise<void>;
  stopCastDiscovery: () => Promise<void>;
  connectCast: (host: string) => Promise<void>;
  disconnectCast: () => Promise<void>;
}

export interface HistoryState {
  currentView: ViewType;
  selectedAlbum: Album | null;
  selectedArtistId: string | null;
  selectedPlaylistId: string | null;
  selectedPlaylist: Playlist | null;
  albumDetailSourceView: ViewType | null;
}

interface UISlice {
  viewHistory: HistoryState[];
  goBack: () => void;
  currentView: ViewType;
  selectedPlaylistId: string | null;
  isQueueVisible: boolean;
  isMiniPlayer: boolean;
  isSettingsOpen: boolean;
  searchQuery: string;
  toast: { message: string; type: "success" | "error" } | null;
  albumDetailSourceView: ViewType | null;
  setView: (view: ViewType) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  toggleQueue: () => void;
  toggleMiniPlayer: () => void;
  toggleSettings: () => void;
  setSearchQuery: (query: string) => void;
  radioSearchQuery: string;
  setRadioSearchQuery: (query: string) => void;
  showToast: (message: string, type?: "success" | "error") => void;
  hideToast: () => void;
}

interface RemoteConfigSlice {
  remoteConfig: RemoteConfig | null;
  fetchRemoteConfig: () => Promise<void>;
  refreshRemoteConfig: () => Promise<void>;
}

interface ConnectivitySlice {
  isOnline: boolean | null; // null = unknown (checking), true = online, false = offline
  checkConnectivity: () => Promise<void>;
  setOnlineStatus: (isOnline: boolean) => void;
}

type StoreState = AuthSlice &
  PlayerSlice &
  QueueSlice &
  BulkJobSlice &
  CollectionSlice &
  PlaylistSlice &
  RadioSlice &
  CacheSlice &
  ScrobblerSlice &
  SettingsSlice &
  RemoteSlice &
  UpdateSlice &
  CastSlice &
  ArtistSlice &
  RemoteConfigSlice &
  ConnectivitySlice &
  UISlice;

interface ArtistSlice {
  artists: Artist[];
  isLoadingArtists: boolean;
  selectedArtistId: string | null;
  fetchArtists: () => Promise<void>;
  selectArtist: (artistId: string | null) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

// Module-level map tracking albumId for each in-progress download.
// Lives outside Zustand so we can recompute downloadingAlbumIds after each
// track completes without serialising the full map into state.
const _downloadingTrackAlbums = new Map<string, string>();

// Module-level map: albumId → number of cached tracks for that album.
// Populated by fetchCachedTrackIds() and reused by deriveCachedAlbumIds()
// so the collection can be re-evaluated without a second IPC round-trip.
const _cachedTrackCountByAlbum = new Map<string, number>();

// Derive known artists and albums from the collection
function deriveKnownArtistsAndAlbums(collection: Collection | null): { knownArtists: Set<string>, knownAlbums: Set<string> } {
  const artists = new Set<string>();
  const albums = new Set<string>();
  collection?.items.forEach((item) => {
    if (item.album) {
      if (item.album.artist) artists.add(item.album.artist);
      if (item.album.title && item.album.artist) albums.add(`${item.album.artist}|${item.album.title}`);
    }
    if (item.track) {
      if (item.track.artist) artists.add(item.track.artist);
      if (item.track.album && item.track.artist) albums.add(`${item.track.artist}|${item.track.album}`);
    }
  });
  return { knownArtists: artists, knownAlbums: albums };
}

// Derive the set of fully-cached album IDs from the current count map and
// the provided collection.  An album is "fully cached" when the number of
// cache entries for its ID matches its known trackCount (> 0).
function deriveCachedAlbumIds(collection: Collection | null): Set<string> {
  const ids = new Set<string>();

  if (_cachedTrackCountByAlbum.size > 0) {
    console.debug(
      "[CacheIndicator] _cachedTrackCountByAlbum keys:",
      [..._cachedTrackCountByAlbum.entries()].map(([k, v]) => `${k}(×${v})`),
    );
  }

  collection?.items.forEach((item) => {
    if (item.type === "album" && item.album) {
      const { id, trackCount } = item.album;
      const cachedCount = _cachedTrackCountByAlbum.get(id) ?? 0;

      if (_cachedTrackCountByAlbum.size > 0) {
        console.debug(
          `[CacheIndicator] album id="${id}" trackCount=${trackCount} cachedCount=${cachedCount} title="${item.album.title}"`,
        );
      }

      if (cachedCount > 0 && (trackCount === 0 || cachedCount >= trackCount)) {
        ids.add(id);
      }
    }
  });
  return ids;
}

// Helper to push history state
const pushViewState = (s: StoreState): HistoryState[] => {
  const state: HistoryState = {
    currentView: s.currentView,
    selectedAlbum: s.selectedAlbum,
    selectedArtistId: s.selectedArtistId,
    selectedPlaylistId: s.selectedPlaylistId,
    selectedPlaylist: s.selectedPlaylist,
    albumDetailSourceView: s.albumDetailSourceView,
  };
  return [...s.viewHistory, state].slice(-20); // Keep last 20 views
};

export const useStore = create<StoreState>()((set, get) => ({
  // ---- Auth Slice ----
  auth: { isAuthenticated: false, user: null },
  setAuth: (auth) => set({ auth }),
  login: async () => {
    console.log("Store: initiating login");
    const result = await window.electron.auth.login();
    console.log("Store: login result", result);
    set({ auth: result });
    if (result.isAuthenticated) {
      get().fetchCollection();
      get().fetchPlaylists();
    }
  },
  logout: async () => {
    console.log("Store: initiating logout");
    await window.electron.auth.logout();
    set({ auth: { isAuthenticated: false, user: null }, collection: null });
  },
  checkSession: async () => {
    console.log("Store: checking session");
    const result = await window.electron.auth.checkSession();
    console.log("Store: session result", result);
    set({ auth: result });
    if (result.isAuthenticated) {
      // Cache-first on purpose: the SQLite cache renders instantly and
      // ScraperService kicks off a background refresh when it is stale.
      // Never force here — that bypasses all three cache layers on every launch.
      get().fetchCollection();
      get().fetchPlaylists();
    }
  },

  // ---- Player Slice ----
  player: {
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    repeatMode: "off",
    isShuffled: false,
    queue: { items: [], currentIndex: -1 },
    isCasting: false,
    error: null,
  },
  setPlayerState: (state) =>
    set((s) => ({ player: { ...s.player, ...state } })),
  play: async (track) => {
    // Fast client-side guard: show toast immediately for non-cached tracks in offline mode
    const cachedTrackIds = get().cachedTrackIds;
    if (track && get().settings?.offlineMode && !cachedTrackIds.has(track.id)) {
      get().showToast(
        "Offline mode is on — track not available offline",
        "error",
      );
      return;
    }
    if (track) {
      await get().clearQueue(false);
    }
    await window.electron.player.play(track);
  },
  pause: async () => {
    await window.electron.player.pause();
  },
  togglePlay: async () => {
    await window.electron.player.togglePlay();
  },
  next: async () => {
    await window.electron.player.next();
  },
  previous: async () => {
    await window.electron.player.previous();
  },
  seek: async (time) => {
    await window.electron.player.seek(time);
  },
  setVolume: async (volume) => {
    await window.electron.player.setVolume(volume);
  },
  toggleMute: async () => {
    await window.electron.player.toggleMute();
  },
  toggleShuffle: async () => {
    await window.electron.player.toggleShuffle();
  },
  setRepeat: async (mode) => {
    await window.electron.player.setRepeat(mode);
  },

  // ---- Queue Slice ----
  queue: { items: [], currentIndex: -1 },
  addToQueue: async (track, playNext) => {
    await window.electron.queue.addTrack(track, playNext);
  },
  addAlbumToQueue: async (album, playNext) => {
    await window.electron.queue.addAlbum(album, playNext);
  },
  removeFromQueue: async (id) => {
    await window.electron.queue.remove(id);
  },
  clearQueue: async (keepCurrent?: boolean) => {
    await window.electron.queue.clear(keepCurrent);
  },
  reorderQueue: async (from, to) => {
    await window.electron.queue.reorder(from, to);
  },
  playQueueIndex: async (index) => {
    await window.electron.queue.playIndex(index);
  },
  addTracksToQueue: async (tracks, playNext) => {
    await window.electron.queue.addTracks(tracks, playNext);
  },

  // ---- Bulk Job Slice ----
  bulkJob: null,
  startBulkAction: async (request) => {
    // The main process runs the job; this resolves as soon as it is accepted.
    const seed = await window.electron.bulk.start(request);
    set({ bulkJob: seed ?? null });
  },
  cancelBulkAction: async () => {
    const job = get().bulkJob;
    await window.electron.bulk.cancel(job?.id);
  },

  // ---- Collection Slice ----
  collection: null,
  selectedAlbum: null,
  isLoadingCollection: false,
  isRefreshingCollection: false,
  collectionError: null,
  knownArtists: new Set(),
  knownAlbums: new Set(),
  collection_sort_key: "default",
  collection_sort_direction: "desc",
  collectionFilterAlbums: true,
  collectionFilterTracks: true,
  collectionFilterWishlist: true,
  collectionFilterDownloaded: false,
  collection_view_mode: "grid",
  collection_cover_size: "medium",
  setCollectionSortKey: (key: SortKey) => {
    set({ collection_sort_key: key });
    get().updateSettings({ collectionSortKey: key });
  },
  setCollectionSortDirection: (dir: SortDirection) => {
    set({ collection_sort_direction: dir });
    get().updateSettings({ collectionSortDirection: dir });
  },
  setCollectionFilterAlbums: (show: boolean) => {
    set({ collectionFilterAlbums: show });
    get().updateSettings({ collectionFilterAlbums: show });
  },
  setCollectionFilterTracks: (show: boolean) => {
    set({ collectionFilterTracks: show });
    get().updateSettings({ collectionFilterTracks: show });
  },
  setCollectionFilterWishlist: (show: boolean) => {
    set({ collectionFilterWishlist: show });
    get().updateSettings({ collectionFilterWishlist: show });
  },
  setCollectionFilterDownloaded: (show: boolean) => {
    set({ collectionFilterDownloaded: show });
    get().updateSettings({ collectionFilterDownloaded: show });
  },
  setCollectionViewMode: (mode: CollectionViewMode) => {
    set({ collection_view_mode: mode });
    get().updateSettings({ collectionViewMode: mode });
  },
  setCollectionCoverSize: (size: CoverSize) => {
    set({ collection_cover_size: size });
    get().updateSettings({ collectionCoverSize: size });
  },
  fetchCollection: async (forceRefresh = false) => {
    const { isOnline, settings } = useStore.getState();
    const isOfflineMode = settings?.offlineMode ?? false;

    // If we know we're offline and the user hasn't enabled offline mode yet,
    // don't send the IPC call — the main process would try to hit the network.
    // Once the NoInternetDialog resolves (offlineMode becomes true), the
    // CollectionView useEffect will re-run and fetch from the DB cache.
    if (isOnline === false && !isOfflineMode && !forceRefresh) {
      set({ isLoadingCollection: false });
      return;
    }

    set({
      // Only a cold start (nothing to show) gets the full-screen loading state;
      // otherwise the grid stays rendered while data refreshes underneath it.
      isLoadingCollection: !get().collection,
      // Optimistic so the spinner reacts to the click without waiting for the
      // main-process event to come back.
      isRefreshingCollection: forceRefresh || get().isRefreshingCollection,
      collectionError: null,
    });
    try {
      const collection = forceRefresh
        ? await window.electron.collection.refresh()
        : await window.electron.collection.fetch();
      const { knownArtists, knownAlbums } = deriveKnownArtistsAndAlbums(collection);
      set({
        collection,
        isLoadingCollection: false,
        // Recompute album cache indicators now that we have collection data.
        // _cachedTrackCountByAlbum may already be populated from the startup
        // fetchCachedTrackIds() call, so this is a pure in-memory derivation.
        cachedAlbumIds: deriveCachedAlbumIds(collection),
        knownArtists,
        knownAlbums,
      });

      // Also fetch Bandcamp playlists when collection is fetched/refreshed
      // TODO: move it somewhere else?
      get().fetchBandcampPlaylists();
      get().fetchRadioStations();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch collection";
      // Never destroy a good cached grid because a background refresh failed —
      // surface it as a toast and leave the existing collection in place.
      if (get().collection) {
        console.error("[Store] Collection refresh failed", error);
        get().showToast("Could not refresh collection", "error");
        set({ isLoadingCollection: false });
      } else {
        set({ collectionError: message, isLoadingCollection: false });
      }
    } finally {
      set({ isRefreshingCollection: false });
    }
  },
  selectAlbum: (album) =>
    set((s) => ({
      viewHistory: pushViewState(s as StoreState),
      selectedAlbum: album,
      currentView: "album-detail",
      albumDetailSourceView:
        s.currentView !== "album-detail"
          ? s.currentView
          : s.albumDetailSourceView,
    })),
  updateAlbumInCollection: (album) =>
    set((s) => {
      if (!s.collection) return {};
      // Replace the matching item's album with the fully-loaded version so
      // subsequent opens skip the network fetch entirely.
      const updatedItems = s.collection.items.map((item) => {
        if (item.type === "album" && item.album?.id === album.id) {
          return { ...item, album };
        }
        return item;
      });
      const updatedCollection = { ...s.collection, items: updatedItems };
      return {
        collection: updatedCollection,
        selectedAlbum: album,
        // Real trackCount is now known — recompute cached album IDs.
        cachedAlbumIds: deriveCachedAlbumIds(updatedCollection),
      };
    }),
  searchCollection: async (query) => {
    return window.electron.collection.search(query);
  },
  getAlbumDetails: async (url, albumId) => {
    // Passing the id lets the main process serve the album from the DB cache
    // instead of re-scraping the page on every open.
    return window.electron.collection.getAlbum(url, albumId);
  },
  navigateToAlbumFromTrack: async (track) => {
    const s = get();
    const collectionAlbum = s.collection?.items.find((i) => i.type === "album" && i.album?.id === track.albumId)?.album;
    if (collectionAlbum) {
      s.selectAlbum(collectionAlbum);
      return;
    }

    const tempId = track.albumId || `temp-${track.id}`;

    // Select temporary album state so UI updates instantly
    s.selectAlbum({
      id: tempId,
      title: track.album || track.title,
      artist: track.artist,
      artistId: track.artistId,
      artworkUrl: track.artworkUrl,
      bandcampUrl: track.bandcampUrl,
      tracks: [track],
      trackCount: 1
    });

    if (track.bandcampUrl) {
      try {
        const fullAlbum = await s.getAlbumDetails(
          track.bandcampUrl,
          track.albumId,
        );
        // If we are still viewing this album, update the state with full details
        if (fullAlbum && get().selectedAlbum?.id === tempId) {
          set({ selectedAlbum: fullAlbum });
        }
      } catch (e) {
        console.error("Failed to load album from track URL", e);
      }
    }
  },

  // ---- Playlist Slice ----
  playlists: [],
  selectedPlaylist: null,
  fetchPlaylists: async () => {
    const playlists = await window.electron.playlist.getAll();
    set({ playlists });
  },
  selectPlaylist: async (id) => {
    // Check if it's a Bandcamp playlist first
    const bcPlaylist = get().bandcampPlaylists.find(p => p.id === id);
    if (bcPlaylist) {
      const needsTracks =
        (!bcPlaylist.tracks || bcPlaylist.tracks.length === 0) && !!bcPlaylist.bandcampUrl;

      // Navigate immediately so the detail view can render its loading state
      // instead of the click appearing to do nothing while we scrape.
      set((s) => ({
        viewHistory: pushViewState(s as StoreState),
        selectedPlaylist: bcPlaylist,
        currentView: "playlist-detail",
        selectedPlaylistId: id,
        loadingBandcampPlaylistId: needsTracks ? id : null,
      }));

      if (!needsTracks) return;

      try {
        const tracks = await get().getBandcampPlaylistTracks(bcPlaylist.bandcampUrl!);
        const fullPlaylist = {
          ...bcPlaylist,
          tracks,
          trackCount: tracks.length || bcPlaylist.trackCount,
        };
        // Update store's bandcampPlaylists array so it retains fetched tracks
        set((s) => ({
          bandcampPlaylists: s.bandcampPlaylists.map(p => p.id === id ? fullPlaylist : p),
          // Only refresh the detail view if the user hasn't navigated away
          selectedPlaylist:
            s.selectedPlaylistId === id ? fullPlaylist : s.selectedPlaylist,
        }));
      } catch (e) {
        console.error("Failed to fetch Bandcamp playlist tracks", e);
      } finally {
        set((s) => ({
          loadingBandcampPlaylistId:
            s.loadingBandcampPlaylistId === id ? null : s.loadingBandcampPlaylistId,
        }));
      }
      return;
    }

    // Check offline playlists
    try {
      const playlist = await window.electron.playlist.getById(id);
      if (playlist) {
        set((s) => ({
          viewHistory: pushViewState(s as StoreState),
          selectedPlaylist: playlist,
          currentView: "playlist-detail",
          selectedPlaylistId: id,
        }));
      }
    } catch (e) {
      console.error("Failed to fetch playlist", e);
    }
  },
  createPlaylist: async (name, description) => {
    return window.electron.playlist.create({ name, description });
  },
  updatePlaylist: async (id, name, description) => {
    try {
      await window.electron.playlist.update({ id, name, description });
      // State will be updated via onUpdated broadcast
    } catch (error) {
      console.error("Store: updatePlaylist failed", error);
      get().showToast("Failed to update playlist", "error");
    }
  },
  deletePlaylist: async (id) => {
    await window.electron.playlist.delete(id);
    // Navigation logic stays here as it's UI state, not just data synchronization
    set((s) => ({
      selectedPlaylist:
        s.selectedPlaylist?.id === id ? null : s.selectedPlaylist,
      currentView: s.selectedPlaylistId === id ? "playlists" : s.currentView,
      selectedPlaylistId:
        s.selectedPlaylistId === id ? null : s.selectedPlaylistId,
    }));
  },
  addTrackToPlaylist: async (playlistId, track) => {
    await window.electron.playlist.addTrack(playlistId, track);
    const playlist = get().playlists.find((p) => p.id === playlistId);
    if (playlist) {
      get().showToast(
        `Item ${track.title} added to the ${playlist.name}`,
        "success",
      );
    }
  },
  addTracksToPlaylist: async (playlistId, tracks) => {
    if (tracks.length === 0) return;
    await window.electron.playlist.addTracks(playlistId, tracks);
    const playlist = get().playlists.find((p) => p.id === playlistId);
    if (playlist) {
      get().showToast(
        `${tracks.length} tracks added to ${playlist.name}`,
        "success",
      );
    }
  },
  removeTrackFromPlaylist: async (playlistId, trackId) => {
    await window.electron.playlist.removeTrack(playlistId, trackId);
  },
  reorderPlaylistTracks: async (playlistId, fromIndex, toIndex) => {
    await window.electron.playlist.reorderTracks(playlistId, fromIndex, toIndex);
  },
  playPlaylist: async (id: string) => {
    const playlist = get().playlists.find(p => p.id === id);
    let tracksToPlay: Track[] = [];

    if (!playlist) {
      // Might be a Bandcamp playlist
      const bcPlaylist = get().bandcampPlaylists.find(p => p.id === id);
      if (bcPlaylist && bcPlaylist.bandcampUrl) {
        get().showToast("Loading Bandcamp playlist...", "success");
        set({ loadingBandcampPlaylistId: id });
        try {
          tracksToPlay = await get().getBandcampPlaylistTracks(bcPlaylist.bandcampUrl);
        } finally {
          set((s) => ({
            loadingBandcampPlaylistId:
              s.loadingBandcampPlaylistId === id ? null : s.loadingBandcampPlaylistId,
          }));
          get().hideToast();
        }
      }
    } else {
      const fullPlaylist = await window.electron.playlist.getById(id);
      if (fullPlaylist) {
        tracksToPlay = fullPlaylist.tracks;
      }
    }

    if (tracksToPlay.length > 0) {
      await get().clearQueue(false);
      await get().addTracksToQueue(tracksToPlay);
      await get().playQueueIndex(0);
    }
  },
  bandcampPlaylists: [],
  isLoadingBandcampPlaylists: false,
  loadingBandcampPlaylistId: null,
  fetchBandcampPlaylists: async () => {
    if (get().isLoadingBandcampPlaylists) return;
    set({ isLoadingBandcampPlaylists: true });
    try {
      const playlists = await window.electron.playlist.getBandcampPlaylists();

      set({ bandcampPlaylists: playlists ?? [] });
    } catch (error) {
      console.error("Store: fetchBandcampPlaylists failed", error);
      get().showToast("Failed to fetch Bandcamp playlists", "error");
    } finally {
      set({ isLoadingBandcampPlaylists: false });
    }
  },
  getBandcampPlaylistTracks: async (url: string) => {
    try {
      return await window.electron.playlist.getBandcampPlaylistTracks(url);
    } catch (error) {
      console.error("Store: getBandcampPlaylistTracks failed", error);
      get().showToast("Failed to fetch Bandcamp playlist tracks", "error");
      return [];
    }
  },
  exportPlaylist: async (playlistId: string) => {
    try {
      const success = await window.electron.playlist.export(playlistId);
      if (success) {
        get().showToast("Playlist exported successfully", "success");
      }
      return success;
    } catch (error) {
      console.error("Store: exportPlaylist failed", error);
      get().showToast(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      return false;
    }
  },
  importPlaylist: async () => {
    try {
      const importedData = await window.electron.playlist.import();
      return importedData;
    } catch (error) {
      console.error("Store: importPlaylist failed", error);
      get().showToast(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      return null;
    }
  },

  // ---- Radio Slice ----
  radioStations: [],
  radioState: { isActive: false, currentStation: null, currentTrack: null },
  isLoadingRadioStations: false,
  fetchRadioStations: async () => {
    const stations = await window.electron.radio.getStations();
    set({ radioStations: stations });
  },
  refreshRadioStations: async () => {
    set({ isLoadingRadioStations: true });
    try {
      const stations = await window.electron.radio.refreshStations();
      set({ radioStations: stations });
    } finally {
      set({ isLoadingRadioStations: false });
    }
  },
  playRadioStation: async (station) => {
    await window.electron.radio.playStation(station);
  },
  stopRadio: async () => {
    await window.electron.radio.stop();
  },
  addRadioToQueue: async (station, playNext) => {
    await window.electron.radio.addToQueue(station, playNext);
    get().showToast(`${station.name} added to queue`, "success");
  },
  addRadioStationsToQueue: async (stations, playNext) => {
    if (stations.length === 0) return;
    // One IPC call, one queue broadcast and one toast — the per-station loop
    // this replaces produced all three N times over.
    await window.electron.radio.addStationsToQueue(stations, playNext);
    get().showToast(`${stations.length} stations added to queue`, "success");
  },
  addRadioToPlaylist: async (playlistId, station) => {
    await window.electron.radio.addToPlaylist(playlistId, station);
    get().fetchPlaylists();
    const playlist = get().playlists.find((p) => p.id === playlistId);
    if (playlist) {
      get().showToast(`${station.name} added to ${playlist.name}`, "success");
    }
  },
  extractRadioToPlaylist: async (playlistId, station) => {
    get().showToast(`Extracting tracks from ${station.name}...`, "success");
    try {
      await window.electron.radio.extractToPlaylist(station, playlistId);
      get().fetchPlaylists();
      const playlist = get().playlists.find((p) => p.id === playlistId);
      if (playlist) {
        get().showToast(`Tracks from ${station.name} added to ${playlist.name}`, "success");
      }
    } catch (error) {
      get().showToast(`Failed to extract tracks from ${station.name}`, "error");
      console.error(error);
    }
  },
  selectedRadioStation: null,
  selectRadioStation: (station: RadioStation) => set({ selectedRadioStation: station, currentView: "radio-detail" }),

  // ---- Cache Slice ----
  cacheStats: null,
  cachedTrackIds: new Set(),
  cachedAlbumIds: new Set(),
  downloadingTracks: new Set(),
  downloadingAlbumIds: new Set(),
  cachedTracksDetailed: [],
  downloadTrack: async (track) => {
    // Module-level map: trackId → albumId, used to recompute downloadingAlbumIds
    // after each track finishes without needing a separate Zustand field.
    _downloadingTrackAlbums.set(track.id, track.albumId ?? "");
    set((s) => ({
      downloadingTracks: new Set([...s.downloadingTracks, track.id]),
      downloadingAlbumIds: track.albumId
        ? new Set([...s.downloadingAlbumIds, track.albumId])
        : s.downloadingAlbumIds,
    }));
    try {
      await window.electron.cache.downloadTrack(track);
      // Refresh cached IDs so the indicator flips from blinking → solid immediately
      get().fetchCachedTrackIds();
    } catch (error) {
      // Never reject: bulk callers loop with `await downloadTrack(...)` and one
      // bad track must not abort the whole batch. Surface it instead.
      console.error("[Store] downloadTrack failed", error);
      get().showToast(
        `Download failed: ${track.title || "track"}`,
        "error",
      );
    } finally {
      _downloadingTrackAlbums.delete(track.id);
      set((s) => {
        const updatedTracks = new Set(s.downloadingTracks);
        updatedTracks.delete(track.id);
        // Recompute downloading album IDs from remaining in-progress tracks
        const updatedAlbums = new Set(
          [..._downloadingTrackAlbums.values()].filter(Boolean),
        );
        return {
          downloadingTracks: updatedTracks,
          downloadingAlbumIds: updatedAlbums,
        };
      });
    }
  },
  deleteFromCache: async (trackId) => {
    await window.electron.cache.deleteTrack(trackId);
    get().fetchCacheStats();
    get().fetchCachedTrackIds();
  },
  clearCache: async () => {
    await window.electron.cache.clear();
    // Eagerly clear indicators so the UI reacts immediately
    set({ cachedTrackIds: new Set(), cachedAlbumIds: new Set() });
    get().fetchCacheStats();
    get().fetchCachedTrackIds();
  },
  fetchCacheStats: async () => {
    const stats = await window.electron.cache.getStats();
    set({ cacheStats: stats });
  },
  fetchCachedTrackIds: async () => {
    const tracks = await window.electron.cache.getCachedTracks();
    const cachedTrackIds = new Set(tracks.map((t) => t.id));

    // Rebuild the module-level album-count map from fresh DB data
    _cachedTrackCountByAlbum.clear();
    for (const t of tracks) {
      if (t.albumId) {
        _cachedTrackCountByAlbum.set(
          t.albumId,
          (_cachedTrackCountByAlbum.get(t.albumId) ?? 0) + 1,
        );
      }
    }

    console.debug(
      `[CacheIndicator] fetchCachedTrackIds: ${tracks.length} cached tracks, albumIds in map: ${_cachedTrackCountByAlbum.size}`,
      tracks.length > 0
        ? tracks
          .slice(0, 5)
          .map((t) => `trackId=${t.id} albumId=${t.albumId ?? "MISSING"}`)
        : "(empty)",
    );

    // Derive fully-cached album IDs using the current collection
    const cachedAlbumIds = deriveCachedAlbumIds(get().collection);

    set({ cachedTrackIds, cachedAlbumIds });
  },
  downloadAlbum: async (album) => {
    if (!album.tracks || album.tracks.length === 0) {
      return;
    }

    // Track which album we're downloading
    const albumId = album.id;
    set((s) => ({
      downloadingAlbumIds: new Set([...s.downloadingAlbumIds, albumId]),
    }));

    try {
      await window.electron.cache.downloadAlbum(album);
      // Refresh cached IDs so the indicator flips from blinking → solid immediately
      get().fetchCachedTrackIds();
    } catch (error) {
      console.error("[Store] downloadAlbum failed", error);
      get().showToast(
        `Download failed: ${album.title || "album"}`,
        "error",
      );
    } finally {
      set((s) => {
        const updatedAlbums = new Set(s.downloadingAlbumIds);
        updatedAlbums.delete(albumId);
        return { downloadingAlbumIds: updatedAlbums };
      });
    }
  },
  deleteAlbum: async (albumId) => {
    await window.electron.cache.deleteAlbum(albumId);
    get().fetchCacheStats();
    get().fetchCachedTrackIds();
  },
  fetchCachedTracksDetailed: async () => {
    const tracks = await window.electron.cache.getCachedTracksDetailed();
    set({ cachedTracksDetailed: tracks });
  },

  // ---- Scrobbler Slice ----
  lastfm: { isConnected: false, user: null },
  connectLastfm: async () => {
    const result = await window.electron.scrobbler.connect();
    set({ lastfm: result });
  },
  disconnectLastfm: async () => {
    await window.electron.scrobbler.disconnect();
    set({ lastfm: { isConnected: false, user: null } });
  },

  // ---- Settings Slice ----
  settings: null,
  fetchSettings: async () => {
    const settings = await window.electron.settings.get();
    if (settings) {
      set({
        settings,
        collection_sort_key: settings.collectionSortKey || "default",
        collection_sort_direction: settings.collectionSortDirection || "desc",
        collectionFilterAlbums:
          settings.collectionFilterAlbums !== undefined
            ? settings.collectionFilterAlbums
            : true,
        collectionFilterTracks:
          settings.collectionFilterTracks !== undefined
            ? settings.collectionFilterTracks
            : true,
        collectionFilterWishlist:
          settings.collectionFilterWishlist !== undefined
            ? settings.collectionFilterWishlist
            : true,
        collectionFilterDownloaded:
          settings.collectionFilterDownloaded !== undefined
            ? settings.collectionFilterDownloaded
            : false,
        collection_view_mode: settings.collectionViewMode || "grid",
        collection_cover_size: settings.collectionCoverSize || "medium",
      });
    }
  },
  updateSettings: async (newSettings) => {
    const currentSettings = get().settings;
    const wasOffline = currentSettings?.offlineMode ?? false;
    const isNowOnline = newSettings.offlineMode === false;
    const includeWishlistChanged =
      typeof newSettings.includeWishlistInCollection === "boolean" &&
      newSettings.includeWishlistInCollection !==
      (currentSettings?.includeWishlistInCollection ?? false);

    // If disabling wishlist, also reset the filter to "Show All" (inactive)
    const settingsToUpdate = { ...newSettings };
    if (includeWishlistChanged && !newSettings.includeWishlistInCollection) {
      settingsToUpdate.collectionFilterWishlist = true;
    }

    const updated = await window.electron.settings.set(settingsToUpdate);
    set({ settings: updated });

    if (includeWishlistChanged && !newSettings.includeWishlistInCollection) {
      set({ collectionFilterWishlist: true });
    }

    if (wasOffline && isNowOnline) {
      console.log("[Store] Back online - refreshing auth and collection...");
      const authResult = await window.electron.auth.refreshUser();
      get().setAuth(authResult);
      get().fetchCollection(true);
    }

    if (includeWishlistChanged) {
      // Cache-first is safe here: the cacheId gains/loses a `_withWishlist`
      // suffix and the memory guard compares lastCacheId, so this hits the
      // other variant's cached row instead of re-scraping on every toggle.
      get().fetchCollection();
    }

    // Auto-start/stop remote service based on setting
    if ("remoteEnabled" in newSettings) {
      if (newSettings.remoteEnabled) {
        await window.electron.remote.start();
      } else {
        await window.electron.remote.stop();
      }
      get().fetchRemoteStatus();
    }
  },

  // ---- Remote Slice ----
  remoteStatus: null,
  connectedDevices: [],
  fetchRemoteStatus: async () => {
    const status = await window.electron.remote.getStatus();
    set({ remoteStatus: status });
  },
  startRemote: async () => {
    await window.electron.remote.start();
    get().fetchRemoteStatus();
  },
  stopRemote: async () => {
    await window.electron.remote.stop();
    get().fetchRemoteStatus();
    set({ connectedDevices: [] });
  },
  fetchConnectedDevices: async () => {
    const devices = await window.electron.remote.getConnectedDevices();
    set({ connectedDevices: devices });
  },
  disconnectDevice: async (clientId) => {
    const success = await window.electron.remote.disconnectDevice(clientId);
    if (success) {
      get().fetchConnectedDevices();
    }
  },

  // ---- Update Slice ----
  updateStatus: { status: "idle" },
  checkForUpdates: async (isManual = false) => {
    set({ updateStatus: { status: "checking" } });
    await window.electron.update.check(isManual);
  },
  installUpdate: async () => {
    await window.electron.update.install();
  },

  // ---- Cast Slice ----
  castDevices: [],
  castStatus: { status: "disconnected" },
  startCastDiscovery: async () => {
    await window.electron.cast.startDiscovery();
  },
  stopCastDiscovery: async () => {
    await window.electron.cast.stopDiscovery();
  },
  connectCast: async (id: string) => {
    await window.electron.cast.connect(id);
  },
  disconnectCast: async () => {
    await window.electron.cast.disconnect();
  },

  // ---- UI Slice ----
  currentView: "collection",
  selectedPlaylistId: null,
  isQueueVisible: false,
  isMiniPlayer: false,
  isSettingsOpen: false,
  searchQuery: "",
  radioSearchQuery: "",
  albumDetailSourceView: null,
  viewHistory: [],
  goBack: () => set((s) => {
    if (s.viewHistory.length === 0) return s;
    const history = [...s.viewHistory];
    const previousState = history.pop()!;
    return {
      viewHistory: history,
      currentView: previousState.currentView,
      selectedAlbum: previousState.selectedAlbum,
      selectedArtistId: previousState.selectedArtistId,
      selectedPlaylistId: previousState.selectedPlaylistId,
      selectedPlaylist: previousState.selectedPlaylist,
      albumDetailSourceView: previousState.albumDetailSourceView,
    };
  }),
  setView: (view) => set((s) => ({
    viewHistory: pushViewState(s as StoreState),
    currentView: view,
    selectedAlbum: null,
    selectedArtistId: null,
    selectedPlaylistId: null,
    selectedPlaylist: null,
    albumDetailSourceView: null
  })),
  setSelectedPlaylistId: (id) => set({ selectedPlaylistId: id }),
  toggleQueue: () => set((s) => ({ isQueueVisible: !s.isQueueVisible })),
  toggleMiniPlayer: async () => {
    await window.electron.window.toggleMiniPlayer();
    set((s) => ({ isMiniPlayer: !s.isMiniPlayer }));
  },
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setRadioSearchQuery: (query) => set({ radioSearchQuery: query }),
  toast: null,
  showToast: (message, type = "success") => set({ toast: { message, type } }),
  hideToast: () => set({ toast: null }),

  // ---- Artist Slice ----
  artists: [],
  isLoadingArtists: false,
  selectedArtistId: null,
  fetchArtists: async () => {
    set({ isLoadingArtists: true });
    try {
      const artists = await window.electron.collection.getArtists();
      set({ artists, isLoadingArtists: false });
    } catch (error) {
      console.error("Store: fetchArtists failed", error);
      set({ isLoadingArtists: false });
    }
  },
  selectArtist: (artistId) => set((s) => ({
    viewHistory: pushViewState(s as StoreState),
    selectedArtistId: artistId,
    currentView: artistId ? "artists" : s.currentView
  })),

  // ---- Remote Config Slice ----
  remoteConfig: null,
  fetchRemoteConfig: async () => {
    const config = await window.electron.system.getRemoteConfig();
    set({ remoteConfig: config });
  },
  refreshRemoteConfig: async () => {
    await window.electron.system.refreshRemoteConfig();
    const config = await window.electron.system.getRemoteConfig();
    set({ remoteConfig: config });
  },

  // ---- Connectivity Slice ----
  isOnline: null,
  checkConnectivity: async () => {
    try {
      const { isOnline } = await window.electron.system.checkConnectivity();
      set({ isOnline });
    } catch {
      // If the IPC call itself fails, assume offline
      set({ isOnline: false });
    }
  },
  setOnlineStatus: (isOnline) => set({ isOnline }),
}));

// ============================================================================
// IPC Event Subscriptions (called once on app init)
// ============================================================================

export async function initializeStoreSubscriptions() {
  const { setPlayerState, setAuth } = useStore.getState();

  // Fetch initial player state
  const initialState = await window.electron.player.getState();
  setPlayerState(initialState);
  if (initialState.queue) {
    useStore.setState({ queue: initialState.queue });
  }

  // Player state updates
  window.electron.player.onStateChanged((state) => {
    const previousError = useStore.getState().player.error;
    setPlayerState(state);

    if (state.error && state.error !== previousError) {
      useStore.getState().showToast(state.error, "error");
    }

    if (state.queue) {
      useStore.setState({ queue: state.queue });
    }
  });

  window.electron.player.onTrackChanged((track) => {
    setPlayerState({ currentTrack: track });
  });

  window.electron.player.onTimeUpdate(({ currentTime, duration }) => {
    setPlayerState({ currentTime, duration });
  });

  // Collection updates
  window.electron.collection.onUpdated((collection) => {
    useStore.setState({
      collection,
      cachedAlbumIds: deriveCachedAlbumIds(collection),
    });
  });

  // Background refreshes start in the main process without any renderer call,
  // so the indicator has to be driven by events rather than derived locally.
  window.electron.collection.onRefreshStarted(() => {
    useStore.setState({ isRefreshingCollection: true });
  });

  window.electron.collection.onRefreshFinished(() => {
    useStore.setState({ isRefreshingCollection: false });
  });

  // Queue updates
  window.electron.queue.onUpdated((queue) => {
    useStore.setState({ queue });
    // Also sync with player state
    const currentPlayerState = useStore.getState().player;
    setPlayerState({ ...currentPlayerState, queue });
  });

  // Playlist updates
  window.electron.playlist.onUpdated(async (playlists) => {
    useStore.setState({ playlists });
    // If current selected playlist is updated, refresh it too (data only, no navigation)
    const { selectedPlaylistId } = useStore.getState();
    if (selectedPlaylistId) {
      const updated =
        await window.electron.playlist.getById(selectedPlaylistId);
      useStore.setState({ selectedPlaylist: updated });
    }
  });

  // Auth updates
  window.electron.auth.onAuthChanged((auth) => {
    setAuth(auth);
  });

  // Cache stats updates
  window.electron.cache.onStatsUpdated((stats) => {
    useStore.setState({ cacheStats: stats });
    // Refresh the cached track ID set whenever the cache changes
    useStore.getState().fetchCachedTrackIds();
  });

  // Seed initial cached track IDs
  useStore.getState().fetchCachedTrackIds();

  // Scrobbler updates
  window.electron.scrobbler.onStateChanged((state) => {
    useStore.setState({ lastfm: state });
  });
  // Fetch initial scrobbler state
  window.electron.scrobbler.getState().then((state) => {
    useStore.setState({ lastfm: state });
  });

  // Settings updates
  window.electron.settings.onChanged((settings) => {
    useStore.setState({
      settings,
      collection_sort_key: settings.collectionSortKey || "default",
      collection_sort_direction: settings.collectionSortDirection || "desc",
      collectionFilterAlbums:
        settings.collectionFilterAlbums !== undefined
          ? settings.collectionFilterAlbums
          : true,
      collectionFilterTracks:
        settings.collectionFilterTracks !== undefined
          ? settings.collectionFilterTracks
          : true,
      collectionFilterWishlist:
        settings.collectionFilterWishlist !== undefined
          ? settings.collectionFilterWishlist
          : true,
      collectionFilterDownloaded:
        settings.collectionFilterDownloaded !== undefined
          ? settings.collectionFilterDownloaded
          : false,
      collection_view_mode: settings.collectionViewMode || "grid",
      collection_cover_size: settings.collectionCoverSize || "medium",
    });
  });

  // Radio updates
  window.electron.radio.onStateChanged((state) => {
    useStore.setState({ radioState: state });
  });
  window.electron.radio.onStationsUpdated((stations) => {
    useStore.setState({ radioStations: stations });
  });

  // Bulk queue job progress. The job lives in the main process, so re-attach to
  // whatever is already running (a renderer reload must not orphan the UI).
  const initialBulkJob = await window.electron.bulk.getState();
  if (initialBulkJob) {
    useStore.setState({ bulkJob: initialBulkJob });
  }
  window.electron.bulk.onProgress((progress) => {
    const isTerminal =
      progress.status === "done" ||
      progress.status === "cancelled" ||
      progress.status === "error";

    useStore.setState({ bulkJob: isTerminal ? null : progress });

    if (!isTerminal) return;

    const { showToast } = useStore.getState();
    if (progress.status === "error") {
      showToast(progress.error || "Bulk action failed", "error");
    } else if (progress.status === "cancelled") {
      showToast(
        `Stopped adding to queue (${progress.completed} of ${progress.total} added)`,
        "success",
      );
    } else if (progress.failed > 0) {
      showToast(
        `Finished with ${progress.failed} of ${progress.total} item(s) failing to load`,
        "error",
      );
    }
  });

  // Remote updates
  window.electron.remote.onStatusChanged(() => {
    useStore.getState().fetchRemoteStatus();
  });
  window.electron.remote.onConnectionsChanged((count) => {
    const current = useStore.getState().remoteStatus;
    if (current) {
      useStore.setState({ remoteStatus: { ...current, connections: count } });
    } else {
      useStore.getState().fetchRemoteStatus();
    }
    // Also refresh the devices list if it's available
    useStore.getState().fetchConnectedDevices();
  });

  // Update events
  window.electron.update.onChecking(() => {
    useStore.setState({ updateStatus: { status: "checking" } });
  });
  window.electron.update.onAvailable((info) => {
    useStore.setState({ updateStatus: { status: "available", info } });
  });
  window.electron.update.onNotAvailable((info) => {
    useStore.setState({ updateStatus: { status: "not-available", info } });
  });
  window.electron.update.onError((error) => {
    useStore.setState({ updateStatus: { status: "error", error } });
  });
  window.electron.update.onProgress((progress) => {
    useStore.setState({ updateStatus: { status: "downloading", progress } });
  });
  window.electron.update.onDownloaded((info) => {
    useStore.setState({ updateStatus: { status: "downloaded", info } });
  });

  // Cast updates
  window.electron.cast.onDevicesUpdated((devices) => {
    useStore.setState({ castDevices: devices });
  });

  window.electron.cast.onStatusChanged((status) => {
    useStore.setState({ castStatus: status });

    // Sync with player state if needed (isCasting is already synced via player state)
    const currentPlayer = useStore.getState().player;
    if (status.status === "connected") {
      setPlayerState({
        ...currentPlayer,
        isCasting: true,
        castDevice: status.device,
      });
    } else {
      setPlayerState({
        ...currentPlayer,
        isCasting: false,
        castDevice: undefined,
      });
    }
  });
}
