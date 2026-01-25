import { Tabs } from 'expo-router';
import { Disc3, Library, ListMusic } from 'lucide-react-native';
import { useStore } from '../../store';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function TabLayout() {
    const connectionStatus = useStore((state) => state.connectionStatus);
    const insets = useSafeAreaInsets();

    if (connectionStatus !== 'connected') {
        return <Redirect href="/" />;
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#121212',
                    borderTopColor: '#333',
                    height: 60 + (Platform.OS === 'android' ? insets.bottom : 0),
                    paddingBottom: 8 + (Platform.OS === 'android' ? insets.bottom : 0),
                    paddingTop: 8,
                },
                tabBarActiveTintColor: '#1da1f2',
                tabBarInactiveTintColor: '#888',
            }}
        >
            <Tabs.Screen
                name="player"
                options={{
                    title: 'Player',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Disc3 color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="playlists"
                options={{
                    title: 'Playlists',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <ListMusic color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="library"
                options={{
                    title: 'Library',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Library color={color} size={size} />,
                }}
            />
        </Tabs>
    );
}
