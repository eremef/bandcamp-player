import { autoUpdater } from 'electron-updater';
import { EventEmitter } from 'events';
import { UPDATE_CHANNELS } from '../../shared/ipc-channels';

export class UpdaterService extends EventEmitter {
    private isChecking = false;
    private notifiedOnce = false;
    private lastNotifiedVersion = '';
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor(private isDev: boolean) {
        super();
        this.setupListeners();

        // Disable auto-download - we want to notify first (optional, but better UX)
        autoUpdater.autoDownload = true;

        // In dev mode, we can't really check for updates easily unless configured
        if (this.isDev) {
            autoUpdater.logger = console;
            // autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
        }

        // Initial check after startup
        setTimeout(() => this.checkForUpdates(), 1000 * 15); // 15 seconds after start

        // Setup periodic check
        this.startPeriodicCheck();
    }

    private startPeriodicCheck() {
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => {
            this.checkForUpdates();
        }, this.CHECK_INTERVAL_MS);
    }

    private setupListeners() {
        autoUpdater.on('checking-for-update', () => {
            this.isChecking = true;
            this.emit(UPDATE_CHANNELS.ON_CHECKING);
        });

        autoUpdater.on('update-available', (info) => {
            this.isChecking = false;

            // Only notify once per version to avoid spamming the renderer
            if (this.notifiedOnce && this.lastNotifiedVersion === info.version) {
                return;
            }

            this.notifiedOnce = true;
            this.lastNotifiedVersion = info.version;
            this.emit(UPDATE_CHANNELS.ON_AVAILABLE, info);
        });

        autoUpdater.on('update-not-available', (info) => {
            this.isChecking = false;
            this.emit(UPDATE_CHANNELS.ON_NOT_AVAILABLE, info);
        });

        autoUpdater.on('error', (err) => {
            this.isChecking = false;
            this.emit(UPDATE_CHANNELS.ON_ERROR, err.message);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.emit(UPDATE_CHANNELS.ON_PROGRESS, progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            this.emit(UPDATE_CHANNELS.ON_DOWNLOADED, info);
        });
    }

    public async checkForUpdates() {
        if (this.isChecking) return;

        try {
            return await autoUpdater.checkForUpdates();
        } catch (error) {
            console.error('Error checking for updates:', error);
            this.emit(UPDATE_CHANNELS.ON_ERROR, error instanceof Error ? error.message : String(error));
        }
    }

    public quitAndInstall() {
        autoUpdater.quitAndInstall();
    }
}
