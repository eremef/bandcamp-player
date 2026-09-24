import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { webSocketService } from '../services/WebSocketService';
import { Album, Artist, Track } from '@shared/types';
import { useStore } from '../store';
import { ArrowLeft, Play, MoreVertical, ListEnd, ListPlus, ListMusic } from 'lucide-react-native';
import { ActionSheet, Action } from '../components/ActionSheet';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { InputModal } from '../components/InputModal';
import { useTheme } from '../theme';

export default function AlbumDetailScreen() {
    const colors = useTheme();
    const { url, albumId, artist, title, artworkUrl } = useLocalSearchParams<{
        url: string;
        albumId?: string;
        artist?: string;
        title?: string;
        artworkUrl?: string;
    }>();
    const router = useRouter();
    const [album, setAlbum] = useState<Album | null>(artist ? {
        id: '',
        title: title || '',
        artist: artist || '',
        artworkUrl: artworkUrl || '',
        tracks: [],
        trackCount: 0,
        bandcampUrl: url || ''
    } : null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUrl, setLastUrl] = useState(url);
    const [lastAlbumId, setLastAlbumId] = useState(albumId);
    const mode = useStore(state => state.mode);
    const offlineMode = useStore(state => state.offlineMode);
    const cachedTrackIds = useStore(state => state.cachedTrackIds);
    const artists = useStore(state => state.artists) || [];
    const collection = useStore(state => state.collection);
    const [lastMode, setLastMode] = useState(mode);

    const loadCachedAlbum = useCallback(async () => {
        const { mobileDatabase } = require('../services/MobileDatabase');
        const { mobileCacheService } = require('../services/MobileCacheService');
        const entries: any[] = albumId
            ? await mobileDatabase.getCacheEntriesByAlbum(albumId)
            : (await mobileDatabase.getAllCacheEntries()).filter((entry: any) =>
                entry.album?.toLowerCase() === title?.toLowerCase()
                && entry.artist?.toLowerCase() === artist?.toLowerCase()
            );
        const cachedEntries = await Promise.all(entries.map(async entry =>
            await mobileCacheService.isCached(entry.track_id) ? entry : null
        ));
        const validEntries = cachedEntries.filter((entry): entry is any => entry !== null);
        if (validEntries.length > 0) {
            useStore.setState(state => ({
                cachedTrackIds: new Set([...state.cachedTrackIds, ...validEntries.map(entry => entry.track_id)])
            }));
        }
        const tracks: Track[] = validEntries.map((entry: any) => ({
            id: entry.track_id,
            title: entry.title || '',
            artist: entry.artist || artist || '',
            artistId: undefined,
            album: entry.album || title || '',
            albumId: entry.album_id || albumId,
            duration: entry.duration || 0,
            trackNumber: entry.track_number || undefined,
            artworkUrl: entry.artwork_url || artworkUrl || '',
            streamUrl: '',
            bandcampUrl: url || '',
            isCached: true,
            cachedPath: entry.file_path
        }));
        tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

        if (tracks.length === 0) return null;
        return {
            id: albumId || tracks[0].albumId || '',
            title: title || tracks[0].album,
            artist: artist || tracks[0].artist,
            artworkUrl: artworkUrl || tracks[0].artworkUrl,
            bandcampUrl: url || '',
            tracks,
            trackCount: tracks.length
        } as Album;
    }, [albumId, artist, artworkUrl, title, url]);

    // Reset state when URL or mode changes (runs during render to avoid cascading updates)
    if (url !== lastUrl || albumId !== lastAlbumId || mode !== lastMode) {
        setLastUrl(url);
        setLastAlbumId(albumId);
        setLastMode(mode);
        setIsLoading(true);
        setAlbum(artist ? {
            id: '',
            title: title || '',
            artist: artist || '',
            artworkUrl: artworkUrl || '',
            tracks: [],
            trackCount: 0,
            bandcampUrl: url || ''
        } : null);
    }

    // Store actions
    const playTrack = useStore(state => state.playTrack);
    const addAlbumToQueue = useStore(state => state.addAlbumToQueue);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const playlists = useStore((state) => state.playlists);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const addAlbumToPlaylist = useStore((state) => state.addAlbumToPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    // Playlist Modal state
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const [isAlbumAction, setIsAlbumAction] = useState(false);

    useEffect(() => {
        if (offlineMode) {
            loadCachedAlbum()
                .then(cachedAlbum => {
                    if (cachedAlbum) {
                        setAlbum(cachedAlbum);
                    } else {
                        Alert.alert('Offline Mode', 'This album has no downloaded tracks.');
                    }
                })
                .catch((err: any) => console.error('Error loading cached album details:', err))
                .finally(() => setIsLoading(false));
            return;
        }

        const showAlbum = (details: Album) => {
            const finalArtist = (details.artist === 'Unknown Artist' && artist) ? artist : details.artist;
            const updatedTracks = (details.tracks || []).map(t => ({
                ...t,
                artist: (t.artist === 'Unknown Artist' || !t.artist) ? finalArtist : t.artist
            }));

            setAlbum({
                ...details,
                artist: finalArtist,
                tracks: updatedTracks
            });
        };

        const loadCachedFallback = async () => {
            const cachedAlbum = await loadCachedAlbum();
            if (cachedAlbum) {
                setAlbum(cachedAlbum);
            } else {
                Alert.alert('Error', 'Failed to load album details');
            }
        };

        if (!url) {
            loadCachedFallback().finally(() => setIsLoading(false));
            return;
        }

        // If in standalone mode, fetch via scraper
        if (mode === 'standalone') {
            // Loading state is set in the render phase above during URL/mode change
            const { mobileScraperService } = require('../services/MobileScraperService');

            mobileScraperService.getAlbumDetails(url)
                .then((details: Album | null) => {
                    if (details) {
                        showAlbum(details);
                    } else {
                        return loadCachedFallback();
                    }
                })
                .catch((err: any) => {
                    console.error('Error fetching album details:', err);
                    return loadCachedFallback();
                })
                .finally(() => {
                    setIsLoading(false);
                });
            return;
        }

        // Remote mode: use WebSocket
        const handleAlbumDetails = (details: Album) => {
            // Check if this details match the requested URL (or close enough)
            if (details && (details.bandcampUrl === url || (albumId && details.id === albumId))) {
                showAlbum(details);
                setIsLoading(false);
            }
        };

        // Subscribe
        const unsubscribe = webSocketService.on('album-details', handleAlbumDetails);

        // Request
        webSocketService.send('get-album', url);

        return () => {
            unsubscribe();
        };
    }, [url, mode, artist, albumId, offlineMode, loadCachedAlbum]);

    const handlePlayAll = () => {
        if (album && (url || offlineMode)) {
            useStore.getState().playAlbum(url || album.bandcampUrl, album);
        }
    };

    const handleTrackPress = (track: Track) => {
        playTrack(track);
    };

    const resolveAlbumArtist = (): Artist | null => {
        if (!album?.artist || album.artist === 'Unknown Artist') return null;

        const normalizeArtistName = (name: string) => `name-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const artist = artists.find(candidate =>
            candidate.id === album.artistId || normalizeArtistName(candidate.name) === normalizeArtistName(album.artist)
        );
        if (artist) return artist;

        const collectionItem = collection?.items?.find(item => {
            const data = item.type === 'album' ? item.album : item.track;
            return data && (
                (album.artistId && data.artistId === album.artistId)
                || normalizeArtistName(data.artist) === normalizeArtistName(album.artist)
            );
        });
        const data = collectionItem?.type === 'album' ? collectionItem.album : collectionItem?.track;
        if (!data) return null;

        return {
            id: data.artistId || normalizeArtistName(data.artist),
            name: data.artist,
            imageUrl: data.artworkUrl,
            bandcampUrl: data.bandcampUrl?.match(/^https?:\/\/[^/]+/)?.[0] || ''
        };
    };

    const handleArtistPress = () => {
        const artist = resolveAlbumArtist();
        if (!artist) return;

        router.push({
            pathname: '/artist/artist_detail' as any,
            params: {
                id: artist.id,
                name: artist.name,
                imageUrl: artist.imageUrl || album?.artworkUrl || '',
                bandcampUrl: artist.bandcampUrl || ''
            }
        });
    };

    const handleAlbumMenu = () => {
        if (!album) return;
        setActionSheetTitle(album.title);
        setActionSheetActions([
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: async () => {
                    if (album.bandcampUrl || offlineMode) {
                        await addAlbumToQueue(album.bandcampUrl, true, album.tracks);
                        Alert.alert('Success', 'Album added to play next');
                    }
                }
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: async () => {
                    if (album.bandcampUrl || offlineMode) {
                        await addAlbumToQueue(album.bandcampUrl, false, album.tracks);
                        Alert.alert('Success', 'Album added to queue');
                    }
                }
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
                onPress: () => {
                    setIsAlbumAction(true);
                    setPlaylistModalVisible(true);
                }
            },
            {
                text: "Cancel",
                style: "cancel",
                onPress: () => { }
            }
        ]);
        setActionSheetVisible(true);
    };

    const handleTrackLongPress = (track: Track) => {
        setActionSheetTitle(track.title);
        // Ensure track has artist if it was fixed in the album state
        const trackWithArtist = {
            ...track,
            artist: (track.artist && track.artist !== 'Unknown Artist') ? track.artist : (album?.artist || track.artist)
        };

        setActionSheetActions([
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: () => {
                    addTrackToQueue(trackWithArtist, true);
                }
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: () => {
                    addTrackToQueue(trackWithArtist, false);
                }
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
                onPress: () => {
                    setIsAlbumAction(false);
                    setSelectedTrack(trackWithArtist);
                    setPlaylistModalVisible(true);
                }
            },
            {
                text: "Cancel",
                style: "cancel",
                onPress: () => { }
            }
        ]);
        setActionSheetVisible(true);
    };

    const handleSelectPlaylist = (playlistId: string) => {
        if (isAlbumAction && album?.bandcampUrl) {
            // We pass the resolved album object which has correct artists
            addAlbumToPlaylist(playlistId, album.bandcampUrl, album);
            Alert.alert("Success", "Album added to playlist");
        } else if (!isAlbumAction && selectedTrack) {
            addTrackToPlaylist(playlistId, selectedTrack);
            Alert.alert("Success", "Track added to playlist");
        }

        setPlaylistModalVisible(false);
        setSelectedTrack(null);
        setIsAlbumAction(false);
    };

    const handleCreatePlaylist = (name: string) => {
        createPlaylist(name);
        setCreatePlaylistModalVisible(false);
    };

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.text, { color: colors.textSecondary }]}>Loading Album...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!album) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <Text style={[styles.text, { color: colors.textSecondary }]}>Album not found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const canPlayAlbum = album?.tracks.some(track => track.streamUrl || cachedTrackIds.has(track.id));

    const renderHeader = () => (
        <View style={styles.albumHeader}>
            <Image source={{ uri: album.artworkUrl }} style={[styles.artwork, { backgroundColor: colors.card }]} />
            <Text style={[styles.title, { color: colors.text }]}>{album.title}</Text>
            {album.isPreorder && (
                <View style={styles.preorderBadge}>
                    <Text style={styles.preorderBadgeText}>PRE-ORDER</Text>
                </View>
            )}
            {resolveAlbumArtist() ? <TouchableOpacity
                onPress={handleArtistPress}
                accessibilityRole="link"
                accessibilityLabel={`View artist ${album.artist}`}
            >
                <Text style={[styles.artist, { color: colors.accent }]}>
                    {album.artist}
                </Text>
            </TouchableOpacity> : (
                <Text style={[styles.artist, { color: colors.accent }]}>{album.artist}</Text>
            )}
            <TouchableOpacity
                style={[
                    styles.playButton,
                    { backgroundColor: colors.accent },
                    !canPlayAlbum && { opacity: 0.5 }
                ]}
                onPress={handlePlayAll}
                disabled={!canPlayAlbum}
            >
                <Play size={20} color="#fff" fill="#fff" />
                <Text style={[styles.playButtonText, { color: '#fff' }]}>Play Album</Text>
            </TouchableOpacity>
        </View>
    );

    const renderTrack = ({ item, index }: { item: Track, index: number }) => {
        const isUnreleased = !item.streamUrl && !cachedTrackIds.has(item.id);
        return (
            <TouchableOpacity
                style={[
                    styles.trackItem,
                    { borderBottomColor: colors.border },
                    isUnreleased && { opacity: 0.5 }
                ]}
                onPress={() => !isUnreleased && handleTrackPress(item)}
                onLongPress={() => !isUnreleased && handleTrackLongPress(item)}
                delayLongPress={500}
                activeOpacity={isUnreleased ? 1 : 0.7}
            >
                <Text style={[styles.trackNumber, { color: colors.textSecondary }]}>{index + 1}</Text>
                <View style={styles.trackInfo}>
                    <Text style={[styles.trackTitle, { color: isUnreleased ? colors.textSecondary : colors.text }]}>
                        {item.title}
                    </Text>
                    <Text style={[styles.trackDuration, { color: colors.textSecondary }]}>
                        {isUnreleased ? 'Unreleased' : `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                    testID="back-button"
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Album</Text>
                <TouchableOpacity
                    onPress={handleAlbumMenu}
                    style={styles.backButton}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                    <MoreVertical size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={album.tracks}
                renderItem={renderTrack}
                keyExtractor={(item, index) => item.id || String(index)}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.listContent}
            />

            <ActionSheet
                visible={actionSheetVisible}
                onClose={() => setActionSheetVisible(false)}
                title={actionSheetTitle}
                actions={actionSheetActions}
            />

            <PlaylistSelectionModal
                visible={playlistModalVisible}
                onClose={() => setPlaylistModalVisible(false)}
                onSelect={handleSelectPlaylist}
                onCreateNew={() => setCreatePlaylistModalVisible(true)}
                playlists={playlists}
            />

            <InputModal
                visible={createPlaylistModalVisible}
                title="Create Playlist"
                placeholder="Playlist Name"
                onClose={() => setCreatePlaylistModalVisible(false)}
                onSubmit={handleCreatePlaylist}
                submitLabel="Create"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: '#888',
        marginTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    listContent: {
        paddingBottom: 24,
    },
    albumHeader: {
        alignItems: 'center',
        padding: 24,
        paddingTop: 0,
    },
    artwork: {
        width: 200,
        height: 200,
        borderRadius: 8,
        marginBottom: 16,
        backgroundColor: '#333',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 6,
    },
    preorderBadge: {
        backgroundColor: 'rgba(230, 160, 40, 0.2)',
        borderColor: 'rgba(230, 160, 40, 0.4)',
        borderWidth: 1,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 4,
        marginBottom: 8,
    },
    preorderBadgeText: {
        color: '#e6a028',
        fontSize: 10,
        fontWeight: 'bold',
    },
    artist: {
        fontSize: 18,
        color: '#888',
        textAlign: 'center',
        marginBottom: 24,
    },
    playButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 32,
    },
    playButtonText: {
        color: '#000',
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 16,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    trackNumber: {
        width: 32,
        color: '#666',
        fontSize: 14,
    },
    trackInfo: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    trackTitle: {
        color: '#fff',
        fontSize: 16,
        flex: 1,
        marginRight: 8,
    },
    trackDuration: {
        color: '#666',
        fontSize: 14,
        fontVariant: ['tabular-nums'],
    },
    label: {
        fontSize: 14,
        color: '#888',
        fontWeight: 'normal',
    },
});
