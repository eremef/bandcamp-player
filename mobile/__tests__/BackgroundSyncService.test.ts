import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { mobileScraperService } from '../services/MobileScraperService';
import { mobileAuthService } from '../services/MobileAuthService';
import { registerBackgroundSync, unregisterBackgroundSync } from '../services/BackgroundSyncService';

jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
    getRegisteredTasksAsync: jest.fn(),
    unregisterTaskAsync: jest.fn(),
}));

jest.mock('expo-background-task', () => ({
    registerTaskAsync: jest.fn(),
    unregisterTaskAsync: jest.fn(),
    BackgroundTaskResult: {
        Success: 'Success',
        Failed: 'Failed',
    },
}));

jest.mock('../services/MobileScraperService', () => ({
    mobileScraperService: {
        fetchCollection: jest.fn(),
    },
}));

jest.mock('../services/MobileAuthService', () => ({
    mobileAuthService: {
        checkSession: jest.fn(),
    },
}));

describe('BackgroundSyncService', () => {
    const BACKGROUND_COLLECTION_SYNC = 'BACKGROUND_COLLECTION_SYNC';
    let taskCallback: () => Promise<string>;

    beforeAll(() => {
        taskCallback = (TaskManager.defineTask as jest.Mock).mock.calls[0][1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (TaskManager.getRegisteredTasksAsync as jest.Mock).mockResolvedValue([]);
    });

    it('should register background sync successfully', async () => {
        (BackgroundTask.registerTaskAsync as jest.Mock).mockResolvedValue(undefined);

        await registerBackgroundSync();

        expect(TaskManager.getRegisteredTasksAsync).toHaveBeenCalled();
        expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_COLLECTION_SYNC, {
            minimumInterval: 24 * 60,
        });
    });

    it('should not register if already registered', async () => {
        (TaskManager.getRegisteredTasksAsync as jest.Mock).mockResolvedValue([{
            taskName: BACKGROUND_COLLECTION_SYNC,
            taskType: 'backgroundTask',
        }]);

        await registerBackgroundSync();

        expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('should unregister background sync successfully', async () => {
        (TaskManager.getRegisteredTasksAsync as jest.Mock).mockResolvedValue([{
            taskName: BACKGROUND_COLLECTION_SYNC,
            taskType: 'backgroundTask',
        }]);
        (BackgroundTask.unregisterTaskAsync as jest.Mock).mockResolvedValue(undefined);

        await unregisterBackgroundSync();

        expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_COLLECTION_SYNC);
    });

    it('task callback should return NoData if user not authenticated', async () => {
        (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: false });

        const result = await taskCallback();

        expect(result).toBe('Success');
        expect(mobileScraperService.fetchCollection).not.toHaveBeenCalled();
    });

    it('task callback should return NewData and fetch collection if user authenticated', async () => {
        (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({
            isAuthenticated: true,
            user: { id: 'user123' },
        });
        (mobileScraperService.fetchCollection as jest.Mock).mockResolvedValue(undefined);

        const result = await taskCallback();

        expect(mobileScraperService.fetchCollection).toHaveBeenCalledWith(true);
        expect(result).toBe('Success');
    });

    it('task callback should return Failed if an error occurs', async () => {
        (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({
            isAuthenticated: true,
            user: { id: 'user123' },
        });
        (mobileScraperService.fetchCollection as jest.Mock).mockRejectedValue(new Error('Network error'));

        const result = await taskCallback();

        expect(result).toBe('Failed');
    });
});
