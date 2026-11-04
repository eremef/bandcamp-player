import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { mobileScraperService } from './MobileScraperService';
import { mobileAuthService } from './MobileAuthService';

const BACKGROUND_COLLECTION_SYNC = 'BACKGROUND_COLLECTION_SYNC';
const LEGACY_BACKGROUND_FETCH_TASK_TYPE = 'backgroundFetch';
const BACKGROUND_COLLECTION_SYNC_INTERVAL_MINUTES = 24 * 60;

// Define the background task
TaskManager.defineTask(BACKGROUND_COLLECTION_SYNC, async () => {
    const now = new Date().toISOString();
    console.log(`[BackgroundSync] Task started at ${now}`);

    try {
        const authState = await mobileAuthService.checkSession();
        if (!authState.isAuthenticated || !authState.user) {
            console.log('[BackgroundSync] User not authenticated, skipping sync');
            return BackgroundTask.BackgroundTaskResult.Success;
        }

        console.log(`[BackgroundSync] Syncing collection for ${authState.user.id}...`);
        // Force refresh to ensure we get new items
        await mobileScraperService.fetchCollection(true);

        console.log('[BackgroundSync] Sync complete');
        return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
        console.error('[BackgroundSync] Task failed:', error);
        return BackgroundTask.BackgroundTaskResult.Failed;
    }
});

/**
 * Register the background sync task
 */
export async function registerBackgroundSync() {
    try {
        const registeredTasks = await TaskManager.getRegisteredTasksAsync();
        const registeredTask = registeredTasks.find(task => task.taskName === BACKGROUND_COLLECTION_SYNC);

        if (registeredTask?.taskType === LEGACY_BACKGROUND_FETCH_TASK_TYPE) {
            await TaskManager.unregisterTaskAsync(BACKGROUND_COLLECTION_SYNC);
            console.log('[BackgroundSync] Removed legacy background fetch registration');
        } else if (registeredTask) {
            console.log('[BackgroundSync] Task already registered');
            return;
        }

        await BackgroundTask.registerTaskAsync(BACKGROUND_COLLECTION_SYNC, {
            minimumInterval: BACKGROUND_COLLECTION_SYNC_INTERVAL_MINUTES,
        });

        console.log('[BackgroundSync] Task registered successfully');
    } catch (err) {
        console.error('[BackgroundSync] Registration failed:', err);
    }
}

/**
 * Unregister the background sync task
 */
export async function unregisterBackgroundSync() {
    try {
        const registeredTask = (await TaskManager.getRegisteredTasksAsync())
            .find(task => task.taskName === BACKGROUND_COLLECTION_SYNC);
        if (!registeredTask) return;

        if (registeredTask.taskType === LEGACY_BACKGROUND_FETCH_TASK_TYPE) {
            await TaskManager.unregisterTaskAsync(BACKGROUND_COLLECTION_SYNC);
        } else {
            await BackgroundTask.unregisterTaskAsync(BACKGROUND_COLLECTION_SYNC);
        }
        console.log('[BackgroundSync] Task unregistered');
    } catch (err) {
        console.error('[BackgroundSync] Unregistration failed:', err);
    }
}
