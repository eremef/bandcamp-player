import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './services/TrackPlayerService';

// Must be exported or Fast Refresh won't update the context
export function App() {
    const ctx = require.context('./app');
    return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
