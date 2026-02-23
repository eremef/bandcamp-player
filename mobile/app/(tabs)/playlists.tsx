import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useStore } from '../../store';
import { Playlist } from '@shared/types';
import { useTheme } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../../components/ActionSheet';
import { InputModal } from '../../components/InputModal';

export default function PlaylistsScreen() {
    const insets = useSafeAreaInsets();
    const colors = useTheme();
    const playlists = useStore((state) => state.playlists);
    const mode = useStore((state) => state.mode);
    const playPlaylist = useStore((state) => state.playPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);
    const renamePlaylist = useStore((state) => state.renamePlaylist);
    const deletePlaylist = useStore((state) => state.deletePlaylist);

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

    const handlePlayPlaylist = (playlist: Playlist) => {
        playPlaylist(playlist.id);
    };

    const handleCreate = (name: string) => {
        createPlaylist(name);
        setCreateModalVisible(false);
    };

    const handleRename = (name: string) => {
        if (selectedPlaylist) {
            renamePlaylist(selectedPlaylist.id, name);
            setRenameModalVisible(false);
            setSelectedPlaylist(null);
        }
    };

    const handleDelete = () => {
        if (selectedPlaylist) {
            Alert.alert(
                "Delete Playlist",
                `Are you sure you want to delete "${selectedPlaylist.name}"?`,
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                            deletePlaylist(selectedPlaylist.id);
                            setSelectedPlaylist(null);
                        }
                    }
                ]
            );
        }
    };

    const handleLongPress = (playlist: Playlist) => {
        setSelectedPlaylist(playlist);
        setActionSheetVisible(true);
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '0 min';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes} min`;
    };

    const renderItem = ({ item }: { item: Playlist }) => {
        return (
            <TouchableOpacity
                style={[styles.item, { backgroundColor: colors.card }]}
                onPress={() => handlePlayPlaylist(item)}
                onLongPress={() => handleLongPress(item)}
            >
                {item.artworkUrl ? (
                    <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.input }]}>
                        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>♪</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                        {item.trackCount} tracks • {formatDuration(item.totalDuration)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const refreshPlaylists = useStore((state) => state.refreshPlaylists);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshPlaylists();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshPlaylists]);

    const renderEmptyComponent = () => (
        <View style={styles.center}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No playlists found</Text>
            <TouchableOpacity
                style={[styles.createButton, { backgroundColor: colors.accent }]}
                onPress={() => setCreateModalVisible(true)}
            >
                <Text style={[styles.createButtonText, { color: '#fff' }]}>Create Playlist</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <FlatList
                data={playlists}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, playlists.length === 0 && { flex: 1 }]}
                ListEmptyComponent={renderEmptyComponent}
                refreshControl={mode === 'standalone' ? undefined :
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
            />

            <InputModal
                visible={createModalVisible}
                title="Create Playlist"
                placeholder="Playlist Name"
                onClose={() => setCreateModalVisible(false)}
                onSubmit={handleCreate}
                submitLabel="Create"
            />

            <InputModal
                visible={renameModalVisible}
                title="Rename Playlist"
                initialValue={selectedPlaylist?.name}
                placeholder="Playlist Name"
                onClose={() => {
                    setRenameModalVisible(false);
                    setSelectedPlaylist(null);
                }}
                onSubmit={handleRename}
                submitLabel="Save"
            />

            <ActionSheet
                visible={actionSheetVisible}
                onClose={() => {
                    setActionSheetVisible(false);
                    // Don't null selectedPlaylist here, wait for action or cancel
                }}
                title={selectedPlaylist?.name}
                actions={[
                    {
                        text: 'Rename',
                        onPress: () => {
                            // Delay slightly to allow action sheet to close
                            setTimeout(() => setRenameModalVisible(true), 100);
                        }
                    },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            setTimeout(handleDelete, 100);
                        }
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => setSelectedPlaylist(null)
                    }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
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
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#888',
        fontSize: 16,
        marginBottom: 16,
    },
    createButton: {
        backgroundColor: '#fff',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
    },
    createButtonText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        padding: 8,
    },
    artwork: {
        width: 60,
        height: 60,
        borderRadius: 4,
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
        flex: 1,
        marginLeft: 16,
    },
    itemTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemSubtitle: {
        color: '#888',
        fontSize: 14,
    },
});
