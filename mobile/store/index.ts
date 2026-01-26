import { PlayerState, Collection, Playlist, RadioStation, Track, QueueItem } from '@shared/types';
import { create } from 'zustand';
import { webSocketService } from '../services/WebSocketService';
import { DiscoveryService } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState extends PlayerState {
    // Connection State
    connectionStatus: 'disconnected' | 'connected' | 'connecting';
    hostIp: string;

    // Data Caches
    collection: Collection | null;
    playlists: Playlist[];
    radioStations: RadioStation[];

    // Actions
    recentIps: string[];

    // Actions
    setHostIp: (ip: string) => Promise<void>;
    connect: (ip?: string) => Promise<void>;
    disconnect: () => void;
    autoConnect: () => Promise<void>;
    startScan: () => Promise<void>;
    removeRecentIp: (ip: string) => Promise<void>;

    isScanning: boolean;

    // Playback Actions
    play: () => void;
    pause: () => void;
    next: () => void;
    previous: () => void;
    seek: (time: number) => void;
    setVolume: (vol: number) => void;
    toggleShuffle: () => void;
    setRepeat: (mode: 'off' | 'one' | 'all') => void;

    // Play Actions
    playTrack: (track: Track) => void;
    playAlbum: (albumUrl: string) => void;
    playPlaylist: (playlistId: string) => void;
    playStation: (station: RadioStation) => void;
}

const initialState: Omit<PlayerState, 'queue'> = {
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    repeatMode: 'off',
    isShuffled: false,
};

export const useStore = create<AppState>((set, get) => ({
    ...initialState,
    queue: { items: [], currentIndex: -1 },
    connectionStatus: 'disconnected',
    hostIp: '',
    recentIps: [],
    collection: null,
    playlists: [],
    radioStations: [],
    isScanning: false,

    setHostIp: async (ip: string) => {
        set({ hostIp: ip });
    },

    connect: async (manualIp?: string) => {
        const ip = manualIp || get().hostIp;
        if (!ip) return;

        // Add to recent IPs if not exists or move to top
        const currentRecents = get().recentIps;
        const newRecents = [ip, ...currentRecents.filter(i => i !== ip)].slice(0, 3);

        await AsyncStorage.setItem('recent_ips', JSON.stringify(newRecents));
        await AsyncStorage.setItem('last_ip', ip);

        set({ hostIp: ip, recentIps: newRecents, connectionStatus: 'connecting' });
        webSocketService.connect(ip);
    },

    disconnect: () => {
        webSocketService.disconnect();
        set({ connectionStatus: 'disconnected', hostIp: '' });
        AsyncStorage.removeItem('last_ip'); // Clear last IP to prevent auto-connect loop
    },

    autoConnect: async () => {
        const lastIp = await AsyncStorage.getItem('last_ip');
        const recentsJson = await AsyncStorage.getItem('recent_ips');
        const recentIps = recentsJson ? JSON.parse(recentsJson) : [];

        set({ recentIps });

        if (lastIp) {
            set({ hostIp: lastIp });
            get().connect(lastIp);
        } else {
            // If no last IP, try scanning automatically? Or let user decide.
            // Let's just ready the recents.
        }
    },

    startScan: async () => {
        if (get().isScanning) return;
        set({ isScanning: true });

        try {
            const ip = await DiscoveryService.scanNetwork((progress) => {
                // Could expose progress if needed
                console.log(`Scan progress: ${Math.round(progress * 100)}%`);
            });

            if (ip) {
                console.log('Discovery found IP:', ip);
                get().connect(ip);
            }
        } finally {
            set({ isScanning: false });
        }
    },

    removeRecentIp: async (ip: string) => {
        const currentRecents = get().recentIps;
        const newRecents = currentRecents.filter(i => i !== ip);
        await AsyncStorage.setItem('recent_ips', JSON.stringify(newRecents));
        set({ recentIps: newRecents });
    },

    play: () => webSocketService.send('play'),
    pause: () => webSocketService.send('pause'),
    next: () => webSocketService.send('next'),
    previous: () => webSocketService.send('previous'),
    seek: (time) => webSocketService.send('seek', time),
    setVolume: (vol) => webSocketService.send('set-volume', vol),
    toggleShuffle: () => webSocketService.send('toggle-shuffle'),
    setRepeat: (mode) => webSocketService.send('set-repeat', mode),

    playTrack: (track) => webSocketService.send('play-track', track),
    playAlbum: (url) => webSocketService.send('play-album', url),
    playPlaylist: (id) => webSocketService.send('play-playlist', id),
    playStation: (station) => webSocketService.send('play-station', station),

    // Initialize
    // This is called automatically when store is created? No, we need to call it.
    // We'll call autoConnect in app index.
}));

// Initialize Listeners
webSocketService.on('connection-status', (status) => {
    useStore.setState({ connectionStatus: status });
    if (status === 'connected') {
        // Request initial data
        webSocketService.send('get-collection');
        webSocketService.send('get-playlists');
        webSocketService.send('get-radio-stations');
    }
});

webSocketService.on('state-changed', (payload) => {
    useStore.setState(payload);
});

webSocketService.on('collection-data', (collection) => {
    useStore.setState({ collection });
});

webSocketService.on('playlists-data', (playlists) => {
    useStore.setState({ playlists });
});

webSocketService.on('radio-data', (radioStations) => {
    useStore.setState({ radioStations });
});

webSocketService.on('time-update', (payload) => {
    useStore.setState(payload);
});
