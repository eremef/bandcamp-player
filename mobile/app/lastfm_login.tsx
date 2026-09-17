import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../theme';
import { mobileScrobblerService } from '../services/MobileScrobblerService';
import { isLastfmCallbackUrl, LASTFM_CALLBACK_URL } from '../services/lastfm-auth';

type LoginPhase = 'loading' | 'authorizing' | 'exchanging' | 'error';

export default function LastfmLoginScreen() {
    const router = useRouter();
    const colors = useTheme();
    const [attempt, setAttempt] = useState(() => mobileScrobblerService.createAuthenticationUrl(LASTFM_CALLBACK_URL));
    const [phase, setPhase] = useState<LoginPhase>('loading');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [canRetrySave, setCanRetrySave] = useState(false);
    const [webViewKey, setWebViewKey] = useState(0);
    const processingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => () => {
        mountedRef.current = false;
        mobileScrobblerService.cancelAuthentication(attempt.attemptId);
    }, [attempt.attemptId]);

    useEffect(() => {
        if (phase !== 'loading') return;
        const timeout = setTimeout(() => {
            setPhase('error');
            setError('Last.fm took too long to load. Check your connection and try again.');
        }, 20_000);
        return () => clearTimeout(timeout);
    }, [phase, attempt.attemptId]);

    const close = () => {
        mobileScrobblerService.cancelAuthentication(attempt.attemptId);
        router.back();
    };

    const retry = () => {
        if (canRetrySave) {
            processingRef.current = true;
            setPhase('exchanging');
            setError(null);
            void mobileScrobblerService.retryPendingSession(attempt.attemptId)
                .then(() => {
                    if (mountedRef.current) router.back();
                })
                .catch((saveError: unknown) => {
                    if (!mountedRef.current) return;
                    processingRef.current = false;
                    setPhase('error');
                    setError(saveError instanceof Error ? saveError.message : 'Could not save the Last.fm connection.');
                    setCanRetrySave(mobileScrobblerService.hasPendingSession(attempt.attemptId));
                });
            return;
        }
        mobileScrobblerService.cancelAuthentication(attempt.attemptId);
        processingRef.current = false;
        setAttempt(mobileScrobblerService.createAuthenticationUrl(LASTFM_CALLBACK_URL));
        setPhase('loading');
        setProgress(0);
        setError(null);
        setCanRetrySave(false);
        setWebViewKey(value => value + 1);
    };

    const processCallback = async (url: string) => {
        if (processingRef.current || !isLastfmCallbackUrl(url)) return;
        processingRef.current = true;
        setPhase('exchanging');
        setError(null);
        try {
            const token = new URL(url).searchParams.get('token');
            if (!token) throw new Error('Last.fm did not return an authorization token.');
            await mobileScrobblerService.getSession(token, attempt.attemptId);
            if (mountedRef.current) router.back();
        } catch (callbackError: unknown) {
            if (!mountedRef.current) return;
            processingRef.current = false;
            setPhase('error');
            setError(callbackError instanceof Error ? callbackError.message : 'Could not connect to Last.fm.');
            setCanRetrySave(mobileScrobblerService.hasPendingSession(attempt.attemptId));
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border || '#333' }]}>
                <TouchableOpacity accessibilityLabel="Close Last.fm login" onPress={close} style={styles.closeButton}>
                    <X color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Connect to Last.fm</Text>
                <View style={styles.headerSpacer} />
            </View>

            {phase !== 'error' && (
                <WebView
                    key={webViewKey}
                    source={{ uri: attempt.url }}
                    style={styles.webview}
                    originWhitelist={['https://*', 'http://localhost:26505']}
                    javaScriptEnabled
                    domStorageEnabled
                    onShouldStartLoadWithRequest={request => {
                        if (!isLastfmCallbackUrl(request.url)) return true;
                        void processCallback(request.url);
                        return false;
                    }}
                    onNavigationStateChange={state => {
                        if (isLastfmCallbackUrl(state.url)) void processCallback(state.url);
                    }}
                    onLoadStart={() => {
                        if (!processingRef.current) setPhase('loading');
                    }}
                    onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
                    onLoadEnd={() => {
                        if (!processingRef.current) setPhase('authorizing');
                    }}
                    onError={({ nativeEvent }) => {
                        if (processingRef.current) return;
                        setPhase('error');
                        setError(nativeEvent.description || 'Could not load Last.fm.');
                    }}
                    onHttpError={({ nativeEvent }) => {
                        if (processingRef.current || nativeEvent.statusCode < 400) return;
                        setPhase('error');
                        setError(`Last.fm returned HTTP ${nativeEvent.statusCode}.`);
                    }}
                    onRenderProcessGone={() => {
                        setPhase('error');
                        setError('The login page stopped responding.');
                    }}
                />
            )}

            {(phase === 'loading' || phase === 'exchanging') && (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                        {phase === 'exchanging'
                            ? 'Saving your Last.fm connection…'
                            : `Loading Last.fm… ${Math.round(progress * 100)}%`}
                    </Text>
                </View>
            )}

            {phase === 'error' && (
                <View style={styles.errorContainer}>
                    <Text style={[styles.errorTitle, { color: colors.text }]}>Could not connect</Text>
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={retry} style={[styles.retryButton, { backgroundColor: colors.accent }]}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={close} style={styles.cancelButton}>
                        <Text style={{ color: colors.accent }}>Cancel</Text>
                    </TouchableOpacity>
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
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 48,
        minHeight: 48,
    },
    headerSpacer: {
        width: 48,
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 81,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusText: {
        marginTop: 12,
        fontSize: 14,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
    },
    errorText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 24,
    },
    retryButton: {
        minWidth: 160,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    retryText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    cancelButton: {
        minWidth: 120,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
});
