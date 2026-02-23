import { PlayerState, Collection, CollectionItem, Playlist, RadioStation, Track, QueueItem, Artist, Theme, BandcampUser, Album } from '@shared/types';
import { create } from 'zustand';
import { webSocketService } from '../services/WebSocketService';
import { DiscoveryService } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { addTrack } from '../services/player';
// import { mobilePlayerService } from '../services/MobilePlayerService';

interface AppState extends PlayerState {
    // Connection State
    connectionStatus: 'disconnected' | 'connected' | 'connecting';
    mode: 'remote' | 'standalone';
    hostIp: string;
    auth: { isAuthenticated: boolean; user: BandcampUser | null };
    skipAutoLogin: boolean;

    // Data Caches
    collection: Collection | null;
    playlists: Playlist[];
    radioStations: RadioStation[];
    artists: Artist[];
    artistCollection: Collection | null;
    isArtistCollectionLoading: boolean;
    collectionError: string | null;

    // Actions
    recentIps: string[];

    // Actions
    setHostIp: (ip: string) => Promise<void>;
    restoreStandaloneState: () => Promise<void>;
    setMode: (mode: 'remote' | 'standalone') => Promise<void>;
    loginBandcamp: () => Promise<void>;
    logoutBandcamp: () => Promise<void>;
    connect: (ip?: string) => Promise<void>;
    disconnect: () => Promise<void>;
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
    playTrack: (track: Track) => Promise<void>;
    playAlbum: (albumUrl: string, album?: Album) => Promise<void>;
    playPlaylist: (playlistId: string) => void;
    playStation: (station: RadioStation) => void;
    addStationToQueue: (station: RadioStation, playNext?: boolean) => void;
    addStationToPlaylist: (playlistId: string, station: RadioStation) => Promise<void>;
    addTrackToQueue: (track: Track, playNext?: boolean) => Promise<void>;
    addAlbumToQueue: (albumUrl: string, playNext?: boolean, tracks?: Track[]) => void;
    addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>;
    addAlbumToPlaylist: (playlistId: string, albumUrl: string, album?: Album) => Promise<void>;

    // Queue Actions
    playQueueIndex: (index: number) => void;
    removeFromQueue: (id: string) => void;
    clearQueue: () => void;

    // Playlist Actions
    createPlaylist: (name: string, description?: string) => void;
    renamePlaylist: (id: string, name: string, description?: string) => void;
    deletePlaylist: (id: string) => void;

    // Refresh Actions
    refreshCollection: (reset?: boolean, query?: string, forceServerRefresh?: boolean) => void;
    loadMoreCollection: () => void;
    refreshPlaylists: () => void;
    refreshRadio: () => void;
    refreshQueue: () => void;
    refreshArtists: () => void;
    refreshArtistCollection: (artistId: string) => void;

    // Pagination State
    collectionOffset: number;
    hasMoreCollection: boolean;
    isCollectionLoading: boolean;
    searchQuery: string;
    radioSearchQuery: string;
    setRadioSearchQuery: (query: string) => void;
    collectionLoadingStatus: string | null;
    // Simulation Mode
    isSimulationMode: boolean;
    toggleSimulationMode: () => Promise<void>;

    // Theme State
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;

    // Silent Refresh
    isSilentRefreshing: boolean;

    // Persistence Helpers
    saveQueue: () => Promise<void>;
}

const initialState: Omit<PlayerState, 'queue'> & { skipAutoLogin: boolean } = {
    isPlaying: false,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    repeatMode: 'off',
    isShuffled: false,
    isCasting: false,
    skipAutoLogin: false,
};

export const useStore = create<AppState>((set, get) => ({
    ...initialState,
    queue: { items: [], currentIndex: -1 },
    connectionStatus: 'disconnected',
    skipAutoLogin: false,
    mode: 'remote',
    hostIp: '',
    auth: { isAuthenticated: false, user: null },
    recentIps: [],
    collection: null,
    playlists: [],
    radioStations: [],
    artists: [],
    isScanning: false,
    collectionOffset: 0,
    hasMoreCollection: true,
    isCollectionLoading: false,
    artistCollection: null,
    isArtistCollectionLoading: false,
    collectionError: null,
    searchQuery: '',
    radioSearchQuery: '',
    setRadioSearchQuery: (query) => set({ radioSearchQuery: query }),
    collectionLoadingStatus: null,
    theme: 'system',
    setTheme: async (theme: Theme) => {
        await AsyncStorage.setItem('app_theme', theme);
        set({ theme });
    },

    isSimulationMode: false,
    isSilentRefreshing: false,
    toggleSimulationMode: async () => {
        const newValue = !get().isSimulationMode;
        await AsyncStorage.setItem('is_simulation_mode', newValue ? 'true' : 'false');
        set({ isSimulationMode: newValue });

        // Force a fresh collection refresh to generate/load simulation data
        await get().refreshCollection(true, '', true);
    },

    setHostIp: async (ip: string) => {
        set({ hostIp: ip });
    },

    restoreStandaloneState: async () => {
        // Restore standalone queue
        let restoredQueue = { items: [] as QueueItem[], currentIndex: -1 };
        let restoredTrack = null as Track | null;
        let restoredDuration = 0;
        let restoredTime = 0;

        const savedQueueJson = await AsyncStorage.getItem('standalone_queue');
        if (savedQueueJson) {
            try {
                const parsed = JSON.parse(savedQueueJson);
                if (parsed?.items?.length > 0) {
                    restoredQueue = parsed;
                    restoredTrack = parsed.items[parsed.currentIndex]?.track || null;
                    restoredDuration = restoredTrack?.duration || 0;
                    restoredTime = typeof parsed.currentTime === 'number' ? parsed.currentTime : 0;
                }
            } catch (e) {
                console.error('[MobileStore] Failed to parse standalone queue:', e);
            }
        }

        // Restore persisted volume from DB
        const { mobileDatabase } = require('../services/MobileDatabase');
        const settings = await mobileDatabase.getSettings();
        const restoredVolume = typeof settings.standalone_volume === 'number' ? settings.standalone_volume : 1;

        // Atomic set: restored playback state
        set({
            mode: 'standalone',
            ...initialState,
            volume: restoredVolume,
            queue: restoredQueue,
            currentTrack: restoredTrack,
            duration: restoredDuration,
            currentTime: restoredTime,
            isPlaying: false,
            skipAutoLogin: false,
        });

        // Ensure TrackPlayer volume is restored (might have been set to 0 in remote mode)
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        await mobilePlayerService.setVolume(restoredVolume);

        // Load track into player without playing if restored
        if (restoredTrack) {
            await mobilePlayerService.loadTrack(restoredTrack, restoredTime);
        }

        // Restore auth
        const { mobileAuthService } = require('../services/MobileAuthService');
        const authState = await mobileAuthService.checkSession();
        if (authState.isAuthenticated) {
            set({ auth: authState, connectionStatus: 'connected' });
        }

        // Restore simulation mode
        const simMode = await AsyncStorage.getItem('is_simulation_mode');
        set({ isSimulationMode: simMode === 'true' });

        // Data refresh — stagger to avoid SQLite "database is locked" errors
        if (authState.isAuthenticated) {
            get().refreshCollection(true);
            setTimeout(() => {
                get().refreshPlaylists();
                get().refreshRadio();
            }, 200);
        } else {
            // Even if not authenticated, we can refresh radio as it doesn't require session
            get().refreshRadio();
        }
    },

    setMode: async (mode) => {
        const currentMode = get().mode;
        if (currentMode === mode) return;

        // ── STEP 1: Snapshot before any mutations ──
        // Capture everything we need BEFORE stop() or set() modifies anything
        const wasConnected = get().connectionStatus === 'connected';

        if (currentMode === 'standalone') {
            // Save standalone playback snapshot to AsyncStorage
            await get().saveQueue();
        }

        // ── STEP 2: Stop local audio without touching store state ──
        // Don't call mobilePlayerService.stop() — it sets currentTrack: null.
        // Just stop the audio engine directly. The store will be updated by
        // the target mode's restoration logic.
        // Reset TrackPlayer for BOTH directions:
        // - standalone→remote: clear standalone playback
        // - remote→standalone: clear remote track to prevent progress bleed
        await TrackPlayer.reset();

        if (mode === 'remote') {
            await TrackPlayer.setVolume(0);
        }

        // ── STEP 3: Atomic state transition ──
        await AsyncStorage.setItem('app_mode', mode);

        // Set mode early so WebSocket event guards (e.g. state-changed)
        // block remote updates during the async transition below
        set({ mode });

        if (mode === 'standalone') {
            await get().restoreStandaloneState();
        } else {
            // Remote mode: only reset data collections, NOT playback state.
            // The server will provide playback state via state-changed event.
            const isActuallyConnected = webSocketService.isConnected();

            set({
                mode: 'remote',
                collection: null,
                playlists: [],
                radioStations: [],
                artists: [],
                collectionOffset: 0,
                hasMoreCollection: true,
                isCollectionLoading: false,
                // When switching from standalone → remote without an existing connection,
                // skip auto-login so the connect screen shows the manual Connect button
                // instead of auto-connecting (which would cause a navigation loop).
                skipAutoLogin: !isActuallyConnected,
            });

            if (isActuallyConnected) {
                // Delay refresh to let the UI settle with the mode change
                setTimeout(() => {
                    get().refreshCollection(false);
                    get().refreshPlaylists();
                    get().refreshRadio();
                    get().refreshArtists();
                    get().refreshQueue();
                }, 100);
            } else {
                // Not connected — the connect screen will handle connection
                // via its autoConnect effect when the UI navigates there
                set({ connectionStatus: 'disconnected' });
            }
        }
    },

    loginBandcamp: async () => {
        // Placeholder for Phase 2
        console.log('Login logic to be implemented in Phase 2');
    },

    logoutBandcamp: async () => {
        const { mobileAuthService } = require('../services/MobileAuthService');
        await mobileAuthService.logout();
        const { mobilePlayerService } = require('../services/MobilePlayerService');
        mobilePlayerService.stop();
        await AsyncStorage.removeItem('standalone_queue');
        set({
            auth: { isAuthenticated: false, user: null },
            connectionStatus: 'disconnected',
            ...initialState,
            queue: { items: [], currentIndex: -1 }
        });
    },

    connect: async (manualIp?: string) => {
        const ip = manualIp || get().hostIp;
        if (!ip) return;


        // Add to recent IPs if not exists or move to top
        const currentRecents = get().recentIps;
        const newRecents = [ip, ...currentRecents.filter(i => i !== ip)].slice(0, 3);

        await AsyncStorage.setItem('recent_ips', JSON.stringify(newRecents));
        await AsyncStorage.setItem('last_ip', ip);

        set({ hostIp: ip, recentIps: newRecents, connectionStatus: 'connecting', skipAutoLogin: false });
        webSocketService.connect(ip);
    },

    disconnect: async () => {
        const { mode } = get();

        if (mode === 'remote') {
            webSocketService.disconnect();
            await AsyncStorage.removeItem('last_ip'); // Clear last IP to prevent auto-connect loop
        } else if (mode === 'standalone') {
            // Save queue before clearing it from active state
            await get().saveQueue();
        }

        const { mobilePlayerService } = require('../services/MobilePlayerService');
        mobilePlayerService.stop();

        set({
            connectionStatus: 'disconnected',
            hostIp: mode === 'standalone' ? get().hostIp : '',
            ...initialState,
            mode, // Preserve current mode
            queue: { items: [], currentIndex: -1 },
            skipAutoLogin: true
        });
    },

    autoConnect: async () => {
        if (get().connectionStatus === 'connected' || get().connectionStatus === 'connecting') {
            return;
        }

        const lastIp = await AsyncStorage.getItem('last_ip');
        const recentsJson = await AsyncStorage.getItem('recent_ips');
        const recentIps = recentsJson ? JSON.parse(recentsJson) : [];
        const savedTheme = await AsyncStorage.getItem('app_theme') as Theme || 'system';
        const isSimulationMode = await AsyncStorage.getItem('is_simulation_mode') === 'true';

        const savedMode = await AsyncStorage.getItem('app_mode') as 'remote' | 'standalone' || 'remote';
        const { mobileDatabase } = require('../services/MobileDatabase');
        const { mobileAuthService } = require('../services/MobileAuthService');

        const settings = await mobileDatabase.getSettings();
        const volume = typeof settings.standalone_volume === 'number' ? settings.standalone_volume : 1;

        // Check auth status early
        const authStatus = await mobileAuthService.checkSession();

        set({ recentIps, theme: savedTheme, mode: savedMode, volume, isSimulationMode, auth: authStatus });

        // Always attempt connection to last known IP if available,
        // so remote state is tracked even in standalone mode.
        if (lastIp && !get().skipAutoLogin) {
            await get().connect(lastIp);
        }

        if (savedMode === 'standalone' && !get().skipAutoLogin) {
            const { mobilePlayerService } = require('../services/MobilePlayerService');

            // Set listener for queue changes (automatic track advancement)
            if (!mobilePlayerService.onQueueChange) {
                mobilePlayerService.onQueueChange = () => {
                    get().saveQueue();
                };
            }

            await get().restoreStandaloneState();
        }
    },

    saveQueue: async () => {
        if (get().mode === 'standalone') {
            const { queue, currentTime } = get();
            await AsyncStorage.setItem('standalone_queue', JSON.stringify({ ...queue, currentTime }));
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

    play: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('play');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.play();
        }
    },
    pause: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('pause');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.pause();
        }
    },
    next: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('next');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.next();
        }
    },
    previous: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('previous');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.previous();
        }
    },
    seek: (time) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('seek', time);
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.seek(time);
        }
    },
    setVolume: (vol) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('set-volume', vol);
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.setVolume(vol);
        }
    },
    toggleShuffle: async () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('toggle-shuffle');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            await mobilePlayerService.toggleShuffle();
        }
    },
    setRepeat: async (mode) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('set-repeat', mode);
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            await mobilePlayerService.setRepeat(mode);
        }
    },

    playTrack: async (track) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            // Optimistic update
            set({
                currentTrack: track,
                isPlaying: true
            });
            webSocketService.send('play-track', track);
        } else {
            console.log(`[MobileStore] playTrack standalone: ${track.title}`);

            let trackToPlay = track;

            // If artist is 'Unknown Artist', try to fetch details
            if (track.artist === 'Unknown Artist' && track.bandcampUrl) {
                try {
                    const { mobileScraperService } = require('../services/MobileScraperService');
                    const albumDetails = await mobileScraperService.getAlbumDetails(track.bandcampUrl);
                    if (albumDetails) {
                        const foundTrack = (albumDetails.tracks || []).find((t: { id: any; title: string; }) =>
                            String(t.id) === String(track.id) || t.title === track.title
                        );
                        if (foundTrack) {
                            trackToPlay = {
                                ...track,
                                ...foundTrack,
                                artist: (foundTrack.artist && foundTrack.artist !== 'Unknown Artist') ? foundTrack.artist : (albumDetails.artist || track.artist)
                            };
                        } else if (albumDetails.artist && albumDetails.artist !== 'Unknown Artist') {
                            trackToPlay = { ...track, artist: albumDetails.artist };
                        }
                    }
                } catch (e) {
                    console.warn('[MobileStore] Failed to fetch track details for playback:', e);
                }
            }

            const queueItem: QueueItem = {
                id: `track-${trackToPlay.id}-${Date.now()}`,
                track: trackToPlay,
                source: 'collection'
            };

            set({
                queue: {
                    items: [queueItem],
                    currentIndex: 0
                },
                currentTrack: trackToPlay,
                isPlaying: true
            });

            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.playQueueIndex(0);
            get().saveQueue();
        }
    },
    playAlbum: async (url, album) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('play-album', url);
        } else {
            console.log(`[MobileStore] playAlbum standalone: ${url}`);

            const handleAlbumData = (albumData: any) => {
                if (albumData && albumData.tracks && albumData.tracks.length > 0) {
                    console.log(`[MobileStore] Album details loaded: ${albumData.title} (${albumData.tracks.length} tracks)`);

                    const albumArtist = (albumData.artist && albumData.artist !== 'Unknown Artist') ? albumData.artist : '';

                    const queueItems: QueueItem[] = albumData.tracks.map((track: any, i: number) => {
                        const trackArtist = (track.artist && track.artist !== 'Unknown Artist') ? track.artist : (albumArtist || 'Unknown Artist');
                        return {
                            id: `album-${albumData.id}-${Date.now()}-${i}`,
                            track: { ...track, artist: trackArtist },
                            source: 'collection'
                        };
                    });

                    set({
                        queue: {
                            items: queueItems,
                            currentIndex: 0
                        },
                        currentTrack: queueItems[0].track,
                        isPlaying: true,
                        isCollectionLoading: false,
                        collectionError: null
                    });
                    get().saveQueue();

                    // Play the first track
                    const { mobilePlayerService } = require('../services/MobilePlayerService');
                    mobilePlayerService.playQueueIndex(0);
                } else {
                    console.warn('[MobileStore] No tracks found in album details');
                    set({ isCollectionLoading: false, collectionError: 'No tracks found in this album.' });
                }
            };

            if (album && album.tracks && album.tracks.length > 0) {
                handleAlbumData(album);
            } else {
                const { mobileScraperService } = require('../services/MobileScraperService');
                set({ isCollectionLoading: true, collectionError: null });

                mobileScraperService.getAlbumDetails(url)
                    .then(handleAlbumData)
                    .catch((err: any) => {
                        console.error('[MobileStore] Play Album Error:', err);
                        set({ isCollectionLoading: false, collectionError: 'Failed to load album details.' });
                    });
            }
        }
    },
    playPlaylist: (id) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('play-playlist', id);
        } else {
            const playlist = get().playlists.find(p => p.id === id);
            if (!playlist || playlist.tracks.length === 0) return;

            const queueItems: QueueItem[] = playlist.tracks.map((track, i) => ({
                id: `playlist-${id}-${Date.now()}-${i}`,
                track,
                source: 'playlist'
            }));

            set({
                queue: {
                    items: queueItems,
                    currentIndex: 0
                },
                currentTrack: playlist.tracks[0],
                isPlaying: true
            });

            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.playQueueIndex(0);
            get().saveQueue();
        }
    },
    playStation: (station) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('play-station', station);
        } else {
            console.log(`[MobileStore] playStation standalone: ${station.name}`);
            const { mobileScraperService } = require('../services/MobileScraperService');
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            set({ isCollectionLoading: true, collectionError: null });

            mobileScraperService.getStationStreamUrl(station.id)
                .then(({ streamUrl, duration }: { streamUrl: string; duration: number }) => {
                    const stationTrack: Track = {
                        id: `station-${station.id}`,
                        title: station.name,
                        artist: 'Bandcamp Weekly',
                        artworkUrl: station.imageUrl || '',
                        streamUrl,
                        duration,
                        bandcampUrl: `https://bandcamp.com/?show=${station.id}`,
                        album: 'Bandcamp Radio',
                        isCached: false
                    };

                    const queueItem: QueueItem = {
                        id: `queue-${station.id}-${Date.now()}`,
                        track: stationTrack,
                        source: 'radio'
                    };

                    set({
                        queue: {
                            items: [queueItem],
                            currentIndex: 0
                        },
                        currentTrack: stationTrack,
                        isPlaying: true,
                        isCollectionLoading: false
                    });
                    get().saveQueue();

                    mobilePlayerService.playQueueIndex(0);
                })
                .catch((err: any) => {
                    console.error('[MobileStore] Play Station Error:', err);
                    set({ isCollectionLoading: false, collectionError: 'Failed to load station stream.' });
                });
        }
    },
    addStationToQueue: (station, playNext) => {
        // Optimistic update
        const { queue } = get();
        // Create a temporary track object for the station
        const stationTrack: Track = {
            id: `station-${station.id || Date.now()}`,
            title: station.name,
            artist: 'Bandcamp Weekly',
            artworkUrl: station.imageUrl || '',
            streamUrl: station.streamUrl,
            duration: 0,
            bandcampUrl: `https://bandcamp.com/?show=${station.id}`,
            album: 'Bandcamp Radio',
            isCached: false
        };

        const newItem: QueueItem = {
            id: `queue-${Date.now()}`,
            track: stationTrack,
            source: 'radio'
        };

        const newItems = [...queue.items];
        if (playNext) {
            newItems.splice(queue.currentIndex + 1, 0, newItem);
        } else {
            newItems.push(newItem);
        }

        set({
            queue: {
                ...queue,
                items: newItems
            }
        });

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-station-to-queue', { station, playNext });
        } else {
            // Local state already updated optimistically above.
            get().saveQueue();
            // Check if we should auto-play
            if (queue.items.length === 0) {
                get().playStation(station);
            }
        }
    },
    addStationToPlaylist: async (playlistId, station) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-station-to-playlist', { playlistId, station });
        } else {
            const { mobileScraperService } = require('../services/MobileScraperService');
            const { mobileDatabase } = require('../services/MobileDatabase');

            try {
                // Fetch full details to get duration if not already present
                let streamUrl = station.streamUrl;
                let duration = 0;

                let isUnresolvedUrl = false;
                if (streamUrl) {
                    try {
                        const urlObj = new URL(streamUrl);
                        isUnresolvedUrl = urlObj.hostname === 'bandcamp.com' || urlObj.hostname.endsWith('.bandcamp.com');
                    } catch {
                        isUnresolvedUrl = false;
                    }
                }

                if (!streamUrl || isUnresolvedUrl) {
                    const details = await mobileScraperService.getStationStreamUrl(station.id);
                    streamUrl = details.streamUrl;
                    duration = details.duration;
                }

                const stationTrack: Track = {
                    id: `station-${station.id}`,
                    title: station.name,
                    artist: 'Bandcamp Weekly',
                    artworkUrl: station.imageUrl || '',
                    streamUrl: streamUrl,
                    duration: duration,
                    bandcampUrl: `https://bandcamp.com/?show=${station.id}`,
                    album: 'Bandcamp Radio',
                    isCached: false
                };
                await mobileDatabase.addTrackToPlaylist(playlistId, stationTrack);
                get().refreshPlaylists();
            } catch (err) {
                console.error('[MobileStore] Failed to add station to playlist:', err);
                // Fallback to minimal data if fetch fails
                const stationTrack: Track = {
                    id: `station-${station.id}`,
                    title: station.name,
                    artist: 'Bandcamp Weekly',
                    artworkUrl: station.imageUrl || '',
                    streamUrl: station.streamUrl,
                    duration: 0,
                    bandcampUrl: `https://bandcamp.com/?show=${station.id}`,
                    album: 'Bandcamp Radio',
                    isCached: false
                };
                await mobileDatabase.addTrackToPlaylist(playlistId, stationTrack);
                get().refreshPlaylists();
            }
        }
    },
    addTrackToQueue: async (track, playNext) => {
        let trackToAdd = track;

        // If artist is 'Unknown Artist', try to fetch full details
        if (get().mode !== 'remote' && track.artist === 'Unknown Artist' && track.bandcampUrl) {
            try {
                const { mobileScraperService } = require('../services/MobileScraperService');
                const albumDetails = await mobileScraperService.getAlbumDetails(track.bandcampUrl);
                if (albumDetails) {
                    const foundTrack = (albumDetails.tracks || []).find((t: { id: any; title: string; }) =>
                        String(t.id) === String(track.id) || t.title === track.title
                    );
                    if (foundTrack) {
                        trackToAdd = {
                            ...track,
                            ...foundTrack,
                            artist: (foundTrack.artist && foundTrack.artist !== 'Unknown Artist') ? foundTrack.artist : (albumDetails.artist || track.artist)
                        };
                    } else if (albumDetails.artist && albumDetails.artist !== 'Unknown Artist') {
                        trackToAdd = { ...track, artist: albumDetails.artist };
                    }
                }
            } catch (e) {
                console.warn('[MobileStore] Failed to fetch track details for queue:', e);
            }
        }

        // Optimistic update
        const { queue } = get();
        const newItem: QueueItem = {
            id: `queue-${Date.now()}`,
            track: trackToAdd,
            source: 'collection'
        };

        const newItems = [...queue.items];

        if (playNext) {
            newItems.splice(queue.currentIndex + 1, 0, newItem);
        } else {
            newItems.push(newItem);
        }

        set({
            queue: {
                ...queue,
                items: newItems
            }
        });

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-track-to-queue', { track: trackToAdd, playNext });
        } else {
            get().saveQueue();
        }
    },
    addAlbumToQueue: (albumUrl, playNext, tracks) => {
        console.log(`[MobileStore] addAlbumToQueue called. URL: ${albumUrl}, PlayNext: ${playNext}, Tracks: ${tracks?.length}`);
        // Optimistic update if tracks are provided
        if (tracks && tracks.length > 0) {
            const { queue } = get();
            console.log('[MobileStore] Current queue length:', queue.items.length);

            // Try to find album artist if tracks might have 'Unknown Artist'
            // We don't have the album object here directly, but we can check if all tracks have the same artist
            const artists = tracks.map(t => t.artist).filter(a => a && a !== 'Unknown Artist');
            const commonArtist = artists.length > 0 ? artists[0] : '';

            const newQueueItems: QueueItem[] = tracks.map((track, index) => ({
                id: `queue-${Date.now()}-${index}`,
                track: {
                    ...track,
                    artist: (track.artist && track.artist !== 'Unknown Artist') ? track.artist : commonArtist
                },
                source: 'collection'
            }));

            const newItems = [...queue.items];

            if (playNext) {
                // When playing next, we insert after current index
                newItems.splice(queue.currentIndex + 1, 0, ...newQueueItems);
            } else {
                newItems.push(...newQueueItems);
            }

            console.log('[MobileStore] New queue length:', newItems.length);

            set({
                queue: {
                    ...queue,
                    items: newItems
                }
            });
            get().saveQueue();
        } else {
            console.warn('[MobileStore] addAlbumToQueue called without tracks! Fetching...', albumUrl);
            const { mobileScraperService } = require('../services/MobileScraperService');
            // Force fetch tracks
            mobileScraperService.getAlbumDetails(albumUrl)
                .then((album: any) => {
                    if (album && album.tracks && album.tracks.length > 0) {
                        // Recursive call with tracks
                        get().addAlbumToQueue(albumUrl, playNext, album.tracks);
                    } else {
                        set({ collectionError: 'Failed to load tracks for queue' });
                    }
                })
                .catch((err: any) => {
                    console.error('Failed to fetch album for queue:', err);
                    set({ collectionError: 'Failed to fetch album for queue' });
                });
        }

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-album-to-queue', { albumUrl, playNext, tracks });
        } else {
            if (tracks && tracks.length > 0) {
                console.log('[MobileStore] Added album to queue locally');
                // Check if we should auto-play (if queue was empty)
                const { mobilePlayerService } = require('../services/MobilePlayerService');
                // If the queue only contains the items we just added, it was empty.
                // Note: Use fresh state
                const currentQueue = get().queue;
                console.log(`[MobileStore] Checking auto-play. Queue len: ${currentQueue.items.length}, Tracks added: ${tracks?.length}`);

                if (currentQueue.items.length === (tracks?.length || 0)) {
                    console.log('[MobileStore] Queue was empty, auto-playing index 0');
                    mobilePlayerService.playQueueIndex(0).then(() => get().saveQueue());
                } else {
                    get().saveQueue();
                }
            }
        }
    },
    addTrackToPlaylist: async (playlistId, track) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-track-to-playlist', { playlistId, track });
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { mobileScraperService } = require('../services/MobileScraperService');

            let trackToSave = track;

            // If track duration is 0 OR artist is 'Unknown Artist', try to fetch full details
            if ((track.duration === 0 || track.artist === 'Unknown Artist') && track.bandcampUrl) {
                try {
                    const albumDetails = await mobileScraperService.getAlbumDetails(track.bandcampUrl);
                    if (albumDetails && albumDetails.tracks) {
                        const fullTrack = albumDetails.tracks.find((t: { id: any; title: string; }) => String(t.id) === String(track.id) || t.title === track.title);
                        if (fullTrack) {
                            trackToSave = {
                                ...track,
                                ...fullTrack,
                                artist: (fullTrack.artist && fullTrack.artist !== 'Unknown Artist') ? fullTrack.artist : (albumDetails.artist || track.artist)
                            };
                        } else if (albumDetails.artist && albumDetails.artist !== 'Unknown Artist') {
                            trackToSave = { ...track, artist: albumDetails.artist };
                        }
                    }
                } catch (e) {
                    console.warn('[MobileStore] Failed to fetch track details for playlist:', e);
                }
            }

            await mobileDatabase.addTrackToPlaylist(playlistId, trackToSave);
            get().refreshPlaylists();
        }
    },
    addAlbumToPlaylist: async (playlistId, albumUrl, album) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('add-album-to-playlist', { playlistId, albumUrl });
        } else {
            const { mobileScraperService } = require('../services/MobileScraperService');
            const { mobileDatabase } = require('../services/MobileDatabase');
            try {
                const albumData = album || await mobileScraperService.getAlbumDetails(albumUrl);
                if (albumData && albumData.tracks) {
                    const albumArtist = (albumData.artist && albumData.artist !== 'Unknown Artist') ? albumData.artist : 'Unknown Artist';

                    for (const track of albumData.tracks) {
                        const trackToSave = {
                            ...track,
                            artist: (track.artist && track.artist !== 'Unknown Artist') ? track.artist : albumArtist
                        };
                        await mobileDatabase.addTrackToPlaylist(playlistId, trackToSave);
                    }
                    get().refreshPlaylists();
                }
            } catch (e) {
                console.error('[MobileStore] Failed to add album to playlist:', e);
            }
        }
    },
    playQueueIndex: (index) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('play-queue-index', index);
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.playQueueIndex(index);
            get().saveQueue();
        }
    },
    removeFromQueue: (id) => {
        const { queue } = get();
        const index = queue.items.findIndex(item => item.id === id);
        if (index === -1) return;

        const newItems = [...queue.items];
        newItems.splice(index, 1);

        let newIndex = queue.currentIndex;
        if (index < queue.currentIndex) {
            newIndex--;
        } else if (index === queue.currentIndex) {
            if (newItems.length === 0) {
                newIndex = -1;
            } else {
                newIndex = Math.min(newIndex, newItems.length - 1);
            }
        }

        set({
            queue: {
                ...queue,
                items: newItems,
                currentIndex: newIndex
            }
        });
        get().saveQueue();

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('remove-from-queue', id);
        } else {
            // Local state is already updated optimistically above.
            if (index === queue.currentIndex) {
                const { mobilePlayerService } = require('../services/MobilePlayerService');
                if (newItems.length > 0) {
                    mobilePlayerService.playQueueIndex(newIndex);
                } else {
                    mobilePlayerService.stop();
                }
            }
        }
    },
    clearQueue: () => {
        const { queue } = get();
        let newItems: QueueItem[] = [];
        let newIndex = -1;

        if (queue.currentIndex >= 0 && queue.currentIndex < queue.items.length) {
            newItems = [queue.items[queue.currentIndex]];
            newIndex = 0;
        }

        set({
            queue: {
                ...queue,
                items: newItems,
                currentIndex: newIndex
            }
        });
        get().saveQueue();

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('clear-queue');
        } else {
            const { mobilePlayerService } = require('../services/MobilePlayerService');
            mobilePlayerService.stop(); // Clear and stop
        }
    },
    createPlaylist: (name, description) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('create-playlist', { name, description });
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.createPlaylist(name).then(() => get().refreshPlaylists());
        }
    },
    renamePlaylist: (id, name, description) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('update-playlist', { id, name, description });
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.renamePlaylist(id, name).then(() => get().refreshPlaylists());
        }
    },
    deletePlaylist: (id) => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('delete-playlist', id);
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.deletePlaylist(id).then(() => get().refreshPlaylists());
        }
    },

    refreshCollection: (reset = false, query = '', forceServerRefresh = false) => {
        if (reset) {
            set({
                collection: forceServerRefresh ? null : get().collection, // Clear collection if forced refresh to show loading screen
                collectionOffset: 0,
                hasMoreCollection: true,
                searchQuery: query, // Update query state on reset/search
                isCollectionLoading: true,
                collectionError: null,
                collectionLoadingStatus: null // Reset status on new refresh
            });
            if (get().mode === 'remote' && get().connectionStatus === 'connected') {
                webSocketService.send('get-collection', {
                    forceRefresh: forceServerRefresh,
                    offset: 0,
                    limit: 50,
                    query
                });
                if (forceServerRefresh) {
                    webSocketService.send('get-artists');
                }
                return Promise.resolve();
            } else {
                const { mobileDatabase } = require('../services/MobileDatabase');
                const { mobileScraperService } = require('../services/MobileScraperService');

                const fetchLogic = async () => {
                    const onProgress = (msg: string) => {
                        set({ collectionLoadingStatus: msg || null });
                    };

                    onProgress('Connecting...');

                    const { user } = get().auth;
                    if (!user) {
                        console.log('[MobileStore] Skipping collection fetch: user not authenticated');
                        set({ isCollectionLoading: false });
                        return;
                    }

                    if (forceServerRefresh) {
                        await mobileScraperService.fetchCollection(true, get().isSimulationMode, onProgress);
                    }

                    let items = await mobileDatabase.getCollectionGranular(user.id, 0, 50, query);
                    let totalCount = await mobileDatabase.getCollectionTotalCount(user.id, query);

                    // Fresh start detection: if DB is empty and no search query, fetch from scraper
                    if (totalCount === 0 && !query && !forceServerRefresh) {
                        console.log('[MobileStore] Collection empty, performing initial fetch...');
                        await mobileScraperService.fetchCollection(false, get().isSimulationMode, onProgress);
                        items = await mobileDatabase.getCollectionGranular(user.id, 0, 50, query);
                        totalCount = await mobileDatabase.getCollectionTotalCount(user.id, query);
                    }

                    set({
                        collection: {
                            items,
                            totalCount,
                            lastUpdated: new Date().toISOString(),
                            isSimulated: get().isSimulationMode
                        },
                        isCollectionLoading: false,
                        collectionOffset: items.length,
                        hasMoreCollection: items.length < totalCount
                    });

                    get().refreshArtists();
                };

                return fetchLogic().catch(err => {
                    console.error('Fetch collection error:', err);
                    if (err.message === 'User not authenticated' || (err.response && err.response.status === 401) || String(err).includes('401')) {
                        console.log('[MobileStore] Authentication error detected, triggering silent refresh');
                        set({ isSilentRefreshing: true, isCollectionLoading: false });
                    } else {
                        set({ isCollectionLoading: false, collectionError: 'Failed to load collection.' });
                    }
                });
            }
        } else {
            // Loading more or non-reset refresh
            set({ isCollectionLoading: true });
            const { searchQuery } = get();
            if (get().mode === 'remote' && get().connectionStatus === 'connected') {
                webSocketService.send('get-collection', {
                    forceRefresh: forceServerRefresh,
                    query: searchQuery,
                    offset: get().collectionOffset,
                    limit: 50
                });
                return Promise.resolve();
            } else {
                return get().loadMoreCollection();
            }
        }
    },

    loadMoreCollection: () => {
        const { collectionOffset, hasMoreCollection, isCollectionLoading, searchQuery, collection } = get();
        if (!hasMoreCollection || isCollectionLoading) return Promise.resolve();

        set({ isCollectionLoading: true });

        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-collection', {
                forceRefresh: false,
                offset: collectionOffset,
                limit: 50,
                query: searchQuery
            });
            return Promise.resolve();
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            const { user } = get().auth;
            if (!user || !collection) {
                set({ isCollectionLoading: false });
                return Promise.resolve();
            }

            return mobileDatabase.getCollectionGranular(user.id, collectionOffset, 50, searchQuery)
                .then((newItems: CollectionItem[]) => {
                    const updatedItems = [...collection.items, ...newItems];
                    const uniqueItems = Array.from(new Map(updatedItems.map(item => [item.id, item])).values());

                    set({
                        collection: {
                            ...collection,
                            items: uniqueItems
                        },
                        collectionOffset: collectionOffset + newItems.length,
                        hasMoreCollection: uniqueItems.length < collection.totalCount,
                        isCollectionLoading: false
                    });
                })
                .catch((err: any) => {
                    console.error('[MobileStore] loadMore error:', err);
                    set({ isCollectionLoading: false });
                });
        }
    },

    refreshPlaylists: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-playlists');
        } else {
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.getAllPlaylists().then((playlists: Playlist[]) => set({ playlists }));
        }
    },
    refreshRadio: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-radio-stations');
        } else {
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.getRadioStations().then((stations: RadioStation[]) => set({ radioStations: stations }));
        }
    },
    refreshQueue: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-state');
        } else {
            // Local queue is already managed in store state
        }
    },
    refreshArtists: () => {
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-artists');
        } else {
            console.log('[MobileStore] Refreshing artists from DB...');
            const { mobileDatabase } = require('../services/MobileDatabase');
            mobileDatabase.getArtists()
                .then((artists: any[]) => {
                    console.log(`[MobileStore] Loaded ${artists.length} artists from DB`);
                    const mappedArtists: Artist[] = artists.map(a => ({
                        id: a.id,
                        name: a.name,
                        bandcampUrl: a.url,
                        imageUrl: a.image_url
                    }));
                    set({ artists: mappedArtists });
                })
                .catch((err: any) => console.error('[MobileStore] Failed to load artists:', err));
        }
    },
    refreshArtistCollection: (artistId: string) => {
        if (!get().auth.isAuthenticated) {
            console.log('[MobileStore] Skipping artist collection fetch: user not authenticated');
            return;
        }
        set({ isArtistCollectionLoading: true });
        if (get().mode === 'remote' && get().connectionStatus === 'connected') {
            webSocketService.send('get-artist-collection', artistId);
        } else {
            const { mobileScraperService } = require('../services/MobileScraperService');
            mobileScraperService.fetchCollection(false)
                .then((collection: any) => {
                    const items = collection.items || [];
                    const artistItems = items.filter((item: any) => {
                        const data = item.type === 'album' ? item.album : item.track;
                        return data && (data.artistId === artistId || data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-') === artistId.replace('name-', ''));
                    });
                    set({
                        artistCollection: {
                            items: artistItems,
                            totalCount: artistItems.length,
                            lastUpdated: new Date().toISOString()
                        },
                        isArtistCollectionLoading: false
                    });
                })
                .catch((err: any) => {
                    console.error('[MobileStore] Failed to load artist collection:', err);
                    set({ isArtistCollectionLoading: false });
                });
        }
    },
}));

// Initialize Listeners
webSocketService.on('connection-status', (status, isExplicit) => {
    const { mode, connectionStatus: currentStatus } = useStore.getState();

    // In standalone mode, we don't want background WebSocket drops 
    // to overwrite our 'connected' state unless it's an explicit disconnect.
    if (mode === 'standalone' && status === 'disconnected' && !isExplicit) {
        return;
    }

    if (currentStatus !== status) {
        useStore.setState({ connectionStatus: status });
    }

    if (status === 'disconnected' && isExplicit) {
        // Clear last_ip to prevent auto-reconnect loop on app focus/restart
        AsyncStorage.removeItem('last_ip');
    }

    if (status === 'connected' && useStore.getState().mode === 'remote') {
        // Request initial data - reset to 0 but use cache if available
        useStore.getState().refreshCollection(false);
        webSocketService.send('get-playlists');
        webSocketService.send('get-radio-stations');
        webSocketService.send('get-artists');
    }
});

webSocketService.on('state-changed', async (payload: Partial<PlayerState>) => {
    if (useStore.getState().mode !== 'remote') return;
    const currentState = useStore.getState();
    const prevTrackId = currentState.currentTrack?.id;

    useStore.setState(payload);

    // Sync with TrackPlayer
    try {
        if (payload.currentTrack && payload.currentTrack.id !== prevTrackId) {
            await addTrack(payload.currentTrack, currentState.hostIp);
        }

        if (payload.isPlaying !== undefined) {
            if (payload.isPlaying) {
                await TrackPlayer.play();
            } else {
                await TrackPlayer.pause();
            }
        }
    } catch (e) {
        console.error('Failed to sync TrackPlayer state', e);
    }
});

webSocketService.on('collection-data', (collectionData) => {
    if (useStore.getState().mode !== 'remote') return;
    const currentStore = useStore.getState();
    const isReset = collectionData.offset === 0;

    let newItems = [];
    if (isReset || !currentStore.collection) {
        newItems = collectionData.items;
    } else {
        // Append
        newItems = [...currentStore.collection.items, ...collectionData.items];
    }

    // De-dupe by ID just in case
    const uniqueItems = Array.from(new Map(newItems.map((item: { id: any; }) => [item.id, item])).values());

    useStore.setState({
        collection: {
            ...collectionData,
            items: uniqueItems,
            // If totalCount is available, use it to check hasMore. 
            // If not, rely on whether we got fewer items than limit?
            // Desktop sends totalCount which is TOTAL in DB.
            // But we can check if new items length < limit.
            // Or checks offset + length >= totalCount
        },
        collectionOffset: (collectionData.offset || 0) + collectionData.items.length,
        hasMoreCollection: (collectionData.offset || 0) + collectionData.items.length < collectionData.totalCount,
        isCollectionLoading: false
    });
});


webSocketService.on('playlists-data', (playlists) => {
    if (useStore.getState().mode !== 'remote') return;
    useStore.setState({ playlists });
});

webSocketService.on('radio-data', (radioStations) => {
    if (useStore.getState().mode !== 'remote') return;
    useStore.setState({ radioStations });
});

webSocketService.on('artists-data', (artists) => {
    if (useStore.getState().mode !== 'remote') return;
    useStore.setState({ artists });
});

webSocketService.on('artist-collection-data', (artistCollection) => {
    if (useStore.getState().mode !== 'remote') return;
    useStore.setState({ artistCollection, isArtistCollectionLoading: false });
});

// Mobile Scraper Events
import { mobileScraperService } from '../services/MobileScraperService';

// We can subscribe to the scraper service explicitly or just handle the promise result in the action.
// The desktop app uses events. Let's stick to promise handling in the action for simplicity in React Native store,
// OR we can add a listener here if we want to support background updates.
// For now, the actions handle the state setting.

webSocketService.on('time-update', async (payload) => {
    if (useStore.getState().mode !== 'remote') return;

    useStore.setState(payload);

    // Sync TrackPlayer progress (Smart Sync)
    // Only seek if we are significantly out of sync (> 2s) to avoid stuttering
    if (payload.currentTime !== undefined) {
        try {
            const progress = await TrackPlayer.getProgress();
            const currentPosition = progress.position;
            const timeDiff = Math.abs(currentPosition - payload.currentTime);

            if (timeDiff > 2) {
                // console.log(`Syncing time: remote=${payload.currentTime}, local=${currentPosition}, diff=${timeDiff}`);
                await TrackPlayer.seekTo(payload.currentTime);
            }
        } catch {
            // Ignore errors (e.g. if player not ready)
        }
    }
});
