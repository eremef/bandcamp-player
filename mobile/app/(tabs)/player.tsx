import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import Slider from '@react-native-community/slider';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, MoreVertical, Volume2 } from 'lucide-react-native';
import { router } from 'expo-router';

export default function PlayerScreen() {
    const [isVolumeVisible, setIsVolumeVisible] = useState(false);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
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
        hostIp
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

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={{ width: 24 }} />
                <Text style={styles.headerTitle}>Now Playing</Text>
                <TouchableOpacity onPress={() => setIsMenuVisible(true)}>
                    <MoreVertical size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {/* Artwork */}
                <View style={styles.artworkContainer}>
                    {currentTrack && currentTrack.artworkUrl ? (
                        <Image
                            source={{ uri: currentTrack.artworkUrl }}
                            style={styles.artwork}
                        />
                    ) : (
                        <View style={[styles.artwork, styles.placeholderArtwork]}>
                            <Text style={styles.placeholderText}>
                                {currentTrack ? 'No Art' : 'No Track'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Info */}
                <View style={styles.infoContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                        {currentTrack?.title || 'Not Playing'}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                        {currentTrack?.artist || ''}
                    </Text>
                    <Text style={styles.album} numberOfLines={1}>
                        {currentTrack?.album || ''}
                    </Text>
                </View>


                {/* Spacer to push controls to bottom */}
                <View style={{ flex: 1 }} />

                {/* Progress */}
                <View style={styles.progressContainer}>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={duration || 1}
                        value={currentTime || 0}
                        onSlidingComplete={seek}
                        minimumTrackTintColor="#1da1f2"
                        maximumTrackTintColor="#333"
                        thumbTintColor="#1da1f2"
                    />
                    <View style={styles.timeContainer}>
                        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                        <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.controlsContainer}>
                    <TouchableOpacity onPress={toggleShuffle}>
                        <Shuffle size={24} color={isShuffled ? '#1da1f2' : '#666'} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={previous}>
                        <SkipBack size={32} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.playButton}
                        onPress={isPlaying ? pause : play}
                    >
                        {isPlaying ? (
                            <Pause size={32} color="#fff" fill="#fff" />
                        ) : (
                            <Play size={32} color="#fff" fill="#fff" />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={next}>
                        <SkipForward size={32} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => {
                        const nextMode = repeatMode === 'off' ? 'one' : repeatMode === 'one' ? 'all' : 'off';
                        setRepeat(nextMode);
                    }}>
                        <Repeat size={24} color={repeatMode !== 'off' ? '#1da1f2' : '#666'} />
                        {repeatMode === 'one' && (
                            <View style={styles.badgeOne}>
                                <Text style={styles.badgeText}>1</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Volume Button */}
                    <TouchableOpacity
                        style={styles.volumeButtonRowItem}
                        onPress={() => setIsVolumeVisible(true)}
                    >
                        <Volume2 size={24} color="#fff" />
                        <Text style={styles.volumeButtonTextRow}>{Math.round((volume ?? 0) * 100)}%</Text>
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
                        style={styles.menuModalOverlay}
                        onPress={() => setIsMenuVisible(false)}
                    >
                        <View style={styles.menuContainer}>
                            <Text style={styles.menuTitle}>Connected to</Text>
                            <Text style={styles.menuIp}>{hostIp}</Text>

                            <View style={styles.menuDivider} />

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setIsMenuVisible(false);
                                    router.push('/about');
                                }}
                            >
                                <Text style={styles.menuItemText}>About</Text>
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
                        <View style={styles.verticalVolumeContainer}>
                            <View style={styles.sliderWrapper}>
                                <Slider
                                    style={styles.verticalSlider}
                                    minimumValue={0}
                                    maximumValue={1}
                                    value={volume ?? 0.8}
                                    onSlidingComplete={setVolume}
                                    minimumTrackTintColor="#1da1f2"
                                    maximumTrackTintColor="#333"
                                    thumbTintColor="#fff"
                                />
                            </View>
                            <Text style={styles.modalVolumeText}>{Math.round((volume ?? 0) * 100)}%</Text>

                        </View>
                    </Pressable>
                </Modal>
            </View>
        </SafeAreaView>
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
        paddingBottom: 80,
        paddingTop: 12,
    },
    artworkContainer: {
        width: 260,
        height: 260,
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
        fontSize: 18,
        color: '#ccc',
        marginBottom: 4,
        textAlign: 'center',
    },
    album: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        marginTop: 32,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    timeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
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
        paddingHorizontal: 10, // Reduce padding to fit more items
    },
    playButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#1da1f2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeOne: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#1da1f2',
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
        width: 200,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    menuTitle: {
        color: '#888',
        fontSize: 12,
        marginBottom: 4,
    },
    menuIp: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 16,
        fontWeight: 'bold',
    },
    menuDivider: {
        width: '100%',
        height: 1,
        backgroundColor: '#333',
        marginBottom: 8,
    },
    menuItem: {
        width: '100%',
        paddingVertical: 12,
        alignItems: 'flex-start',
    },
    menuItemText: {
        color: '#fff',
        fontSize: 18,
    },
    menuItemDestructive: {
        marginTop: 4,
    },
    destructiveText: {
        color: '#ff4444',
    }
});
