import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Base64 } from 'js-base64';
import { useStore } from '../store';
import { webSocketService } from '../services/WebSocketService';

interface PairingTicket {
    version: number;
    host: string;
    port: number;
    code: string;
    caFingerprint: string;
}

export default function PairRemoteScreen() {
    const { ticket } = useLocalSearchParams<{ ticket?: string }>();
    const router = useRouter();
    const { connect, setMode, connectionStatus } = useStore();
    const [message, setMessage] = useState('Reading the desktop pairing code...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = webSocketService.on('connection-error', (reason: string) => {
            setError(reason);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!ticket || Array.isArray(ticket)) {
            setError('This pairing QR code is incomplete. Scan it again from the desktop app.');
            return;
        }

        let decoded: PairingTicket;
        try {
            const normalized = ticket.replace(/-/g, '+').replace(/_/g, '/');
            const base64 = normalized + '='.repeat((4 - normalized.length % 4) % 4);
            decoded = JSON.parse(Base64.decode(base64)) as PairingTicket;
            if (
                decoded.version !== 1 ||
                typeof decoded.host !== 'string' ||
                !isLanIpv4(decoded.host) ||
                typeof decoded.code !== 'string' ||
                !/^[A-Za-z0-9_-]{24}$/.test(decoded.code) ||
                typeof decoded.caFingerprint !== 'string' ||
                !/^[a-fA-F0-9]{64}$/.test(decoded.caFingerprint.replace(/:/g, '')) ||
                !Number.isInteger(decoded.port) || decoded.port < 1 || decoded.port > 65535
            ) throw new Error('Invalid pairing ticket');
        } catch {
            setError('This pairing QR code is not valid. Create a new code in desktop Settings.');
            return;
        }

        const startPairing = async () => {
            try {
                setError(null);
                await setMode('remote');
                setMessage('Connecting securely. Approve this device on the desktop.');
                await connect(decoded.host, {
                    mode: 'safe',
                    port: decoded.port,
                    pairingCode: decoded.code,
                    caFingerprint: decoded.caFingerprint,
                });
            } catch (connectError) {
                setError(connectError instanceof Error ? connectError.message : 'Could not start secure pairing.');
            }
        };
        void startPairing();
    }, [ticket, connect, setMode]);

    useEffect(() => {
        if (connectionStatus === 'connected') {
            setMessage('Device paired. Opening remote controls...');
            const timeout = setTimeout(() => router.replace('/(tabs)/player'), 700);
            return () => clearTimeout(timeout);
        }
    }, [connectionStatus, router]);

    return (
        <View style={styles.container}>
            <ActivityIndicator color="#a855f7" size="large" />
            <Text style={styles.title}>{error ? 'Pairing failed' : 'Secure pairing'}</Text>
            <Text style={error ? styles.error : styles.message}>{error || message}</Text>
            {connectionStatus === 'connecting' && !error && (
                <Text style={styles.hint}>Keep the desktop app open until approval completes.</Text>
            )}
        </View>
    );
}

function isLanIpv4(host: string): boolean {
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    return octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 169 && octets[1] === 254);
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#121212',
        gap: 16,
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    message: {
        color: '#ddd',
        fontSize: 16,
        textAlign: 'center',
    },
    hint: {
        color: '#888',
        textAlign: 'center',
    },
    error: {
        color: '#ff6b6b',
        fontSize: 16,
        textAlign: 'center',
    },
});
