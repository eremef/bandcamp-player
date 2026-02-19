import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { CollectionItem } from '@shared/types';
import { SearchBar } from '../../components/SearchBar';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { CollectionGridItem } from '../../components/CollectionGridItem';
import { InputModal } from '../../components/InputModal';
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
    const playAlbum = useStore((state) => state.playAlbum);
    const playTrack = useStore((state) => state.playTrack);
    const playlists = useStore((state) => state.playlists);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const addAlbumToQueue = useStore((state) => state.addAlbumToQueue);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const addAlbumToPlaylist = useStore((state) => state.addAlbumToPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);
    const loadMoreCollection = useStore((state) => state.loadMoreCollection);
    const isCollectionLoading = useStore((state) => state.isCollectionLoading);
    const collectionLoadingStatus = useStore((state) => state.collectionLoadingStatus);
    const storeSearchQuery = useStore((state) => state.searchQuery);
    const insets = useSafeAreaInsets();

    const [searchQuery, setSearchQuery] = useState('');
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const handleLongPress = useCallback((item: CollectionItem) => {
        const title = item.type === 'album' ? item.album?.title : item.track?.title;
        setActionSheetTitle(title || 'Item');
        setActionSheetActions([
            {
                text: "Play Next",
                onPress: async () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        addAlbumToQueue(item.album.bandcampUrl, true, item.album.tracks);
                    }
                    else if (item.type === 'track' && item.track) {
                        await addTrackToQueue(item.track, true);
                    }
                }
            },
            {
                text: "Add to Queue",
                onPress: async () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks);
                    }
                    else if (item.type === 'track' && item.track) {
                        await addTrackToQueue(item.track, false);
                    }
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
    }, [addAlbumToQueue, addTrackToQueue]);

    const handleSelectPlaylist = useCallback((playlistId: string) => {
        if (!selectedItem) return;

        if (selectedItem.type === 'album' && selectedItem.album?.bandcampUrl) {
            addAlbumToPlaylist(playlistId, selectedItem.album.bandcampUrl);
        } else if (selectedItem.type === 'track' && selectedItem.track) {
            addTrackToPlaylist(playlistId, selectedItem.track);
        }

        setPlaylistModalVisible(false);
        setSelectedItem(null);
        Alert.alert("Success", "Added to playlist");
    }, [selectedItem, addAlbumToPlaylist, addTrackToPlaylist]);

    const handleCreatePlaylist = useCallback((name: string) => {
        createPlaylist(name);
        setCreatePlaylistModalVisible(false);
        // After creating, the playlists in store will update.
        // We stay in the PlaylistSelectionModal so user can select the newly created playlist.
    }, [createPlaylist]);

    const collectionItems = useMemo(() => collection?.items || [], [collection?.items]);


    const handlePlayItem = useCallback(async (item: CollectionItem) => {
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
            // For tracks in collection, we already have the artist name. 
            // playTrack handles details resolution if needed while preserving the artist.
            await playTrack(item.track);
        }
    }, [playTrack]);


    const renderItem = useCallback(({ item }: { item: CollectionItem }) => {
        return (
            <CollectionGridItem
                item={item}
                onPress={handlePlayItem}
                onLongPress={handleLongPress}
                width={ITEM_WIDTH}
                testID={`item-${item.id}`}
            />
        );
    }, [handlePlayItem, handleLongPress]);

    const refreshCollection = useStore((state) => state.refreshCollection);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        const totalCount = collection?.totalCount || 0;

        const performRefresh = () => {
            setRefreshing(true);
            refreshCollection(true, searchQuery, true);
            setTimeout(() => {
                setRefreshing(false);
            }, 1500);
        };

        if (totalCount > 1000) {
            Alert.alert(
                "Large Collection Sync",
                `Your collection has ${totalCount} items. A full synchronization may take a minute. Do you want to proceed?`,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Proceed", onPress: performRefresh }
                ]
            );
        } else {
            performRefresh();
        }
    }, [refreshCollection, searchQuery, collection?.totalCount]);

    useEffect(() => {
        // Skip refreshing if we already have items and the search query hasn't changed
        if (searchQuery === storeSearchQuery && collection && collection.items.length > 0) return;

        const timer = setTimeout(() => {
            refreshCollection(true, searchQuery, false);
        }, 500);

        return () => clearTimeout(timer);
        // collection intentionally omitted to avoid infinite reload loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, storeSearchQuery, refreshCollection]);

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
                    <View style={[styles.loadingIconContainer, { backgroundColor: colors.card }]}>
                        <ActivityIndicator size="large" color={colors.accent} />
                    </View>
                    <Text style={[styles.loadingTitle, { color: colors.text }]}>Loading Your Music</Text>
                    <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>Syncing with Bandcamp...</Text>

                    {collectionLoadingStatus && (
                        <View style={[styles.statusBadge, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
                            <Text style={[styles.statusText, { color: colors.accent }]}>
                                {collectionLoadingStatus}
                            </Text>
                        </View>
                    )}
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
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={10}
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
    loadingIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    loadingTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    loadingSubtitle: {
        fontSize: 14,
        marginBottom: 32,
    },
    statusBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginTop: 10,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    listContent: {
        padding: LIST_PADDING,
    },
    columnWrapper: {
        gap: GAP,
    },
});
