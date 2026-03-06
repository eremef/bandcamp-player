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

interface CollectionSlice {
  collection: Collection | null;
  selectedAlbum: Album | null;
  isLoadingCollection: boolean;
  collectionError: string | null;
  fetchCollection: (forceRefresh?: boolean) => Promise<void>;
  selectAlbum: (album: Album) => void;
  updateAlbumInCollection: (album: Album) => void;
  searchCollection: (query: string) => Promise<Collection>;
  getAlbumDetails: (url: string) => Promise<Album | null>;
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
  playPlaylist: (id: string) => Promise<void>;
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
  addRadioToPlaylist: (
    playlistId: string,
    station: RadioStation,
  ) => Promise<void>;
}

interface CacheSlice {
  cacheStats: CacheStats | null;
  cachedTrackIds: Set<string>;
  cachedAlbumIds: Set<string>;
  downloadingTracks: Set<string>;
  downloadingAlbumIds: Set<string>;
  downloadTrack: (track: Track) => Promise<void>;
  deleteFromCache: (trackId: string) => Promise<void>;
  clearCache: () => Promise<void>;
  fetchCacheStats: () => Promise<void>;
  fetchCachedTrackIds: () => Promise<void>;
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

interface UISlice {
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
    if (track && get().settings?.offlineMode && !track.isCached) {
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

  // ---- Collection Slice ----
  collection: null,
  selectedAlbum: null,
  isLoadingCollection: false,
  collectionError: null,
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

    set({ isLoadingCollection: true, collectionError: null });
    try {
      const collection = forceRefresh
        ? await window.electron.collection.refresh()
        : await window.electron.collection.fetch();
      set({
        collection,
        isLoadingCollection: false,
        // Recompute album cache indicators now that we have collection data.
        // _cachedTrackCountByAlbum may already be populated from the startup
        // fetchCachedTrackIds() call, so this is a pure in-memory derivation.
        cachedAlbumIds: deriveCachedAlbumIds(collection),
      });
    } catch (error) {
      set({
        collectionError:
          error instanceof Error ? error.message : "Failed to fetch collection",
        isLoadingCollection: false,
      });
    }
  },
  selectAlbum: (album) =>
    set((s) => ({
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
  getAlbumDetails: async (url) => {
    return window.electron.collection.getAlbum(url);
  },

  // ---- Playlist Slice ----
  playlists: [],
  selectedPlaylist: null,
  fetchPlaylists: async () => {
    const playlists = await window.electron.playlist.getAll();
    set({ playlists });
  },
  selectPlaylist: async (id) => {
    const playlist = await window.electron.playlist.getById(id);
    set({
      selectedPlaylist: playlist,
      currentView: "playlist-detail",
      selectedPlaylistId: id,
    });
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
  playPlaylist: async (id: string) => {
    const playlist = await window.electron.playlist.getById(id);
    if (playlist && playlist.tracks.length > 0) {
      await get().clearQueue(false);
      await get().addTracksToQueue(playlist.tracks);
      await get().playQueueIndex(0);
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
  addRadioToPlaylist: async (playlistId, station) => {
    await window.electron.radio.addToPlaylist(playlistId, station);
    get().fetchPlaylists();
    const playlist = get().playlists.find((p) => p.id === playlistId);
    if (playlist) {
      get().showToast(`${station.name} added to ${playlist.name}`, "success");
    }
  },

  // ---- Cache Slice ----
  cacheStats: null,
  cachedTrackIds: new Set(),
  cachedAlbumIds: new Set(),
  downloadingTracks: new Set(),
  downloadingAlbumIds: new Set(),
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
    set({ settings });
  },
  updateSettings: async (newSettings) => {
    const updated = await window.electron.settings.set(newSettings);
    set({ settings: updated });

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
  setView: (view) => set({ currentView: view }),
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
  selectArtist: (artistId) => set({ selectedArtistId: artistId }),

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
    useStore.setState({ settings });
  });

  // Radio updates
  window.electron.radio.onStateChanged((state) => {
    useStore.setState({ radioState: state });
  });
  window.electron.radio.onStationsUpdated((stations) => {
    useStore.setState({ radioStations: stations });
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
