import { Stack } from 'expo-router';
import { useStore } from '../store';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from '../services/TrackPlayerService';
import { setupPlayer } from '../services/player';
import { useVolumeButtons } from '../services/useVolumeButtons';

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
    }, []);

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
    }, [connectionStatus, segments, router]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="album_detail" />
            <Stack.Screen name="about" options={{ presentation: 'modal' }} />
            <Stack.Screen name="license" />
        </Stack>
    );
}
