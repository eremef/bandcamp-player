import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { RadioStation } from '@shared/types';
import { router } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';

export default function RadioScreen() {
    const radioStations = useStore((state) => state.radioStations);
    const playlists = useStore((state) => state.playlists);
    const playStation = useStore((state) => state.playStation);
    const disconnect = useStore((state) => state.disconnect);
    const addStationToQueue = useStore((state) => state.addStationToQueue);
    const addStationToPlaylist = useStore((state) => state.addStationToPlaylist);

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const handlePlayStation = (station: RadioStation) => {
        playStation(station);
    };

    const handleLongPress = (station: RadioStation) => {
        setActionSheetTitle(station.name);
        setActionSheetActions([
            {
                text: "Play Next",
                onPress: () => addStationToQueue(station, true)
            },
            {
                text: "Add to Queue",
                onPress: () => addStationToQueue(station, false)
            },
            {
                text: "Add to Playlist",
                onPress: () => {
                    setSelectedStation(station);
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

    const handleAddToPlaylist = (playlistId: string) => {
        if (selectedStation) {
            addStationToPlaylist(playlistId, selectedStation);
            setPlaylistModalVisible(false);
            setSelectedStation(null);
            Alert.alert("Success", "Added to playlist");
        }
    };

    const handleDisconnect = () => {
        setActionSheetTitle("Disconnect");
        setActionSheetActions([
            {
                text: "Disconnect",
                style: "destructive",
                onPress: () => {
                    disconnect();
                    router.replace('/');
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
                        <Text style={styles.itemDate}>
                            {item.date}{item.duration ? ` • ${Math.floor(item.duration / 3600)}h ${Math.floor((item.duration % 3600) / 60)}m` : ''}
                        </Text>
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

            <ActionSheet
                visible={actionSheetVisible}
                onClose={() => setActionSheetVisible(false)}
                title={actionSheetTitle}
                actions={actionSheetActions}
            />

            <PlaylistSelectionModal
                visible={playlistModalVisible}
                onClose={() => setPlaylistModalVisible(false)}
                onSelect={handleAddToPlaylist}
                playlists={playlists}
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
});
