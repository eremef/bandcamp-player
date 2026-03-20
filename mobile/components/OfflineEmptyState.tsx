import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useStore } from '../store';

interface OfflineEmptyStateProps {
    visible: boolean;
    message?: string;
}

export function OfflineEmptyState({ visible, message }: OfflineEmptyStateProps) {
    const colors = useTheme();
    const setMode = useStore((state) => state.setMode);

    if (!visible) {
        return null;
    }

    const displayMessage = message ?? 'Switch to Standalone mode to download music for offline listening';

    const handleSwitchToStandalone = () => {
        setMode('standalone');
    };

    return (
        <View style={styles.container}>
            <WifiOff size={48} color={colors.textSecondary} />
            <Text style={[styles.message, { color: colors.textSecondary }]}>
                {displayMessage}
            </Text>
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }]}
                onPress={handleSwitchToStandalone}
                activeOpacity={0.8}
            >
                <Text style={styles.buttonText}>Switch to Standalone</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        gap: 16,
    },
    message: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 22,
    },
    button: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});
