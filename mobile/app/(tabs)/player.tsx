import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import Slider from '@react-native-community/slider';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, MoreVertical, Volume2, Moon, Sun, Monitor, Check } from 'lucide-react-native';
import { Theme } from '@shared/types';
import { router } from 'expo-router';
import { useTheme } from '../../theme';
import { StandardHeader } from '../../components/StandardHeader';

export default function PlayerScreen() {
    const colors = useTheme();
    const [isVolumeVisible, setIsVolumeVisible] = useState(false);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const {
        currentTrack,
        isPlaying,
        duration,
        currentTime,
        play,
        pause,
        next,
        previous,
        seek,
        toggleShuffle,
        setRepeat,
        repeatMode,
        isShuffled,
        disconnect,
        volume,
        setVolume,
        hostIp,
        theme,
        setTheme
    } = useStore();

    const handleDisconnect = () => {
        setIsMenuVisible(false); // Close menu first

        setTimeout(() => {
            Alert.alert(
                "Disconnect",
                "Are you sure you want to disconnect?",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Disconnect",
                        style: "destructive",
                        onPress: () => {
                            disconnect();
                            router.replace('/');
                        }
                    }
                ]
            );
        }, 300); // Small delay to allow menu animation to finish
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const renderThemeOption = (option: Theme, label: string, Icon: any) => {
        const isSelected = theme === option;
        return (
            <TouchableOpacity
                style={[
                    styles.menuThemeOption,
                    isSelected && { borderColor: colors.accent, borderWidth: 1 }
                ]}
                onPress={() => setTheme(option)}
            >
                <View style={styles.menuThemeOptionLeft}>
                    <Icon size={20} color={isSelected ? colors.accent : colors.textSecondary} />
                    <Text style={[styles.menuThemeLabel, { color: colors.text }]}>{label}</Text>
                </View>
                {isSelected && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StandardHeader
                title="Now Playing"
                rightComponent={
                    <TouchableOpacity onPress={() => setIsMenuVisible(true)}>
                        <MoreVertical size={24} color={colors.text} />
                    </TouchableOpacity>
                }
            />

            <View style={styles.content}>
                {/* Artwork */}
                <View style={[styles.artworkContainer, { backgroundColor: colors.input, shadowColor: colors.text }]}>
                    {currentTrack && currentTrack.artworkUrl ? (
                        <Image
                            source={{ uri: currentTrack.artworkUrl }}
                            style={styles.artwork}
                        />
                    ) : (
                        <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.card }]}>
                            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                                {currentTrack ? 'No Art' : 'No Track'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Info */}
                <View style={styles.infoContainer}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                        {currentTrack?.title || 'Not Playing'}
                    </Text>
                    <Text style={[styles.artist, { color: colors.accent }]} numberOfLines={1}>
                        {currentTrack?.artist || ''}
                    </Text>
                    <Text style={[styles.album, { color: colors.textSecondary }]} numberOfLines={1}>
                        {currentTrack?.album || ''}
                    </Text>
                </View>

                <View style={{ flex: 1 }} />

                {/* Progress */}
                <View style={styles.progressContainer}>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={duration || 1}
                        value={currentTime || 0}
                        onSlidingComplete={seek}
                        minimumTrackTintColor={colors.accent}
                        maximumTrackTintColor={colors.border}
                        thumbTintColor={colors.accent}
                    />
                    <View style={styles.timeContainer}>
                        <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatTime(currentTime)}</Text>
                        <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatTime(duration)}</Text>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.controlsContainer}>
                    <TouchableOpacity onPress={toggleShuffle}>
                        <Shuffle size={24} color={isShuffled ? colors.accent : colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={previous}>
                        <SkipBack size={32} color={colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.playButton, { backgroundColor: colors.accent }]}
                        onPress={isPlaying ? pause : play}
                    >
                        {isPlaying ? (
                            <Pause size={32} color="#fff" fill="#fff" />
                        ) : (
                            <Play size={32} color="#fff" fill="#fff" />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={next}>
                        <SkipForward size={32} color={colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => {
                        const nextMode = repeatMode === 'off' ? 'one' : repeatMode === 'one' ? 'all' : 'off';
                        setRepeat(nextMode);
                    }}>
                        <Repeat size={24} color={repeatMode !== 'off' ? colors.accent : colors.textSecondary} />
                        {repeatMode === 'one' && (
                            <View style={[styles.badgeOne, { backgroundColor: colors.accent }]}>
                                <Text style={styles.badgeText}>1</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Volume Button */}
                    <TouchableOpacity
                        style={styles.volumeButtonRowItem}
                        onPress={() => setIsVolumeVisible(true)}
                    >
                        <Volume2 size={24} color={colors.text} />
                        <Text style={[styles.volumeButtonTextRow, { color: colors.textSecondary }]}>{Math.round((volume ?? 0) * 100)}%</Text>
                    </TouchableOpacity>
                </View>

                {/* Menu Modal */}
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={isMenuVisible}
                    onRequestClose={() => setIsMenuVisible(false)}
                >
                    <Pressable
                        style={[styles.menuModalOverlay, { paddingTop: insets.top + 20 }]}
                        onPress={() => setIsMenuVisible(false)}
                    >
                        <View style={[styles.menuContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={[styles.menuTitle, { color: colors.textSecondary }]}>Connected to</Text>
                            <Text style={[styles.menuIp, { color: colors.text }]}>{hostIp}</Text>

                            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

                            <Text style={[styles.menuLabel, { color: colors.textSecondary }]}>Appearance</Text>
                            <View style={styles.themeOptionsContainer}>
                                {renderThemeOption('system', 'System', Monitor)}
                                {renderThemeOption('light', 'Light', Sun)}
                                {renderThemeOption('dark', 'Dark', Moon)}
                            </View>

                            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setIsMenuVisible(false);
                                    router.push('/about' as any);
                                }}
                            >
                                <Text style={[styles.menuItemText, { color: colors.text }]}>About</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.menuItem, styles.menuItemDestructive]}
                                onPress={handleDisconnect}
                            >
                                <Text style={[styles.menuItemText, styles.destructiveText]}>Disconnect</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Modal>

                {/* Vertical Volume Modal */}
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={isVolumeVisible}
                    onRequestClose={() => setIsVolumeVisible(false)}
                >
                    <Pressable
                        style={styles.volumeModalOverlay}
                        onPress={() => setIsVolumeVisible(false)}
                    >
                        <View style={[styles.verticalVolumeContainer, { backgroundColor: colors.card }]}>
                            <View style={styles.sliderWrapper}>
                                <Slider
                                    style={styles.verticalSlider}
                                    minimumValue={0}
                                    maximumValue={1}
                                    value={volume ?? 0.8}
                                    onSlidingComplete={setVolume}
                                    minimumTrackTintColor={colors.accent}
                                    maximumTrackTintColor={colors.border}
                                    thumbTintColor={colors.accent}
                                />
                            </View>
                            <Text style={[styles.modalVolumeText, { color: colors.text }]}>{Math.round((volume ?? 0) * 100)}%</Text>

                        </View>
                    </Pressable>
                </Modal>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },

    controls: {
        width: '100%',
        justifyContent: 'flex-end',
    },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 20,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        paddingBottom: 12,
        paddingTop: 12,
    },
    artworkContainer: {
        width: '81%',
        aspectRatio: 1,
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.5,
        shadowRadius: 13.16,
        elevation: 20,
    },
    artwork: {
        width: '100%',
        height: '100%',
    },
    placeholderArtwork: {
        backgroundColor: '#1e1e1e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#666',
        fontSize: 18,
    },
    infoContainer: {
        alignItems: 'center',
        marginTop: 32,
        width: '100%',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    artist: {
        fontSize: 20,
        color: '#ccc',
        marginBottom: 4,
        textAlign: 'center',
    },
    album: {
        fontSize: 16,
        color: '#888',
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        marginTop: 15,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    timeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 11,
    },
    timeText: {
        color: '#888',
        fontSize: 12,
    },
    controlsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between', // Try 'space-around' if it crowds
        width: '100%',
        paddingHorizontal: 11, // Reduce padding to fit more items
        paddingBottom: 15,
    },
    playButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#0896afff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeOne: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#0896afff',
        width: 12,
        height: 12,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#fff',
        fontSize: 8,
        fontWeight: 'bold',
    },
    volumeButtonRowItem: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        paddingBottom: 3,
        marginBottom: 10,
    },
    volumeButtonTextRow: {
        color: '#fff',
        fontSize: 10,
        marginTop: 2,
        fontWeight: 'bold',
        position: 'absolute',
        bottom: -14,
        width: '100%',
        textAlign: 'center',
    },
    menuModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-start',
        paddingRight: 25,
        paddingTop: 80,
        alignItems: 'flex-end',
    },
    volumeModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 25,
        paddingTop: 25,
    },
    verticalVolumeContainer: {
        backgroundColor: '#1e1e1e',
        padding: 20,
        borderRadius: 24,
        alignItems: 'center',
        height: 300,
        justifyContent: 'space-between',
        width: 90,
    },
    sliderWrapper: {
        height: 200,
        width: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    verticalSlider: {
        width: 200,
        height: 40,
        transform: [{ rotate: '-90deg' }],
    },
    modalVolumeText: {
        color: '#fff',
        fontSize: 16,
        bottom: 15,
        fontWeight: 'bold'
    },
    menuContainer: {
        backgroundColor: '#1e1e1e',
        width: 240,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
    },
    menuTitle: {
        color: '#888',
        fontSize: 10,
        marginBottom: 2,
        alignSelf: 'flex-start',
    },
    menuIp: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 12,
        fontWeight: 'bold',
        alignSelf: 'flex-start',
    },
    menuLabel: {
        color: '#888',
        fontSize: 10,
        marginBottom: 8,
        alignSelf: 'flex-start',
        textTransform: 'uppercase',
    },
    themeOptionsContainer: {
        width: '100%',
        marginBottom: 8,
    },
    menuThemeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 4,
    },
    menuThemeOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuThemeLabel: {
        fontSize: 14,
    },
    menuDivider: {
        width: '100%',
        height: 1,
        backgroundColor: '#333',
        marginVertical: 12,
    },
    menuItem: {
        width: '100%',
        paddingVertical: 10,
        alignItems: 'flex-start',
    },
    menuItemText: {
        color: '#fff',
        fontSize: 16,
    },
    menuItemDestructive: {
        marginTop: 0,
    },
    destructiveText: {
        color: '#ff4444',
    }
});
