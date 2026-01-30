import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { RadioStation } from '@shared/types';
import { router } from 'expo-router';
import { MoreVertical, X } from 'lucide-react-native';

export default function RadioScreen() {
    const radioStations = useStore((state) => state.radioStations);
    const playlists = useStore((state) => state.playlists);
    const playStation = useStore((state) => state.playStation);
    const disconnect = useStore((state) => state.disconnect);
    const addStationToQueue = useStore((state) => state.addStationToQueue);
    const addStationToPlaylist = useStore((state) => state.addStationToPlaylist);

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);

    const handlePlayStation = (station: RadioStation) => {
        playStation(station);
    };

    const handleLongPress = (station: RadioStation) => {
        Alert.alert(
            station.name,
            "Choose an action",
            [
                { text: "Play Next", onPress: () => addStationToQueue(station, true) },
                { text: "Add to Queue", onPress: () => addStationToQueue(station, false) },
                {
                    text: "Add to Playlist",
                    onPress: () => {
                        setSelectedStation(station);
                        setPlaylistModalVisible(true);
                    }
                },
                { text: "Cancel", style: "cancel" }
            ]
        );
    };

    const handleAddToPlaylist = (playlistId: string) => {
        if (selectedStation) {
            addStationToPlaylist(playlistId, selectedStation);
            setPlaylistModalVisible(false);
            setSelectedStation(null);
            Alert.alert("Success", "Added to playlist");
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

    const renderItem = ({ item }: { item: RadioStation }) => {
        return (
            <TouchableOpacity
                style={styles.item}
                onPress={() => handlePlayStation(item)}
                onLongPress={() => handleLongPress(item)}
                delayLongPress={500}
            >
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork]}>
                        <Text style={styles.placeholderText}>Radio</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
                    {item.date && (
                        <Text style={styles.itemDate}>{item.date}</Text>
                    )}
                    <Text style={styles.itemSubtitle} numberOfLines={2}>{item.description}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Radio</Text>
                <TouchableOpacity onPress={handleDisconnect}>
                    <MoreVertical size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            {radioStations.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No radio stations found</Text>
                </View>
            ) : (
                <FlatList
                    data={radioStations}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                />
            )}

            {/* Playlist Selection Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={playlistModalVisible}
                onRequestClose={() => setPlaylistModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add to Playlist</Text>
                            <TouchableOpacity onPress={() => setPlaylistModalVisible(false)}>
                                <X size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {playlists.length > 0 ? (
                            <FlatList
                                data={playlists}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.playlistItem}
                                        onPress={() => handleAddToPlaylist(item.id)}
                                    >
                                        <Text style={styles.playlistName}>{item.name}</Text>
                                        <Text style={styles.playlistCount}>{item.tracks.length} tracks</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        ) : (
                            <Text style={styles.emptyText}>No playlists available</Text>
                        )}
                    </View>
                </View>
            </Modal>
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
        textAlign: 'center',
        marginTop: 20,
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
        width: 80,
        height: 80,
        borderRadius: 4,
    },
    placeholderArtwork: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#666',
        fontSize: 16,
    },
    itemInfo: {
        flex: 1,
        marginLeft: 16,
        justifyContent: 'center',
    },
    itemTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemDate: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 2,
        textTransform: 'uppercase',
    },
    itemSubtitle: {
        color: '#888',
        fontSize: 14,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1e1e1e',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 16,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    playlistItem: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2a2a2a',
    },
    playlistName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    playlistCount: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
});
