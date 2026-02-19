import { Stack } from 'expo-router';
import { useStore } from '../store';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from '../services/TrackPlayerService';
import { setupPlayer } from '../services/player';
import { useVolumeButtons } from '../services/useVolumeButtons';

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

        // Save queue when app goes to background
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/active/) &&
                nextAppState.match(/inactive|background/)
            ) {
                console.log('[RootLayout] App moved to background, saving queue...');
                saveQueue();
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
            console.log(`[RootLayout] Navigating to: ${targetPath} (from ${segments.join('/') || 'root'})`);
            lastNavigatedPath.current = targetPath;
            router.replace(targetPath as any);
        }
    }, [connectionStatus, segments, router, mode, auth, auth.isAuthenticated]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="bandcamp_login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="album_detail" />
            <Stack.Screen name="about" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="license" />
        </Stack>
    );
}
