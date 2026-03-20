import React, { useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Download, Check, Activity } from 'lucide-react-native';
import { useTheme } from '../theme';
import { ActionSheet, Action } from './ActionSheet';

interface CacheFabProps {
    visible: boolean;
    isAllCached: boolean;
    downloadProgress: number | null;
    onDownloadAllCached: () => void;
    onDownloadAllVisible: () => void;
    onCancelDownloads: () => void;
}

const PLAYER_BAR_HEIGHT = 76;

export function CacheFab({
    visible,
    isAllCached,
    downloadProgress,
    onDownloadAllCached,
    onDownloadAllVisible,
    onCancelDownloads,
}: CacheFabProps) {
    const colors = useTheme();
    const [showActions, setShowActions] = useState(false);

    const isDownloading = downloadProgress !== null;

    const IconComponent = isDownloading
        ? Activity
        : isAllCached
            ? Check
            : Download;

    const actions: Action[] = [];

    if (!isAllCached) {
        actions.push({
            text: 'Download All Cached',
            onPress: onDownloadAllCached,
            icon: Download,
        });
    }

    actions.push({
        text: 'Download All Visible',
        onPress: onDownloadAllVisible,
        icon: Download,
    });

    if (isDownloading) {
        actions.push({
            text: 'Cancel Downloads',
            onPress: onCancelDownloads,
            style: 'destructive',
        });
    }

    actions.push({
        text: 'Cancel',
        onPress: () => {},
        style: 'cancel',
    });

    if (!visible) return null;

    return (
        <>
            <View style={styles.container}>
                <TouchableOpacity
                    style={[
                        styles.fab,
                        { backgroundColor: colors.accent },
                        isDownloading && styles.fabDownloading,
                    ]}
                    onPress={() => setShowActions(true)}
                    activeOpacity={0.8}
                >
                    <IconComponent
                        size={24}
                        color="#ffffff"
                        style={isDownloading ? styles.spinning : undefined}
                    />
                </TouchableOpacity>
                {isDownloading && downloadProgress > 0 && downloadProgress < 1 && (
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    backgroundColor: colors.accent,
                                    width: `${Math.round(downloadProgress * 100)}%`,
                                },
                            ]}
                        />
                    </View>
                )}
            </View>
            <ActionSheet
                visible={showActions}
                onClose={() => setShowActions(false)}
                title="Cache Options"
                actions={actions}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: PLAYER_BAR_HEIGHT + 16,
        right: 16,
        alignItems: 'center',
    },
    fab: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    fabDownloading: {
        opacity: 0.9,
    },
    spinning: {
        // lucide Activity spins automatically via animation prop
    },
    progressBar: {
        width: 56,
        height: 3,
        borderRadius: 1.5,
        marginTop: 6,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 1.5,
    },
});
