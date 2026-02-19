import React, { useRef, useState } from 'react';
import { StyleSheet, ActivityIndicator, View, TouchableOpacity, Text, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useStore } from '../store';
import { mobileAuthService } from '../services/MobileAuthService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../theme';
import CookieManager from '@react-native-cookies/cookies';

const LOGIN_URL = 'https://bandcamp.com/login';

export default function BandcampLoginScreen() {
    const router = useRouter();
    const colors = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const webViewRef = useRef<WebView>(null);
    const setMode = useStore((state) => state.setMode);

    // Inject JS to get cookies and user data
    // We try multiple methods:
    // 1. API call to /api/account/1/whoami (most reliable if logged in)
    // 2. window.pagedata (often has user data on homepage)
    // 3. document.cookie (least reliable due to HttpOnly)
    // Native check function - runs in React Native, NOT in WebView
    const checkNativeSession = async () => {
        try {
            console.log('Checking Native Session...');

            // This fetch should automatically use cookies from the WebView if sharedCookiesEnabled works
            // Using /api/design_system/1/menubar like the desktop app does
            const response = await fetch('https://bandcamp.com/api/design_system/1/menubar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'Accept': '*/*, application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: '{}'
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Native API Success', JSON.stringify(data).slice(0, 50));

                // Identify user from API response
                const user = data.user || data.fan;
                if (user && (user.id || user.fan_id)) {
                    // Extract and save cookies properly
                    await saveCookiesAndLogin(user);
                }
            } else {
                console.log('Native API Status:', response.status);
            }
        } catch (e) {
            console.log('Native Error:', e);
        }
    };

    // Inject JS to scrape page source as a backup (REGEX method)
    const extractCookiesJS = `
        (function() {
            try {
                // Signal that script has injected
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug',
                    message: 'Injected script active...'
                }));

                var checkPageSource = function() {
                    try {
                        if (!document.body) return;

                        var html = document.body.innerHTML;
                        var info = {
                            url: window.location.href,
                            foundId: null,
                            foundName: null,
                            foundUsername: null,
                        };
                        
                        // 1. Look for client_id/fan_id in scripts
                        var fanIdMatch = html.match(/"fan_id"\\s*:\\s*(\\d+)/) || html.match(/fan_id\\s*:\\s*(\\d+)/);
                        if (fanIdMatch) info.foundId = fanIdMatch[1];
                        
                        // 2. Look for user name/username
                        var nameMatch = html.match(/"name"\\s*:\\s*"([^"]+)"/);
                        if (nameMatch) info.foundName = nameMatch[1];
                        
                        var usMatch = html.match(/"username"\\s*:\\s*"([^"]+)"/);
                        if (usMatch) info.foundUsername = usMatch[1];

                        if (info.foundId) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'page_scrape',
                                data: info,
                                cookies: document.cookie
                            }));
                        }
                    } catch (innerE) {
                       // ignore
                    }
                };
                
                checkPageSource();
                setInterval(checkPageSource, 3000);
            } catch (e) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'critical',
                    message: 'Top-level error: ' + e.toString()
                }));
            }
        })();
    `;

    const handleMessage = async (event: any) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);

            // Handle Page Scrape Fallback
            if (message.type === 'page_scrape') {
                const scrape = message.data;
                if (scrape.foundId) {
                    console.log('Scrape found ID:', scrape.foundId);
                    if (message.cookies) await mobileAuthService.setCookies(message.cookies);

                    const authState = {
                        isAuthenticated: true,
                        user: {
                            id: scrape.foundId,
                            username: scrape.foundUsername || 'user',
                            displayName: scrape.foundName || scrape.foundUsername || 'Bandcamp User',
                            profileUrl: `https://bandcamp.com/${scrape.foundUsername || 'profile'}`,
                            avatarUrl: ''
                        }
                    };
                    useStore.setState({ auth: authState });
                    await setMode('standalone');
                    setIsLoading(false);
                    router.replace('/(tabs)/player');
                    return;
                }
            }

            // Also trigger native check on interaction/interval
            checkNativeSession();
        } catch (e) {
            console.log('Error in handleMessage:', e);
        }
    };

    const saveCookiesAndLogin = async (user: any) => {
        try {
            console.log('Getting cookies from CookieManager...');
            const cookies = await CookieManager.get('https://bandcamp.com');

            // Format cookies for header: key=value; key2=value2
            const cookieString = Object.entries(cookies)
                .map(([key, value]) => `${key}=${value.value}`)
                .join('; ');

            console.log('Extracted Cookies Length:', cookieString.length);
            await mobileAuthService.setCookies(cookieString);

            // Construct user object
            const authUser = {
                id: user.id || user.fan_id,
                username: user.username,
                displayName: user.name || user.username,
                profileUrl: user.url || `https://bandcamp.com/${user.username}`,
                avatarUrl: user.photo_url || user.image_url || user.image || ''
            };

            // Save user to storage for reliable access
            await mobileAuthService.setUser(authUser);

            const authState = {
                isAuthenticated: true,
                user: authUser
            };

            useStore.setState({ auth: authState });
            await setMode('standalone');
            setIsLoading(false);
            router.replace('/(tabs)/player');
        } catch (e) {
            console.error('Failed to save cookies:', e);
            // Fallback to just proceeding if critical, but scraper might fail
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <X color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Login to Bandcamp</Text>
                <TouchableOpacity onPress={checkNativeSession} style={styles.checkButton}>
                    <Text style={{ color: colors.accent, fontWeight: 'bold' }}>Native Check</Text>
                </TouchableOpacity>
            </View>

            <WebView
                ref={webViewRef}
                source={{ uri: LOGIN_URL }}
                style={styles.webview}
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => {
                    setIsLoading(false);
                    checkNativeSession();
                }}
                onMessage={handleMessage}
                injectedJavaScript={extractCookiesJS}
                sharedCookiesEnabled={true}
                domStorageEnabled={true}
                javaScriptEnabled={true} // Explicitly enable JS
            />

            {isLoading && (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.accent} />
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
    checkButton: {
        padding: 8,
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 60, // below header
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
