import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { webSocketService } from '../services/WebSocketService';
import { Album, Track } from '@shared/types';
import { useStore } from '../store';
import { ArrowLeft, Play, MoreVertical, ListEnd, ListPlus, ListMusic } from 'lucide-react-native';
import { ActionSheet, Action } from '../components/ActionSheet';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { InputModal } from '../components/InputModal';
import { useTheme } from '../theme';

export default function AlbumDetailScreen() {
    const colors = useTheme();
    const { url, artist, title, artworkUrl } = useLocalSearchParams<{ url: string, artist?: string, title?: string, artworkUrl?: string }>();
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
    const mode = useStore(state => state.mode);
    const [lastMode, setLastMode] = useState(mode);

    // Reset state when URL or mode changes (runs during render to avoid cascading updates)
    if (url !== lastUrl || mode !== lastMode) {
        setLastUrl(url);
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
        if (!url) return;

        // If in standalone mode, fetch via scraper
        if (mode === 'standalone') {
            // Loading state is set in the render phase above during URL/mode change
            const { mobileScraperService } = require('../services/MobileScraperService');

            mobileScraperService.getAlbumDetails(url)
                .then((details: Album | null) => {
                    if (details) {
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
                    } else {
                        Alert.alert('Error', 'Failed to load album details');
                    }
                })
                .catch((err: any) => {
                    console.error('Error fetching album details:', err);
                    Alert.alert('Error', 'Failed to load album details');
                })
                .finally(() => {
                    setIsLoading(false);
                });
            return;
        }

        // Remote mode: use WebSocket
        const handleAlbumDetails = (details: Album) => {
            // Check if this details match the requested URL (or close enough)
            if (details.bandcampUrl === url) {
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
    }, [url, mode, artist]);

    const handlePlayAll = () => {
        if (url && album) {
            useStore.getState().playAlbum(url, album);
        }
    };

    const handleTrackPress = (track: Track) => {
        playTrack(track);
    };

    const handleAlbumMenu = () => {
        if (!album) return;
        setActionSheetTitle(album.title);
        setActionSheetActions([
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: async () => {
                    if (album.bandcampUrl) {
                        await addAlbumToQueue(album.bandcampUrl, true, album.tracks);
                        Alert.alert('Success', 'Album added to play next');
                    }
                }
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: async () => {
                    if (album.bandcampUrl) {
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

    const renderHeader = () => (
        <View style={styles.albumHeader}>
            <Image source={{ uri: album.artworkUrl }} style={[styles.artwork, { backgroundColor: colors.card }]} />
            <Text style={[styles.title, { color: colors.text }]}>{album.title}</Text>
            <Text style={[styles.artist, { color: colors.accent }]}>{album.artist}</Text>
            <TouchableOpacity style={[styles.playButton, { backgroundColor: colors.accent }]} onPress={handlePlayAll}>
                <Play size={20} color="#fff" fill="#fff" />
                <Text style={[styles.playButtonText, { color: '#fff' }]}>Play Album</Text>
            </TouchableOpacity>
        </View>
    );

    const renderTrack = ({ item, index }: { item: Track, index: number }) => (
        <TouchableOpacity
            style={[styles.trackItem, { borderBottomColor: colors.border }]}
            onPress={() => handleTrackPress(item)}
            onLongPress={() => handleTrackLongPress(item)}
            delayLongPress={500}
        >
            <Text style={[styles.trackNumber, { color: colors.textSecondary }]}>{index + 1}</Text>
            <View style={styles.trackInfo}>
                <Text style={[styles.trackTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.trackDuration, { color: colors.textSecondary }]}>{Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}</Text>
            </View>
        </TouchableOpacity>
    );

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
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 8,
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
});
