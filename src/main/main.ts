import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as path from 'path';
import { TrayService } from './services/tray.service';
import { AuthService } from './services/auth.service';
import { ScraperService } from './services/scraper.service';
import { PlayerService } from './services/player.service';
import { CacheService } from './services/cache.service';
import { PlaylistService } from './services/playlist.service';
import { ScrobblerService } from './services/scrobbler.service';
import { RemoteControlService } from './services/remote.service';
import { Database } from './database/database';
import { registerIpcHandlers } from './ipc-handlers';

// ============================================================================
// App Configuration
// ============================================================================

// Disable hardware acceleration to fix FFmpeg pixel format errors
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.disableHardwareAcceleration();

// Set App User Model ID for Windows (required for proper app name in SMTC)
if (process.platform === 'win32') {
    app.setAppUserModelId('xyz.eremef.bandcamp.player');
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
console.log('App starting. isDev:', isDev, 'NODE_ENV:', process.env.NODE_ENV, 'isPackaged:', app.isPackaged);

let mainWindow: BrowserWindow | null = null;
let miniPlayerWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let appIsQuitting = false;

// Services
let database: Database;
let authService: AuthService;
let scraperService: ScraperService;
let playerService: PlayerService;
let cacheService: CacheService;
let playlistService: PlaylistService;
let scrobblerService: ScrobblerService;
let remoteService: RemoteControlService;

// ============================================================================
// Window Creation
// ============================================================================

function createMainWindow(options: { forceShow?: boolean } = {}): BrowserWindow {
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#111111',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#111111',
            symbolColor: '#ffffff',
            height: 40,
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Required for better-sqlite3
        },
        show: false,
        icon: path.join(__dirname, '../assets/icons/icon.png'),
    });

    // Load the app
    if (isDev) {
        window.loadURL('http://localhost:5173');
        window.webContents.openDevTools();

        // Add keyboard shortcuts for DevTools in development
        window.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
                window.webContents.toggleDevTools();
            }
        });
    } else {
        window.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window when ready
    window.once('ready-to-show', () => {
        if (options.forceShow) {
            window.show();
            return;
        }

        const settings = database?.getSettings();
        if (!settings?.startMinimized) {
            window.show();
        }
    });

    // Handle window close
    window.on('close', (event) => {
        // If app is quitting, just let the window close
        if (appIsQuitting) return;

        // Check if we should minimize to tray instead of closing
        try {
            const settings = database?.getSettings();
            if (settings?.minimizeToTray) {
                event.preventDefault();
                window.hide();
            }
        } catch (error) {
            // Fallback if database access fails
            console.error('Error reading settings on close:', error);
        }
    });

    window.on('closed', () => {
        mainWindow = null;
    });

    return window;
}

function createMiniPlayerWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 450,
        height: 120,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#111111',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
        show: false,
    });

    if (isDev) {
        window.loadURL('http://localhost:5173/#/mini-player');
    } else {
        window.loadFile(path.join(__dirname, '../renderer/index.html'), {
            hash: '/mini-player',
        });
    }

    window.on('closed', () => {
        miniPlayerWindow = null;
    });

    return window;
}

// ============================================================================
// App Initialization
// ============================================================================

async function initializeServices() {
    // Initialize database
    const userDataPath = app.getPath('userData');
    database = new Database(path.join(userDataPath, 'bandcamp-player.db'));

    // Initialize services
    authService = new AuthService(session.defaultSession);
    scraperService = new ScraperService(authService);
    cacheService = new CacheService(database, path.join(userDataPath, 'cache'));
    playlistService = new PlaylistService(database);
    scrobblerService = new ScrobblerService(database);
    playerService = new PlayerService(cacheService, scrobblerService, scraperService, database);
    remoteService = new RemoteControlService(playerService, scraperService, playlistService, database);

    // Start remote service if enabled
    const settings = database.getSettings();
    if (settings?.remoteEnabled) {
        remoteService.start();
    }

    // Register IPC handlers
    registerIpcHandlers(ipcMain, {
        authService,
        scraperService,
        playerService,
        cacheService,
        playlistService,
        scrobblerService,
        remoteService,
        database,
        getMainWindow: () => mainWindow,
        getMiniPlayerWindow: () => miniPlayerWindow,
        toggleMiniPlayer,
    });

    // Inject headers for all requests to Bandcamp
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.bandcamp.com/*', '*://*.bcbits.com/*'] },
        (details, callback) => {
            details.requestHeaders['Referer'] = 'https://bandcamp.com/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );
}

function toggleMiniPlayer() {
    if (miniPlayerWindow && miniPlayerWindow.isVisible()) {
        miniPlayerWindow.hide();
        mainWindow?.show();
    } else {
        if (!miniPlayerWindow) {
            miniPlayerWindow = createMiniPlayerWindow();
        }
        miniPlayerWindow.show();
        mainWindow?.hide();
    }
}

// ============================================================================
// App Events
// ============================================================================

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        await initializeServices();
        mainWindow = createMainWindow();

        // Initialize tray
        trayService = new TrayService(
            mainWindow,
            playerService,
            () => {
                // Show window callback
                mainWindow?.show();
                mainWindow?.focus();
            },
            () => {
                // Quit callback
                appIsQuitting = true;
                app.quit();
            },
            isDev
        );

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createMainWindow({ forceShow: true });
            } else {
                mainWindow?.show();
            }
        });
    }).catch(err => {
        console.error('Error during app startup:', err);
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', () => {
        appIsQuitting = true;
        trayService?.destroy();
        database?.close();
    });
}

// ============================================================================
// Exports for IPC handlers
// ============================================================================

export { mainWindow, miniPlayerWindow };
