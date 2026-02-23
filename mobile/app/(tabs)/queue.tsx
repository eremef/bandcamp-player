import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useStore } from '../../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Trash2 } from 'lucide-react-native';
import { QueueItem } from '@shared/types';
import { useTheme } from '../../theme';

export default function QueueScreen() {
    const colors = useTheme();
    const queue = useStore((state) => state.queue);
    const mode = useStore((state) => state.mode);
    const playQueueIndex = useStore((state) => state.playQueueIndex);
    const removeFromQueue = useStore((state) => state.removeFromQueue);
    const isPlaying = useStore((state) => state.isPlaying);
    // const clearQueue = useStore((state) => state.clearQueue); 

    // Note: clearQueue is added to store but not used in UI yet per design choice or can be added seamlessly.
    // For now, focusing on fixing the crash.

    const insets = useSafeAreaInsets();

    const handlePlay = (index: number) => {
        playQueueIndex(index);
    };

    const handleRemove = (id: string) => {
        removeFromQueue(id);
    };

    const renderItem = ({ item, index }: { item: QueueItem, index: number }) => {
        const isCurrent = index === queue.currentIndex;
        const isPlayed = index < queue.currentIndex;

        return (
            <TouchableOpacity
                style={[
                    styles.item,
                    { borderBottomColor: colors.border },
                    isCurrent && { backgroundColor: colors.input },
                    isPlayed && styles.playedItem
                ]}
                onPress={() => handlePlay(index)}
            >
                <Image
                    source={{ uri: item.track.artworkUrl }}
                    style={[styles.artwork, { backgroundColor: colors.card }]}
                />

                <View style={styles.info}>
                    <Text
                        style={[styles.title, { color: colors.text }, isCurrent && { color: colors.accent }]}
                        numberOfLines={1}
                    >
                        {item.track.title}
                    </Text>
                    <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.track.artist}
                    </Text>
                </View>

                {isCurrent && isPlaying && (
                    <View style={styles.playingIndicator}>
                        <Play size={16} color={colors.accent} fill={colors.accent} />
                    </View>
                )}

                <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Trash2 size={18} color={colors.textSecondary} />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    const refreshQueue = useStore((state) => state.refreshQueue);

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        refreshQueue();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshQueue]);

    const renderEmptyComponent = () => (
        <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text }]}>Queue is empty</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Add songs from your collection</Text>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>

            <FlatList
                data={queue.items}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, queue.items.length === 0 && { flex: 1 }]}
                extraData={[queue.items.length, queue.currentIndex]}
                ListEmptyComponent={renderEmptyComponent}
                refreshControl={mode === 'standalone' ? undefined :
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    listContent: {
        paddingBottom: 20,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    currentItem: {
        backgroundColor: '#1a1a1a',
    },
    playedItem: {
        opacity: 0.6,
    },
    artwork: {
        width: 50,
        height: 50,
        borderRadius: 4,
        backgroundColor: '#333',
    },
    info: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'center',
    },
    title: {
        fontSize: 16,
        fontWeight: '500',
        color: '#fff',
        marginBottom: 4,
    },
    currentText: {
        color: '#0896afff',
    },
    artist: {
        fontSize: 14,
        color: '#888',
    },
    playingIndicator: {
        marginRight: 15,
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
        color: '#fff',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#666',
    },
});
