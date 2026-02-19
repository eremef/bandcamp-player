import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { webSocketService } from '../services/WebSocketService';
import { Album, Track } from '@shared/types';
import { useStore } from '../store';
import { ArrowLeft, Play, MoreVertical } from 'lucide-react-native';
import { ActionSheet, Action } from '../components/ActionSheet';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { useTheme } from '../theme';

export default function AlbumDetailScreen() {
    const colors = useTheme();
    const { url } = useLocalSearchParams<{ url: string }>();
    const router = useRouter();
    const [album, setAlbum] = useState<Album | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUrl, setLastUrl] = useState(url);

    // Reset state when URL changes (runs during render to avoid cascading updates)
    if (url !== lastUrl) {
        setLastUrl(url);
        setIsLoading(true);
        setAlbum(null);
    }

    // Store actions
    const playTrack = useStore(state => state.playTrack);
    const addAlbumToQueue = useStore(state => state.addAlbumToQueue);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const playlists = useStore((state) => state.playlists);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const addAlbumToPlaylist = useStore((state) => state.addAlbumToPlaylist);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    // Playlist Modal state
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const [isAlbumAction, setIsAlbumAction] = useState(false);

    useEffect(() => {
        if (!url) return;

        // If in standalone mode, fetch via scraper
        const store = useStore.getState();
        if (store.mode === 'standalone') {
            setIsLoading(true);
            const { mobileScraperService } = require('../services/MobileScraperService');

            mobileScraperService.getAlbumDetails(url)
                .then((details: Album | null) => {
                    if (details) {
                        setAlbum(details);
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
                setAlbum(details);
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
    }, [url]);

    const handlePlayAll = () => {
        if (url) {
            useStore.getState().playAlbum(url);
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
                onPress: () => {
                    if (album.bandcampUrl) {
                        addAlbumToQueue(album.bandcampUrl, true, album.tracks);
                        Alert.alert('Success', 'Album added to play next');
                    }
                }
            },
            {
                text: "Add to Queue",
                onPress: () => {
                    if (album.bandcampUrl) {
                        addAlbumToQueue(album.bandcampUrl, false, album.tracks);
                        Alert.alert('Success', 'Album added to queue');
                    }
                }
            },
            {
                text: "Add to Playlist",
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
        setActionSheetActions([
            {
                text: "Play Next",
                onPress: () => {
                    addTrackToQueue(track, true);
                }
            },
            {
                text: "Add to Queue",
                onPress: () => {
                    addTrackToQueue(track, false);
                }
            },
            {
                text: "Add to Playlist",
                onPress: () => {
                    setIsAlbumAction(false);
                    setSelectedTrack(track);
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
            addAlbumToPlaylist(playlistId, album.bandcampUrl);
            Alert.alert("Success", "Album added to playlist");
        } else if (!isAlbumAction && selectedTrack) {
            addTrackToPlaylist(playlistId, selectedTrack);
            Alert.alert("Success", "Track added to playlist");
        }

        setPlaylistModalVisible(false);
        setSelectedTrack(null);
        setIsAlbumAction(false);
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
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Album</Text>
                <TouchableOpacity onPress={handleAlbumMenu} style={styles.backButton}>
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
                playlists={playlists}
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
