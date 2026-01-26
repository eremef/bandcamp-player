import { IpcMain, BrowserWindow, app, shell } from 'electron';
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
} from '../shared/ipc-channels';
import type { Track, Album, Playlist, RepeatMode, RadioStation } from '../shared/types';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';
import { PlayerService } from './services/player.service';
import { CacheService } from './services/cache.service';
import { PlaylistService } from './services/playlist.service';
import { ScrobblerService } from './services/scrobbler.service';
import { RemoteControlService } from './services/remote.service';
import { Database } from './database/database';

// ============================================================================
// IPC Handlers Registration
// ============================================================================

interface Services {
    authService: AuthService;
    scraperService: ScraperService;
    playerService: PlayerService;
    cacheService: CacheService;
    playlistService: PlaylistService;
    scrobblerService: ScrobblerService;
    remoteService: RemoteControlService;
    database: Database;
    getMainWindow: () => BrowserWindow | null;
    getMiniPlayerWindow: () => BrowserWindow | null;
    toggleMiniPlayer: () => void;
}

export function registerIpcHandlers(ipcMain: IpcMain, services: Services) {
    const {
        authService,
        scraperService,
        playerService,
        cacheService,
        playlistService,
        scrobblerService,
        remoteService,
        database,
        getMainWindow,
        getMiniPlayerWindow,
        toggleMiniPlayer,
    } = services;

    // Helper to send to all windows
    const broadcast = (channel: string, data: unknown) => {
        getMainWindow()?.webContents.send(channel, data);
        getMiniPlayerWindow()?.webContents.send(channel, data);
    };

    // ---- Authentication ----
    ipcMain.handle(AUTH_CHANNELS.LOGIN, () => authService.login());
    ipcMain.handle(AUTH_CHANNELS.LOGOUT, () => authService.logout());
    ipcMain.handle(AUTH_CHANNELS.CHECK_SESSION, () => authService.checkSession());
    ipcMain.handle(AUTH_CHANNELS.GET_USER, () => authService.getUser());

    // ---- Collection ----
    ipcMain.handle(COLLECTION_CHANNELS.FETCH, () => scraperService.fetchCollection());
    ipcMain.handle(COLLECTION_CHANNELS.REFRESH, () => scraperService.fetchCollection(true));
    ipcMain.handle(COLLECTION_CHANNELS.GET_ALBUM, async (_, albumUrl: string) =>
        scraperService.getAlbumDetails(albumUrl)
    );
    ipcMain.handle(COLLECTION_CHANNELS.SEARCH, (_, query: string) =>
        scraperService.searchCollection(query)
    );

    // ---- Player ----
    ipcMain.handle(PLAYER_CHANNELS.PLAY, (_, track?: Track) => playerService.play(track));
    ipcMain.handle(PLAYER_CHANNELS.PAUSE, () => playerService.pause());
    ipcMain.handle(PLAYER_CHANNELS.TOGGLE_PLAY, () => playerService.togglePlay());
    ipcMain.handle(PLAYER_CHANNELS.STOP, () => playerService.stop());
    ipcMain.handle(PLAYER_CHANNELS.NEXT, () => playerService.next());
    ipcMain.handle(PLAYER_CHANNELS.PREVIOUS, () => playerService.previous());
    ipcMain.handle(PLAYER_CHANNELS.SEEK, (_, time: number) => playerService.seek(time));
    ipcMain.handle(PLAYER_CHANNELS.SET_VOLUME, (_, volume: number) => playerService.setVolume(volume));
    ipcMain.handle(PLAYER_CHANNELS.TOGGLE_MUTE, () => playerService.toggleMute());
    ipcMain.handle(PLAYER_CHANNELS.SET_REPEAT, (_, mode: RepeatMode) => playerService.setRepeat(mode));
    ipcMain.handle(PLAYER_CHANNELS.TOGGLE_SHUFFLE, () => playerService.toggleShuffle());
    ipcMain.handle(PLAYER_CHANNELS.GET_STATE, () => playerService.getState());
    ipcMain.handle(PLAYER_CHANNELS.UPDATE_TIME, (_, currentTime: number, duration: number) =>
        playerService.updateTime(currentTime, duration)
    );

    // Player events
    playerService.on('state-changed', (state) => {
        broadcast(PLAYER_CHANNELS.ON_STATE_CHANGED, state);
    });
    playerService.on('track-changed', (track) => {
        broadcast(PLAYER_CHANNELS.ON_TRACK_CHANGED, track);
    });
    playerService.on('time-update', (data) => {
        broadcast(PLAYER_CHANNELS.ON_TIME_UPDATE, data);
    });
    playerService.on('seek-command', (time) => {
        broadcast(PLAYER_CHANNELS.ON_SEEK, time);
    });

    // ---- Queue ----
    ipcMain.handle(QUEUE_CHANNELS.ADD_TRACK, (_, track: Track, playNext?: boolean) =>
        playerService.addToQueue(track, 'collection', playNext)
    );
    ipcMain.handle(QUEUE_CHANNELS.ADD_TRACKS, (_, tracks: Track[]) =>
        playerService.addTracksToQueue(tracks)
    );
    ipcMain.handle(QUEUE_CHANNELS.ADD_ALBUM, (_, album: Album, _playNext?: boolean) => {
        playerService.addTracksToQueue(album.tracks, 'collection');
    });
    ipcMain.handle(QUEUE_CHANNELS.ADD_PLAYLIST, (_, playlist: Playlist) => {
        playerService.addTracksToQueue(playlist.tracks, 'playlist');
    });
    ipcMain.handle(QUEUE_CHANNELS.REMOVE, (_, queueItemId: string) =>
        playerService.removeFromQueue(queueItemId)
    );
    ipcMain.handle(QUEUE_CHANNELS.CLEAR, (_, keepCurrent?: boolean) => playerService.clearQueue(keepCurrent));
    ipcMain.handle(QUEUE_CHANNELS.REORDER, (_, fromIndex: number, toIndex: number) =>
        playerService.reorderQueue(fromIndex, toIndex)
    );
    ipcMain.handle(QUEUE_CHANNELS.PLAY_INDEX, (_, index: number) =>
        playerService.playIndex(index)
    );
    ipcMain.handle(QUEUE_CHANNELS.GET_QUEUE, () => playerService.getQueue());

    playerService.on('queue-updated', (queue) => {
        broadcast(QUEUE_CHANNELS.ON_UPDATED, queue);
    });

    // ---- Playlists ----
    ipcMain.handle(PLAYLIST_CHANNELS.GET_ALL, () => playlistService.getAll());
    ipcMain.handle(PLAYLIST_CHANNELS.GET_BY_ID, (_, id: string) => playlistService.getById(id));
    ipcMain.handle(PLAYLIST_CHANNELS.CREATE, (_, input) => playlistService.create(input));
    ipcMain.handle(PLAYLIST_CHANNELS.UPDATE, (_, input) => playlistService.update(input));
    ipcMain.handle(PLAYLIST_CHANNELS.DELETE, (_, id: string) => playlistService.delete(id));
    ipcMain.handle(PLAYLIST_CHANNELS.ADD_TRACK, (_, playlistId: string, track: Track) =>
        playlistService.addTrack(playlistId, track)
    );
    ipcMain.handle(PLAYLIST_CHANNELS.ADD_TRACKS, (_, playlistId: string, tracks: Track[]) =>
        playlistService.addTracks(playlistId, tracks)
    );
    ipcMain.handle(PLAYLIST_CHANNELS.REMOVE_TRACK, (_, playlistId: string, trackId: string) =>
        playlistService.removeTrack(playlistId, trackId)
    );
    ipcMain.handle(PLAYLIST_CHANNELS.REORDER_TRACKS, (_, playlistId: string, from: number, to: number) =>
        playlistService.reorderTracks(playlistId, from, to)
    );

    // ---- Radio ----
    ipcMain.handle(RADIO_CHANNELS.GET_STATIONS, () => scraperService.getRadioStations());
    ipcMain.handle(RADIO_CHANNELS.PLAY_STATION, (_, station: RadioStation) => playerService.playStation(station));
    ipcMain.handle(RADIO_CHANNELS.STOP, () => playerService.stopRadio());
    ipcMain.handle(RADIO_CHANNELS.GET_STATE, () => playerService.getRadioState());

    playerService.on('radio-state-changed', (state) => {
        broadcast(RADIO_CHANNELS.ON_STATE_CHANGED, state);
    });

    // ---- Cache ----
    ipcMain.handle(CACHE_CHANNELS.DOWNLOAD_TRACK, (_, track: Track) =>
        cacheService.downloadTrack(track)
    );
    ipcMain.handle(CACHE_CHANNELS.CANCEL_DOWNLOAD, (_, trackId: string) =>
        cacheService.cancelDownload(trackId)
    );
    ipcMain.handle(CACHE_CHANNELS.DELETE_TRACK, (_, trackId: string) =>
        cacheService.deleteTrack(trackId)
    );
    ipcMain.handle(CACHE_CHANNELS.CLEAR_CACHE, () => cacheService.clearCache());
    ipcMain.handle(CACHE_CHANNELS.GET_STATS, () => cacheService.getStats());
    ipcMain.handle(CACHE_CHANNELS.GET_CACHED_TRACKS, () => cacheService.getCachedTracks());
    ipcMain.handle(CACHE_CHANNELS.IS_CACHED, (_, trackId: string) =>
        cacheService.isCached(trackId)
    );

    cacheService.on('download-progress', (data) => {
        broadcast(CACHE_CHANNELS.ON_DOWNLOAD_PROGRESS, data);
    });
    cacheService.on('stats-updated', (stats) => {
        broadcast(CACHE_CHANNELS.ON_STATS_UPDATED, stats);
    });

    // ---- Scrobbler ----
    ipcMain.handle(SCROBBLER_CHANNELS.CONNECT, () => scrobblerService.connect());
    ipcMain.handle(SCROBBLER_CHANNELS.DISCONNECT, () => scrobblerService.disconnect());
    ipcMain.handle(SCROBBLER_CHANNELS.GET_STATE, () => scrobblerService.getState());

    scrobblerService.on('state-changed', (state) => {
        broadcast(SCROBBLER_CHANNELS.ON_STATE_CHANGED, state);
    });

    // ---- Settings ----
    ipcMain.handle(SETTINGS_CHANNELS.GET, () => database.getSettings());
    ipcMain.handle(SETTINGS_CHANNELS.SET, (_, settings) => {
        const updated = database.setSettings(settings);
        broadcast(SETTINGS_CHANNELS.ON_CHANGED, updated);
        return updated;
    });
    ipcMain.handle(SETTINGS_CHANNELS.RESET, () => {
        // Reset would reinitialize default settings
        return database.getSettings();
    });

    // ---- Remote Control ----
    ipcMain.handle(REMOTE_CHANNELS.START, () => remoteService.start());
    ipcMain.handle(REMOTE_CHANNELS.STOP, () => remoteService.stop());
    ipcMain.handle(REMOTE_CHANNELS.GET_STATUS, () => remoteService.getStatus());

    remoteService.on('status-changed', (isRunning) => {
        broadcast(REMOTE_CHANNELS.ON_STATUS_CHANGED, isRunning);
    });
    remoteService.on('connections-changed', (count) => {
        broadcast(REMOTE_CHANNELS.ON_CONNECTIONS_CHANGED, count);
    });

    // ---- Window ----
    ipcMain.handle(WINDOW_CHANNELS.MINIMIZE, () => {
        getMainWindow()?.minimize();
    });
    ipcMain.handle(WINDOW_CHANNELS.MAXIMIZE, () => {
        const win = getMainWindow();
        if (win?.isMaximized()) {
            win.unmaximize();
        } else {
            win?.maximize();
        }
    });
    ipcMain.handle(WINDOW_CHANNELS.CLOSE, () => {
        getMainWindow()?.close();
    });
    ipcMain.handle(WINDOW_CHANNELS.TOGGLE_MINI_PLAYER, () => {
        toggleMiniPlayer();
    });
    ipcMain.handle(WINDOW_CHANNELS.SET_ALWAYS_ON_TOP, (_, value: boolean) => {
        getMainWindow()?.setAlwaysOnTop(value);
        getMiniPlayerWindow()?.setAlwaysOnTop(value);
    });

    // ---- System ----
    ipcMain.handle(SYSTEM_CHANNELS.GET_APP_VERSION, () => app.getVersion());
    ipcMain.handle(SYSTEM_CHANNELS.OPEN_EXTERNAL, (_, url: string) => shell.openExternal(url));
    ipcMain.handle(SYSTEM_CHANNELS.SHOW_ITEM_IN_FOLDER, (_, path: string) =>
        shell.showItemInFolder(path)
    );
}
