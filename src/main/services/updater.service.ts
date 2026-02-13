import { autoUpdater } from 'electron-updater';
import { EventEmitter } from 'events';
import { UPDATE_CHANNELS } from '../../shared/ipc-channels';

export class UpdaterService extends EventEmitter {
    private isChecking = false;

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
    }

    private setupListeners() {
        autoUpdater.on('checking-for-update', () => {
            this.isChecking = true;
            this.emit(UPDATE_CHANNELS.ON_CHECKING);
        });

        autoUpdater.on('update-available', (info) => {
            this.isChecking = false;
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
