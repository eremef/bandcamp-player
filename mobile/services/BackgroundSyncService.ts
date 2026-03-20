import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobileScraperService } from './MobileScraperService';
import { mobileAuthService } from './MobileAuthService';
import { mobileCacheService } from './MobileCacheService';
import { Track } from '@shared/types';

const BACKGROUND_COLLECTION_SYNC = 'BACKGROUND_COLLECTION_SYNC';
const BACKGROUND_DOWNLOAD = 'BACKGROUND_DOWNLOAD';
const PENDING_DOWNLOADS_KEY = 'pending_downloads';

interface PendingDownload {
    trackId: string;
    track: Track;
    addedAt: string;
}

async function getPendingDownloads(): Promise<PendingDownload[]> {
    try {
        const json = await AsyncStorage.getItem(PENDING_DOWNLOADS_KEY);
        return json ? JSON.parse(json) : [];
    } catch {
        return [];
    }
}

async function savePendingDownloads(downloads: PendingDownload[]): Promise<void> {
    await AsyncStorage.setItem(PENDING_DOWNLOADS_KEY, JSON.stringify(downloads));
}

async function removePendingDownload(trackId: string): Promise<void> {
    const downloads = await getPendingDownloads();
    const filtered = downloads.filter(d => d.trackId !== trackId);
    await savePendingDownloads(filtered);
}

export async function addPendingDownload(track: Track): Promise<void> {
    const downloads = await getPendingDownloads();
    if (!downloads.find(d => d.trackId === track.id)) {
        downloads.push({ trackId: track.id, track, addedAt: new Date().toISOString() });
        await savePendingDownloads(downloads);
    }
}

// Define the background collection sync task
TaskManager.defineTask(BACKGROUND_COLLECTION_SYNC, async () => {
    const now = new Date().toISOString();
    console.log(`[BackgroundSync] Task started at ${now}`);

    try {
        const authState = await mobileAuthService.checkSession();
        if (!authState.isAuthenticated || !authState.user) {
            console.log('[BackgroundSync] User not authenticated, skipping sync');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const userId = authState.user.id;
        
        // Check if app is in offline mode
        const { useStore } = require('../store');
        const isOffline = useStore.getState().isOfflineMode || useStore.getState().manualOfflineOverride;
        if (isOffline) {
            console.log('[BackgroundSync] App is in offline mode, skipping sync');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        console.log(`[BackgroundSync] Syncing collection for ${userId}...`);
        // Force refresh to ensure we get new items
        await mobileScraperService.fetchCollection(true);

        console.log('[BackgroundSync] Sync complete');
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        console.error('[BackgroundSync] Task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

// Define the background download task
TaskManager.defineTask(BACKGROUND_DOWNLOAD, async () => {
    const now = new Date().toISOString();
    console.log(`[BackgroundDownload] Task started at ${now}`);

    try {
        const { useStore } = require('../store');
        const state = useStore.getState();
        
        // Only download in standalone mode
        if (state.mode !== 'standalone') {
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }
        
        // Check WiFi-only setting
        if (state.wifiOnlyDownloads) {
            const Network = require('expo-network').Network;
            const networkState = await Network.getNetworkStateAsync();
            if (networkState.type !== Network.NetworkStateType.WIFI) {
                console.log('[BackgroundDownload] WiFi-only enabled, skipping on mobile data');
                return BackgroundFetch.BackgroundFetchResult.NoData;
            }
        }
        
        // Process pending downloads
        const pending = await getPendingDownloads();
        if (pending.length === 0) {
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }
        
        console.log(`[BackgroundDownload] Processing ${pending.length} pending downloads`);
        
        for (const item of pending) {
            try {
                await mobileCacheService.downloadTrack(item.track);
                await removePendingDownload(item.trackId);
                const newCachedIds = new Set(state.cachedTrackIds);
                newCachedIds.add(item.trackId);
                useStore.setState({ cachedTrackIds: newCachedIds });
            } catch (e) {
                console.warn(`[BackgroundDownload] Failed to download ${item.trackId}:`, e);
            }
        }
        
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        console.error('[BackgroundDownload] Task failed:', error);
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
 * Register the background download task
 */
export async function registerBackgroundDownload() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD);
        if (isRegistered) {
            console.log('[BackgroundDownload] Task already registered');
            return;
        }

        await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD, {
            minimumInterval: 15 * 60, // 15 minutes
            stopOnTerminate: false,
            startOnBoot: true,
        });

        console.log('[BackgroundDownload] Task registered successfully');
    } catch (err) {
        console.error('[BackgroundDownload] Registration failed:', err);
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
