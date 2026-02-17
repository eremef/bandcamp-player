import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Github, ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '../theme';

export default function AboutScreen() {
    const colors = useTheme();
    const version = Constants.expoConfig?.version || '1.5.0-beta';

    const handleGithubPress = () => {
        Linking.openURL('https://github.com/eremef/Bandcamp-player');
    };

    const handleWebsitePress = () => {
        Linking.openURL('https://eremef.xyz');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>About</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.content}>
                <View style={styles.logoContainer}>
                    {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
                    <Image source={require('../assets/icon.png')} style={styles.logo} />
                </View>

                <Text style={[styles.appName, { color: colors.text }]}>Bandcamp Remote</Text>
                <Text style={[styles.version, { color: colors.textSecondary }]}>Version {version}</Text>

                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    A remote control companion for the Bandcamp Desktop Player.
                    Control playback, browse your collection, and manage your queue from your mobile device.
                </Text>

                <TouchableOpacity style={[styles.githubButton, { backgroundColor: colors.accent }]} onPress={handleGithubPress}>
                    <Github size={24} color="#fff" />
                    <Text style={[styles.githubText, { color: '#fff' }]}>View on GitHub</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.copyright} onPress={handleWebsitePress}>
                    <Text style={[styles.copyright, { color: colors.textSecondary }]}>
                        © {new Date().getFullYear()} eremef.xyz
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/license' as any)}>
                    <Text style={[styles.copyright, styles.licenseLink, { color: colors.textSecondary }]}>
                        Licensed under the MIT License.
                    </Text>
                </TouchableOpacity>
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
    content: {
        flex: 1,
        alignItems: 'center',
        padding: 24,
        paddingTop: 60,
    },
    logoContainer: {
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    logo: {
        width: 120,
        height: 120,
        borderRadius: 24,
    },
    appName: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    version: {
        fontSize: 16,
        color: '#888',
        marginBottom: 32,
    },
    description: {
        fontSize: 16,
        color: '#ccc',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 48,
        maxWidth: 300,
    },
    githubButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#333',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 30,
        marginBottom: 'auto',
    },
    githubText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
        marginLeft: 12,
    },
    copyright: {
        color: '#666',
        fontSize: 14,
        marginTop: 20,
    },
    licenseLink: {
        textDecorationLine: 'underline',
        marginTop: 4,
    }
});
