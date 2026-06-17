import { app, BrowserWindow, ipcMain, session, nativeTheme } from "electron";
import { remoteConfigService } from "../shared/remote-config.service";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { TrayService } from "./services/tray.service";
import { AuthService } from "./services/auth.service";
import { ScraperService } from "./services/scraper.service";
import { PlayerService } from "./services/player.service";
import { CacheService } from "./services/cache.service";
import { PlaylistService } from "./services/playlist.service";
import { ScrobblerService } from "./services/scrobbler.service";
import { RemoteControlService } from "./services/remote.service";
import { UpdaterService } from "./services/updater.service";
import { CastService } from "./services/cast.service";
import { Database } from "./database/database";
import { registerIpcHandlers } from "./ipc-handlers";

// ============================================================================
// App Configuration
// ============================================================================

// Disable hardware acceleration to fix FFmpeg pixel format errors
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.disableHardwareAcceleration();

// Set App User Model ID for Windows (required for proper app name in SMTC)
if (process.platform === "win32") {
  app.setAppUserModelId("xyz.eremef.beta.app");
}

const isDev =
  process.env.NODE_ENV === "development" ||
  (!app.isPackaged && process.env.NODE_ENV !== "production");
console.log(
  "App starting. isDev:",
  isDev,
  "NODE_ENV:",
  process.env.NODE_ENV,
  "isPackaged:",
  app.isPackaged,
);

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
let updaterService: UpdaterService;
let castService: CastService;
let cacheServer: http.Server | null = null;

// ============================================================================
// Window Creation
// ============================================================================

function getTitleBarOverlay() {
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    color: isDark ? "#141414" : "#f5f5f5",
    symbolColor: isDark ? "#ffffff" : "#000000",
    height: 40,
  };
}

function createMainWindow(
  options: { forceShow?: boolean } = {},
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1250,
    height: 800,
    minWidth: 1180,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    ...(process.platform !== "linux" && {
      titleBarOverlay: getTitleBarOverlay(),
    }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for better-sqlite3
    },
    show: false,
    icon: path.join(
      __dirname,
      process.platform === "win32"
        ? "../assets/icons/icon.ico"
        : "../assets/icons/icon.png"
    ),
  });

  // Load the app
  if (isDev) {
    window.loadURL("http://localhost:5173");
    window.webContents.openDevTools();

    // Add keyboard shortcuts for DevTools in development
    window.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i")
      ) {
        window.webContents.toggleDevTools();
      }
    });
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  // Show window when ready
  window.once("ready-to-show", () => {
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
  window.on("close", (event) => {
    // If app is quitting, just let the window close
    if (appIsQuitting) return;

    // Check if we should minimize to tray instead of closing
    try {
      const settings = database?.getSettings();
      if (settings?.minimizeToTray) {
        event.preventDefault();
        window.hide();
        return;
      }
    } catch (error) {
      // Fallback if database access fails
      console.error("Error reading settings on close:", error);
    }
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  // Update title bar overlay when theme changes (Windows only)
  nativeTheme.on("updated", () => {
    if (process.platform === "win32") {
      window.setTitleBarOverlay(getTitleBarOverlay());
    }
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
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  if (isDev) {
    window.loadURL("http://localhost:5173/#/mini-player");
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/mini-player",
    });
  }

  window.on("closed", () => {
    miniPlayerWindow = null;
  });

  return window;
}

// ============================================================================
// App Initialization
// ============================================================================

async function initializeServices() {
  // Initialize database
  const userDataPath = app.getPath("userData");
  database = new Database(path.join(userDataPath, "bandcamp-player.db"));

  // Initialize services
  authService = new AuthService(session.defaultSession, () =>
    database.getSettings(),
  );
  scraperService = new ScraperService(authService, database);
  cacheService = new CacheService(database, path.join(userDataPath, "cache"));
  playlistService = new PlaylistService(database);
  scrobblerService = new ScrobblerService(database);
  castService = new CastService();
  playerService = new PlayerService(
    cacheService,
    scrobblerService,
    scraperService,
    castService,
    database,
  );

  const remotePort = process.env.REMOTE_PORT
    ? parseInt(process.env.REMOTE_PORT, 10)
    : 9999;
  remoteService = new RemoteControlService(
    playerService,
    scraperService,
    playlistService,
    authService,
    database,
    remotePort,
  );

  updaterService = new UpdaterService(isDev);

  // Start remote service if enabled
  const settings = database.getSettings();
  if (settings?.remoteEnabled) {
    remoteService.start();
  }

  // Set initial theme
  if (settings?.theme) {
    nativeTheme.themeSource = settings.theme;
  }

  // Inform RemoteConfigService about offline mode so it skips GitHub fetches
  if (settings?.offlineMode) {
    remoteConfigService.setOfflineMode(true);
  }

  // Fetch remote config (skipped automatically if offline mode is enabled)
  remoteConfigService.fetchLatestConfig().catch((e) =>
    console.error("[RemoteConfig] Initial fetch failed:", e),
  );

  // Register IPC handlers
  registerIpcHandlers(ipcMain, {
    authService,
    scraperService,
    playerService,
    cacheService,
    playlistService,
    scrobblerService,
    remoteService,
    updaterService,
    castService,
    database,
    getMainWindow: () => mainWindow,
    getMiniPlayerWindow: () => miniPlayerWindow,
    toggleMiniPlayer,
  });

  // Inject headers for all requests to Bandcamp
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.bandcamp.com/*", "*://*.bcbits.com/*"] },
    (details, callback) => {
      details.requestHeaders["Referer"] = "https://bandcamp.com/";
      callback({ requestHeaders: details.requestHeaders });
    },
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
// Ensure single instance
const gotTheLock =
  process.env.E2E_TEST === "true" ? true : app.requestSingleInstanceLock();

console.log("Single instance lock:", gotTheLock);

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(async () => {
      const CACHE_ROOT = path.join(app.getPath("userData"), "cache");
      // Ensure directory exists before calling realpathSync to avoid ENOENT crash
      if (!fs.existsSync(CACHE_ROOT)) {
        fs.mkdirSync(CACHE_ROOT, { recursive: true });
      }
      const canonicalCacheRoot = fs.realpathSync(CACHE_ROOT);
      cacheServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        const rawPath = req.url ? req.url.slice(1) : "";
        const requestedPath = decodeURIComponent(rawPath);

        if (!requestedPath) {
          res.writeHead(400);
          res.end("Missing file path");
          return;
        }

        let safePath: string;
        try {
          const resolvedPath = path.resolve(canonicalCacheRoot, requestedPath);
          safePath = fs.realpathSync(resolvedPath); // CodeQL: validated by path.sep check below
        } catch {
          res.writeHead(404);
          res.end("File not found");
          return;
        }

        if (
          safePath !== canonicalCacheRoot &&
          !safePath.startsWith(canonicalCacheRoot + path.sep)
        ) {
          res.writeHead(403);
          res.end("Access denied");
          return;
        }

        console.log("[cache-server] Serving:", safePath);
        if (fs.existsSync(safePath)) {
          const stat = fs.statSync(safePath);
          const fileSize = stat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize,
              "Content-Type": "audio/mpeg",
            });
            fs.createReadStream(safePath, { start, end }).pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Length": fileSize,
              "Content-Type": "audio/mpeg",
            });
            fs.createReadStream(safePath).pipe(res);
          }
        } else {
          res.writeHead(404);
          res.end("File not found");
        }
      });
      if (cacheServer) {
        cacheServer.listen(0, "0.0.0.0", () => {
          const addr = cacheServer?.address() as { port: number };
          if (addr) {
            (global as any).cacheServerPort = addr.port;
            console.log("[cache-server] Listening on port", addr.port);
          }
        });
      }

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
        isDev,
      );

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow({ forceShow: true });
        } else {
          mainWindow?.show();
        }
      });
    })
    .catch((err) => {
      console.error("Error during app startup:", err);
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    if (appIsQuitting && process.platform === 'win32') {
      // Fallback: if we are already quitting but something is taking too long,
      // force exit after a timeout to prevent the process from hanging and blocking installers.
      setTimeout(() => {
        console.log("[Main] Shutdown timeout reached. Forcing exit.");
        process.exit(0);
      }, 2000).unref(); // unref() so the timer itself doesn't keep the process alive
    }

    appIsQuitting = true;

    console.log("[Main] Shutting down services...");

    // Stop all services and servers for a clean exit
    // This prevents the process from hanging and blocking uninstallation
    try {
      remoteService?.stop();
      castService?.stop();
      updaterService?.stop();
      if (cacheServer) {
        cacheServer.close();
        if (typeof (cacheServer as any).closeAllConnections === 'function') {
          (cacheServer as any).closeAllConnections();
        }
        cacheServer = null;
      }
    } catch (err) {
      console.error("Error during clean shutdown:", err);
    }

    trayService?.destroy();
    database?.close();
  });
}

// ============================================================================
// Exports for IPC handlers
// ============================================================================

export { mainWindow, miniPlayerWindow };
