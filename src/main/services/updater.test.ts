import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { autoUpdater } from 'electron-updater';

// Mock channels BEFORE importing UpdaterService
vi.mock('../../shared/ipc-channels', () => ({
    UPDATE_CHANNELS: {
        CHECK: 'update:check',
        INSTALL: 'update:install',
        ON_CHECKING: 'update:on-checking',
        ON_AVAILABLE: 'update:on-available',
        ON_NOT_AVAILABLE: 'update:on-not-available',
        ON_ERROR: 'update:on-error',
        ON_PROGRESS: 'update:on-progress',
        ON_DOWNLOADED: 'update:on-downloaded',
    }
}));

// Mock electron-updater
vi.mock('electron-updater', () => {
    const handlers: Record<string, ((...args: any[]) => void)[]> = {};
    const mockAutoUpdater = {
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(cb);
            return mockAutoUpdater;
        }),
        checkForUpdates: vi.fn().mockResolvedValue({}),
        quitAndInstall: vi.fn(),
        autoDownload: false,
        logger: null,
        allowPrerelease: false,
        // Helper to trigger events
        emit: (event: string, ...args: any[]) => {
            if (handlers[event]) {
                handlers[event].forEach(cb => cb(...args));
            }
        }
    };
    return {
        autoUpdater: mockAutoUpdater
    };
});

// Import service AFTER mocks
import { UpdaterService } from './updater.service';
import { UPDATE_CHANNELS } from '../../shared/ipc-channels';

describe('UpdaterService', () => {
    let updaterService: UpdaterService;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.spyOn(global, 'setTimeout');
        vi.spyOn(global, 'setInterval');
        updaterService = new UpdaterService(false);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Constructor & Timers', () => {
        it('should schedule an initial check after 15 seconds', () => {
            expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 15000);
        });

        it('should setup a periodic check every 24 hours', () => {
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000);
        });

        it('should trigger check after 15 seconds', () => {
            const checkSpy = vi.spyOn(updaterService, 'checkForUpdates');
            vi.advanceTimersByTime(15000);
            expect(checkSpy).toHaveBeenCalled();
        });

        it('should enable logger in all environments', () => {
            expect(autoUpdater.logger).toBe(console);
        });
    });

    describe('checkForUpdates', () => {
        it('should handle manual flag correctly', async () => {
            await updaterService.checkForUpdates(true);
            // @ts-expect-error private property
            expect(updaterService.isManualCheck).toBe(true);

            await updaterService.checkForUpdates(false);
            // @ts-expect-error private property
            expect(updaterService.isManualCheck).toBe(false);
        });

        it('should not check if already checking', async () => {
            // @ts-expect-error private property    
            updaterService.isChecking = true;
            await updaterService.checkForUpdates();
            expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
        });

        it('should set isChecking to true during check', async () => {
            // Use checking-for-update event emission to verify state
            // or just check the internal flag if possible
            const checkPromise = updaterService.checkForUpdates();

            autoUpdater.emit('checking-for-update');
            // @ts-expect-error private property
            expect(updaterService.isChecking).toBe(true);
            await checkPromise;
        });
    });

    describe('Error Handling Logic', () => {
        it('should SILENTLY handle 404/NotFound during background checks', async () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');

            await updaterService.checkForUpdates(false);

            autoUpdater.emit('error', new Error('HttpError: 404 Not Found'));

            expect(emitSpy).not.toHaveBeenCalledWith(UPDATE_CHANNELS.ON_ERROR, expect.anything());
            expect(emitSpy).toHaveBeenCalledWith(UPDATE_CHANNELS.ON_NOT_AVAILABLE, expect.anything());
        });

        it('should SHOW friendly error for 404 during manual checks', async () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');

            await updaterService.checkForUpdates(true);

            autoUpdater.emit('error', new Error('HttpError: 404 Not Found'));

            expect(emitSpy).toHaveBeenCalledWith(
                UPDATE_CHANNELS.ON_ERROR,
                expect.stringContaining('information was not found on GitHub')
            );
        });

        it('should map ENOTFOUND to internet connection error', async () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');
            await updaterService.checkForUpdates(true);

            autoUpdater.emit('error', new Error('ENOTFOUND github.com'));

            expect(emitSpy).toHaveBeenCalledWith(
                UPDATE_CHANNELS.ON_ERROR,
                expect.stringContaining('check your internet connection')
            );
        });

        it('should map rate limit to readable message', async () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');
            await updaterService.checkForUpdates(true);

            autoUpdater.emit('error', new Error('GitHub API rate limit exceeded'));

            expect(emitSpy).toHaveBeenCalledWith(
                UPDATE_CHANNELS.ON_ERROR,
                expect.stringContaining('rate-limiting')
            );
        });
    });

    describe('Update Available & Debouncing', () => {
        it('should only notify once for the same version', () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');
            const info = { files: [], path: 'path', sha512: 'sha512', version: '1.7.6', releaseDate: '2022-01-01' };

            // First notification
            autoUpdater.emit('update-available', info);
            expect(emitSpy).toHaveBeenCalledWith(UPDATE_CHANNELS.ON_AVAILABLE, info);

            emitSpy.mockClear();

            // Second notification for same version
            autoUpdater.emit('update-available', info);
            expect(emitSpy).not.toHaveBeenCalled();

            // Notification for NEW version
            const nextInfo = { files: [], path: 'path', sha512: 'sha512', version: '1.7.7', releaseDate: '2023-01-01' };;
            autoUpdater.emit('update-available', nextInfo);
            expect(emitSpy).toHaveBeenCalledWith(UPDATE_CHANNELS.ON_AVAILABLE, nextInfo);
        });
    });

    describe('Other events', () => {
        it('should forward download progress', () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');
            const progress = { percent: 10, total: 100, bytesPerSecond: 100, transferred: 10000000, delta: 10000000 };

            autoUpdater.emit('download-progress', progress);
            expect(emitSpy).toHaveBeenCalledWith(UPDATE_CHANNELS.ON_PROGRESS, progress);
        });

        it('should forward download completion', () => {
            const emitSpy = vi.spyOn(updaterService, 'emit');
            const info = { version: '1.0.0', path: 'path', downloadedFile: 'path', files: [], sha512: 'sha512', releaseDate: '2022-01-01' };

            autoUpdater.emit('update-downloaded', info);
            expect(emitSpy).toHaveBeenCalledWith(UPDATE_CHANNELS.ON_DOWNLOADED, info);
        });
    });

    describe('quitAndInstall', () => {
        it('should call autoUpdater.quitAndInstall', () => {
            updaterService.quitAndInstall();
            expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
        });
    });
});
