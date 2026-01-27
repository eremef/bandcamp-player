import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { CollectionItem } from '@shared/types';
import { RefreshCw, MoreVertical, Search } from 'lucide-react-native';
import { webSocketService } from '../../services/WebSocketService';
import { router } from 'expo-router';

export default function CollectionScreen() {
    const collection = useStore((state) => state.collection);
    const playAlbum = useStore((state) => state.playAlbum);
    const playTrack = useStore((state) => state.playTrack);
    const disconnect = useStore((state) => state.disconnect);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCollection = useMemo(() => {
        if (!collection?.items) return [];
        if (!searchQuery.trim()) return collection.items;

        const query = searchQuery.toLowerCase();
        return collection.items.filter((item) => {
            if (item.type === 'album' && item.album) {
                return (
                    item.album.title.toLowerCase().includes(query) ||
                    item.album.artist.toLowerCase().includes(query)
                );
            } else if (item.type === 'track' && item.track) {
                return (
                    item.track.title.toLowerCase().includes(query) ||
                    item.track.artist.toLowerCase().includes(query)
                );
            }
            return false;
        });
    }, [collection, searchQuery]);

    const handleRefresh = () => {
        if (webSocketService) {
            webSocketService.send('get-collection');
        }
    };

    const handlePlayItem = (item: CollectionItem) => {
        if (item.type === 'album' && item.album?.bandcampUrl) {
            playAlbum(item.album.bandcampUrl);
        } else if (item.type === 'track' && item.track) {
            // Use playAlbum even for tracks if they have a URL, this ensures queue is updated/replaced
            // on the desktop side, matching web remote behavior
            if (item.track.bandcampUrl) {
                playAlbum(item.track.bandcampUrl);
            } else {
                playTrack(item.track);
            }
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

            <View style={styles.searchContainer}>
                <Search size={20} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search collection..."
                    placeholderTextColor="#888"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            <FlatList
                data={filteredCollection}
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
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        margin: 16,
        marginTop: 0,
        paddingHorizontal: 12,
        borderRadius: 8,
        height: 48,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        height: '100%',
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
