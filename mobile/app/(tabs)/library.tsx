import React, { useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { CollectionItem } from '@shared/types';
import { RefreshCw, MoreVertical } from 'lucide-react-native';
import { webSocketService } from '../../services/WebSocketService';
import { router } from 'expo-router';

export default function LibraryScreen() {
    const collection = useStore((state) => state.collection);
    const playAlbum = useStore((state) => state.playAlbum);
    const playTrack = useStore((state) => state.playTrack);
    const disconnect = useStore((state) => state.disconnect);

    const handleRefresh = () => {
        if (webSocketService) {
            webSocketService.send('get-collection');
        }
    };

    const handlePlayItem = (item: CollectionItem) => {
        if (item.type === 'album' && item.album?.bandcampUrl) {
            playAlbum(item.album.bandcampUrl);
        } else if (item.type === 'track' && item.track) {
            playTrack(item.track);
        }
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
            <TouchableOpacity style={styles.item} onPress={() => handlePlayItem(item)}>
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

    if (!collection) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1da1f2" />
                    <Text style={styles.text}>Loading Collection...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Collection</Text>
                <View style={styles.headerButtons}>
                    <TouchableOpacity onPress={handleRefresh} style={styles.iconButton}>
                        <RefreshCw size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDisconnect} style={styles.iconButton}>
                        <MoreVertical size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
            <FlatList
                data={collection.items}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={styles.columnWrapper}
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
