import { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Image as RNImage } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { useStore } from '../store';
import { Play, Pause, SkipBack, SkipForward, Minimize2, Music, Lock, Unlock } from 'lucide-react-native';
import { useTheme } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { scheduleOnRN } from 'react-native-worklets';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLLAPSED_SIZE = 55;
const EXPANDED_WIDTH = 300;
const EXPANDED_HEIGHT = 65;

export function FloatingPlayer() {
    const colors = useTheme();
    const pathname = usePathname();
    const {
        currentTrack,
        isPlaying,
        floatingPlayerEnabled,
        play,
        pause,
        next,
        previous,
        isFloatingPlayerLocked,
        toggleFloatingPlayerLock
    } = useStore();

    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial position bottom right
    const translateX = useSharedValue(SCREEN_WIDTH - COLLAPSED_SIZE - 20);
    const translateY = useSharedValue(SCREEN_HEIGHT - COLLAPSED_SIZE - 120);

    const contextX = useSharedValue(0);
    const contextY = useSharedValue(0);

    const width = useSharedValue(COLLAPSED_SIZE);
    const height = useSharedValue(COLLAPSED_SIZE);
    const borderRadius = useSharedValue(COLLAPSED_SIZE / 2);

    useEffect(() => {
        const loadPosition = async () => {
            try {
                const pos = await AsyncStorage.getItem('floating_player_pos');
                if (pos) {
                    const { x, y } = JSON.parse(pos);
                    // Ensure it's within bounds
                    const safeX = Math.max(0, Math.min(x, SCREEN_WIDTH - COLLAPSED_SIZE));
                    const safeY = Math.max(0, Math.min(y, SCREEN_HEIGHT - COLLAPSED_SIZE));
                    translateX.value = safeX;
                    translateY.value = safeY;
                }
            } catch (e) {
                console.warn('[FloatingPlayer] Failed to load position', e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadPosition();
    }, [translateX, translateY]);

    const shrink = useCallback(() => {
        setIsExpanded(false);
        width.value = withSpring(COLLAPSED_SIZE);
        height.value = withSpring(COLLAPSED_SIZE);
        borderRadius.value = withTiming(COLLAPSED_SIZE / 2);
    }, [width, height, borderRadius]);

    const resetTimeout = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (isExpanded && !isFloatingPlayerLocked) {
            timeoutRef.current = setTimeout(() => {
                shrink();
            }, 10000);
        }
    }, [isExpanded, isFloatingPlayerLocked, shrink]);

    useEffect(() => {
        resetTimeout();
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isExpanded, isPlaying, isFloatingPlayerLocked, resetTimeout]);

    const expand = () => {
        setIsExpanded(true);
        width.value = withSpring(EXPANDED_WIDTH);
        height.value = withSpring(EXPANDED_HEIGHT);
        borderRadius.value = withTiming(16);
        resetTimeout();

        // Ensure it doesn't go off-screen when expanding
        const currentX = translateX.value;
        if (currentX + EXPANDED_WIDTH > SCREEN_WIDTH) {
            translateX.value = withSpring(Math.max(0, SCREEN_WIDTH - EXPANDED_WIDTH - 10));
        }
    };

    const savePosition = async (x: number, y: number) => {
        try {
            await AsyncStorage.setItem('floating_player_pos', JSON.stringify({ x, y }));
        } catch (e) {
            console.warn('[FloatingPlayer] Failed to save position', e);
        }
    };

    const handleDragEnd = (x: number, y: number) => {
        let finalX = x;
        let finalY = y;

        const currentWidth = isExpanded ? EXPANDED_WIDTH : COLLAPSED_SIZE;
        const currentHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_SIZE;

        if (x < 0) finalX = 0;
        if (x > SCREEN_WIDTH - currentWidth) finalX = SCREEN_WIDTH - currentWidth;
        if (y < 0) finalY = 0;
        if (y > SCREEN_HEIGHT - currentHeight) finalY = SCREEN_HEIGHT - currentHeight;

        translateX.value = withSpring(finalX);
        translateY.value = withSpring(finalY);

        savePosition(finalX, finalY);
    };

    const panGesture = Gesture.Pan()
        .onStart(() => {
            contextX.value = translateX.value;
            contextY.value = translateY.value;
        })
        .onUpdate((event) => {
            let nextX = contextX.value + event.translationX;
            let nextY = contextY.value + event.translationY;

            if (nextX < 0) nextX = 0;
            if (nextX > SCREEN_WIDTH - width.value) nextX = SCREEN_WIDTH - width.value;

            if (nextY < 0) nextY = 0;
            if (nextY > SCREEN_HEIGHT - height.value) nextY = SCREEN_HEIGHT - height.value;

            translateX.value = nextX;
            translateY.value = nextY;
        })
        .onEnd(() => {
            scheduleOnRN(handleDragEnd, translateX.value, translateY.value);
            scheduleOnRN(resetTimeout);
        });

    const tapGesture = Gesture.Tap().onEnd(() => {
        if (!isExpanded) {
            scheduleOnRN(expand);
        } else {
            scheduleOnRN(resetTimeout);
        }
    });

    const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value }
            ],
            width: width.value,
            height: height.value,
            borderRadius: borderRadius.value,
        };
    });

    const DISALLOWED_PATHS = '/player';
    if (!floatingPlayerEnabled || !isLoaded || DISALLOWED_PATHS.includes(pathname)) {
        return null;
    }

    return (
        <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.container, animatedStyle, { backgroundColor: colors.accent }]}>


                {!isExpanded ? (
                    <View style={styles.collapsedIconContainer}>
                        <Music color={"#FFF"} size={24} />
                    </View>
                ) : (
                    <View style={styles.expandedContainer}>
                        <TouchableOpacity onPress={shrink} style={styles.shrinkButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Minimize2 color={"#FFF"} size={16} />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { toggleFloatingPlayerLock(); resetTimeout(); }} style={styles.lockButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            {isFloatingPlayerLocked ? <Lock color={"#FFF"} size={19} /> : <Unlock color={"#DDD"} size={19} />}
                        </TouchableOpacity>

                        <View style={styles.controlsRow}>
                            <TouchableOpacity activeOpacity={0.8} onPress={shrink}>
                                {currentTrack?.artworkUrl ? (
                                    <RNImage
                                        source={{ uri: currentTrack.artworkUrl }}
                                        style={styles.expandedImage}
                                    />
                                ) : (
                                    <View style={[styles.expandedImage, { backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }]}>
                                        <Music color={"#FFF"} size={24} />
                                    </View>
                                )}
                            </TouchableOpacity>

                            <View style={styles.playbackControls}>
                                <TouchableOpacity onPress={() => { previous(); resetTimeout(); }} style={styles.controlButton}>
                                    <SkipBack color={"#FFF"} size={24} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => { if (isPlaying) pause(); else play(); resetTimeout(); }} style={styles.controlButton}>
                                    {isPlaying ? (
                                        <Pause color={"#FFF"} size={28} />
                                    ) : (
                                        <Play color={"#FFF"} size={28} />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => { next(); resetTimeout(); }} style={styles.controlButton}>
                                    <SkipForward color={"#FFF"} size={24} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        elevation: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        zIndex: 1000,
    },
    collapsedIconContainer: {
        width: '100%',
        height: '100%',
        borderRadius: COLLAPSED_SIZE / 2,
        borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    expandedContainer: {
        flex: 1,
        padding: 8,
        justifyContent: 'center',
    },
    shrinkButton: {
        position: 'absolute',
        top: 6,
        right: 8,
        zIndex: 10,
        padding: 4,
    },
    lockButton: {
        position: 'absolute',
        bottom: 6,
        right: 8,
        zIndex: 10,
        padding: 4,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 24, // Space for the absolute buttons
    },
    expandedImage: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 12,
    },
    playbackControls: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
    },
    controlButton: {
        padding: 8,
    },
    iconButton: {
        padding: 4,
    }
});
