import { Stack } from 'expo-router';
import { useStore } from '../store';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';


export default function RootLayout() {
    const connectionStatus = useStore((state) => state.connectionStatus);
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        // If we're not inside the (tabs) group and we are connected, go to player
        const inTabsGroup = segments[0] === '(tabs)';

        // Simple auth guard
        if (connectionStatus === 'connected' && !inTabsGroup) {
            router.replace('/(tabs)/player');
        } else if (connectionStatus !== 'connected' && inTabsGroup) {
            // If disconnected, force back to connect screen
            router.replace('/');
        }
    }, [connectionStatus, segments]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
        </Stack>
    );
}
