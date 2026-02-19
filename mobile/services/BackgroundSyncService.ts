import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { mobileScraperService } from './MobileScraperService';
import { mobileAuthService } from './MobileAuthService';

const BACKGROUND_COLLECTION_SYNC = 'BACKGROUND_COLLECTION_SYNC';

// Define the background task
TaskManager.defineTask(BACKGROUND_COLLECTION_SYNC, async () => {
    const now = new Date().toISOString();
    console.log(`[BackgroundSync] Task started at ${now}`);

    try {
        const authState = await mobileAuthService.checkSession();
        if (!authState.isAuthenticated || !authState.user) {
            console.log('[BackgroundSync] User not authenticated, skipping sync');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        console.log(`[BackgroundSync] Syncing collection for ${authState.user.id}...`);
        // Force refresh to ensure we get new items
        await mobileScraperService.fetchCollection(true);

        console.log('[BackgroundSync] Sync complete');
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        console.error('[BackgroundSync] Task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

/**
 * Register the background sync task
 */
export async function registerBackgroundSync() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_COLLECTION_SYNC);
        if (isRegistered) {
            console.log('[BackgroundSync] Task already registered');
            return;
        }

        await BackgroundFetch.registerTaskAsync(BACKGROUND_COLLECTION_SYNC, {
            minimumInterval: 60 * 60 * 24, // 24 hours (in seconds)
            stopOnTerminate: false, // Continue after app is closed
            startOnBoot: true, // Start after device reboot
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
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_COLLECTION_SYNC);
        console.log('[BackgroundSync] Task unregistered');
    } catch (err) {
        console.error('[BackgroundSync] Unregistration failed:', err);
    }
}
