import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, MoreVertical, ListEnd, ListPlus, ListMusic } from 'lucide-react-native';
import { RadioStation, Track } from '@shared/types';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { ActionSheet, Action } from '../components/ActionSheet';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { InputModal } from '../components/InputModal';

export default function RadioDetailScreen() {
    const { id, name, description, longDescription, imageCaption, date, imageUrl, streamUrl, duration } = useLocalSearchParams<{
        id: string;
        name?: string;
        description?: string;
        longDescription?: string;
        imageCaption?: string;
        date?: string;
        imageUrl?: string;
        streamUrl?: string;
        duration?: string;
    }>();

    const colors = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const radioStations = useStore((state) => state.radioStations);
    const storeStation = useMemo(() => radioStations.find(s => s.id === id), [radioStations, id]);

    const station: RadioStation = useMemo(() => {
        if (storeStation) return storeStation;
        return {
            id: id || '',
            name: name || 'Radio Show',
            description: description || '',
            longDescription: longDescription || '',
            imageCaption: imageCaption || '',
            date: date || '',
            imageUrl: imageUrl || '',
            streamUrl: streamUrl || '',
            duration: duration ? parseInt(duration, 10) : 0,
        };
    }, [storeStation, id, name, description, longDescription, imageCaption, date, imageUrl, streamUrl, duration]);

    const mode = useStore((state) => state.mode);
    const playStation = useStore((state) => state.playStation);
    const extractRadioTracksToQueue = useStore((state) => state.extractRadioTracksToQueue);

    const playTrack = useStore((state) => state.playTrack);
    const addTrackToQueue = useStore((state) => state.addTrackToQueue);
    const playlists = useStore((state) => state.playlists);
    const addTrackToPlaylist = useStore((state) => state.addTrackToPlaylist);
    const createPlaylist = useStore((state) => state.createPlaylist);

    const [tracks, setTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Context menu / ActionSheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [actionSheetTitle, setActionSheetTitle] = useState('');
    const [actionSheetActions, setActionSheetActions] = useState<Action[]>([]);

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

    useEffect(() => {
        if (!station.id) return;

        let isMounted = true;
        setIsLoading(true);

        const fetchTracks = async () => {
            try {
                if (mode === 'standalone') {
                    const { mobileScraperService } = require('../services/MobileScraperService');
                    const fetched = await mobileScraperService.getStationTracks(station.id);
                    if (isMounted) setTracks(fetched || []);
                } else {
                    // In remote mode, extract tracks via mobile scraper
                    const { mobileScraperService } = require('../services/MobileScraperService');
                    const fetched = await mobileScraperService.getStationTracks(station.id);
                    if (isMounted) setTracks(fetched || []);
                }
            } catch (err) {
                console.error('[RadioDetail] Error fetching station tracks:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchTracks();

        return () => {
            isMounted = false;
        };
    }, [station.id, mode]);

    const handlePlayAllStation = useCallback(() => {
        playStation(station);
    }, [playStation, station]);

    const handleExtractTracks = useCallback(() => {
        extractRadioTracksToQueue(station, false);
    }, [extractRadioTracksToQueue, station]);

    const handleTrackPress = useCallback((track: Track) => {
        playTrack(track);
    }, [playTrack]);

    const handleTrackMenuPress = useCallback((track: Track) => {
        setSelectedTrack(track);
        setActionSheetTitle(track.title);
        setActionSheetActions([
            {
                text: "Play Now",
                icon: Play,
                onPress: () => playTrack(track)
            },
            {
                text: "Play Next",
                icon: ListEnd,
                onPress: () => addTrackToQueue(track, true)
            },
            {
                text: "Add to Queue",
                icon: ListPlus,
                onPress: () => addTrackToQueue(track, false)
            },
            {
                text: "Add to Playlist",
                icon: ListMusic,
                onPress: () => setPlaylistModalVisible(true)
            },
            { text: "", type: "separator", onPress: () => { } },
            {
                text: "Cancel",
                style: "cancel",
                onPress: () => { }
            }
        ]);
        setActionSheetVisible(true);
    }, [playTrack, addTrackToQueue]);

    const handleAddToPlaylist = useCallback((playlistId: string) => {
        if (selectedTrack) {
            addTrackToPlaylist(playlistId, selectedTrack);
            setPlaylistModalVisible(false);
            setSelectedTrack(null);
            Alert.alert("Success", "Track added to playlist");
        }
    }, [addTrackToPlaylist, selectedTrack]);

    const handleCreatePlaylist = useCallback((playlistName: string) => {
        createPlaylist(playlistName);
        setCreatePlaylistModalVisible(false);
    }, [createPlaylist]);

    const renderHeader = useCallback(() => {
        const formattedDuration = station.duration
            ? `${Math.floor(station.duration / 3600)}h ${Math.floor((station.duration % 3600) / 60)}m`
            : null;

        return (
            <View style={styles.headerCardContainer}>
                <View style={styles.cardHeader}>
                    {station.imageUrl ? (
                        <Image source={{ uri: station.imageUrl }} style={styles.headerArtwork} />
                    ) : (
                        <View style={[styles.headerArtwork, styles.placeholderArtwork, { backgroundColor: colors.card }]}>
                            <Text style={{ color: colors.textSecondary, fontSize: 18 }}>Radio</Text>
                        </View>
                    )}
                    <View style={styles.headerInfo}>
                        <Text style={[styles.stationTitle, { color: colors.text }]} numberOfLines={2}>
                            {station.name}
                        </Text>
                        {station.date && (
                            <Text style={[styles.stationDate, { color: colors.accent }]}>
                                {station.date}{formattedDuration ? ` • ${formattedDuration}` : ''}
                            </Text>
                        )}
                        {station.description && (
                            <Text style={[styles.stationSubtitle, { color: colors.textSecondary }]}>
                                {station.description}
                            </Text>
                        )}
                        {station.longDescription && (
                            <Text style={[styles.stationDescription, { color: colors.textSecondary }]}>
                                {station.longDescription}
                            </Text>
                        )}
                        {station.imageCaption && (
                            <Text style={[styles.stationHost, { color: colors.textSecondary }]}>
                                {station.imageCaption}
                            </Text>
                        )}
                    </View>
                </View>

                <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                        testID="play-mix-btn"
                        style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                        onPress={handlePlayAllStation}
                        activeOpacity={0.8}
                    >
                        <Play size={18} color="#fff" fill="#fff" />
                        <Text style={styles.actionBtnText}>Play Mix</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        testID="play-extracted-btn"
                        style={[styles.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                        onPress={handleExtractTracks}
                        activeOpacity={0.8}
                    >
                        <ListPlus size={18} color={colors.text} />
                        <Text style={[styles.actionBtnText, { color: colors.text }]}>Play Tracks</Text>
                    </TouchableOpacity>
                </View>

                {tracks.length > 0 && (
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        Tracks ({tracks.length})
                    </Text>
                )}
            </View>
        );
    }, [station.duration, station.imageUrl, station.name, station.date, station.imageCaption, station.description, station.longDescription, colors.card, colors.textSecondary, colors.text, colors.accent, colors.border, handlePlayAllStation, handleExtractTracks, tracks.length]);

    const renderItem = useCallback(({ item, index }: { item: Track; index: number }) => {
        return (
            <TouchableOpacity
                style={[styles.item, { borderBottomColor: colors.border }]}
                onPress={() => handleTrackPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.positionContainer}>
                    <Text style={[styles.position, { color: colors.textSecondary }]}>
                        {index + 1}.
                    </Text>
                </View>
                {item.artworkUrl ? (
                    <Image
                        source={{ uri: item.artworkUrl }}
                        style={[styles.artwork, { backgroundColor: colors.card }]}
                    />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.card }]}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>🎵</Text>
                    </View>
                )}
                <View style={styles.info}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.artist}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={() => handleTrackMenuPress(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <MoreVertical size={18} color={colors.textSecondary} />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    }, [colors, handleTrackPress, handleTrackMenuPress]);

    const keyExtractor = useCallback((item: Track, index: number) => item.id || `track-${index}`, []);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <ChevronLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        {station.name}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                        Bandcamp Radio
                    </Text>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    {renderHeader()}
                    <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 20 }} />
                </View>
            ) : (
                <FlatList
                    data={tracks}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    ListHeaderComponent={renderHeader}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                No individual tracks extracted for this show.
                            </Text>
                        </View>
                    }
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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 10,
        paddingTop: 4,
        borderBottomWidth: 1,
    },
    backBtn: {
        paddingRight: 12,
        paddingVertical: 4,
    },
    headerTitleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    headerSubtitle: {
        fontSize: 13,
        fontWeight: '500',
    },
    headerCardContainer: {
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    headerArtwork: {
        width: 100,
        height: 100,
        borderRadius: 8,
    },
    placeholderArtwork: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 16,
        justifyContent: 'center',
    },
    stationTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    stationDate: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    stationSubtitle: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 4,
    },
    stationDescription: {
        fontSize: 13,
        lineHeight: 18,
    },
    stationHost: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    actionButtonsRow: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 10,
        flexWrap: 'wrap',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        gap: 8,
    },
    actionBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 4,
    },
    listContent: {
        paddingBottom: 50,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingLeft: 4,
        paddingRight: 16,
        borderBottomWidth: 1,
    },
    positionContainer: {
        width: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    position: {
        fontSize: 12,
        fontWeight: '500',
    },
    artwork: {
        width: 44,
        height: 44,
        borderRadius: 4,
        marginHorizontal: 5,
    },
    info: {
        flex: 1,
        marginLeft: 5,
        justifyContent: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 2,
    },
    artist: {
        fontSize: 12,
    },
    menuBtn: {
        padding: 8,
    },
    loadingContainer: {
        flex: 1,
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
    },
});
