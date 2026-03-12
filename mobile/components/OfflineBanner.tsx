import { View, Text, StyleSheet } from 'react-native';
import { useOfflineMode } from '../services/useOfflineMode';

export function OfflineBanner() {
    const { isOffline, manualOfflineOverride } = useOfflineMode();
    
    if (!isOffline) {
        return null;
    }

    return (
        <View style={styles.banner}>
            <Text style={styles.text}>
                {manualOfflineOverride 
                    ? 'Offline Mode (Manual)' 
                    : 'No Internet Connection'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        backgroundColor: '#FF9500',
        padding: 8,
        alignItems: 'center',
    },
    text: {
        color: '#fff',
        fontWeight: '600',
    },
});
