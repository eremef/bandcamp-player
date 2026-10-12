import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Image, Alert, Modal, ActivityIndicator } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Trash2, GripVertical, ListX, ChevronsDown, Import } from 'lucide-react-native';
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
    const desktopSocketConnected = useStore((state) => state.desktopSocketConnected);
    const desktopQueueAvailability = useStore((state) => state.desktopQueueAvailability);
    const desktopQueueAvailabilityRevision = useStore((state) => state.desktopQueueAvailabilityRevision);
    const isContinuingDesktopQueue = useStore((state) => state.isContinuingDesktopQueue);
    const desktopContinuationError = useStore((state) => state.desktopContinuationError);
    const continueDesktopQueue = useStore((state) => state.continueDesktopQueue);
    const [showReplaceQueueModal, setShowReplaceQueueModal] = useState(false);
    const [confirmationAvailabilityRevision, setConfirmationAvailabilityRevision] = useState<number | null>(null);

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

    const handleContinueDesktopQueue = useCallback(async (confirmed = false) => {
        const result = await continueDesktopQueue(confirmed);
        if (result === 'confirmation-required') {
            setConfirmationAvailabilityRevision(useStore.getState().desktopQueueAvailabilityRevision);
            setShowReplaceQueueModal(true);
        } else {
            setShowReplaceQueueModal(false);
        }
    }, [continueDesktopQueue]);

    const showContinueDesktopQueue = mode === 'standalone' && desktopSocketConnected &&
        desktopQueueAvailability === 'nonempty';
    const showReplaceQueueConfirmation = showReplaceQueueModal && showContinueDesktopQueue &&
        confirmationAvailabilityRevision === desktopQueueAvailabilityRevision;

    const keyExtractor = useCallback((item: QueueItem) => item.id, []);

    const renderEmptyComponent = useCallback(() => (
        <View style={styles.emptyContainer}>

            <Text style={[styles.emptyText, { color: colors.text }]}>Queue is empty</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Add songs from your collection</Text>
        </View>
    ), [colors]);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>
            {desktopContinuationError && (
                <Text accessibilityRole="alert" style={[styles.continuationError, { color: colors.textSecondary }]}>
                    {desktopContinuationError}
                </Text>
            )}
            {(queue.items.length > 0 || showContinueDesktopQueue) && (
                <View style={styles.header}>
                    <Text style={[styles.headerText, { color: colors.textSecondary }]}>
                        {queue.items.length > 0
                            ? `${queue.items.length} ${queue.items.length === 1 ? 'track' : 'tracks'}`
                            : 'Desktop queue'}
                    </Text>
                    <View style={styles.clearBtnContainer}>
                        {showContinueDesktopQueue && (
                            <TouchableOpacity
                                testID="continue-desktop-queue"
                                onPress={() => { void handleContinueDesktopQueue(); }}
                                style={styles.clearBtn}
                                disabled={isContinuingDesktopQueue}
                                accessibilityState={{ disabled: isContinuingDesktopQueue, busy: isContinuingDesktopQueue }}
                                accessibilityRole="button"
                                accessibilityLabel={isContinuingDesktopQueue ? 'Preparing desktop queue' : 'Continue desktop queue on phone'}
                                accessibilityHint={isContinuingDesktopQueue
                                    ? 'Preparing the desktop queue for playback on this phone.'
                                    : 'Replaces the phone queue with the desktop queue and starts playback on this phone.'}
                            >
                                {isContinuingDesktopQueue
                                    ? <ActivityIndicator testID="desktop-queue-loading-indicator" size="small" color={colors.textSecondary} />
                                    : <Import size={20} color={colors.textSecondary} />}
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            testID="scroll-to-current-track"
                            onPress={() => scrollToIndexSafe(currentIndexRef.current, false)}
                            style={styles.clearBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            disabled={queue.items.length === 0}
                            accessibilityState={{ disabled: queue.items.length === 0 }}
                            accessibilityRole="button"
                            accessibilityLabel="Scroll to current track"
                            accessibilityHint="Moves the queue list to the track currently playing on this phone."
                        >
                            <ChevronsDown size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="clear-phone-queue"
                            onPress={handleClearQueue}
                            style={styles.clearBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            disabled={queue.items.length === 0}
                            accessibilityState={{ disabled: queue.items.length === 0 }}
                            accessibilityRole="button"
                            accessibilityLabel="Clear phone queue"
                            accessibilityHint="Removes all tracks from the phone's queue."
                        >
                            <ListX size={20} color={colors.error} />
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
            <Modal
                visible={showReplaceQueueConfirmation}
                transparent
                animationType="fade"
                onRequestClose={() => setShowReplaceQueueModal(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Replace phone queue?</Text>
                        <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
                            Continue the desktop queue on this phone and replace its current queue?
                        </Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                testID="cancel-continue-desktop-queue"
                                style={styles.modalAction}
                                onPress={() => setShowReplaceQueueModal(false)}
                                disabled={isContinuingDesktopQueue}
                            >
                                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID="confirm-continue-desktop-queue"
                                style={styles.modalAction}
                                onPress={() => { void handleContinueDesktopQueue(true); }}
                                disabled={isContinuingDesktopQueue}
                            >
                                <Text style={{ color: colors.accent }}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
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
    continuationError: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        fontSize: 13,
    },
    modalBackdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    modalCard: {
        width: '100%',
        maxWidth: 420,
        padding: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    modalMessage: {
        fontSize: 14,
        lineHeight: 20,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 20,
        gap: 20,
    },
    modalAction: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
});
