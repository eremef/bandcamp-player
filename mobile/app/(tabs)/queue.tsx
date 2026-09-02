import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Image, Alert } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Trash2, GripVertical, ListX, ChevronsDown } from 'lucide-react-native';
import { QueueItem } from '@shared/types';
import { useTheme } from '../../theme';

// Row geometry, shared between the StyleSheet below and getItemLayout so the two cannot drift.
const ARTWORK_SIZE = 44;
const ROW_PADDING_V = 10;
const ROW_BORDER = 1;
const ACCENT_BAR_WIDTH = 3;
const ITEM_HEIGHT = ARTWORK_SIZE + ROW_PADDING_V * 2 + ROW_BORDER;

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

    const listRef = useRef<FlatList<QueueItem>>(null);
    // null = not reported yet (unknown), which must read as "allow".
    const viewableRangeRef = useRef<{ min: number; max: number } | null>(null);
    const isDraggingRef = useRef(false);
    const currentIndexRef = useRef(queue.currentIndex);
    const prevIndexRef = useRef(queue.currentIndex);
    const itemCountRef = useRef(queue.items.length);

    // Mirrored in an effect (never during render) so the stable callbacks below can read the
    // latest values. Declared first, so it has run by the time the effects below fire.
    useEffect(() => {
        currentIndexRef.current = queue.currentIndex;
        itemCountRef.current = queue.items.length;
    });

    // Stable identity (no deps) so the focus effect below does not re-fire on every track change.
    const scrollToIndexSafe = useCallback((index: number, animated: boolean) => {
        if (index < 0 || index >= itemCountRef.current) return;
        try {
            listRef.current?.scrollToIndex({ index, animated, viewPosition: 0 });
        } catch {
            // List not measured yet — nothing to scroll.
        }
    }, []);

    // Tab screens stay mounted, so focus is what covers "opening the queue". This path
    // deliberately ignores the scrolled-away guard: re-centring is the whole point of it.
    useFocusEffect(useCallback(() => {
        scrollToIndexSafe(currentIndexRef.current, false);
        return () => { viewableRangeRef.current = null; };
    }, [scrollToIndexSafe]));

    // DFL wraps its own viewability handler and forwards to ours (DraggableFlatList.tsx:366).
    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
        const indices = viewableItems.map((v) => v.index).filter((i): i is number => i !== null);
        if (!indices.length) return;
        viewableRangeRef.current = { min: Math.min(...indices), max: Math.max(...indices) };
    }, []);

    // Follow the playing track, unless the user is dragging or has scrolled away from it.
    useEffect(() => {
        const index = queue.currentIndex;
        const prev = prevIndexRef.current;
        if (prev === index) return;
        prevIndexRef.current = index;
        if (index < 0 || isDraggingRef.current) return;
        const range = viewableRangeRef.current;
        if (range && prev >= 0 && (prev < range.min || prev > range.max)) return;
        scrollToIndexSafe(index, true);
    }, [queue.currentIndex, scrollToIndexSafe]);

    const handleClearQueue = useCallback(() => {
        if (queue.items.length === 0) return;
        Alert.alert(
            'Clear Queue',
            'Remove all items from the queue?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearQueue(false) },
            ]
        );
    }, [queue.items.length, clearQueue]);

    const handlePlay = useCallback((index: number) => {
        playQueueIndex(index);
    }, [playQueueIndex]);

    const handleRemove = useCallback((id: string) => {
        removeFromQueue(id);
    }, [removeFromQueue]);

    const handleDragEnd = useCallback(({ data, from, to }: { data: QueueItem[]; from: number; to: number }) => {
        isDraggingRef.current = false;
        if (from !== to) {
            reorderQueue(from, to, data);
        }
    }, [reorderQueue]);

    const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<QueueItem>) => {
        const dynamicIndex = getIndex();
        const fallbackIndex = queue.items.findIndex(qi => qi.id === item.id);
        const index = dynamicIndex !== undefined ? dynamicIndex : (fallbackIndex !== -1 ? fallbackIndex : 0);

        const currentPlayingId = queue.items[queue.currentIndex]?.id;
        const isCurrent = item.id === currentPlayingId;
        const isPlayed = index >= 0 && index < queue.currentIndex;

        return (
            <ScaleDecorator>
                <TouchableOpacity
                    testID={`queue-item-${index}`}
                    style={[
                        styles.item,
                        { borderBottomColor: colors.border },
                        isCurrent && { backgroundColor: colors.highlight, borderLeftColor: colors.accent },
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
                            style={[styles.title, { color: colors.text }, isCurrent && { color: colors.accent, fontWeight: '700' }]}
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
                    <View style={styles.clearBtnContainer}>
                        <TouchableOpacity
                            onPress={() => scrollToIndexSafe(currentIndexRef.current, false)}
                            style={styles.clearBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <ChevronsDown size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleClearQueue}
                            style={styles.clearBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <ListX size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            <DraggableFlatList
                ref={listRef}
                data={queue.items}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                onViewableItemsChanged={onViewableItemsChanged}
                onDragBegin={() => { isDraggingRef.current = true; }}
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
    clearBtnContainer: {
        flexDirection: 'row',
        gap: 4,
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
        paddingBottom: 43,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        // Pinned so getItemLayout stays exact even if OS font scaling grows the text column.
        height: ITEM_HEIGHT,
        paddingVertical: ROW_PADDING_V,
        paddingLeft: 4 - ACCENT_BAR_WIDTH,
        paddingRight: 16,
        borderBottomWidth: ROW_BORDER,
        borderBottomColor: '#1a1a1a',
        // Always reserved, so marking the current row only changes its colour — never the layout.
        borderLeftWidth: ACCENT_BAR_WIDTH,
        borderLeftColor: 'transparent',
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
        width: ARTWORK_SIZE,
        height: ARTWORK_SIZE,
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
