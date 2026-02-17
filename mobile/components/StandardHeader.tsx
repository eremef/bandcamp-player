import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StandardHeaderProps {
    title: string;
    rightComponent?: React.ReactNode;
    leftComponent?: React.ReactNode;
}

export const StandardHeader: React.FC<StandardHeaderProps> = ({ title, rightComponent, leftComponent }) => {
    const colors = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
            <View style={styles.left}>
                {leftComponent}
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
                {title}
            </Text>
            <View style={styles.right}>
                {rightComponent}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        // Removed borderBottomWidth to keep it clean, can be added if requested
    },
    left: {
        width: 40,
        alignItems: 'flex-start',
    },
    right: {
        width: 40,
        alignItems: 'flex-end',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        flex: 1,
        letterSpacing: -0.5,
    },
});
