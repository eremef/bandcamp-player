import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Image, Alert } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useStore } from '../../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Trash2, GripVertical, ListX } from 'lucide-react-native';
import { QueueItem } from '@shared/types';
import { useTheme } from '../../theme';

export default function QueueScreen() {
    const colors = useTheme();
    const queue = useStore((state) => state.queue);
    const mode = useStore((state) => state.mode);
    const playQueueIndex = useStore((state) => state.playQueueIndex);
    const removeFromQueue = useStore((state) => state.removeFromQueue);
    const reorderQueue = useStore((state) => state.reorderQueue);
    const isPlaying = useStore((state) => state.isPlaying);
    const clearQueue = useStore((state) => state.clearQueue);

    const insets = useSafeAreaInsets();

    const handleClearQueue = useCallback(() => {
        if (queue.items.length === 0) return;
        Alert.alert(
            'Clear Queue',
            'Remove all items from the queue?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearQueue() },
            ]
        );
    }, [queue.items.length, clearQueue]);

    const handlePlay = useCallback((index: number) => {
        playQueueIndex(index);
    }, [playQueueIndex]);

    const handleRemove = useCallback((id: string) => {
        removeFromQueue(id);
    }, [removeFromQueue]);

    const handleDragEnd = useCallback(({ from, to }: { from: number; to: number }) => {
        if (from !== to) {
            reorderQueue(from, to);
        }
    }, [reorderQueue]);

    const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<QueueItem>) => {
        const index = queue.items.findIndex(qi => qi.id === item.id);
        if (index === -1) return <></>;
        const isCurrent = index === queue.currentIndex;
        const isPlayed = index < queue.currentIndex;

        return (
            <ScaleDecorator>
                <TouchableOpacity
                    style={[
                        styles.item,
                        { borderBottomColor: colors.border },
                        isCurrent && { backgroundColor: colors.input },
                        isPlayed && styles.playedItem,
                        isActive && styles.activeItem,
                    ]}
                    onPress={() => handlePlay(index)}
                    disabled={isActive}
                    activeOpacity={0.7}
                >
                    <TouchableOpacity
                        onLongPress={drag}
                        delayLongPress={100}
                        style={styles.dragHandle}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={[styles.position, { color: colors.textSecondary }, isCurrent && { color: colors.accent }]}>
                            {index + 1}.
                        </Text>
                        <GripVertical size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Image
                        source={{ uri: item.track.artworkUrl }}
                        style={[styles.artwork, { backgroundColor: colors.card }]}
                    />
                    <View style={[styles.info]}>
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
            </ScaleDecorator>
        );
    }, [queue.currentIndex, queue.items, isPlaying, colors, handlePlay, handleRemove]);

    const refreshQueue = useStore((state) => state.refreshQueue);

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        refreshQueue();
        setTimeout(() => {
            setRefreshing(false);
        }, 1500);
    }, [refreshQueue]);

    const keyExtractor = useCallback((item: QueueItem) => item.id, []);

    const renderEmptyComponent = useCallback(() => (
        <View style={styles.emptyContainer}>

            <Text style={[styles.emptyText, { color: colors.text }]}>Queue is empty</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Add songs from your collection</Text>
        </View>
    ), [colors]);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>
            {queue.items.length > 0 && (
                <View style={styles.header}>
                    <Text style={[styles.headerText, { color: colors.textSecondary }]}>
                        {queue.items.length} {queue.items.length === 1 ? 'track' : 'tracks'}
                    </Text>
                    <TouchableOpacity
                        onPress={handleClearQueue}
                        style={styles.clearBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <ListX size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}
            <DraggableFlatList
                data={queue.items}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                onDragEnd={handleDragEnd}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={renderEmptyComponent}
                autoscrollThreshold={80}
                autoscrollSpeed={300}
                activationDistance={10}
                windowSize={10}
                removeClippedSubviews={false}
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerText: {
        fontSize: 13,
        fontWeight: '500',
    },
    clearBtn: {
        padding: 4,
    },
    listContent: {
        paddingBottom: 20,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingLeft: 4,
        paddingRight: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    activeItem: {
        opacity: 0.9,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    playedItem: {
        opacity: 0.6,
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
        color: '#888',
    },
    artwork: {
        width: 44,
        height: 44,
        borderRadius: 4,
        marginHorizontal: 5,
        backgroundColor: '#333',
    },
    info: {
        flex: 1,
        marginLeft: 5,
        justifyContent: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: '500',
        color: '#fff',
        marginBottom: 2,
    },
    artist: {
        fontSize: 12,
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
