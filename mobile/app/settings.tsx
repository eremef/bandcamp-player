import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { X, TestTubeDiagonal, RefreshCcw, Info, Music, LogOut, Heart, FastForward, Minus, Plus, Monitor, Sun, Moon, Check, WifiOff, Database, Trash2 } from 'lucide-react-native';
import { Theme } from '@shared/types';
import { useStore } from '../store';
import { Switch, ScrollView } from 'react-native';
import { remoteConfigService } from '@shared/remote-config.service';

export default function SettingsScreen() {
    const router = useRouter();
    const colors = useTheme();
    const {
        mode,
        isSimulationMode,
        toggleSimulationMode,
        lastfmState,
        scrobblingEnabled,
        disconnectLastfm,
        toggleScrobbling,
        includeWishlistInCollection,
        toggleIncludeWishlistInCollection,
        dedupeEnabled,
        setDedupeEnabled,
        crossfadeEnabled,
        setCrossfadeEnabled,
        crossfadeDuration,
        setCrossfadeDuration,
        theme,
        setTheme,
        offlineMode,
        setOfflineMode,
        downloadWifiOnly,
        toggleDownloadWifiOnly,
        cacheSize,
        cacheSizeLimit,
        setCacheSizeLimit,
        clearCache,
        floatingPlayerEnabled,
        toggleFloatingPlayer
    } = useStore();
    const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);

    const handleRefreshConfig = async () => {
        setIsRefreshingConfig(true);
        try {
            await remoteConfigService.fetchLatestConfig();
        } finally {
            setIsRefreshingConfig(false);
        }
    };

    const renderThemeOption = (option: Theme, label: string, description: string, Icon: any) => {
        const isSelected = theme === option;
        return (
            <TouchableOpacity
                style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}
                onPress={() => setTheme(option)}
            >
                <View style={styles.settingLabelContainer}>
                    <Icon color={colors.text} size={20} style={styles.settingIcon} />
                    <View>
                        <Text style={[styles.settingTitle, { color: colors.text }]}>{label}</Text>
                        <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</Text>
                    </View>
                </View>
                {isSelected && <Check color={colors.accent} size={20} />}
            </TouchableOpacity>
        );
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
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
                    {renderThemeOption('system', 'System', 'Follow device settings', Monitor)}
                    {renderThemeOption('light', 'Light', 'Always use light theme', Sun)}
                    {renderThemeOption('dark', 'Dark', 'Always use dark theme', Moon)}
                    <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                        <View style={styles.settingLabelContainer}>
                            <Music color={colors.text} size={20} style={styles.settingIcon} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingTitle, { color: colors.text }]}>Floating Playback Bubble</Text>
                                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                    Show a moveable bubble to control playback
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={floatingPlayerEnabled}
                            onValueChange={toggleFloatingPlayer}
                            trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                        />
                    </View>
                </View>


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


                {mode === 'standalone' && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Last.fm Scrobbling</Text>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <Music color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>
                                        {lastfmState.isConnected ? lastfmState.user?.name : 'Last.fm Account'}
                                    </Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        {lastfmState.isConnected ? 'Connected' : 'Connect to scrobble tracks in standalone mode'}
                                    </Text>
                                </View>
                            </View>
                            {lastfmState.isConnected ? (
                                <TouchableOpacity onPress={disconnectLastfm} style={styles.refreshButton}>
                                    <LogOut color={colors.accent} size={20} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity onPress={() => router.push('/lastfm_login')} style={styles.refreshButton}>
                                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Connect</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {lastfmState.isConnected && (
                            <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                                <View style={styles.settingLabelContainer}>
                                    <View style={{ marginLeft: 32 }}>
                                        <Text style={[styles.settingTitle, { color: colors.text }]}>Enable Scrobbling</Text>
                                        <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                            Scrobble tracks played in standalone mode
                                        </Text>
                                    </View>
                                </View>
                                <Switch
                                    value={scrobblingEnabled}
                                    onValueChange={toggleScrobbling}
                                    trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                                />
                            </View>
                        )}
                    </View>
                )}

                {mode === 'standalone' && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Offline & Caching</Text>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <WifiOff color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Offline Mode</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        Only play downloaded tracks
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={offlineMode}
                                onValueChange={setOfflineMode}
                                trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                            />
                        </View>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <Database color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Wi-Fi Only Downloads</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        Prevent downloading over cellular data
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={downloadWifiOnly}
                                onValueChange={toggleDownloadWifiOnly}
                                trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                            />
                        </View>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={[styles.settingLabelContainer, { marginLeft: 0 }]}>
                                <Database color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Cache Size Limit</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        {cacheSizeLimit} GB
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.stepperContainer}>
                                <TouchableOpacity
                                    onPress={() => setCacheSizeLimit(Math.max(1, cacheSizeLimit - 1))}
                                    style={[styles.stepperButton, { borderColor: colors.border || '#333' }]}
                                >
                                    <Minus color={colors.text} size={16} />
                                </TouchableOpacity>
                                <Text style={[styles.stepperValue, { color: colors.text }]}>{cacheSizeLimit}GB</Text>
                                <TouchableOpacity
                                    onPress={() => setCacheSizeLimit(Math.min(20, cacheSizeLimit + 1))}
                                    style={[styles.stepperButton, { borderColor: colors.border || '#333' }]}
                                >
                                    <Plus color={colors.text} size={16} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <Trash2 color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Clear Cache</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        {(cacheSize / 1024 / 1024).toFixed(1)} MB used
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={clearCache} style={styles.refreshButton}>
                                <Text style={{ color: colors.accent, fontWeight: '600' }}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Collection Preferences</Text>

                    <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                        <View style={styles.settingLabelContainer}>
                            <Heart color={colors.text} size={20} style={styles.settingIcon} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingTitle, { color: colors.text }]}>Include Wishlist</Text>
                                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                    Show wishlist items in your collection
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={includeWishlistInCollection}
                            onValueChange={toggleIncludeWishlistInCollection}
                            trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                        />
                    </View>

                    <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                        <View style={styles.settingLabelContainer}>
                            <RefreshCcw color={colors.text} size={20} style={styles.settingIcon} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingTitle, { color: colors.text }]}>Deduplicate Collection</Text>
                                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                    Hide duplicate albums and releases
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={dedupeEnabled}
                            onValueChange={setDedupeEnabled}
                            trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                        />
                    </View>
                </View>

                {mode === 'standalone' && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Playback</Text>

                        <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                            <View style={styles.settingLabelContainer}>
                                <FastForward color={colors.text} size={20} style={styles.settingIcon} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingTitle, { color: colors.text }]}>Simulated Crossfade</Text>
                                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                        Fade out tracks at the end for gapless effect
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={crossfadeEnabled}
                                onValueChange={setCrossfadeEnabled}
                                trackColor={{ false: '#333', true: colors.accent || '#1DA1F2' }}
                            />
                        </View>

                        {crossfadeEnabled && (
                            <View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
                                <View style={[styles.settingLabelContainer, { marginLeft: 32 }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.settingTitle, { color: colors.text }]}>Crossfade Duration</Text>
                                        <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                            {crossfadeDuration} second{crossfadeDuration !== 1 ? 's' : ''}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.stepperContainer}>
                                    <TouchableOpacity
                                        onPress={() => setCrossfadeDuration(Math.max(1, crossfadeDuration - 1))}
                                        style={[styles.stepperButton, { borderColor: colors.border || '#333' }]}
                                    >
                                        <Minus color={colors.text} size={16} />
                                    </TouchableOpacity>
                                    <Text style={[styles.stepperValue, { color: colors.text }]}>{crossfadeDuration}s</Text>
                                    <TouchableOpacity
                                        onPress={() => setCrossfadeDuration(Math.min(10, crossfadeDuration + 1))}
                                        style={[styles.stepperButton, { borderColor: colors.border || '#333' }]}
                                    >
                                        <Plus color={colors.text} size={16} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                )}


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
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stepperButton: {
        borderWidth: 1,
        borderRadius: 4,
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperValue: {
        width: 32,
        textAlign: 'center',
        fontWeight: 'bold',
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
