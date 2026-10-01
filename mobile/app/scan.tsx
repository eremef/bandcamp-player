import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ExpoLinking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { useTheme } from '../theme';

export default function PairingQrScannerScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [scanError, setScanError] = useState('');
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colors = useTheme();

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;

        setScanned(true);
        const pairingLink = ExpoLinking.parse(data);
        const ticket = pairingLink.queryParams?.ticket;

        if (
            pairingLink.scheme !== 'beta-app' ||
            pairingLink.hostname !== 'pair' ||
            typeof ticket !== 'string'
        ) {
            setScanError('This QR code is not a Beta Player pairing code.');
            return;
        }

        router.replace({ pathname: '/pair', params: { ticket } });
    };

    if (!permission) {
        return (
            <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.accent} />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={[styles.permissionContainer, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
                <Camera size={48} color={colors.accent} />
                <Text style={[styles.title, { color: colors.text }]}>Allow camera access</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>Beta Player uses the camera to scan the pairing QR code shown in desktop Settings.</Text>
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.accent }]}
                    onPress={() => permission.canAskAgain ? void requestPermission() : void Linking.openSettings()}
                >
                    <Text style={styles.actionButtonText}>{permission.canAskAgain ? 'Enable camera' : 'Open Settings'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                    <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />
            <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel QR scanning">
                        <ArrowLeft size={22} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Scan pairing QR code</Text>
                    <View style={styles.backButtonPlaceholder} />
                </View>

                <View style={styles.scanArea}>
                    <View style={styles.scanFrame} />
                    {scanError ? (
                        <View style={styles.errorCard}>
                            <Text style={styles.errorText}>{scanError}</Text>
                            <TouchableOpacity
                                style={styles.retryButton}
                                onPress={() => {
                                    setScanError('');
                                    setScanned(false);
                                }}
                            >
                                <Text style={styles.actionButtonText}>Try again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>

                <Text style={styles.hint}>Point your camera at the QR code in desktop Settings.</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        gap: 16,
    },
    overlay: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    backButtonPlaceholder: {
        width: 44,
        height: 44,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    scanArea: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanFrame: {
        width: 260,
        height: 260,
        borderWidth: 3,
        borderColor: '#fff',
        borderRadius: 24,
        backgroundColor: 'transparent',
    },
    hint: {
        color: '#fff',
        fontSize: 15,
        textAlign: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
    actionButton: {
        minWidth: 180,
        minHeight: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    errorCard: {
        position: 'absolute',
        top: '50%',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 18,
    },
    errorText: {
        color: '#fff',
        fontSize: 15,
        textAlign: 'center',
    },
    retryButton: {
        minHeight: 44,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 18,
        backgroundColor: '#0896af',
    },
});
