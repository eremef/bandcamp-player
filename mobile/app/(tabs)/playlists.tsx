import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { Playlist } from '@shared/types';
import { router } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';

export default function PlaylistsScreen() {
    const playlists = useStore((state) => state.playlists);
    const playPlaylist = useStore((state) => state.playPlaylist);
    const disconnect = useStore((state) => state.disconnect);

    const handlePlayPlaylist = (playlist: Playlist) => {
        playPlaylist(playlist.id);
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
            <TouchableOpacity style={styles.item} onPress={() => handlePlayPlaylist(item)}>
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

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Playlists</Text>
                <TouchableOpacity onPress={handleDisconnect}>
                    <MoreVertical size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            {playlists.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No playlists found</Text>
                </View>
            ) : (
                <FlatList
                    data={playlists}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                />
            )}
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
