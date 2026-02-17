import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { Asset } from 'expo-asset';
import { useTheme } from '../theme';
import { File } from 'expo-file-system';

export default function LicenseScreen() {
    const colors = useTheme();
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadLicense() {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const asset = Asset.fromModule(require('../assets/license.txt'));
                await asset.downloadAsync();

                if (asset.localUri) {
                    const file = new File(asset.localUri);
                    const text = await file.text();
                    setContent(text);
                }
            } catch (error) {
                console.error('Failed to load license:', error);
                setContent('Failed to load license text.');
            } finally {
                setLoading(false);
            }
        }

        loadLicense();
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>License</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={[styles.licenseText, { color: colors.textSecondary }]}>{content}</Text>
                </ScrollView>
            )}
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
        paddingTop: 10,
        height: 60,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    licenseText: {
        color: '#ccc',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'monospace',
    },
});
