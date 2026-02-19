import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { CollectionItem } from '@shared/types';
import { RefreshCw, MoreVertical } from 'lucide-react-native';
import { SearchBar } from '../../components/SearchBar';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { CollectionGridItem } from '../../components/CollectionGridItem'; // Import new component
import { webSocketService } from '../../services/WebSocketService';
import { router } from 'expo-router';
import { useTheme } from '../../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = 3;
const LIST_PADDING = 12;
const GAP = 12;
// Calculate width: (Screen - (Padding * 2) - (Gap * (Cols - 1))) / Cols
const ITEM_WIDTH = (SCREEN_WIDTH - (LIST_PADDING * 2) - (GAP * (COLUMN_COUNT - 1))) / COLUMN_COUNT;

export default function CollectionScreen() {
    const colors = useTheme();
    const collection = useStore((state) => state.collection);
    const collectionError = useStore((state) => state.collectionError);
    // ... existing hooks ...
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
    const insets = useSafeAreaInsets();

    const [searchQuery, setSearchQuery] = useState('');
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    // ... handlers (handleLongPress, handleSelectPlaylist, handleRefresh, handlePlayItem, handleDisconnect) same as before ... 

    const handleLongPress = (item: CollectionItem) => {
        // ... same implementation ...
        const title = item.type === 'album' ? item.album?.title : item.track?.title;
        setActionSheetTitle(title || 'Item');
        setActionSheetActions([
            {
                text: "Play Next",
                onPress: () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
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

    const collectionData = useStore((state) => state.collection);
    const collectionItems = collectionData?.items || [];

    const handleRefresh = () => {
        if (webSocketService) {
            webSocketService.send('get-collection');
        }
    };

    const handlePlayItem = (item: CollectionItem) => {
        if (item.type === 'album' && item.album) {
            if (item.album.bandcampUrl) {
                router.push({
                    pathname: '/album_detail',
                    params: {
                        url: item.album.bandcampUrl,
                        artist: item.album.artist,
                        title: item.album.title,
                        artworkUrl: item.album.artworkUrl
                    }
                });
                return;
            }
        } else if (item.type === 'track' && item.track) {
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
        return (
            <CollectionGridItem
                item={item}
                onPress={handlePlayItem}
                onLongPress={handleLongPress}
                width={ITEM_WIDTH}
                testID={`item-${item.id}`}
            />
        );
    };

    const refreshCollection = useStore((state) => state.refreshCollection);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshCollection(true, searchQuery, true);
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshCollection, searchQuery]);

    useEffect(() => {
        // Skip refreshing if we already have items and no search query (already handled by store initialization)
        if (!searchQuery && collection && collection.items.length > 0) return;

        const timer = setTimeout(() => {
            refreshCollection(true, searchQuery, false);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, refreshCollection, collection]);

    if (!collection) {
        if (collectionError) {
            return (
                <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
                    <View style={styles.center}>
                        <Text style={[styles.text, { color: 'red', marginBottom: 16 }]}>Error: {collectionError}</Text>
                        <TouchableOpacity
                            onPress={() => refreshCollection(true, searchQuery, true)}
                            style={{ padding: 12, backgroundColor: colors.accent, borderRadius: 8 }}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.text, { color: colors.textSecondary }]}>Loading Collection...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search collection..."
            />
            {collectionError && (
                <TouchableOpacity onPress={() => refreshCollection(true, searchQuery, true)} style={{ padding: 8, backgroundColor: '#330000' }}>
                    <Text style={{ color: 'red', textAlign: 'center' }}>Sync Error: {collectionError}. Tap to retry.</Text>
                </TouchableOpacity>
            )}

            <FlatList
                testID="collection-list"
                data={collectionItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={COLUMN_COUNT}
                key={COLUMN_COUNT} // Force re-render when columns change
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={styles.columnWrapper}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
                onEndReached={() => {
                    loadMoreCollection();
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    isCollectionLoading && !refreshing ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={colors.accent} />
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
        </View>
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
    listContent: {
        padding: LIST_PADDING,
    },
    columnWrapper: {
        gap: GAP,
    },
    // Removed old item styles as they are now in CollectionGridItem or unused
});
