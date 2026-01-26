import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useStore } from '../store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wifi, AlertCircle } from 'lucide-react-native';

export default function ConnectScreen() {
    const { connect, setHostIp, hostIp, connectionStatus, recentIps, autoConnect, removeRecentIp, startScan, isScanning } = useStore();
    const [ipInput, setIpInput] = useState(hostIp);
    const [isAutoConnecting, setIsAutoConnecting] = useState(true);

    useEffect(() => {
        // Attempt auto-connect on mount
        const init = async () => {
            await autoConnect();
            setIsAutoConnecting(false);
        };
        init();
    }, []);

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
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <ActivityIndicator size="large" color="#1da1f2" />
                    <Text style={[styles.subtitle, { marginTop: 20 }]}>Auto-connecting...</Text>
                    <TouchableOpacity onPress={() => setIsAutoConnecting(false)}>
                        <Text style={{ color: '#1da1f2', marginTop: 20 }}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Wifi size={64} color="#1da1f2" />
                </View>

                <Text style={styles.title}>Bandcamp Remote</Text>
                <Text style={styles.subtitle}>Enter the IP address of your desktop</Text>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="192.168.1.x"
                        placeholderTextColor="#666"
                        value={ipInput}
                        onChangeText={setIpInput}
                        keyboardType="numeric"
                        autoCapitalize="none"
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, connectionStatus === 'connecting' && styles.buttonDisabled]}
                    onPress={() => handleConnect()}
                    disabled={connectionStatus === 'connecting'}
                >
                    {connectionStatus === 'connecting' ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Connect</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.scanButton, isScanning && styles.buttonDisabled]}
                    onPress={() => startScan()}
                    disabled={connectionStatus === 'connecting' || isScanning}
                >
                    {isScanning ? (
                        <ActivityIndicator color="#1da1f2" />
                    ) : (
                        <Text style={styles.scanButtonText}>Auto Scan Network</Text>
                    )}
                </TouchableOpacity>

                {connectionStatus === 'disconnected' && hostIp && !isAutoConnecting && (
                    <View style={styles.statusContainer}>
                        <AlertCircle size={16} color="#ff4444" />
                        <Text style={styles.errorText}>Disconnected. Check IP and try again.</Text>
                    </View>
                )}

                {/* Recent IPs */}
                {recentIps.length > 0 && (
                    <View style={styles.recentContainer}>
                        <Text style={styles.recentTitle}>Recent Connections</Text>
                        {recentIps.map((ip) => (
                            <TouchableOpacity
                                key={ip}
                                style={styles.recentItem}
                                onPress={() => handleConnect(ip)}
                            >
                                <Text style={styles.recentText}>{ip}</Text>
                                <TouchableOpacity
                                    style={styles.removeRecent}
                                    onPress={() => removeRecentIp(ip)}
                                >
                                    <Text style={styles.removeRecentText}>×</Text>
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
        backgroundColor: '#1da1f2',
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
        color: '#1da1f2',
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
