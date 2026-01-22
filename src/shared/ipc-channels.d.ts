/**
 * IPC Channel names for communication between main and renderer processes
 * Using constants ensures type safety and prevents typos
 */
export declare const AUTH_CHANNELS: {
    readonly LOGIN: "auth:login";
    readonly LOGOUT: "auth:logout";
    readonly CHECK_SESSION: "auth:check-session";
    readonly GET_USER: "auth:get-user";
    readonly ON_AUTH_CHANGED: "auth:on-changed";
};
export declare const COLLECTION_CHANNELS: {
    readonly FETCH: "collection:fetch";
    readonly REFRESH: "collection:refresh";
    readonly GET_ALBUM: "collection:get-album";
    readonly GET_TRACK: "collection:get-track";
    readonly SEARCH: "collection:search";
    readonly ON_UPDATED: "collection:on-updated";
};
export declare const PLAYER_CHANNELS: {
    readonly PLAY: "player:play";
    readonly PAUSE: "player:pause";
    readonly TOGGLE_PLAY: "player:toggle-play";
    readonly STOP: "player:stop";
    readonly NEXT: "player:next";
    readonly PREVIOUS: "player:previous";
    readonly SEEK: "player:seek";
    readonly SET_VOLUME: "player:set-volume";
    readonly TOGGLE_MUTE: "player:toggle-mute";
    readonly SET_REPEAT: "player:set-repeat";
    readonly TOGGLE_SHUFFLE: "player:toggle-shuffle";
    readonly GET_STATE: "player:get-state";
    readonly ON_STATE_CHANGED: "player:on-state-changed";
    readonly ON_TRACK_CHANGED: "player:on-track-changed";
    readonly ON_TIME_UPDATE: "player:on-time-update";
};
export declare const QUEUE_CHANNELS: {
    readonly ADD_TRACK: "queue:add-track";
    readonly ADD_TRACKS: "queue:add-tracks";
    readonly ADD_ALBUM: "queue:add-album";
    readonly ADD_PLAYLIST: "queue:add-playlist";
    readonly REMOVE: "queue:remove";
    readonly CLEAR: "queue:clear";
    readonly REORDER: "queue:reorder";
    readonly PLAY_INDEX: "queue:play-index";
    readonly GET_QUEUE: "queue:get";
    readonly ON_UPDATED: "queue:on-updated";
};
export declare const PLAYLIST_CHANNELS: {
    readonly GET_ALL: "playlist:get-all";
    readonly GET_BY_ID: "playlist:get-by-id";
    readonly CREATE: "playlist:create";
    readonly UPDATE: "playlist:update";
    readonly DELETE: "playlist:delete";
    readonly ADD_TRACK: "playlist:add-track";
    readonly REMOVE_TRACK: "playlist:remove-track";
    readonly REORDER_TRACKS: "playlist:reorder-tracks";
    readonly ON_UPDATED: "playlist:on-updated";
};
export declare const RADIO_CHANNELS: {
    readonly GET_STATIONS: "radio:get-stations";
    readonly PLAY_STATION: "radio:play-station";
    readonly STOP: "radio:stop";
    readonly GET_STATE: "radio:get-state";
    readonly ON_STATE_CHANGED: "radio:on-state-changed";
};
export declare const CACHE_CHANNELS: {
    readonly DOWNLOAD_TRACK: "cache:download-track";
    readonly CANCEL_DOWNLOAD: "cache:cancel-download";
    readonly DELETE_TRACK: "cache:delete-track";
    readonly CLEAR_CACHE: "cache:clear";
    readonly GET_STATS: "cache:get-stats";
    readonly GET_CACHED_TRACKS: "cache:get-cached-tracks";
    readonly IS_CACHED: "cache:is-cached";
    readonly ON_DOWNLOAD_PROGRESS: "cache:on-download-progress";
    readonly ON_STATS_UPDATED: "cache:on-stats-updated";
};
export declare const SCROBBLER_CHANNELS: {
    readonly CONNECT: "scrobbler:connect";
    readonly DISCONNECT: "scrobbler:disconnect";
    readonly GET_STATE: "scrobbler:get-state";
    readonly ON_STATE_CHANGED: "scrobbler:on-state-changed";
};
export declare const SETTINGS_CHANNELS: {
    readonly GET: "settings:get";
    readonly SET: "settings:set";
    readonly RESET: "settings:reset";
    readonly ON_CHANGED: "settings:on-changed";
};
export declare const WINDOW_CHANNELS: {
    readonly MINIMIZE: "window:minimize";
    readonly MAXIMIZE: "window:maximize";
    readonly CLOSE: "window:close";
    readonly TOGGLE_MINI_PLAYER: "window:toggle-mini-player";
    readonly SET_ALWAYS_ON_TOP: "window:set-always-on-top";
    readonly GET_STATE: "window:get-state";
    readonly ON_STATE_CHANGED: "window:on-state-changed";
};
export declare const SYSTEM_CHANNELS: {
    readonly GET_APP_VERSION: "system:get-app-version";
    readonly OPEN_EXTERNAL: "system:open-external";
    readonly SHOW_ITEM_IN_FOLDER: "system:show-item-in-folder";
};
export declare const IPC_CHANNELS: {
    readonly GET_APP_VERSION: "system:get-app-version";
    readonly OPEN_EXTERNAL: "system:open-external";
    readonly SHOW_ITEM_IN_FOLDER: "system:show-item-in-folder";
    readonly MINIMIZE: "window:minimize";
    readonly MAXIMIZE: "window:maximize";
    readonly CLOSE: "window:close";
    readonly TOGGLE_MINI_PLAYER: "window:toggle-mini-player";
    readonly SET_ALWAYS_ON_TOP: "window:set-always-on-top";
    readonly GET_STATE: "window:get-state";
    readonly ON_STATE_CHANGED: "window:on-state-changed";
    readonly GET: "settings:get";
    readonly SET: "settings:set";
    readonly RESET: "settings:reset";
    readonly ON_CHANGED: "settings:on-changed";
    readonly CONNECT: "scrobbler:connect";
    readonly DISCONNECT: "scrobbler:disconnect";
    readonly DOWNLOAD_TRACK: "cache:download-track";
    readonly CANCEL_DOWNLOAD: "cache:cancel-download";
    readonly DELETE_TRACK: "cache:delete-track";
    readonly CLEAR_CACHE: "cache:clear";
    readonly GET_STATS: "cache:get-stats";
    readonly GET_CACHED_TRACKS: "cache:get-cached-tracks";
    readonly IS_CACHED: "cache:is-cached";
    readonly ON_DOWNLOAD_PROGRESS: "cache:on-download-progress";
    readonly ON_STATS_UPDATED: "cache:on-stats-updated";
    readonly GET_STATIONS: "radio:get-stations";
    readonly PLAY_STATION: "radio:play-station";
    readonly STOP: "radio:stop";
    readonly GET_ALL: "playlist:get-all";
    readonly GET_BY_ID: "playlist:get-by-id";
    readonly CREATE: "playlist:create";
    readonly UPDATE: "playlist:update";
    readonly DELETE: "playlist:delete";
    readonly ADD_TRACK: "playlist:add-track";
    readonly REMOVE_TRACK: "playlist:remove-track";
    readonly REORDER_TRACKS: "playlist:reorder-tracks";
    readonly ON_UPDATED: "playlist:on-updated";
    readonly ADD_TRACKS: "queue:add-tracks";
    readonly ADD_ALBUM: "queue:add-album";
    readonly ADD_PLAYLIST: "queue:add-playlist";
    readonly REMOVE: "queue:remove";
    readonly CLEAR: "queue:clear";
    readonly REORDER: "queue:reorder";
    readonly PLAY_INDEX: "queue:play-index";
    readonly GET_QUEUE: "queue:get";
    readonly PLAY: "player:play";
    readonly PAUSE: "player:pause";
    readonly TOGGLE_PLAY: "player:toggle-play";
    readonly NEXT: "player:next";
    readonly PREVIOUS: "player:previous";
    readonly SEEK: "player:seek";
    readonly SET_VOLUME: "player:set-volume";
    readonly TOGGLE_MUTE: "player:toggle-mute";
    readonly SET_REPEAT: "player:set-repeat";
    readonly TOGGLE_SHUFFLE: "player:toggle-shuffle";
    readonly ON_TRACK_CHANGED: "player:on-track-changed";
    readonly ON_TIME_UPDATE: "player:on-time-update";
    readonly FETCH: "collection:fetch";
    readonly REFRESH: "collection:refresh";
    readonly GET_ALBUM: "collection:get-album";
    readonly GET_TRACK: "collection:get-track";
    readonly SEARCH: "collection:search";
    readonly LOGIN: "auth:login";
    readonly LOGOUT: "auth:logout";
    readonly CHECK_SESSION: "auth:check-session";
    readonly GET_USER: "auth:get-user";
    readonly ON_AUTH_CHANGED: "auth:on-changed";
};
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
//# sourceMappingURL=ipc-channels.d.ts.map