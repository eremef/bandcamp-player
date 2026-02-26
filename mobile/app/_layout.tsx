import { Stack } from 'expo-router';
import { useStore } from '../store';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { setupPlayer } from '../services/player';
import { useVolumeButtons } from '../services/useVolumeButtons';
import { registerBackgroundSync } from '../services/BackgroundSyncService';
import { SilentRefreshHandler } from '../components/SilentRefreshHandler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
    const connectionStatus = useStore(state => state.connectionStatus);
    const mode = useStore(state => state.mode);
    const auth = useStore(state => state.auth);
    const saveQueue = useStore(state => state.saveQueue);

    const router = useRouter();
    const segments = useSegments() as string[];
    const appState = useRef(AppState.currentState);

    const lastNavigatedPath = useRef<string | null>(null);

    // Listen for hardware volume button presses
    useVolumeButtons();

    useEffect(() => {
        setupPlayer();
        registerBackgroundSync();
    }, []);

    useEffect(() => {
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
    }, [saveQueue, router, segments]);

    useEffect(() => {
        const inTabsGroup = segments[0] === '(tabs)';
        const isLoginScreen = segments.length === 0 || segments[0] === 'index';
        const isAuthScreen = segments[0] === 'bandcamp_login';

        const canAccessApp =
            ((mode === 'remote' || mode === 'standalone') && connectionStatus === 'connected') &&
            (mode === 'remote' || (mode === 'standalone' && auth.isAuthenticated));

        let targetPath: string | null = null;

        if (canAccessApp && (isLoginScreen || isAuthScreen)) {
            targetPath = '/(tabs)/player';
        } else if (!canAccessApp && inTabsGroup) {
            targetPath = '/';
        }

        if (targetPath && targetPath !== lastNavigatedPath.current) {
            lastNavigatedPath.current = targetPath;
            router.replace(targetPath as any);
        }
    }, [connectionStatus, segments, router, mode, auth, auth.isAuthenticated]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="bandcamp_login" options={{ presentation: 'modal' }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="album_detail" />
                <Stack.Screen name="about" options={{ presentation: 'modal' }} />
                <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
                <Stack.Screen name="license" />
            </Stack>
            <SilentRefreshHandler />
        </GestureHandlerRootView>
    );
}
