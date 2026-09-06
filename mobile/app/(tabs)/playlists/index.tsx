import React, { useState } from 'react';
import { View, Text, SectionList, Image, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useStore } from '../../../store';
import { Playlist } from '@shared/types';
import { useTheme } from '../../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet } from '../../../components/ActionSheet';
import { InputModal } from '../../../components/InputModal';
import { Pencil, Trash2, Share, Play, ListPlus, Forward } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function PlaylistsScreen() {
    const insets = useSafeAreaInsets();
    const colors = useTheme();
    const playlists = useStore((state) => state.playlists);
    const bandcampPlaylists = useStore((state) => state.bandcampPlaylists);
    const playPlaylist = useStore((state) => state.playPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);
    const renamePlaylist = useStore((state) => state.renamePlaylist);
    const deletePlaylist = useStore((state) => state.deletePlaylist);
    const importPlaylist = useStore((state) => state.importPlaylist);
    const exportPlaylist = useStore((state) => state.exportPlaylist);
    const canEdit = useStore((state) => state.canEditPlaylists());

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const router = useRouter();

    const handlePress = (playlist: Playlist) => {
        router.push(`/playlists/${playlist.id}`);
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
        if (playlist.isBandcampPlaylist) return; // Uneditable
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

    const renderItem = ({ item }: { item: Playlist | { id: string } }) => {
        if (item.id === 'empty-local') {
            return (
                <View style={[styles.center, { marginTop: 40, paddingBottom: 40 }]}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No playlists found</Text>
                    {canEdit && (
                        <>
                            <TouchableOpacity
                                style={[styles.createButton, { backgroundColor: colors.accent }]}
                                onPress={() => setCreateModalVisible(true)}
                            >
                                <Text style={[styles.createButtonText, { color: '#fff' }]}>Create Playlist</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.createButton, { backgroundColor: colors.card, marginTop: 12, borderWidth: 1, borderColor: colors.border }]}
                                onPress={importPlaylist}
                            >
                                <Text style={[styles.createButtonText, { color: colors.text }]}>Import Playlist</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            );
        }

        const playlist = item as Playlist;
        return (
            <TouchableOpacity
                style={[styles.item, { backgroundColor: colors.card }]}
                onPress={() => handlePress(playlist)}
                onLongPress={() => handleLongPress(playlist)}
            >
                {playlist.artworkUrl ? (
                    <Image source={{ uri: playlist.artworkUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.input }]}>
                        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>♪</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{playlist.name}</Text>
                    <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                        {playlist.isBandcampPlaylist ? 'Bandcamp Playlist (Online)' : `${playlist.trackCount || 0} tracks • ${formatDuration(playlist.totalDuration)}`}
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

    const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
        <View style={styles.sectionHeaderContainer}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>{title}</Text>
            {title === 'Local Playlists' && canEdit && (
                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        style={[styles.createSmallButton, { backgroundColor: colors.card, marginRight: 8, borderWidth: 1, borderColor: colors.border }]}
                        onPress={importPlaylist}
                    >
                        <Text style={[styles.createSmallButtonText, { color: colors.text }]}>Import</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.createSmallButton, { backgroundColor: colors.accent }]}
                        onPress={() => setCreateModalVisible(true)}
                    >
                        <Text style={[styles.createSmallButtonText, { color: '#fff' }]}>New</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const sections = [];
    if (playlists.length === 0) {
        sections.push({ title: 'Local Playlists', data: [{ id: 'empty-local' }] });
    } else {
        sections.push({ title: 'Local Playlists', data: playlists });
    }

    if (bandcampPlaylists.length > 0) {
        sections.push({ title: 'Bandcamp Playlists', data: bandcampPlaylists });
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
            <SectionList
                sections={sections}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, sections.length === 0 && { flex: 1 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
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
                        text: 'Play',
                        icon: Play,
                        onPress: () => {
                            if (selectedPlaylist) {
                                playPlaylist(selectedPlaylist.id);
                                setActionSheetVisible(false);
                                setSelectedPlaylist(null);
                            }
                        }
                    },
                    {
                        text: 'Play Next',
                        icon: Forward,
                        onPress: () => {
                            if (selectedPlaylist) {
                                useStore.getState().playPlaylistNext(selectedPlaylist.id);
                                setActionSheetVisible(false);
                                setSelectedPlaylist(null);
                            }
                        }
                    },
                    {
                        text: 'Add to Queue',
                        icon: ListPlus,
                        onPress: () => {
                            if (selectedPlaylist) {
                                useStore.getState().addPlaylistToQueue(selectedPlaylist.id);
                                setActionSheetVisible(false);
                                setSelectedPlaylist(null);
                            }
                        }
                    },
                    {
                        text: 'Rename',
                        icon: Pencil,
                        onPress: () => {
                            setRenameModalVisible(true);
                        }
                    },
                    {
                        text: 'Export',
                        icon: Share,
                        onPress: () => {
                            if (selectedPlaylist) {
                                exportPlaylist(selectedPlaylist.id);
                                setActionSheetVisible(false);
                                setSelectedPlaylist(null);
                            }
                        }
                    },
                    {
                        text: 'Delete',
                        icon: Trash2,
                        style: 'destructive',
                        onPress: () => {
                            handleDelete();
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
        paddingHorizontal: 16,
        paddingBottom: 5,
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
    sectionHeaderContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 5,
        paddingHorizontal: 4,
        marginBottom: 4,
        backgroundColor: '#121212',
    },
    sectionHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    createSmallButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    createSmallButtonText: {
        fontWeight: '600',
        fontSize: 12,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    }
});
