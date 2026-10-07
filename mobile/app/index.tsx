import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert } from 'react-native';
import { useStore } from '../store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wifi, AlertCircle, Globe, LogIn, Camera } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useRouter } from 'expo-router';
import { webSocketService } from '../services/WebSocketService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ConnectScreen() {
    const insets = useSafeAreaInsets();
    const {
        connect, disconnect, setHostIp, hostIp, connectionStatus, recentIps, autoConnect, removeRecentIp, startScan, isScanning,
        mode, setMode, auth
    } = useStore();
    const colors = useTheme();
    const router = useRouter();
    const [ipInput, setIpInput] = useState(hostIp);
    const [isAutoConnecting, setIsAutoConnecting] = useState(true);
    const [securityMode, setSecurityMode] = useState<'safe' | 'unsafe'>('safe');
    const [pairingCode, setPairingCode] = useState('');
    const [certificateFingerprint, setCertificateFingerprint] = useState('');
    const [showManualPairing, setShowManualPairing] = useState(false);
    const [connectionError, setConnectionError] = useState('');

    useEffect(() => {
        // Attempt auto-connect on mount
        const init = async () => {
            await autoConnect();
            setIsAutoConnecting(false);
        };
        init();
    }, [autoConnect]);

    useEffect(() => {
        setIpInput(hostIp);
    }, [hostIp]);

    useEffect(() => {
        const loadConnectionMode = async () => {
            const key = `remote_security_mode_${ipInput.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const saved = await AsyncStorage.getItem(key);
            setSecurityMode(saved === 'unsafe' ? 'unsafe' : 'safe');
        };
        void loadConnectionMode();
    }, [ipInput]);

    useEffect(() => webSocketService.on('connection-error', (message: string) => {
        setConnectionError(message);
    }), []);

    // Auto-redirect to player when connected or authenticated and ready
    useEffect(() => {
        if (!isAutoConnecting) {
            const canAccess =
                ((mode === 'remote' || mode === 'standalone') && connectionStatus === 'connected') &&
                (mode === 'remote' || (mode === 'standalone' && auth.isAuthenticated));

            if (canAccess && useStore.getState().currentTrack) {
                console.log('[ConnectScreen] Conditions met, auto-redirecting to player');
                router.replace('/(tabs)/player');
            }
        }
    }, [connectionStatus, mode, auth.isAuthenticated, isAutoConnecting, router]);

    const handleConnect = (ip?: string) => {
        const targetIp = ip || ipInput;
        setHostIp(targetIp);
        setConnectionError('');
        connect(targetIp, {
            mode: securityMode,
            pairingCode: pairingCode.trim() || undefined,
            caFingerprint: certificateFingerprint.trim() || undefined,
        });
    };

    const handleSecurityModeChange = (useUnsafe: boolean) => {
        if (useUnsafe) {
            Alert.alert(
                'Use unsafe connection?',
                'This uses the previous unencrypted connection. Other devices on your local network may read traffic or control playback. The desktop must also be set to Unsafe mode.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Use unsafe', style: 'destructive', onPress: () => setSecurityMode('unsafe') },
                ],
            );
            return;
        }
        setSecurityMode('safe');
    };

    const handleModeSelect = async (newMode: 'remote' | 'standalone') => {
        await setMode(newMode);
        if (newMode === 'remote' && useStore.getState().connectionStatus === 'connected') {
            router.replace('/(tabs)/player');
        }
    };

    const handleStandaloneLogin = () => {
        router.push('/bandcamp_login');
    };

    const handleStandaloneContinue = async () => {
        await setMode('standalone');
        // If mode was already 'standalone', setMode is a no-op and connectionStatus
        // stays 'disconnected'. Ensure state is restored.
        if (useStore.getState().connectionStatus !== 'connected') {
            await useStore.getState().restoreStandaloneState();
        }
        router.replace('/(tabs)/player');
    };

    if (isAutoConnecting && connectionStatus === 'connecting') {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <View style={styles.content}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.subtitle, { marginTop: 20, color: colors.textSecondary }]}>Auto-connecting...</Text>
                    <TouchableOpacity onPress={() => {
                        setIsAutoConnecting(false);
                        disconnect();
                    }}>
                        <Text style={{ color: colors.accent, marginTop: 20 }}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.content}>

                    {/* App Hero / Title */}
                    <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        {mode === 'remote' ? (
                            <Wifi size={64} color={colors.accent} />
                        ) : (
                            <Globe size={64} color={colors.accent} />
                        )}
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        {mode === 'remote' ? 'Remote mode' : 'Standalone mode'}
                    </Text>

                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {mode === 'remote'
                            ? 'Control your desktop player'
                            : (auth.isAuthenticated
                                ? `Logged in as ${auth.user?.displayName || auth.user?.username}`
                                : 'Play your collection directly')}
                    </Text>

                    {/* Mode Selector - Now below title for better visibility */}
                    <View style={[styles.modeContainer, { backgroundColor: colors.input, borderRadius: 16, padding: 4 }]}>
                        <TouchableOpacity
                            style={[
                                styles.modeButtonSmall,
                                mode === 'remote' && { backgroundColor: colors.card }
                            ]}
                            onPress={() => handleModeSelect('remote')}
                        >
                            <Text style={[styles.modeTextSmall, { color: mode === 'remote' ? colors.text : colors.textSecondary }]}>Remote</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.modeButtonSmall,
                                mode === 'standalone' && { backgroundColor: colors.card }
                            ]}
                            onPress={() => handleModeSelect('standalone')}
                        >
                            <Text style={[styles.modeTextSmall, { color: mode === 'standalone' ? colors.text : colors.textSecondary }]}>Standalone</Text>
                        </TouchableOpacity>
                    </View>

                    {mode === 'remote' ? (
                        <View style={{ width: '100%', alignItems: 'center' }}>
                            {webSocketService.isConnected() ? (
                                <View style={{ width: '100%', alignItems: 'center' }}>
                                    <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 24 }]}>
                                        Connected to {hostIp}
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.button, { backgroundColor: colors.accent }]}
                                        onPress={() => router.replace('/(tabs)/player')}
                                    >
                                        <Text style={[styles.buttonText, { color: '#fff' }]}>Resume Remote Session</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={{ marginTop: 24 }}
                                        onPress={() => disconnect()}
                                    >
                                        <Text style={{ color: '#ff4444', fontWeight: '600' }}>Disconnect</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <View style={[styles.securityOption, { backgroundColor: colors.input, borderColor: colors.border }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text, fontWeight: '600' }}>Safe connection</Text>
                                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Encrypted and paired with this device</Text>
                                        </View>
                                        <Switch
                                            value={securityMode === 'unsafe'}
                                            onValueChange={handleSecurityModeChange}
                                            trackColor={{ false: colors.accent, true: '#b3261e' }}
                                        />
                                        <Text style={{ color: securityMode === 'unsafe' ? '#ff7777' : colors.textSecondary, fontSize: 12 }}>
                                            {securityMode === 'unsafe' ? 'Unsafe' : 'Safe'}
                                        </Text>
                                    </View>



                                    {securityMode === 'safe' ? (
                                        <View style={styles.pairingFields}>
                                            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Scan the QR code here, or with your preferred app.</Text>
                                            <TouchableOpacity
                                                style={[styles.scanButton, { borderColor: colors.border }]}
                                                onPress={() => router.push('/scan')}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <Camera size={18} color={colors.accent} />
                                                    <Text style={[styles.scanButtonText, { color: colors.accent }]}>Scan pairing QR code</Text>
                                                </View>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={styles.manualPairingToggle}
                                                onPress={() => setShowManualPairing((visible) => !visible)}
                                                accessibilityRole="button"
                                                accessibilityState={{ expanded: showManualPairing }}
                                            >
                                                <Text style={[styles.sectionLabel, { color: colors.accent, textDecorationLine: 'underline' }]}>
                                                    Can&apos;t scan? Enter details manually
                                                </Text>
                                            </TouchableOpacity>
                                            {showManualPairing && (
                                                <View style={styles.manualPairingFields}>
                                                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>For manual pairing, enter the code and SHA-256 certificate fingerprint shown in desktop Settings</Text>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                                                        placeholder="Desktop IP address (e.g. 192.168.1.x)"
                                                        placeholderTextColor={colors.textSecondary}
                                                        value={ipInput}
                                                        onChangeText={setIpInput}
                                                        keyboardType="numeric"
                                                        autoCapitalize="none"
                                                    />
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                                                        placeholder="One-time pairing code"
                                                        placeholderTextColor={colors.textSecondary}
                                                        value={pairingCode}
                                                        onChangeText={setPairingCode}
                                                        autoCapitalize="none"
                                                        autoCorrect={false}
                                                    />
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                                                        placeholder="Certificate fingerprint (SHA-256)"
                                                        placeholderTextColor={colors.textSecondary}
                                                        value={certificateFingerprint}
                                                        onChangeText={setCertificateFingerprint}
                                                        autoCapitalize="none"
                                                        autoCorrect={false}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    ) : (
                                        <Text style={[styles.unsafeHint, { color: '#ff7777' }]}>Unsafe traffic is not encrypted. The desktop app must also be set to Unsafe mode.</Text>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.button, { backgroundColor: colors.accent }, connectionStatus === 'connecting' && styles.buttonDisabled]}
                                        onPress={() => handleConnect()}
                                        disabled={connectionStatus === 'connecting'}
                                    >
                                        {connectionStatus === 'connecting' ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text style={[styles.buttonText, { color: '#fff' }]}>Connect</Text>
                                        )}
                                    </TouchableOpacity>

                                    {securityMode === 'unsafe' && <TouchableOpacity
                                        style={[styles.scanButton, { borderColor: colors.border }, isScanning && styles.buttonDisabled]}
                                        onPress={() => startScan({ mode: securityMode })}
                                        disabled={connectionStatus === 'connecting' || isScanning}
                                    >
                                        {isScanning ? (
                                            <ActivityIndicator color={colors.accent} />
                                        ) : (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Wifi size={18} color={colors.accent} />
                                                <Text style={[styles.scanButtonText, { color: colors.accent }]}>Auto Scan Network</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>}

                                    {(connectionError || (connectionStatus === 'disconnected' && hostIp && !isAutoConnecting)) && (
                                        <View style={styles.statusContainer}>
                                            <AlertCircle size={16} color="#ff4444" />
                                            <Text style={[styles.errorText, { color: '#ff4444' }]}>{connectionError || 'Disconnected. Check the address and try again.'}</Text>
                                        </View>
                                    )}

                                    {/* Recent IPs */}
                                    {recentIps.length > 0 && (
                                        <View style={styles.recentContainer}>
                                            <Text style={[styles.recentTitle, { color: colors.textSecondary }]}>Recent Connections</Text>
                                            {recentIps.map((ip) => (
                                                <TouchableOpacity
                                                    key={ip}
                                                    style={[styles.recentItem, { backgroundColor: colors.input, borderColor: colors.border }]}
                                                    onPress={() => handleConnect(ip)}
                                                >
                                                    <Text style={[styles.recentText, { color: colors.text }]}>{ip}</Text>
                                                    <TouchableOpacity
                                                        style={styles.removeRecent}
                                                        onPress={() => removeRecentIp(ip)}
                                                    >
                                                        <Text style={[styles.removeRecentText, { color: colors.textSecondary }]}>×</Text>
                                                    </TouchableOpacity>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    ) : (
                        <View style={{ width: '100%', alignItems: 'center' }}>
                            {auth.isAuthenticated ? (
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: colors.accent }]}
                                    onPress={handleStandaloneContinue}
                                >
                                    <Text style={[styles.buttonText, { color: '#fff' }]}>Continue to Player</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: colors.accent }]}
                                    onPress={handleStandaloneLogin}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <LogIn size={20} color="#fff" />
                                        <Text style={[styles.buttonText, { color: '#fff' }]}>Login to Bandcamp</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    content: {
        alignItems: 'center',
        padding: 24,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    modeContainer: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 8,
        width: '100%',
        maxWidth: 300,
    },
    modeButtonSmall: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 12,
    },
    modeTextSmall: {
        fontWeight: '600',
        fontSize: 14,
    },
    sectionLabel: {
        fontSize: 14,
        marginBottom: 6,
        textAlign: 'center',
    },
    iconContainer: {
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#1a1a1a',
        borderRadius: 50,
        borderWidth: 1,
        borderColor: '#333',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#888888',
        marginBottom: 16,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    inputContainer: {
        width: '100%',
        marginBottom: 24,
    },
    input: {
        backgroundColor: '#1e1e1e',
        color: '#ffffff',
        height: 56,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 18,
        borderWidth: 1,
        borderColor: '#333',
    },
    button: {
        width: '100%',
        height: 56,
        backgroundColor: '#0896afff',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    scanButton: {
        width: '100%',
        height: 56,
        backgroundColor: 'transparent',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#333',
    },
    scanButtonText: {
        color: '#0896afff',
        fontSize: 16,
        fontWeight: '600',
    },
    securityOption: {
        width: '100%',
        minHeight: 68,
        paddingHorizontal: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pairingFields: {
        width: '100%',
        gap: 10,
        marginBottom: 10,
    },
    manualPairingToggle: {
        paddingVertical: 0,
    },
    manualPairingFields: {
        gap: 10,
    },
    pairingHint: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 4,
    },
    unsafeHint: {
        width: '100%',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 14,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 24,
        gap: 8,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 14,
    },
    recentContainer: {
        width: '100%',
        marginTop: 16,
    },
    recentTitle: {
        textAlign: 'center',
        color: '#666',
        fontSize: 14,
        marginBottom: 12,
        marginLeft: 4,
    },
    recentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        paddingHorizontal: 8,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    recentText: {
        color: '#fff',
        fontSize: 16,
        flex: 1,
    },
    removeRecent: {
        padding: 8,
        marginRight: -8,
    },
    removeRecentText: {
        color: '#666',
        fontSize: 20,
    }
});
