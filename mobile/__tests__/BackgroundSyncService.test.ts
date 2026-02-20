import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { mobileScraperService } from '../services/MobileScraperService';
import { mobileAuthService } from '../services/MobileAuthService';
import { registerBackgroundSync, unregisterBackgroundSync } from '../services/BackgroundSyncService';

jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
    isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-fetch', () => ({
    registerTaskAsync: jest.fn(),
    unregisterTaskAsync: jest.fn(),
    BackgroundFetchResult: {
        NoData: 'NoData',
        NewData: 'NewData',
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
    });

    it('should register background sync successfully', async () => {
        (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
        (BackgroundFetch.registerTaskAsync as jest.Mock).mockResolvedValue(true);

        await registerBackgroundSync();

        expect(TaskManager.isTaskRegisteredAsync).toHaveBeenCalledWith(BACKGROUND_COLLECTION_SYNC);
        expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_COLLECTION_SYNC, {
            minimumInterval: 60 * 60 * 24,
            stopOnTerminate: false,
            startOnBoot: true,
        });
    });

    it('should not register if already registered', async () => {
        (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);

        await registerBackgroundSync();

        expect(BackgroundFetch.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('should unregister background sync successfully', async () => {
        (BackgroundFetch.unregisterTaskAsync as jest.Mock).mockResolvedValue(true);

        await unregisterBackgroundSync();

        expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_COLLECTION_SYNC);
    });

    it('task callback should return NoData if user not authenticated', async () => {
        (mobileAuthService.checkSession as jest.Mock).mockResolvedValue({ isAuthenticated: false });

        const result = await taskCallback();

        expect(result).toBe('NoData');
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
        expect(result).toBe('NewData');
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
