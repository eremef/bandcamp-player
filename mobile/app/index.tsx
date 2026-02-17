import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useStore } from '../store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wifi, AlertCircle, Settings } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useRouter } from 'expo-router';

export default function ConnectScreen() {
    const { connect, setHostIp, hostIp, connectionStatus, recentIps, autoConnect, removeRecentIp, startScan, isScanning } = useStore();
    const colors = useTheme();
    const router = useRouter();
    const [ipInput, setIpInput] = useState(hostIp);
    const [isAutoConnecting, setIsAutoConnecting] = useState(true);

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

    const handleConnect = (ip?: string) => {
        const targetIp = ip || ipInput;
        setHostIp(targetIp);
        connect(targetIp);
    };

    if (isAutoConnecting && connectionStatus === 'connecting') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.content}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={[styles.subtitle, { marginTop: 20, color: colors.textSecondary }]}>Auto-connecting...</Text>
                    <TouchableOpacity onPress={() => setIsAutoConnecting(false)}>
                        <Text style={{ color: colors.accent, marginTop: 20 }}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                <View style={[styles.iconContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Wifi size={64} color={colors.accent} />
                </View>

                <Text style={[styles.title, { color: colors.text }]}>Bandcamp Remote</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Enter the IP address of your desktop</Text>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                        placeholder="192.168.1.x"
                        placeholderTextColor={colors.textSecondary}
                        value={ipInput}
                        onChangeText={setIpInput}
                        keyboardType="numeric"
                        autoCapitalize="none"
                    />
                </View>

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

                <TouchableOpacity
                    style={[styles.scanButton, { borderColor: colors.border }, isScanning && styles.buttonDisabled]}
                    onPress={() => startScan()}
                    disabled={connectionStatus === 'connecting' || isScanning}
                >
                    {isScanning ? (
                        <ActivityIndicator color={colors.accent} />
                    ) : (
                        <Text style={[styles.scanButtonText, { color: colors.accent }]}>Auto Scan Network</Text>
                    )}
                </TouchableOpacity>

                {connectionStatus === 'disconnected' && hostIp && !isAutoConnecting && (
                    <View style={styles.statusContainer}>
                        <AlertCircle size={16} color="#ff4444" />
                        <Text style={[styles.errorText, { color: '#ff4444' }]}>Disconnected. Check IP and try again.</Text>
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
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    iconContainer: {
        marginBottom: 32,
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
    },
    subtitle: {
        fontSize: 16,
        color: '#888888',
        marginBottom: 48,
        textAlign: 'center',
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
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#333',
    },
    scanButtonText: {
        color: '#0896afff',
        fontSize: 16,
        fontWeight: '600',
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
        marginTop: 40,
    },
    recentTitle: {
        color: '#666',
        fontSize: 14,
        marginBottom: 12,
        marginLeft: 4,
    },
    recentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        padding: 16,
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
