import { View, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { useTheme } from '../theme';

interface CachedIndicatorProps {
    trackId: string;
    size?: 'small' | 'medium';
}

export function CachedIndicator({ trackId, size = 'small' }: CachedIndicatorProps) {
    const { cachedTrackIds, downloadingTrackIds } = useStore();
    const colors = useTheme();
    
    const isCached = cachedTrackIds.has(trackId);
    const progress = downloadingTrackIds.get(trackId);
    const isDownloading = progress !== undefined;

    if (!isCached && !isDownloading) {
        return null;
    }

    return (
        <View style={[styles.container, styles[size]]}>
            {isCached && <View style={[styles.cachedDot, { backgroundColor: colors.accent }]} />}
            {isDownloading && (
                <View style={[styles.downloadingRing, { 
                    borderColor: `rgba(0,122,255,${progress})` 
                }]} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    small: {
        width: 16,
        height: 16,
    },
    medium: {
        width: 24,
        height: 24,
    },
    cachedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    downloadingRing: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
});
