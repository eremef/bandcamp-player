import { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useStore } from '../../../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Trash2, GripVertical, ChevronLeft } from 'lucide-react-native';
import { Track } from '@shared/types';
import { useTheme } from '../../../theme';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import React from 'react';

export default function PlaylistDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const colors = useTheme();
    const router = useRouter();
    const playlists = useStore((state) => state.playlists);
    const bandcampPlaylists = useStore((state) => state.bandcampPlaylists);
    const playPlaylist = useStore((state) => state.playPlaylist);
    const removeTrackFromPlaylist = useStore((state) => state.removeTrackFromPlaylist);
    const reorderPlaylistTracks = useStore((state) => state.reorderPlaylistTracks);
    const fetchPlaylistDetails = useStore((state) => state.fetchPlaylistDetails);

    useEffect(() => {
        if (id) {
            fetchPlaylistDetails(id);
        }
    }, [id, fetchPlaylistDetails]);

    const localPlaylist = playlists.find(p => p.id === id);
    const bandcampPlaylist = bandcampPlaylists.find(p => p.id === id);

    const isBandcamp = !!bandcampPlaylist;
    const playlist = localPlaylist || bandcampPlaylist;

    const tracks = useMemo(() => playlist?.tracks || [], [playlist]);

    const insets = useSafeAreaInsets();

    const handlePlayAll = useCallback(() => {
        if (!playlist) return;
        playPlaylist(playlist.id);
    }, [playlist, playPlaylist]);

    const handleRemove = useCallback((trackId: string) => {
        if (!playlist || isBandcamp) return;
        removeTrackFromPlaylist(playlist.id, trackId);
    }, [removeTrackFromPlaylist, playlist, isBandcamp]);

    const handleDragEnd = useCallback(({ from, to }: { from: number; to: number }) => {
        if (from !== to && playlist && !isBandcamp) {
            reorderPlaylistTracks(playlist.id, from, to);
        }
    }, [reorderPlaylistTracks, playlist, isBandcamp]);

    const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<Track>) => {
        const index = getIndex();
        if (index === undefined) return <></>;

        return (
            <ScaleDecorator>
                <TouchableOpacity
                    style={[
                        styles.item,
                        { borderBottomColor: colors.border },
                        isActive && styles.activeItem,
                    ]}
                    onPress={() => { }}
                    disabled={isActive}
                    activeOpacity={0.7}
                >
                    <TouchableOpacity
                        onLongPress={isBandcamp ? undefined : drag}
                        delayLongPress={100}
                        style={styles.dragHandle}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={isBandcamp}
                    >
                        <Text style={[styles.position, { color: colors.textSecondary }]}>
                            {index + 1}.
                        </Text>
                        {!isBandcamp && <GripVertical size={18} color={colors.textSecondary} />}
                    </TouchableOpacity>
                    <Image
                        source={{ uri: item.artworkUrl }}
                        style={[styles.artwork, { backgroundColor: colors.card }]}
                    />
                    <View style={[styles.info]}>
                        <Text
                            style={[styles.title, { color: colors.text }]}
                            numberOfLines={1}
                        >
                            {item.title}
                        </Text>
                        <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.artist}
                        </Text>
                    </View>

                    {!isBandcamp && (
                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemove(item.playlistEntryId || item.id)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Trash2 size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>
            </ScaleDecorator>
        );
    }, [colors, handleRemove, isBandcamp]);

    const keyExtractor = useCallback((item: Track) => item.playlistEntryId || item.id, []);

    const refreshPlaylists = useStore((state) => state.refreshPlaylists);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshPlaylists();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshPlaylists]);

    const renderEmptyComponent = useCallback(() => (
        <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text }]}>Playlist is empty</Text>
        </View>
    ), [colors]);

    if (!playlist) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Stack.Screen options={{ title: 'Playlist' }} />
                <Text style={{ color: colors.text }}>Playlist not found</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
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
                        {playlist.name}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                        {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                    </Text>
                </View>
                {tracks.length > 0 && (
                    <TouchableOpacity
                        onPress={handlePlayAll}
                        style={styles.playAllBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Play size={20} color={colors.accent} fill={colors.accent} />
                    </TouchableOpacity>
                )}
            </View>

            {tracks.length === 0 ? renderEmptyComponent() : (
                <DraggableFlatList
                    data={tracks}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    onDragEnd={handleDragEnd}
                    contentContainerStyle={styles.listContent}
                    autoscrollThreshold={80}
                    autoscrollSpeed={300}
                    activationDistance={10}
                    windowSize={10}
                    removeClippedSubviews={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 5,
        borderBottomWidth: 1,
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
    playAllBtn: {
        padding: 8,
    },
    backBtn: {
        paddingRight: 12,
        paddingVertical: 8,
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
    activeItem: {
        opacity: 0.9,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    dragHandle: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    position: {
        fontSize: 12,
        fontWeight: '500',
        width: 25,
        paddingRight: 5,
        textAlign: 'right',
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
    removeBtn: {
        padding: 8,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 18,
        marginBottom: 8,
    },
});
