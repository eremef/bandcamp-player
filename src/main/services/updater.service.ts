import { autoUpdater } from 'electron-updater';
import { EventEmitter } from 'events';
import { UPDATE_CHANNELS } from '../../shared/ipc-channels';

export class UpdaterService extends EventEmitter {
    private isChecking = false;
    private notifiedOnce = false;
    private lastNotifiedVersion = '';
    private isManualCheck = false;
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor(private isDev: boolean) {
        super();
        this.setupListeners();

        // Disable auto-download - we want to notify first (optional, but better UX)
        autoUpdater.autoDownload = true;

        // Enable logging in production too to help with debugging
        autoUpdater.logger = console;

        if (this.isDev) {
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
            const message = err.message || String(err);

            // Fallback: silence 404/NotFound errors during background checks.
            // The pre-check in checkForUpdates() should prevent this, but guard here in case
            // latest.yml is missing from a Release (e.g., partial upload or deleted asset).
            if (!this.isManualCheck && (message.includes('404') || message.includes('NotFound') || message.includes('not found'))) {
                console.log('[Updater] Background check: Update metadata not found on GitHub (404). Silencing error.');
                this.emit(UPDATE_CHANNELS.ON_NOT_AVAILABLE, { version: 'unknown' });
                return;
            }

            // Map technical errors to user-friendly messages for manual checks
            const friendlyMessage = this.getFriendlyErrorMessage(message);
            this.emit(UPDATE_CHANNELS.ON_ERROR, friendlyMessage);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.emit(UPDATE_CHANNELS.ON_PROGRESS, progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            this.emit(UPDATE_CHANNELS.ON_DOWNLOADED, info);
        });
    }

    private async hasPublishedRelease(): Promise<boolean> {
        try {
            const response = await fetch(
                'https://api.github.com/repos/eremef/bandcamp-player/releases?per_page=1',
                { headers: { Accept: 'application/vnd.github+json' } }
            );
            if (!response.ok) return false;
            const releases = await response.json() as unknown[];
            return releases.length > 0;
        } catch {
            // Network error — fall through to electron-updater, which handles offline gracefully
            return true;
        }
    }

    private getFriendlyErrorMessage(message: string): string {
        if (message.includes('404') || message.includes('NotFound') || message.includes('not found')) {
            return 'The update information was not found on GitHub. This can happen if a release is ongoing. Please try again in an hour.';
        }
        if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('internet')) {
            return 'Could not connect to the update server. Please check your internet connection.';
        }
        if (message.includes('rate limit')) {
            return 'GitHub is currently rate-limiting requests. Please try again in a few minutes.';
        }
        return `Failed to check for updates: ${message}`;
    }

    public async checkForUpdates(isManual = false) {
        if (this.isChecking) return;

        this.isManualCheck = isManual;

        // Guard: only proceed if a published GitHub Release exists.
        // Without this, electron-updater would 404 when only a git tag exists (no Release yet).
        const releaseExists = await this.hasPublishedRelease();
        if (!releaseExists) {
            console.log('[Updater] No published GitHub Release found. Skipping update check.');
            this.emit(UPDATE_CHANNELS.ON_NOT_AVAILABLE, { version: 'unknown' });
            return;
        }

        try {
            return await autoUpdater.checkForUpdates();
        } catch (error) {
            console.error('Error checking for updates:', error);
            const message = error instanceof Error ? error.message : String(error);

            if (!this.isManualCheck && (message.includes('404') || message.includes('NotFound') || message.includes('not found'))) {
                return;
            }

            this.emit(UPDATE_CHANNELS.ON_ERROR, this.getFriendlyErrorMessage(message));
        }
    }

    public quitAndInstall() {
        autoUpdater.quitAndInstall();
    }
}
