import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useStore } from '../../store';
import { RadioStation } from '@shared/types';
import { ActionSheet, Action } from '../../components/ActionSheet';
import { PlaylistSelectionModal } from '../../components/PlaylistSelectionModal';
import { InputModal } from '../../components/InputModal';
import { SearchBar } from '../../components/SearchBar';
import { useTheme } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RadioScreen() {
    const insets = useSafeAreaInsets();
    const colors = useTheme();
    const radioStations = useStore((state) => state.radioStations);
    const playlists = useStore((state) => state.playlists);
    const playStation = useStore((state) => state.playStation);
    const addStationToQueue = useStore((state) => state.addStationToQueue);
    const addStationToPlaylist = useStore((state) => state.addStationToPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);
    const refreshRadio = useStore((state) => state.refreshRadio);
    const radioSearchQuery = useStore((state) => state.radioSearchQuery);
    const setRadioSearchQuery = useStore((state) => state.setRadioSearchQuery);

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const filteredStations = React.useMemo(() => {
        if (!radioSearchQuery.trim()) return radioStations;
        const query = radioSearchQuery.toLowerCase();
        return radioStations.filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.description && s.description.toLowerCase().includes(query))
        );
    }, [radioStations, radioSearchQuery]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshRadio();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshRadio]);

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

    const handleCreatePlaylist = (name: string) => {
        createPlaylist(name);
        setCreatePlaylistModalVisible(false);
    };

    const renderItem = ({ item }: { item: RadioStation }) => {
        return (
            <TouchableOpacity
                style={[styles.item, { backgroundColor: colors.card }]}
                onPress={() => handlePlayStation(item)}
                onLongPress={() => handleLongPress(item)}
                delayLongPress={500}
            >
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.input }]}>
                        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Radio</Text>
                    </View>
                )}
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    {item.date && (
                        <Text style={[styles.itemDate, { color: colors.accent }]}>
                            {item.date}{item.duration ? ` • ${Math.floor(item.duration / 3600)}h ${Math.floor((item.duration % 3600) / 60)}m` : ''}
                        </Text>
                    )}
                    <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderEmptyComponent = () => (
        <View style={styles.center}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No radio stations found</Text>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <SearchBar
                value={radioSearchQuery}
                onChangeText={setRadioSearchQuery}
                placeholder="Search radio shows..."
            />

            <FlatList
                data={filteredStations}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, filteredStations.length === 0 && { flex: 1 }]}
                ListEmptyComponent={renderEmptyComponent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
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
                onSelect={handleAddToPlaylist}
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
