import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { Playlist } from '@shared/types';
import { router } from 'expo-router';
import { MoreVertical, Plus } from 'lucide-react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { InputModal } from '../../components/InputModal';

export default function PlaylistsScreen() {
    const playlists = useStore((state) => state.playlists);
    const playPlaylist = useStore((state) => state.playPlaylist);
    const disconnect = useStore((state) => state.disconnect);
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

    const handleDisconnect = () => {
        Alert.alert(
            "Disconnect",
            "Are you sure you want to disconnect?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: () => {
                        disconnect();
                        router.replace('/');
                    }
                }
            ]
        );
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
                style={styles.item}
                onPress={() => handlePlayPlaylist(item)}
                onLongPress={() => handleLongPress(item)}
            >
                {item.artworkUrl ? (
                    <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork]}>
                        <Text style={styles.placeholderText}>♪</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemSubtitle}>
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
            <Text style={styles.emptyText}>No playlists found</Text>
            <TouchableOpacity
                style={styles.createButton}
                onPress={() => setCreateModalVisible(true)}
            >
                <Text style={styles.createButtonText}>Create Playlist</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Playlists</Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity onPress={() => setCreateModalVisible(true)}>
                        <Plus size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={playlists}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, playlists.length === 0 && { flex: 1 }]}
                ListEmptyComponent={renderEmptyComponent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1da1f2" />
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
        padding: 16,
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
