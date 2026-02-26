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
import { ListEnd, ListPlus, ListMusic, Play, MoreHorizontal } from 'lucide-react-native';

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
    const clearQueue = useStore((state) => state.clearQueue);

    // Per-item ActionSheet state
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    // Bulk ActionSheet state
    const [bulkActionSheetVisible, setBulkActionSheetVisible] = useState(false);
    const [bulkPlaylistModalVisible, setBulkPlaylistModalVisible] = useState(false);

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
                text: "Play Now",
                icon: Play,
                onPress: () => playStation(station)
            },
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: () => addStationToQueue(station, true)
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: () => addStationToQueue(station, false)
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
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

    // Bulk action handlers
    const handleBulkPlayNow = React.useCallback(() => {
        clearQueue(false);
        // addStationToQueue auto-plays when the queue is empty (first station),
        // so no explicit playQueueIndex(0) call is needed.
        filteredStations.forEach(s => addStationToQueue(s, false));
    }, [filteredStations, clearQueue, addStationToQueue]);

    const handleBulkPlayNext = React.useCallback(() => {
        filteredStations.forEach(s => addStationToQueue(s, true));
    }, [filteredStations, addStationToQueue]);

    const handleBulkAddToQueue = React.useCallback(() => {
        filteredStations.forEach(s => addStationToQueue(s, false));
    }, [filteredStations, addStationToQueue]);

    const handleBulkSelectPlaylist = React.useCallback((playlistId: string) => {
        filteredStations.forEach(s => addStationToPlaylist(playlistId, s));
        setBulkPlaylistModalVisible(false);
        Alert.alert("Success", `Added ${filteredStations.length} stations to playlist`);
    }, [filteredStations, addStationToPlaylist]);

    const bulkActions: Action[] = React.useMemo(() => [
        {
            text: "Play Now",
            icon: Play,
            onPress: handleBulkPlayNow,
        },
        {
            text: "Play Next",
            icon: ListEnd,
            onPress: handleBulkPlayNext,
        },
        {
            text: "Add to Queue",
            icon: ListPlus,
            onPress: handleBulkAddToQueue,
        },
        {
            text: "Add to Playlist",
            icon: ListMusic,
            onPress: () => setBulkPlaylistModalVisible(true),
        },
        {
            text: "Cancel",
            style: "cancel",
            onPress: () => { },
        },
    ], [handleBulkPlayNow, handleBulkPlayNext, handleBulkAddToQueue]);

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

    const showBulkBar = radioSearchQuery.trim().length > 0 && filteredStations.length > 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <View style={styles.searchRow}>
                <SearchBar
                    style={styles.searchBarInRow}
                    value={radioSearchQuery}
                    onChangeText={setRadioSearchQuery}
                    placeholder="Search radio shows..."
                />
                {showBulkBar && (
                    <>
                        <TouchableOpacity
                            onPress={() => setBulkActionSheetVisible(true)}
                            style={[styles.bulkButton, { backgroundColor: colors.card }]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <MoreHorizontal size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </>
                )}
            </View>

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

            {/* Per-item action sheet */}
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

            {/* Bulk search result action sheet */}
            <ActionSheet
                visible={bulkActionSheetVisible}
                onClose={() => setBulkActionSheetVisible(false)}
                title={`${filteredStations.length} ${filteredStations.length === 1 ? 'result' : 'results'}`}
                actions={bulkActions}
            />
            <PlaylistSelectionModal
                visible={bulkPlaylistModalVisible}
                onClose={() => setBulkPlaylistModalVisible(false)}
                onSelect={handleBulkSelectPlaylist}
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
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 15,
        gap: 6,
    },
    searchBarInRow: {
        flex: 1,
        marginHorizontal: 0,
        marginBottom: 0,
    },
    bulkCount: {
        fontSize: 12,
        fontWeight: '500',
        flexShrink: 1,
    },
    bulkButton: {
        borderRadius: 12,
        padding: 15,
        flexShrink: 0,
    },
});
