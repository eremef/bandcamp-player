import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Image, Alert, Dimensions } from 'react-native';
import { useStore } from '../../store';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Artist, CollectionItem } from '@shared/types';
import { SearchBar } from '../../components/SearchBar';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';
import { InputModal } from '../../components/InputModal';
import { Play, MoreHorizontal, ListEnd, ListPlus, ListMusic } from 'lucide-react-native';

const COLUMN_COUNT = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - 40) / COLUMN_COUNT; // 20 padding on each side

import { useFocusEffect } from 'expo-router';

export default function ArtistsScreen() {
    const { artists, refreshArtists } = useStore();
    const colors = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const getArtistsBulkItems = useStore((state) => state.getArtistsBulkItems);
    const playlists = useStore((state) => state.playlists);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const addAlbumToQueue = useStore((state) => state.addAlbumToQueue);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const addAlbumToPlaylist = useStore((state) => state.addAlbumToPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);
    const clearQueue = useStore((state) => state.clearQueue);

    // Per-artist ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);

    // Bulk ActionSheet state
    const [bulkActionSheetVisible, setBulkActionSheetVisible] = useState(false);
    const [bulkPlaylistModalVisible, setBulkPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);

    // Refresh artists when the screen is focused to ensure it's in sync with collection
    useFocusEffect(
        React.useCallback(() => {
            refreshArtists();
        }, [refreshArtists])
    );

    const filteredArtists = useMemo(() =>
        artists.filter(artist =>
            artist.name && artist.name.trim().length > 0 &&
            artist.name.toLowerCase().includes(searchQuery.toLowerCase())
        ), [artists, searchQuery]
    );

    // Collection items belonging to any of the filtered artists (for bulk actions)
    const [artistCollectionItems, setArtistCollectionItems] = useState<CollectionItem[]>([]);
    useEffect(() => {
        const artistNames = (!searchQuery.trim() || filteredArtists.length === 0)
            ? []
            : filteredArtists.map(a => a.name);
        getArtistsBulkItems(artistNames).then(setArtistCollectionItems);
    }, [searchQuery, filteredArtists, getArtistsBulkItems]);

    const sections = useMemo(() => {
        const groups: { [key: string]: Artist[] } = {};

        filteredArtists.forEach(artist => {
            const cleanName = artist.name.trim();

            const firstLetter = cleanName.charAt(0).toUpperCase();
            const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(artist);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '#') return 1;
            if (b === '#') return -1;
            return a.localeCompare(b);
        });

        return sortedKeys.map(key => {
            // Chunk the artists into rows for the grid layout
            const artistRows = [];
            for (let i = 0; i < groups[key].length; i += COLUMN_COUNT) {
                artistRows.push(groups[key].slice(i, i + COLUMN_COUNT));
            }

            return {
                title: key,
                data: artistRows
            };
        });
    }, [filteredArtists]);

    const handleArtistPress = useCallback((id: string) => {
        router.push({ pathname: '/artist/artist_detail' as any, params: { id } });
    }, [router]);

    const handleArtistLongPress = useCallback((artist: Artist) => {
        setSelectedArtist(artist);
        setActionSheetTitle(artist.name);
        const queueArtistItems = async (playNext: boolean, clearFirst: boolean) => {
            const items = await getArtistsBulkItems([artist.name]);
            if (clearFirst) clearQueue(false);
            for (const item of items) {
                if (item.type === 'album' && item.album?.bandcampUrl) {
                    await addAlbumToQueue(item.album.bandcampUrl, playNext, item.album.tracks, item.album.artist);
                } else if (item.type === 'track' && item.track) {
                    await addTrackToQueue(item.track, playNext);
                }
            }
        };
        setActionSheetActions([
            {
                text: "Play Now",
                icon: Play,
                onPress: () => queueArtistItems(false, true),
            },
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: () => queueArtistItems(true, false),
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: () => queueArtistItems(false, false),
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
                onPress: () => setPlaylistModalVisible(true),
            },
            {
                text: "Cancel",
                style: "cancel",
                onPress: () => { },
            },
        ]);
        setActionSheetVisible(true);
    }, [getArtistsBulkItems, clearQueue, addAlbumToQueue, addTrackToQueue]);

    const handleSelectPlaylist = useCallback(async (playlistId: string) => {
        if (!selectedArtist) return;
        const items = await getArtistsBulkItems([selectedArtist.name]);
        for (const item of items) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                addAlbumToPlaylist(playlistId, item.album.bandcampUrl);
            } else if (item.type === 'track' && item.track) {
                addTrackToPlaylist(playlistId, item.track);
            }
        }
        setPlaylistModalVisible(false);
        Alert.alert("Success", `Added ${items.length} items to playlist`);
    }, [selectedArtist, getArtistsBulkItems, addAlbumToPlaylist, addTrackToPlaylist]);

    // Bulk action handlers (operate on artistCollectionItems)
    const handleBulkPlayNow = useCallback(async () => {
        clearQueue(false);
        // addAlbumToQueue and addTrackToQueue auto-play when the queue is empty,
        // so no explicit playQueueIndex(0) call is needed.
        for (const item of artistCollectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, false);
            }
        }
    }, [artistCollectionItems, clearQueue, addAlbumToQueue, addTrackToQueue]);

    const handleBulkPlayNext = useCallback(async () => {
        for (const item of artistCollectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, true, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, true);
            }
        }
    }, [artistCollectionItems, addAlbumToQueue, addTrackToQueue]);

    const handleBulkAddToQueue = useCallback(async () => {
        for (const item of artistCollectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                await addAlbumToQueue(item.album.bandcampUrl, false, item.album.tracks, item.album.artist);
            } else if (item.type === 'track' && item.track) {
                await addTrackToQueue(item.track, false);
            }
        }
    }, [artistCollectionItems, addAlbumToQueue, addTrackToQueue]);

    const handleBulkSelectPlaylist = useCallback((playlistId: string) => {
        for (const item of artistCollectionItems) {
            if (item.type === 'album' && item.album?.bandcampUrl) {
                addAlbumToPlaylist(playlistId, item.album.bandcampUrl);
            } else if (item.type === 'track' && item.track) {
                addTrackToPlaylist(playlistId, item.track);
            }
        }
        setBulkPlaylistModalVisible(false);
        Alert.alert("Success", `Added ${artistCollectionItems.length} items to playlist`);
    }, [artistCollectionItems, addAlbumToPlaylist, addTrackToPlaylist]);

    const handleCreatePlaylist = useCallback((name: string) => {
        createPlaylist(name);
        setCreatePlaylistModalVisible(false);
    }, [createPlaylist]);

    const bulkActions: Action[] = useMemo(() => [
        {
            text: "Play Now",
            icon: Play,
            onPress: handleBulkPlayNow,
        },
        {
            text: "Play Next",
            icon: ListEnd,
            onPress: handleBulkPlayNext,
        },
        {
            text: "Add to Queue",
            icon: ListPlus,
            onPress: handleBulkAddToQueue,
        },
        {
            text: "Add to Playlist",
            icon: ListMusic,
            onPress: () => setBulkPlaylistModalVisible(true),
        },
        {
            text: "Cancel",
            style: "cancel",
            onPress: () => { },
        },
    ], [handleBulkPlayNow, handleBulkPlayNext, handleBulkAddToQueue]);

    const showBulkBar = searchQuery.trim().length > 0 && filteredArtists.length > 0;

    const renderArtistItem = useCallback((item: Artist) => (
        <TouchableOpacity
            key={item.id}
            style={styles.artistItem}
            onPress={() => handleArtistPress(item.id)}
            onLongPress={() => handleArtistLongPress(item)}
        >
            <View style={[styles.avatarContainer, { backgroundColor: colors.input }]}>
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
                ) : (
                    <View style={[styles.placeholderAvatar, { backgroundColor: colors.card }]}>
                        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                            {item.name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}
            </View>
            <Text style={[styles.artistName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
            </Text>
        </TouchableOpacity>
    ), [colors, handleArtistPress, handleArtistLongPress]);

    const renderRow = useCallback(({ item: row }: { item: Artist[] }) => (
        <View style={styles.row}>
            {row.map(artist => renderArtistItem(artist))}
            {/* Fill empty spots to maintain alignment */}
            {Array.from({ length: COLUMN_COUNT - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.artistItem} /> // Invisible spacer
            ))}
        </View>
    ), [renderArtistItem]);

    const renderSectionHeader = useCallback(({ section: { title } }: { section: { title: string } }) => (
        <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionHeaderText, { color: colors.accent }]}>{title}</Text>
        </View>
    ), [colors]);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <View style={styles.searchRow}>
                <SearchBar
                    style={styles.searchBarInRow}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search artists.."
                />
                {showBulkBar && (
                    <>
                        <TouchableOpacity
                            onPress={() => setBulkActionSheetVisible(true)}
                            style={[styles.bulkButton, { backgroundColor: colors.card }]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <MoreHorizontal size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <SectionList
                sections={sections}
                renderItem={renderRow}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={(item, index) => `row-${index}-${item[0].id}`}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No artists found</Text>
                    </View>
                }
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

            <ActionSheet
                visible={bulkActionSheetVisible}
                onClose={() => setBulkActionSheetVisible(false)}
                title={`${filteredArtists.length} ${filteredArtists.length === 1 ? 'artist' : 'artists'} · ${artistCollectionItems.length} items`}
                actions={bulkActions}
            />
            <PlaylistSelectionModal
                visible={bulkPlaylistModalVisible}
                onClose={() => setBulkPlaylistModalVisible(false)}
                onSelect={handleBulkSelectPlaylist}
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    title: {
        fontSize: 34,
        fontWeight: 'bold',
        color: '#fff',
    },
    listContent: {
        paddingBottom: 20,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#1a1a1a', // Match background to obscure content scrolling under
    },
    sectionHeaderText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#888',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: 15, // 20 (screen) - 5 (item margin)
        marginBottom: 20,
    },
    artistItem: {
        width: ITEM_WIDTH,
        alignItems: 'center',
        paddingHorizontal: 5,
    },
    avatarContainer: {
        width: 90, // Slightly smaller to fit 3 columns comfortably
        height: 90,
        borderRadius: 45,
        marginBottom: 8,
        overflow: 'hidden',
        backgroundColor: '#333',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    placeholderAvatar: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#444',
    },
    placeholderText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#888',
    },
    artistName: {
        color: '#fff',
        fontSize: 13,
        textAlign: 'center',
        fontWeight: '500',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 50,
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 15,
        gap: 6,
    },
    searchBarInRow: {
        flex: 1,
        marginHorizontal: 0,
        marginBottom: 0,
    },
    bulkCount: {
        fontSize: 12,
        fontWeight: '500',
        flexShrink: 1,
    },
    bulkButton: {
        borderRadius: 12,
        padding: 15,
        flexShrink: 0,
    },
});
