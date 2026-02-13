import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { CollectionItem } from '@shared/types';
import { RefreshCw, MoreVertical, Search } from 'lucide-react-native';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { webSocketService } from '../../services/WebSocketService';
import { router } from 'expo-router';

export default function CollectionScreen() {
    const collection = useStore((state) => state.collection);
    const playAlbum = useStore((state) => state.playAlbum);
    const playTrack = useStore((state) => state.playTrack);
    const disconnect = useStore((state) => state.disconnect);
    const playlists = useStore((state) => state.playlists);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const addAlbumToQueue = useStore((state) => state.addAlbumToQueue);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const addAlbumToPlaylist = useStore((state) => state.addAlbumToPlaylist);
    const loadMoreCollection = useStore((state) => state.loadMoreCollection);
    const isCollectionLoading = useStore((state) => state.isCollectionLoading);

    const [searchQuery, setSearchQuery] = useState('');
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const handleLongPress = (item: CollectionItem) => {
        const title = item.type === 'album' ? item.album?.title : item.track?.title;
        setActionSheetTitle(title || 'Item');
        setActionSheetActions([
            {
                text: "Play Next",
                onPress: () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        // Pass tracks if available (optimistic), otherwise just URL (server fetch)
                        addAlbumToQueue(item.album.bandcampUrl, true, item.album.tracks);
                    }
                    else if (item.type === 'track' && item.track) addTrackToQueue(item.track, true);
                }
            },
            {
                text: "Add to Queue",
                onPress: () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks);
                    }
                    else if (item.type === 'track' && item.track) addTrackToQueue(item.track, false);
                }
            },
            {
                text: "Add to Playlist",
                onPress: () => {
                    setSelectedItem(item);
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
        if (!selectedItem) return;

        if (selectedItem.type === 'album' && selectedItem.album?.bandcampUrl) {
            addAlbumToPlaylist(playlistId, selectedItem.album.bandcampUrl);
        } else if (selectedItem.type === 'track' && selectedItem.track) {
            addTrackToPlaylist(playlistId, selectedItem.track);
        }

        setPlaylistModalVisible(false);
        setSelectedItem(null);
        Alert.alert("Success", "Added to playlist");
    };

    // Server-side filtered collection is now in store
    const collectionData = useStore((state) => state.collection);
    // If we want to be safe, defaulting to empty array
    const collectionItems = collectionData?.items || [];

    const handleRefresh = () => {
        if (webSocketService) {
            webSocketService.send('get-collection');
        }
    };

    const handlePlayItem = (item: CollectionItem) => {
        if (item.type === 'album' && item.album) {
            // Always navigate to album detail view
            if (item.album.bandcampUrl) {
                router.push({ pathname: '/album_detail', params: { url: item.album.bandcampUrl } });
                return;
            }
        } else if (item.type === 'track' && item.track) {
            // Use playAlbum even for tracks if they have a URL, this ensures queue is updated/replaced
            // on the desktop side, matching web remote behavior
            if (item.track.bandcampUrl) {
                playAlbum(item.track.bandcampUrl);
            } else {
                playTrack(item.track);
            }
        }
    };

    const handleDisconnect = () => {
        setActionSheetTitle("Disconnect");
        setActionSheetActions([
            {
                text: "Disconnect",
                style: "destructive",
                onPress: () => {
                    disconnect();
                    router.replace('/');
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

    const renderItem = ({ item }: { item: CollectionItem }) => {
        let artworkUrl, title, artist;

        if (item.type === 'album' && item.album) {
            artworkUrl = item.album.artworkUrl;
            title = item.album.title;
            artist = item.album.artist;
        } else if (item.type === 'track' && item.track) {
            artworkUrl = item.track.artworkUrl;
            title = item.track.title;
            artist = item.track.artist;
        } else {
            return null;
        }

        return (
            <TouchableOpacity
                style={styles.item}
                onPress={() => handlePlayItem(item)}
                onLongPress={() => handleLongPress(item)}
                delayLongPress={500}
                testID={`item-${item.id}`}
            >
                {artworkUrl ? (
                    <Image source={{ uri: artworkUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork]}>
                        <Text style={styles.placeholderText}>♪</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
                    <Text style={styles.itemArtist} numberOfLines={1}>{artist}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const refreshCollection = useStore((state) => state.refreshCollection);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshCollection(true, searchQuery, true); // Reset + Force Server Fetch (Pull-to-refresh)
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshCollection, searchQuery]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            // Trigger server-side search (Reset + Use Cache)
            refreshCollection(true, searchQuery, false);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, refreshCollection]);

    if (!collection) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#0896afff" />
                    <Text style={styles.text}>Loading Collection...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Collection</Text>
            </View>

            <View style={styles.searchContainer}>
                <Search size={20} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search collection..."
                    placeholderTextColor="#888"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            <FlatList
                testID="collection-list"
                data={collectionItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={styles.columnWrapper}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0896afff" />
                }
                onEndReached={() => {
                    // Load more works for search too now!
                    loadMoreCollection();
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    isCollectionLoading && !refreshing ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#0896afff" />
                        </View>
                    ) : null
                )}
            />
            <PlaylistSelectionModal
                visible={playlistModalVisible}
                onClose={() => setPlaylistModalVisible(false)}
                onSelect={handleSelectPlaylist}
                playlists={playlists}
            />
            <ActionSheet
                visible={actionSheetVisible}
                onClose={() => setActionSheetVisible(false)}
                title={actionSheetTitle}
                actions={actionSheetActions}
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
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        margin: 16,
        marginTop: 0,
        paddingHorizontal: 12,
        borderRadius: 8,
        height: 48,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        height: '100%',
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 16,
    },
    iconButton: {
        padding: 4,
    },
    listContent: {
        padding: 8,
    },
    columnWrapper: {
        justifyContent: 'space-between',
    },
    item: {
        width: '48%',
        marginBottom: 16,
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        overflow: 'hidden',
    },
    artwork: {
        width: '100%',
        aspectRatio: 1,
    },
    placeholderArtwork: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#666',
        fontSize: 24,
    },
    itemInfo: {
        padding: 8,
    },
    itemTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemArtist: {
        color: '#888',
        fontSize: 12,
    },
});
