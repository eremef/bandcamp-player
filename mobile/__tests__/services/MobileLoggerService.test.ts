import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { MobileLoggerService } from '../../services/MobileLoggerService';

describe('MobileLoggerService', () => {
    let logger: MobileLoggerService;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = new MobileLoggerService();
    });

    it('initializes log directory and overrides console', async () => {
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });

        await logger.init();

        expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
            expect.stringContaining('logs/'),
            { intermediates: true }
        );
    });

    it('captures logs and formats errors and objects correctly', async () => {
        logger.recordLog('log', ['Regular log test', { foo: 'bar' }]);
        logger.recordLog('error', [new Error('Test error')]);

        await logger.flush();

        expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
        const calls = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls;
        const allWritten = calls.map(c => c[1]).join('\n');
        expect(allWritten).toContain('[LOG]');
        expect(allWritten).toContain('Regular log test {"foo":"bar"}');
        expect(allWritten).toContain('[ERROR]');
        expect(allWritten).toContain('Test error');
    });

    it('reads logs via getLogs', async () => {
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
        (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('[2026-08-31T12:00:00.000Z] [INFO] Sample log\n');

        const logs = await logger.getLogs();

        expect(logs).toContain('[INFO] Sample log');
    });

    it('clears logs and deletes file', async () => {
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

        await logger.clearLogs();

        expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
            expect.stringContaining('logs/app.log'),
            { idempotent: true }
        );
    });

    it('shares logs via expo-sharing', async () => {
        (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

        const result = await logger.shareLogs();

        expect(result).toBe(true);
        expect(Sharing.shareAsync).toHaveBeenCalledWith(
            expect.stringContaining('logs/app.log'),
            expect.objectContaining({ mimeType: 'text/plain' })
        );
    });

    it('copies logs to clipboard', async () => {
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
        (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('Sample log output');

        const result = await logger.copyLogs();

        expect(result).toBe(true);
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Sample log output');
    });

    it('trims logs when file exceeds maximum size', async () => {
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 3 * 1024 * 1024 });
        (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('line1\nline2\nline3\nline4\n');

        logger.recordLog('log', ['New line']);
        await logger.flush();

        expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    });
});
