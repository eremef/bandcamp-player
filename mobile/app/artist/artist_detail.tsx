import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useStore } from '../../store';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CollectionItem } from '../../../src/shared/types';
import { CollectionGridItem } from '../../components/CollectionGridItem';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = 3;
const LIST_PADDING = 12;
const GAP = 12;
const ITEM_WIDTH = (SCREEN_WIDTH - (LIST_PADDING * 2) - (GAP * (COLUMN_COUNT - 1))) / COLUMN_COUNT;

export default function ArtistDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const {
        artists,
        artistCollection,
        isArtistCollectionLoading,
        refreshArtistCollection,
        connectionStatus,
        playAlbum,
        playTrack,
        playlists,
        addTrackToQueue,
        addAlbumToQueue,
        addTrackToPlaylist,
        addAlbumToPlaylist
    } = useStore();

    React.useEffect(() => {
        if (connectionStatus === 'connected' && id) {
            refreshArtistCollection(id);
        }
    }, [connectionStatus, id]);

    const artist = artists.find(a => a.id === id);

    const artistItems = artistCollection?.items || [];

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)/artists');
        }
    };

    if (!artist) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton} testID="back-button">
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.errorText}>Artist not found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const handlePlayItem = (item: CollectionItem) => {
        if (item.type === 'album' && item.album) {
            if (item.album.bandcampUrl) {
                router.push({ pathname: '/album_detail', params: { url: item.album.bandcampUrl } });
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

    const handleLongPress = (item: CollectionItem) => {
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

    const renderItem = ({ item }: { item: CollectionItem }) => {
        return (
            <CollectionGridItem
                item={item}
                onPress={handlePlayItem}
                onLongPress={handleLongPress}
                width={ITEM_WIDTH}
            />
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton} testID="back-button">
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{artist.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={artistItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={COLUMN_COUNT}
                key={COLUMN_COUNT}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={styles.columnWrapper}
                ListHeaderComponent={
                    <View style={styles.profileContainer}>
                        <View style={styles.avatarContainer}>
                            {artist.imageUrl ? (
                                <Image source={{ uri: artist.imageUrl }} style={styles.avatar} />
                            ) : (
                                <View style={styles.placeholderAvatar}>
                                    <Text style={styles.placeholderText}>
                                        {artist.name.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.name}>{artist.name}</Text>
                        <Text style={styles.stats}>{artistItems.length} releases in collection</Text>

                        <TouchableOpacity style={styles.bandcampButton}>
                            <Text style={styles.bandcampButtonText}>View on Bandcamp</Text>
                            <Ionicons name="open-outline" size={16} color="#aaa" style={{ marginLeft: 5 }} />
                        </TouchableOpacity>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        {isArtistCollectionLoading ? (
                            <ActivityIndicator size="large" color="#0896afff" />
                        ) : (
                            <Text style={styles.emptyText}>No items found in collection</Text>
                        )}
                    </View>
                }
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        maxWidth: '70%',
    },
    profileContainer: {
        alignItems: 'center',
        paddingVertical: 30,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        marginBottom: 20,
    },
    avatarContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        overflow: 'hidden',
        marginBottom: 15,
        backgroundColor: '#333',
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
        fontSize: 50,
        fontWeight: 'bold',
        color: '#888',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
        textAlign: 'center',
    },
    stats: {
        fontSize: 14,
        color: '#888',
        marginBottom: 15,
    },
    bandcampButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 8,
        backgroundColor: '#222',
        borderRadius: 20,
    },
    bandcampButtonText: {
        color: '#aaa',
        fontSize: 14,
    },
    listContent: {
        padding: LIST_PADDING,
        paddingBottom: 20,
    },
    columnWrapper: {
        gap: GAP,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 16,
        marginLeft: 10,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
    },
});
