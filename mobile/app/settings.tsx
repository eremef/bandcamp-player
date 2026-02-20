import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { X, TestTubeDiagonal, RefreshCcw, Info } from 'lucide-react-native';
import { useStore } from '../store';
import { Switch, ScrollView } from 'react-native';
import { remoteConfigService } from '@shared/remote-config.service';

export default function SettingsScreen() {
    const router = useRouter();
    const colors = useTheme();
    const { isSimulationMode, toggleSimulationMode } = useStore();
    const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);

    const handleRefreshConfig = async () => {
        setIsRefreshingConfig(true);
        try {
            await remoteConfigService.fetchLatestConfig();
        } finally {
            setIsRefreshingConfig(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <X color={colors.text} size={24} />
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.content}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Remote Configuration</Text>
                    <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                        <View style={styles.settingLabelContainer}>
                            <Info color={colors.text} size={20} style={styles.settingIcon} />
                            <View>
                                <Text style={[styles.settingTitle, { color: colors.text }]}>Config Version</Text>
                                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                    v{remoteConfigService.get().version}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={handleRefreshConfig}
                            disabled={isRefreshingConfig}
                            style={styles.refreshButton}
                        >
                            {isRefreshingConfig ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <RefreshCcw color={colors.accent} size={20} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {__DEV__ && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Debug & Simulation</Text>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <TestTubeDiagonal color={colors.text} size={20} style={styles.settingIcon} />
                                <View>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Simulation Mode</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        Mock 5000 items in Standalone collection
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isSimulationMode}
                                onValueChange={toggleSimulationMode}
                                trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                            />
                        </View>
                    </View>
                )}

                {__DEV__ && (
                    <View style={styles.infoBox}>
                        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                            Note: Enabling simulation mode will clear the current collection display.
                            Perform a manual refresh in the Collection tab to load simulated data.
                        </Text>
                    </View>
                )}
            </ScrollView>
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
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 8,
    },
    content: {
        flex: 1,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIcon: {
        marginRight: 12,
    },
    settingTitle: {
        fontSize: 16,
        fontWeight: '500',
    },
    settingDescription: {
        fontSize: 12,
        marginTop: 2,
    },
    refreshButton: {
        padding: 10,
    },
    infoBox: {
        padding: 16,
        backgroundColor: '#1a1a1a',
        margin: 16,
        borderRadius: 8,
    },
    infoText: {
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    }
});
