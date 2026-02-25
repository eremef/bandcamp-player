import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
    AUTH_CHANNELS,
    COLLECTION_CHANNELS,
    PLAYER_CHANNELS,
    QUEUE_CHANNELS,
    PLAYLIST_CHANNELS,
    RADIO_CHANNELS,
    CACHE_CHANNELS,
    SCROBBLER_CHANNELS,
    SETTINGS_CHANNELS,
    WINDOW_CHANNELS,
    REMOTE_CHANNELS,
    SYSTEM_CHANNELS,
    UPDATE_CHANNELS,
    CAST_CHANNELS,
} from '../shared/ipc-channels';
import type {
    Track,
    Album,
    Playlist,
    PlaylistCreateInput,
    PlaylistUpdateInput,
    PlayerState,
    RepeatMode,
    Collection,
    CacheStats,
    AppSettings,
    AuthState,
    LastfmState,
    RadioStation,
    RadioState,
    Queue,
    RemoteClient,
    CastDevice,

    CastStatus,
    Artist,
} from '../shared/types';

// ============================================================================
// Helper for creating invoke and listener methods
// ============================================================================

type Callback<T = unknown> = (data: T) => void;

function createEventSubscriber<T>(channel: string) {
    return (callback: Callback<T>) => {
        const handler = (_event: IpcRendererEvent, data: T) => callback(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}

// ============================================================================
// API Definition
// ============================================================================

const electronAPI = {
    // ---- Authentication ----
    auth: {
        login: (): Promise<AuthState> => ipcRenderer.invoke(AUTH_CHANNELS.LOGIN),
        logout: (): Promise<void> => ipcRenderer.invoke(AUTH_CHANNELS.LOGOUT),
        checkSession: (): Promise<AuthState> => ipcRenderer.invoke(AUTH_CHANNELS.CHECK_SESSION),
        getUser: (): Promise<AuthState> => ipcRenderer.invoke(AUTH_CHANNELS.GET_USER),
        onAuthChanged: createEventSubscriber<AuthState>(AUTH_CHANNELS.ON_AUTH_CHANGED),
    },

    // ---- Collection ----
    collection: {
        fetch: (): Promise<Collection> => ipcRenderer.invoke(COLLECTION_CHANNELS.FETCH),
        refresh: (): Promise<Collection> => ipcRenderer.invoke(COLLECTION_CHANNELS.REFRESH),
        getAlbum: (id: string): Promise<Album> => ipcRenderer.invoke(COLLECTION_CHANNELS.GET_ALBUM, id),
        getTrack: (id: string): Promise<Track> => ipcRenderer.invoke(COLLECTION_CHANNELS.GET_TRACK, id),
        getArtists: (): Promise<Artist[]> => ipcRenderer.invoke(COLLECTION_CHANNELS.GET_ARTISTS),
        search: (query: string): Promise<Collection> => ipcRenderer.invoke(COLLECTION_CHANNELS.SEARCH, query),
        onUpdated: createEventSubscriber<Collection>(COLLECTION_CHANNELS.ON_UPDATED),
    },

    // ---- Player ----
    player: {
        play: (track?: Track): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.PLAY, track),
        pause: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.PAUSE),
        togglePlay: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.TOGGLE_PLAY),
        stop: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.STOP),
        next: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.NEXT),
        previous: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.PREVIOUS),
        seek: (time: number): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.SEEK, time),
        setVolume: (volume: number): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.SET_VOLUME, volume),
        toggleMute: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.TOGGLE_MUTE),
        setRepeat: (mode: RepeatMode): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.SET_REPEAT, mode),
        toggleShuffle: (): Promise<void> => ipcRenderer.invoke(PLAYER_CHANNELS.TOGGLE_SHUFFLE),
        getState: (): Promise<PlayerState> => ipcRenderer.invoke(PLAYER_CHANNELS.GET_STATE),
        onStateChanged: createEventSubscriber<PlayerState>(PLAYER_CHANNELS.ON_STATE_CHANGED),
        onTrackChanged: createEventSubscriber<Track | null>(PLAYER_CHANNELS.ON_TRACK_CHANGED),
        onTimeUpdate: createEventSubscriber<{ currentTime: number; duration: number }>(PLAYER_CHANNELS.ON_TIME_UPDATE),
        onSeek: createEventSubscriber<number>(PLAYER_CHANNELS.ON_SEEK),
        updateTime: (currentTime: number, duration: number): Promise<void> =>
            ipcRenderer.invoke(PLAYER_CHANNELS.UPDATE_TIME, currentTime, duration),
    },

    // ---- Queue ----
    queue: {
        addTrack: (track: Track, playNext?: boolean): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.ADD_TRACK, track, playNext),
        addTracks: (tracks: Track[], playNext?: boolean): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.ADD_TRACKS, tracks, playNext),
        addAlbum: (album: Album, playNext?: boolean): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.ADD_ALBUM, album, playNext),
        addPlaylist: (playlist: Playlist): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.ADD_PLAYLIST, playlist),
        remove: (queueItemId: string): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.REMOVE, queueItemId),
        clear: (keepCurrent?: boolean): Promise<void> => ipcRenderer.invoke(QUEUE_CHANNELS.CLEAR, keepCurrent),
        reorder: (fromIndex: number, toIndex: number): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.REORDER, fromIndex, toIndex),
        playIndex: (index: number): Promise<void> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.PLAY_INDEX, index),
        get: (): Promise<Queue> =>
            ipcRenderer.invoke(QUEUE_CHANNELS.GET_QUEUE),
        onUpdated: createEventSubscriber<Queue>(
            QUEUE_CHANNELS.ON_UPDATED
        ),
    },

    // ---- Playlists ----
    playlist: {
        getAll: (): Promise<Playlist[]> => ipcRenderer.invoke(PLAYLIST_CHANNELS.GET_ALL),
        getById: (id: string): Promise<Playlist> => ipcRenderer.invoke(PLAYLIST_CHANNELS.GET_BY_ID, id),
        create: (input: PlaylistCreateInput): Promise<Playlist> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.CREATE, input),
        update: (input: PlaylistUpdateInput): Promise<Playlist> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.UPDATE, input),
        delete: (id: string): Promise<void> => ipcRenderer.invoke(PLAYLIST_CHANNELS.DELETE, id),
        addTrack: (playlistId: string, track: Track): Promise<void> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.ADD_TRACK, playlistId, track),
        addTracks: (playlistId: string, tracks: Track[]): Promise<void> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.ADD_TRACKS, playlistId, tracks),
        removeTrack: (playlistId: string, trackId: string): Promise<void> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.REMOVE_TRACK, playlistId, trackId),
        reorderTracks: (playlistId: string, fromIndex: number, toIndex: number): Promise<void> =>
            ipcRenderer.invoke(PLAYLIST_CHANNELS.REORDER_TRACKS, playlistId, fromIndex, toIndex),
        onUpdated: createEventSubscriber<Playlist[]>(PLAYLIST_CHANNELS.ON_UPDATED),
    },

    // ---- Radio ----
    radio: {
        getStations: (): Promise<RadioStation[]> => ipcRenderer.invoke(RADIO_CHANNELS.GET_STATIONS),
        refreshStations: (): Promise<RadioStation[]> => ipcRenderer.invoke(RADIO_CHANNELS.REFRESH_STATIONS),
        playStation: (station: RadioStation): Promise<void> =>
            ipcRenderer.invoke(RADIO_CHANNELS.PLAY_STATION, station),
        stop: (): Promise<void> => ipcRenderer.invoke(RADIO_CHANNELS.STOP),
        getState: (): Promise<RadioState> => ipcRenderer.invoke(RADIO_CHANNELS.GET_STATE),
        onStateChanged: createEventSubscriber<RadioState>(RADIO_CHANNELS.ON_STATE_CHANGED),
        onStationsUpdated: createEventSubscriber<RadioStation[]>(RADIO_CHANNELS.ON_STATIONS_UPDATED),
        addToQueue: (station: RadioStation, playNext?: boolean): Promise<void> =>
            ipcRenderer.invoke(RADIO_CHANNELS.ADD_TO_QUEUE, station, playNext),
        addToPlaylist: (playlistId: string, station: RadioStation): Promise<void> =>
            ipcRenderer.invoke(RADIO_CHANNELS.ADD_TO_PLAYLIST, playlistId, station),
    },

    // ---- Cache ----
    cache: {
        downloadTrack: (track: Track): Promise<void> =>
            ipcRenderer.invoke(CACHE_CHANNELS.DOWNLOAD_TRACK, track),
        cancelDownload: (trackId: string): Promise<void> =>
            ipcRenderer.invoke(CACHE_CHANNELS.CANCEL_DOWNLOAD, trackId),
        deleteTrack: (trackId: string): Promise<void> =>
            ipcRenderer.invoke(CACHE_CHANNELS.DELETE_TRACK, trackId),
        clear: (): Promise<void> => ipcRenderer.invoke(CACHE_CHANNELS.CLEAR_CACHE),
        getStats: (): Promise<CacheStats> => ipcRenderer.invoke(CACHE_CHANNELS.GET_STATS),
        getCachedTracks: (): Promise<Track[]> => ipcRenderer.invoke(CACHE_CHANNELS.GET_CACHED_TRACKS),
        isCached: (trackId: string): Promise<boolean> =>
            ipcRenderer.invoke(CACHE_CHANNELS.IS_CACHED, trackId),
        onDownloadProgress: createEventSubscriber<{ trackId: string; progress: number }>(
            CACHE_CHANNELS.ON_DOWNLOAD_PROGRESS
        ),
        onStatsUpdated: createEventSubscriber<CacheStats>(CACHE_CHANNELS.ON_STATS_UPDATED),
    },

    // ---- Scrobbler (Last.fm) ----
    scrobbler: {
        connect: (): Promise<LastfmState> => ipcRenderer.invoke(SCROBBLER_CHANNELS.CONNECT),
        disconnect: (): Promise<void> => ipcRenderer.invoke(SCROBBLER_CHANNELS.DISCONNECT),
        getState: (): Promise<LastfmState> => ipcRenderer.invoke(SCROBBLER_CHANNELS.GET_STATE),
        onStateChanged: createEventSubscriber<LastfmState>(SCROBBLER_CHANNELS.ON_STATE_CHANGED),
    },

    // ---- Settings ----
    settings: {
        get: (): Promise<AppSettings> => ipcRenderer.invoke(SETTINGS_CHANNELS.GET),
        set: (settings: Partial<AppSettings>): Promise<AppSettings> =>
            ipcRenderer.invoke(SETTINGS_CHANNELS.SET, settings),
        reset: (): Promise<AppSettings> => ipcRenderer.invoke(SETTINGS_CHANNELS.RESET),
        onChanged: createEventSubscriber<AppSettings>(SETTINGS_CHANNELS.ON_CHANGED),
    },

    // ---- Window ----
    window: {
        minimize: (): Promise<void> => ipcRenderer.invoke(WINDOW_CHANNELS.MINIMIZE),
        maximize: (): Promise<void> => ipcRenderer.invoke(WINDOW_CHANNELS.MAXIMIZE),
        close: (): Promise<void> => ipcRenderer.invoke(WINDOW_CHANNELS.CLOSE),
        toggleMiniPlayer: (): Promise<void> => ipcRenderer.invoke(WINDOW_CHANNELS.TOGGLE_MINI_PLAYER),
        setAlwaysOnTop: (value: boolean): Promise<void> =>
            ipcRenderer.invoke(WINDOW_CHANNELS.SET_ALWAYS_ON_TOP, value),
    },

    // ---- Remote Control ----
    remote: {
        start: (): Promise<void> => ipcRenderer.invoke(REMOTE_CHANNELS.START),
        stop: (): Promise<void> => ipcRenderer.invoke(REMOTE_CHANNELS.STOP),
        getStatus: (): Promise<{ isRunning: boolean; port: number; ip: string; url: string; connections: number }> =>
            ipcRenderer.invoke(REMOTE_CHANNELS.GET_STATUS),
        getConnectedDevices: (): Promise<RemoteClient[]> => ipcRenderer.invoke(REMOTE_CHANNELS.GET_DEVICES),
        disconnectDevice: (clientId: string): Promise<boolean> =>
            ipcRenderer.invoke(REMOTE_CHANNELS.DISCONNECT_DEVICE, clientId),
        onStatusChanged: createEventSubscriber<boolean>(REMOTE_CHANNELS.ON_STATUS_CHANGED),
        onConnectionsChanged: createEventSubscriber<number>(REMOTE_CHANNELS.ON_CONNECTIONS_CHANGED),
    },

    // ---- System ----
    system: {
        getAppVersion: (): Promise<string> => ipcRenderer.invoke(SYSTEM_CHANNELS.GET_APP_VERSION),
        openExternal: (url: string): Promise<void> =>
            ipcRenderer.invoke(SYSTEM_CHANNELS.OPEN_EXTERNAL, url),
        showItemInFolder: (path: string): Promise<void> =>
            ipcRenderer.invoke(SYSTEM_CHANNELS.SHOW_ITEM_IN_FOLDER, path),
        getRemoteConfig: (): Promise<any> => ipcRenderer.invoke(SYSTEM_CHANNELS.GET_REMOTE_CONFIG),
        refreshRemoteConfig: (): Promise<void> => ipcRenderer.invoke(SYSTEM_CHANNELS.REFRESH_REMOTE_CONFIG),
    },

    // ---- Updates ----
    update: {
        check: (isManual: boolean): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.CHECK, isManual),
        install: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.INSTALL),
        onChecking: createEventSubscriber<void>(UPDATE_CHANNELS.ON_CHECKING),
        onAvailable: createEventSubscriber<any>(UPDATE_CHANNELS.ON_AVAILABLE),
        onNotAvailable: createEventSubscriber<any>(UPDATE_CHANNELS.ON_NOT_AVAILABLE),
        onError: createEventSubscriber<string>(UPDATE_CHANNELS.ON_ERROR),
        onProgress: createEventSubscriber<any>(UPDATE_CHANNELS.ON_PROGRESS),
        onDownloaded: createEventSubscriber<any>(UPDATE_CHANNELS.ON_DOWNLOADED),
    },

    // ---- Chromecast ----
    cast: {
        startDiscovery: (): Promise<void> => ipcRenderer.invoke(CAST_CHANNELS.START_DISCOVERY),
        stopDiscovery: (): Promise<void> => ipcRenderer.invoke(CAST_CHANNELS.STOP_DISCOVERY),
        getDevices: (): Promise<CastDevice[]> => ipcRenderer.invoke(CAST_CHANNELS.GET_DEVICES),
        connect: (host: string): Promise<void> => ipcRenderer.invoke(CAST_CHANNELS.CONNECT, host),
        disconnect: (): Promise<void> => ipcRenderer.invoke(CAST_CHANNELS.DISCONNECT),
        onDevicesUpdated: createEventSubscriber<CastDevice[]>(CAST_CHANNELS.ON_DEVICES_UPDATED),
        onStatusChanged: createEventSubscriber<CastStatus>(CAST_CHANNELS.ON_STATUS_CHANGED),
    },
};

// ============================================================================
// Expose API to renderer
// ============================================================================

contextBridge.exposeInMainWorld('electron', electronAPI);

// ============================================================================
// Type declaration for renderer
// ============================================================================

export type ElectronAPI = typeof electronAPI;
