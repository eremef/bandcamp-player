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
import { ListEnd, ListPlus, ListMusic, Play, MoreHorizontal, ArrowUpDown, Calendar, SlidersHorizontal, Disc, Music, Heart, Drum, ArrowUp, ArrowDown, Quote } from 'lucide-react-native';
import { sortCollectionItems } from '@shared/utils/collection-utils';

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
    const clearQueue = useStore((state) => state.clearQueue);

    // Sort & Dedupe state from store
    const collectionSortKey = useStore((state) => state.collectionSortKey);
    const collectionSortDirection = useStore((state) => state.collectionSortDirection);
    const dedupeEnabled = useStore((state) => state.dedupeEnabled);
    const setCollectionSortKey = useStore((state) => state.setCollectionSortKey);
    const setCollectionSortDirection = useStore((state) => state.setCollectionSortDirection);
    const collectionFilterAlbums = useStore((state) => state.collectionFilterAlbums);
    const collectionFilterTracks = useStore((state) => state.collectionFilterTracks);
    const collectionFilterWishlist = useStore((state) => state.collectionFilterWishlist);
    const setCollectionFilterAlbums = useStore((state) => state.setCollectionFilterAlbums);
    const setCollectionFilterTracks = useStore((state) => state.setCollectionFilterTracks);
    const setCollectionFilterWishlist = useStore((state) => state.setCollectionFilterWishlist);
    const includeWishlistInCollection = useStore((state) => state.includeWishlistInCollection);

    const insets = useSafeAreaInsets();

    const [searchQuery, setSearchQuery] = useState('');
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

    // Per-item ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    // Bulk ActionSheet state
    const [bulkActionSheetVisible, setBulkActionSheetVisible] = useState(false);
    const [bulkPlaylistModalVisible, setBulkPlaylistModalVisible] = useState(false);

    // Sort & Filter ActionSheet state
    const [sortSheetVisible, setSortSheetVisible] = useState(false);
    const [filterSheetVisible, setFilterSheetVisible] = useState(false);

    const hasActiveFilter = !collectionFilterAlbums || !collectionFilterTracks || (includeWishlistInCollection && !collectionFilterWishlist);

    const handleLongPress = useCallback((item: CollectionItem) => {
        const title = item.type === 'album' ? item.album?.title : item.track?.title;
        const artist = item.type === 'album' ? item.album?.artist : item.track?.artist;
        setActionSheetTitle(title + ' - ' + artist || 'Item');
        setActionSheetActions([
            {
                text: "Play Now",
                icon: Play,
                onPress: async () => {
                    clearQueue(false);
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
                    } else if (item.type === 'track' && item.track) {
                        await addTrackToQueue(item.track, false);
                    }
                }
            },
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: async () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        await addAlbumToQueue(item.album.bandcampUrl, true, item.album.tracks, item.album.artist);
                    }
                    else if (item.type === 'track' && item.track) {
                        await addTrackToQueue(item.track, true);
                    }
                }
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: async () => {
                    if (item.type === 'album' && item.album?.bandcampUrl) {
                        await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
                    }
                    else if (item.type === 'track' && item.track) {
                        await addTrackToQueue(item.track, false);
                    }
                }
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
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
    }, [addAlbumToQueue, addTrackToQueue, clearQueue]);

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
    }, [createPlaylist]);

    const collectionItems = useMemo(() => {
        let items = collection?.items || [];

        // Apply filters
        items = items.filter(item => {
            if (item.isWishlist) return collectionFilterWishlist;
            if (item.type === 'album') return collectionFilterAlbums;
            if (item.type === 'track') return collectionFilterTracks;
            return true;
        });

        // Use the unified sorting function which handles stable deduplication internally
        return sortCollectionItems(
            items,
            collectionSortKey,
            collectionSortDirection,
            dedupeEnabled
        );
    }, [collection?.items, dedupeEnabled, collectionSortKey, collectionSortDirection, collectionFilterAlbums, collectionFilterTracks, collectionFilterWishlist]);

    const sortActions: Action[] = useMemo(() => [
        { text: "Sort By", type: "label", onPress: () => { } },
        {
            text: "Purchase Date",
            icon: Calendar,
            checked: collectionSortKey === 'default',
            onPress: () => setCollectionSortKey('default')
        },
        {
            text: "Artist Name",
            icon: Drum,
            checked: collectionSortKey === 'artist',
            onPress: () => setCollectionSortKey('artist')
        },
        {
            text: "Album Title",
            icon: Quote,
            checked: collectionSortKey === 'album',
            onPress: () => setCollectionSortKey('album')
        },
        { text: "", type: "separator", onPress: () => { } },
        { text: "Order", type: "label", onPress: () => { } },
        {
            text: "Ascending (A-Z)",
            icon: ArrowUp,
            checked: collectionSortDirection === 'asc',
            onPress: () => setCollectionSortDirection('asc')
        },
        {
            text: "Descending (Z-A)",
            icon: ArrowDown,
            checked: collectionSortDirection === 'desc',
            onPress: () => setCollectionSortDirection('desc')
        },
        {
            text: "Cancel",
            style: "cancel",
            onPress: () => { }
        }
    ], [collectionSortKey, collectionSortDirection, setCollectionSortKey, setCollectionSortDirection]);

    const filterActions: Action[] = useMemo(() => {
        const baseActions: Action[] = [
            { text: "Show", type: "label", onPress: () => { } },
            {
                text: "Albums",
                icon: Disc,
                checked: collectionFilterAlbums,
                keepOpen: true,
                onPress: () => setCollectionFilterAlbums(!collectionFilterAlbums)
            },
            {
                text: "Tracks",
                icon: Music,
                checked: collectionFilterTracks,
                keepOpen: true,
                onPress: () => setCollectionFilterTracks(!collectionFilterTracks)
            }
        ];

        if (includeWishlistInCollection) {
            baseActions.push({
                text: "Wishlist",
                icon: Heart,
                checked: collectionFilterWishlist,
                keepOpen: true,
                onPress: () => setCollectionFilterWishlist(!collectionFilterWishlist)
            });
        }

        baseActions.push({
            text: "Cancel",
            style: "cancel",
            onPress: () => { }
        });

        return baseActions;
    }, [collectionFilterAlbums, collectionFilterTracks, collectionFilterWishlist, setCollectionFilterAlbums, setCollectionFilterTracks, setCollectionFilterWishlist, includeWishlistInCollection]);

    // Bulk action handlers
    const handleBulkPlayNow = useCallback(async () => {
        clearQueue(false);
        for (const item of collectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, false);
            }
        }
    }, [collectionItems, clearQueue, addAlbumToQueue, addTrackToQueue]);

    const handleBulkPlayNext = useCallback(async () => {
        for (const item of collectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, true, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, true);
            }
        }
    }, [collectionItems, addAlbumToQueue, addTrackToQueue]);

    const handleBulkAddToQueue = useCallback(async () => {
        for (const item of collectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, false);
            }
        }
    }, [collectionItems, addAlbumToQueue, addTrackToQueue]);

    const handleBulkSelectPlaylist = useCallback((playlistId: string) => {
        for (const item of collectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                addAlbumToPlaylist(playlistId, item.album.bandcampUrl);
            } else if (item.type === 'track' && item.track) {
                addTrackToPlaylist(playlistId, item.track);
            }
        }
        setBulkPlaylistModalVisible(false);
        Alert.alert("Success", `Added ${collectionItems.length} items to playlist`);
    }, [collectionItems, addAlbumToPlaylist, addTrackToPlaylist]);

    const bulkActions: Action[] = useMemo(() => [
        { text: "Play Now", icon: Play, onPress: handleBulkPlayNow },
        { text: "Play Next", icon: ListEnd, onPress: handleBulkPlayNext },
        { text: "Add to Queue", icon: ListPlus, onPress: handleBulkAddToQueue },
        { text: "Add to Playlist", icon: ListMusic, onPress: () => setBulkPlaylistModalVisible(true) },
        { text: "Cancel", style: "cancel", onPress: () => { } },
    ], [handleBulkPlayNow, handleBulkPlayNext, handleBulkAddToQueue]);

    const handlePlayItem = useCallback(async (item: CollectionItem) => {
        if (item.type === 'album' && item.album) {
            if (item.album.bandcampUrl) {
                router.push({
                    pathname: '/album_detail',
                    params: {
                        url: item.album.bandcampUrl,
                        artist: item.album.artist,
                        title: item.album.title,
                        artworkUrl: item.album.artworkUrl,
                    }
                });
                return;
            }
        } else if (item.type === 'track' && item.track) {
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
            setTimeout(() => { setRefreshing(false); }, 1500);
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
        if (searchQuery === storeSearchQuery && collection) return;
        const timer = setTimeout(() => {
            refreshCollection(true, searchQuery, false);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, storeSearchQuery, refreshCollection, collection]);

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
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <Text style={[styles.title, { color: colors.text }]}>Collection</Text>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity
                            testID="sort-button"
                            onPress={() => setSortSheetVisible(true)}
                            style={[
                                styles.headerButton,
                                { backgroundColor: colors.border + '40' }
                            ]}
                        >
                            <ArrowUpDown size={14} color={colors.textSecondary} />
                            <Text style={[styles.headerButtonText, { color: colors.textSecondary }]}>
                                {collectionSortKey === 'default' ? 'Date' : collectionSortKey === 'artist' ? 'Artist' : 'Album'}
                                {` (${collectionSortDirection === 'asc' ? 'A-Z' : 'Z-A'})`}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setFilterSheetVisible(true)}
                            style={[
                                styles.headerButton,
                                { backgroundColor: colors.border + '40' },
                                hasActiveFilter && { borderColor: colors.accent, borderWidth: 1 },
                            ]}
                        >
                            <SlidersHorizontal size={14} color={hasActiveFilter ? colors.accent : colors.textSecondary} />
                            {hasActiveFilter && <View style={[styles.filterDot, { backgroundColor: colors.accent }]} />}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setBulkActionSheetVisible(true)}
                            style={styles.iconButton}
                        >
                            <MoreHorizontal size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                <SearchBar
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search collection..."
                />
            </View>

            <FlatList
                testID="collection-list"
                data={collectionItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={COLUMN_COUNT}
                key={COLUMN_COUNT}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={styles.columnWrapper}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={10}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
                onEndReached={() => { loadMoreCollection(); }}
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
            <ActionSheet
                visible={bulkActionSheetVisible}
                onClose={() => setBulkActionSheetVisible(false)}
                actions={bulkActions}
                title="Bulk Actions"
            />
            <ActionSheet
                visible={sortSheetVisible}
                onClose={() => setSortSheetVisible(false)}
                actions={sortActions}
                title="Sort Options"
            />
            <ActionSheet
                visible={filterSheetVisible}
                onClose={() => setFilterSheetVisible(false)}
                actions={filterActions}
                title="Filter Collection"
            />
            <PlaylistSelectionModal
                visible={bulkPlaylistModalVisible}
                onClose={() => setBulkPlaylistModalVisible(false)}
                onSelect={handleBulkSelectPlaylist}
                onCreateNew={() => setCreatePlaylistModalVisible(true)}
                playlists={playlists}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        padding: 8,
        marginLeft: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    headerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginLeft: 8,
    },
    headerButtonText: {
        fontSize: 12,
        fontWeight: '600',
    },
    header: {
        paddingHorizontal: 16,
        paddingBottom: 16,
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
    filterDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginLeft: 2,
    },
});
