import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Electron
vi.mock('electron', () => ({
    ipcRenderer: {
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(),
        listeners: vi.fn(() => []),
    },
    shell: {
        openExternal: vi.fn(),
    },
}));

// Mock window.api (context bridge)
if (typeof window !== 'undefined') {
    (window as any).api = {
        send: vi.fn(),
        receive: vi.fn(),
        invoke: vi.fn(),
        removeListener: vi.fn(),
    };

    // Shared mock for window.electron
    (window as any).electron = {
        auth: {
            login: vi.fn(),
            logout: vi.fn(),
            checkSession: vi.fn(),
            getUser: vi.fn(),
            onAuthChanged: vi.fn(() => vi.fn()),
        },
        collection: {
            fetch: vi.fn(),
            refresh: vi.fn(),
            getAlbum: vi.fn(),
            getTrack: vi.fn(),
            search: vi.fn(),
            onUpdated: vi.fn(() => vi.fn()),
        },
        player: {
            play: vi.fn(),
            pause: vi.fn(),
            togglePlay: vi.fn(),
            stop: vi.fn(),
            next: vi.fn(),
            previous: vi.fn(),
            seek: vi.fn(),
            setVolume: vi.fn(),
            toggleMute: vi.fn(),
            setRepeat: vi.fn(),
            toggleShuffle: vi.fn(),
            getState: vi.fn(),
            onStateChanged: vi.fn(() => vi.fn()),
            onTrackChanged: vi.fn(() => vi.fn()),
            onTimeUpdate: vi.fn(() => vi.fn()),
            onSeek: vi.fn(() => vi.fn()),
            updateTime: vi.fn(),
        },
        queue: {
            addTrack: vi.fn(),
            addTracks: vi.fn(),
            addAlbum: vi.fn(),
            addPlaylist: vi.fn(),
            remove: vi.fn(),
            clear: vi.fn(),
            reorder: vi.fn(),
            playIndex: vi.fn(),
            get: vi.fn(),
            onUpdated: vi.fn(() => vi.fn()),
        },
        playlist: {
            getAll: vi.fn(),
            getById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            addTrack: vi.fn(),
            addTracks: vi.fn(),
            removeTrack: vi.fn(),
            reorderTracks: vi.fn(),
            onUpdated: vi.fn(() => vi.fn()),
        },
        radio: {
            getStations: vi.fn(),
            playStation: vi.fn(),
            stop: vi.fn(),
            getState: vi.fn(),
            onStateChanged: vi.fn(() => vi.fn()),
            onStationsUpdated: vi.fn(() => vi.fn()),
            addToQueue: vi.fn(),
            addToPlaylist: vi.fn(),
        },
        cache: {
            downloadTrack: vi.fn(),
            cancelDownload: vi.fn(),
            deleteTrack: vi.fn(),
            clear: vi.fn(),
            getStats: vi.fn(),
            getCachedTracks: vi.fn(),
            isCached: vi.fn(),
            onDownloadProgress: vi.fn(() => vi.fn()),
            onStatsUpdated: vi.fn(() => vi.fn()),
        },
        scrobbler: {
            connect: vi.fn(),
            disconnect: vi.fn(),
            getState: vi.fn(),
            onStateChanged: vi.fn(() => vi.fn()),
        },
        settings: {
            get: vi.fn(),
            set: vi.fn(),
            reset: vi.fn(),
            onChanged: vi.fn(() => vi.fn()),
        },
        window: {
            minimize: vi.fn(),
            maximize: vi.fn(),
            close: vi.fn(),
            toggleMiniPlayer: vi.fn(),
            setAlwaysOnTop: vi.fn(),
        },
        remote: {
            start: vi.fn(),
            stop: vi.fn(),
            getStatus: vi.fn(),
            getConnectedDevices: vi.fn(),
            disconnectDevice: vi.fn(),
            onStatusChanged: vi.fn(() => vi.fn()),
            onConnectionsChanged: vi.fn(() => vi.fn()),
        },
        system: {
            getAppVersion: vi.fn(),
            openExternal: vi.fn(),
            showItemInFolder: vi.fn(),
        },
        update: {
            check: vi.fn(),
            install: vi.fn(),
            onChecking: vi.fn(() => vi.fn()),
            onAvailable: vi.fn(() => vi.fn()),
            onNotAvailable: vi.fn(() => vi.fn()),
            onError: vi.fn(() => vi.fn()),
            onProgress: vi.fn(() => vi.fn()),
            onDownloaded: vi.fn(() => vi.fn()),
        },
    };
}
