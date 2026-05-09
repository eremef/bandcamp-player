import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';
import { CollectionItem } from '@shared/types';
import { useTheme } from '../theme';

interface CollectionGridItemProps {
    item: CollectionItem;
    onPress: (item: CollectionItem) => void;
    onLongPress?: (item: CollectionItem) => void;
    width: number;
    testID?: string;
}

export const CollectionGridItem: React.FC<CollectionGridItemProps> = React.memo(({
    item,
    onPress,
    onLongPress,
    width,
    testID
}) => {
    const colors = useTheme();
    // ... logic remains same ...
    let artworkUrl, title, artist;

    if (item.type === 'album' && item.album) {
        artworkUrl = item.album.artworkUrl;
        title = item.album.title;
        artist = item.album.artist;
    } else if (item.type === 'track' && item.track) {
        artworkUrl = item.track.artworkUrl;
        title = item.track.title;
        artist = item.track.artist;
    } else {
        return null;
    }

    return (
        <TouchableOpacity
            style={[styles.container, { width }]}
            onPress={() => onPress(item)}
            onLongPress={() => onLongPress?.(item)}
            delayLongPress={500}
            testID={testID}
        >
            <View style={[styles.artworkContainer, { backgroundColor: colors.input }]}>
                {artworkUrl ? (
                    <Image source={{ uri: artworkUrl }} style={styles.artwork} />
                ) : (
                    <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.card }]}>
                        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>♪</Text>
                    </View>
                )}
                {item.isWishlist && (
                    <View style={styles.wishlistBadge}>
                        <Heart size={14} color={colors.error} fill={colors.error} />
                    </View>
                )}
            </View>
            <View style={styles.info}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                    {artist}
                </Text>
            </View>
        </TouchableOpacity>
    );
});

CollectionGridItem.displayName = 'CollectionGridItem';

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
    },
    artworkContainer: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
        marginBottom: 4,
        position: 'relative',
    },
    wishlistBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 12,
        padding: 4,
    },
    artwork: {
        width: '100%',
        height: '100%',
    },
    placeholderArtwork: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#666',
        fontSize: 24,
    },
    info: {
        paddingHorizontal: 2,
    },
    title: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 2,
    },
    artist: {
        color: '#888',
        fontSize: 10,
    },
    label: {
        fontSize: 9,
        opacity: 0.8,
    },
});
