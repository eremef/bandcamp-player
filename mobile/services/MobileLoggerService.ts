import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024;
const TRIMMED_LOG_SIZE_BYTES = 1 * 1024 * 1024;

export class MobileLoggerService {
    private isInitialized = false;
    private logDirectory = (FileSystem.documentDirectory || '') + 'logs/';
    private logFilePath = (FileSystem.documentDirectory || '') + 'logs/app.log';
    private logBuffer: string[] = [];
    private flushTimeout: ReturnType<typeof setTimeout> | null = null;
    private flushPromise: Promise<void> | null = null;

    public originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };

    public async init(): Promise<void> {
        if (this.isInitialized) return;

        try {
            if (FileSystem.documentDirectory) {
                const dirInfo = await FileSystem.getInfoAsync(this.logDirectory);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(this.logDirectory, { intermediates: true });
                }
            }

            this.overrideConsole();
            this.isInitialized = true;
            console.log('[MobileLoggerService] Initialized log capture at:', this.logFilePath);
        } catch (err) {
            this.originalConsole.error('[MobileLoggerService] Failed to initialize:', err);
        }
    }

    private formatArgs(args: any[]): string {
        return args
            .map((arg) => {
                if (typeof arg === 'string') return arg;
                if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            })
            .join(' ');
    }

    private overrideConsole(): void {
        const levels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = ['log', 'info', 'warn', 'error', 'debug'];

        for (const level of levels) {
            console[level] = (...args: any[]) => {
                this.originalConsole[level](...args);
                this.recordLog(level, args);
            };
        }
    }

    public recordLog(level: string, args: any[]): void {
        try {
            const timestamp = new Date().toISOString();
            const message = this.formatArgs(args);
            const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

            this.logBuffer.push(line);

            if (level === 'error' || level === 'warn' || this.logBuffer.length >= 25) {
                this.scheduleFlush(0);
            } else if (!this.flushTimeout) {
                this.scheduleFlush(1000);
            }
        } catch {
            // Avoid logging errors inside log recorder
        }
    }

    private scheduleFlush(delay: number): void {
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }

        if (delay === 0) {
            this.flush().catch(() => {});
        } else {
            this.flushTimeout = setTimeout(() => {
                this.flushTimeout = null;
                this.flush().catch(() => {});
            }, delay);
        }
    }

    public async flush(): Promise<void> {
        if (this.flushPromise) {
            await this.flushPromise;
        }

        if (this.logBuffer.length === 0 || !FileSystem.documentDirectory) return;

        this.flushPromise = (async () => {
            const toWrite = this.logBuffer.join('');
            this.logBuffer = [];

            try {
                const fileInfo = await FileSystem.getInfoAsync(this.logFilePath);
                if (fileInfo.exists) {
                    if ((fileInfo.size || 0) > MAX_LOG_SIZE_BYTES) {
                        const currentContent = await FileSystem.readAsStringAsync(this.logFilePath);
                        const truncated = currentContent.slice(-TRIMMED_LOG_SIZE_BYTES);
                        const cleanStart = truncated.indexOf('\n');
                        const pruned = cleanStart !== -1 ? truncated.slice(cleanStart + 1) : truncated;
                        await FileSystem.writeAsStringAsync(this.logFilePath, pruned + toWrite);
                    } else {
                        const currentContent = await FileSystem.readAsStringAsync(this.logFilePath);
                        await FileSystem.writeAsStringAsync(this.logFilePath, currentContent + toWrite);
                    }
                } else {
                    await FileSystem.writeAsStringAsync(this.logFilePath, toWrite);
                }
            } catch (err) {
                this.originalConsole.error('[MobileLoggerService] Flush failed:', err);
            } finally {
                this.flushPromise = null;
            }
        })();

        await this.flushPromise;
    }

    public async getLogs(): Promise<string> {
        await this.flush();

        try {
            if (!FileSystem.documentDirectory) return this.logBuffer.join('');

            const fileInfo = await FileSystem.getInfoAsync(this.logFilePath);
            if (!fileInfo.exists) {
                return '';
            }

            const content = await FileSystem.readAsStringAsync(this.logFilePath);
            return content;
        } catch (err) {
            this.originalConsole.error('[MobileLoggerService] Failed to read logs:', err);
            return '';
        }
    }

    public async clearLogs(): Promise<void> {
        this.logBuffer = [];
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }

        try {
            if (FileSystem.documentDirectory) {
                const fileInfo = await FileSystem.getInfoAsync(this.logFilePath);
                if (fileInfo.exists) {
                    await FileSystem.deleteAsync(this.logFilePath, { idempotent: true });
                }
            }
        } catch (err) {
            this.originalConsole.error('[MobileLoggerService] Failed to clear logs:', err);
        }
    }

    public getLogFilePath(): string {
        return this.logFilePath;
    }

    public async shareLogs(): Promise<boolean> {
        await this.flush();

        try {
            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) {
                return false;
            }

            const fileInfo = await FileSystem.getInfoAsync(this.logFilePath);
            if (!fileInfo.exists) {
                await FileSystem.writeAsStringAsync(this.logFilePath, '[INFO] Log file initialized.\n');
            }

            await Sharing.shareAsync(this.logFilePath, {
                mimeType: 'text/plain',
                dialogTitle: 'Share Beta Player Logs',
                UTI: 'public.plain-text',
            });

            return true;
        } catch (err) {
            this.originalConsole.error('[MobileLoggerService] Failed to share logs:', err);
            return false;
        }
    }

    public async copyLogs(): Promise<boolean> {
        try {
            const logs = await this.getLogs();
            if (!logs) return false;

            await Clipboard.setStringAsync(logs);
            return true;
        } catch (err) {
            this.originalConsole.error('[MobileLoggerService] Failed to copy logs:', err);
            return false;
        }
    }
}

export const mobileLoggerService = new MobileLoggerService();
