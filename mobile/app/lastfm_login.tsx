import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { mobileScrobblerService } from '../services/MobileScrobblerService';

const CALLBACK_URL = 'http://localhost:26505/lastfm-callback';

export default function LastfmLoginScreen() {
    const router = useRouter();
    const colors = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const apiKey = mobileScrobblerService.getApiKey();
    const authUrl = `${mobileScrobblerService.getAuthUrl()}?api_key=${apiKey}&cb=${encodeURIComponent(CALLBACK_URL)}`;

    const handleNavigationChange = async (navState: { url: string }) => {
        if (isProcessing) return;

        if (navState.url.startsWith(CALLBACK_URL)) {
            setIsProcessing(true);

            try {
                const url = new URL(navState.url);
                const token = url.searchParams.get('token');

                if (token) {
                    console.log('[LastfmLogin] Token received, exchanging for session...');
                    const state = await mobileScrobblerService.getSession(token);
                    useStore.setState({ lastfmState: state });
                    console.log('[LastfmLogin] Session obtained successfully');
                } else {
                    console.warn('[LastfmLogin] No token in callback URL');
                }
            } catch (error) {
                console.error('[LastfmLogin] Auth error:', error);
            }

            router.back();
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <X color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Connect to Last.fm</Text>
            </View>

            <WebView
                source={{ uri: authUrl }}
                style={styles.webview}
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                onNavigationStateChange={handleNavigationChange}
                javaScriptEnabled={true}
            />

            {(isLoading || isProcessing) && (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    {isProcessing && (
                        <Text style={[styles.processingText, { color: colors.textSecondary }]}>
                            Connecting...
                        </Text>
                    )}
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 8,
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    processingText: {
        marginTop: 12,
        fontSize: 14,
    },
});
