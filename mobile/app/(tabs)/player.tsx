import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import Slider from '@react-native-community/slider';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, MoreVertical } from 'lucide-react-native';
import { router } from 'expo-router';

export default function PlayerScreen() {
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
        disconnect
    } = useStore();

    const handleDisconnect = () => {
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
                <TouchableOpacity onPress={handleDisconnect}>
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
                </View>
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
        paddingTop: 8,
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
        justifyContent: 'space-between',
        paddingBottom: 48,
        paddingTop: 12,
    },
    artworkContainer: {
        width: 300,
        height: 300,
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
        paddingHorizontal: 0,
    },
    timeText: {
        color: '#888',
        fontSize: 12,
    },
    controlsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 32,
        paddingHorizontal: 16,
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
    }
});
