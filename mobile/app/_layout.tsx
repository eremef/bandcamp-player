import { Stack } from 'expo-router';
import { useStore } from '../store';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from '../services/TrackPlayerService';
import { setupPlayer } from '../services/player';
import { useVolumeButtons } from '../services/useVolumeButtons';
import { registerBackgroundSync } from '../services/BackgroundSyncService';

// Register the playback service
TrackPlayer.registerPlaybackService(() => PlaybackService);


export default function RootLayout() {
    const connectionStatus = useStore((state) => state.connectionStatus);
    const router = useRouter();
    const segments = useSegments() as string[];

    // Listen for hardware volume button presses
    useVolumeButtons();

    useEffect(() => {
        setupPlayer();
        registerBackgroundSync();

        // Save queue when app goes to background
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/active/) &&
                nextAppState.match(/inactive|background/)
            ) {
                console.log('[RootLayout] App moved to background, saving queue...');
                saveQueue();
            } else if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // App coming to foreground - check if we should navigate to player
                const state = useStore.getState();
                const canAccess =
                    ((state.mode === 'remote' || state.mode === 'standalone') && state.connectionStatus === 'connected') &&
                    (state.mode === 'remote' || (state.mode === 'standalone' && state.auth.isAuthenticated));

                const isRoot = segments.length === 0 || segments[0] === 'index';
                if (canAccess && isRoot && state.currentTrack) {
                    console.log('[RootLayout] App foregrounded with active state, navigating to player');
                    router.replace('/(tabs)/player');
                }
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [saveQueue]);

    useEffect(() => {
        const inTabsGroup = segments[0] === '(tabs)';
        const isLoginScreen = segments.length === 0 || segments[0] === 'index';

        // Only auto-redirect to player if we are connected AND currently on the login screen
        if (connectionStatus === 'connected' && isLoginScreen) {
            router.replace('/(tabs)/player');
        } else if (connectionStatus !== 'connected' && inTabsGroup) {
            // If disconnected, force back to connect screen
            router.replace('/');
        }

        if (targetPath && targetPath !== lastNavigatedPath.current) {
            lastNavigatedPath.current = targetPath;
            router.replace(targetPath as any);
        }
    }, [connectionStatus, segments, router, mode, auth, auth.isAuthenticated]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="album_detail" />
            <Stack.Screen name="about" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="license" />
        </Stack>
    );
}
