/**
 * IPC Channel names for communication between main and renderer processes
 * Using constants ensures type safety and prevents typos
 */

// ============================================================================
// Authentication Channels
// ============================================================================

export const AUTH_CHANNELS = {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    CHECK_SESSION: 'auth:check-session',
    GET_USER: 'auth:get-user',
    ON_AUTH_CHANGED: 'auth:on-changed',
} as const;

// ============================================================================
// Collection Channels
// ============================================================================

export const COLLECTION_CHANNELS = {
    FETCH: 'collection:fetch',
    REFRESH: 'collection:refresh',
    GET_ALBUM: 'collection:get-album',
    GET_TRACK: 'collection:get-track',
    SEARCH: 'collection:search',
    ON_UPDATED: 'collection:on-updated',
} as const;

// ============================================================================
// Player Channels
// ============================================================================

export const PLAYER_CHANNELS = {
    PLAY: 'player:play',
    PAUSE: 'player:pause',
    TOGGLE_PLAY: 'player:toggle-play',
    STOP: 'player:stop',
    NEXT: 'player:next',
    PREVIOUS: 'player:previous',
    SEEK: 'player:seek',
    SET_VOLUME: 'player:set-volume',
    TOGGLE_MUTE: 'player:toggle-mute',
    SET_REPEAT: 'player:set-repeat',
    TOGGLE_SHUFFLE: 'player:toggle-shuffle',
    GET_STATE: 'player:get-state',
    ON_STATE_CHANGED: 'player:on-state-changed',
    ON_TRACK_CHANGED: 'player:on-track-changed',
    ON_TIME_UPDATE: 'player:on-time-update',
    UPDATE_TIME: 'player:update-time',
} as const;

// ============================================================================
// Queue Channels
// ============================================================================

export const QUEUE_CHANNELS = {
    ADD_TRACK: 'queue:add-track',
    ADD_TRACKS: 'queue:add-tracks',
    ADD_ALBUM: 'queue:add-album',
    ADD_PLAYLIST: 'queue:add-playlist',
    REMOVE: 'queue:remove',
    CLEAR: 'queue:clear',
    REORDER: 'queue:reorder',
    PLAY_INDEX: 'queue:play-index',
    GET_QUEUE: 'queue:get',
    ON_UPDATED: 'queue:on-updated',
} as const;

// ============================================================================
// Playlist Channels
// ============================================================================

export const PLAYLIST_CHANNELS = {
    GET_ALL: 'playlist:get-all',
    GET_BY_ID: 'playlist:get-by-id',
    CREATE: 'playlist:create',
    UPDATE: 'playlist:update',
    DELETE: 'playlist:delete',
    ADD_TRACK: 'playlist:add-track',
    ADD_TRACKS: 'playlist:add-tracks',
    REMOVE_TRACK: 'playlist:remove-track',
    REORDER_TRACKS: 'playlist:reorder-tracks',
    ON_UPDATED: 'playlist:on-updated',
} as const;

// ============================================================================
// Radio Channels
// ============================================================================

export const RADIO_CHANNELS = {
    GET_STATIONS: 'radio:get-stations',
    PLAY_STATION: 'radio:play-station',
    STOP: 'radio:stop',
    GET_STATE: 'radio:get-state',
    ON_STATE_CHANGED: 'radio:on-state-changed',
} as const;

// ============================================================================
// Cache Channels
// ============================================================================

export const CACHE_CHANNELS = {
    DOWNLOAD_TRACK: 'cache:download-track',
    CANCEL_DOWNLOAD: 'cache:cancel-download',
    DELETE_TRACK: 'cache:delete-track',
    CLEAR_CACHE: 'cache:clear',
    GET_STATS: 'cache:get-stats',
    GET_CACHED_TRACKS: 'cache:get-cached-tracks',
    IS_CACHED: 'cache:is-cached',
    ON_DOWNLOAD_PROGRESS: 'cache:on-download-progress',
    ON_STATS_UPDATED: 'cache:on-stats-updated',
} as const;

// ============================================================================
// Scrobbler Channels
// ============================================================================

export const SCROBBLER_CHANNELS = {
    CONNECT: 'scrobbler:connect',
    DISCONNECT: 'scrobbler:disconnect',
    GET_STATE: 'scrobbler:get-state',
    ON_STATE_CHANGED: 'scrobbler:on-state-changed',
} as const;

// ============================================================================
// Settings Channels
// ============================================================================

export const SETTINGS_CHANNELS = {
    GET: 'settings:get',
    SET: 'settings:set',
    RESET: 'settings:reset',
    ON_CHANGED: 'settings:on-changed',
} as const;

// ============================================================================
// Window Channels
// ============================================================================

export const WINDOW_CHANNELS = {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    TOGGLE_MINI_PLAYER: 'window:toggle-mini-player',
    SET_ALWAYS_ON_TOP: 'window:set-always-on-top',
    GET_STATE: 'window:get-state',
    ON_STATE_CHANGED: 'window:on-state-changed',
} as const;

// ============================================================================
// System Channels
// ============================================================================

export const SYSTEM_CHANNELS = {
    GET_APP_VERSION: 'system:get-app-version',
    OPEN_EXTERNAL: 'system:open-external',
    SHOW_ITEM_IN_FOLDER: 'system:show-item-in-folder',
} as const;

// ============================================================================
// All Channels (for type inference)
// ============================================================================

export const IPC_CHANNELS = {
    ...AUTH_CHANNELS,
    ...COLLECTION_CHANNELS,
    ...PLAYER_CHANNELS,
    ...QUEUE_CHANNELS,
    ...PLAYLIST_CHANNELS,
    ...RADIO_CHANNELS,
    ...CACHE_CHANNELS,
    ...SCROBBLER_CHANNELS,
    ...SETTINGS_CHANNELS,
    ...WINDOW_CHANNELS,
    ...SYSTEM_CHANNELS,
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
