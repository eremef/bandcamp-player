import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, FlatList, Platform, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Share2, Copy, Trash2, RefreshCw, Search, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../theme';
import { mobileLoggerService } from '../services/MobileLoggerService';

interface LogsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function LogsModal({ visible, onClose }: LogsModalProps) {
    const colors = useTheme();
    const insets = useSafeAreaInsets();
    const [rawLogs, setRawLogs] = useState<string>('');
    const [filterQuery, setFilterQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const content = await mobileLoggerService.getLogs();
            setRawLogs(content);
        } catch {
            setRawLogs('');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            loadLogs();
            setFeedbackMessage(null);
        }
    }, [visible]);

    const showFeedback = (msg: string) => {
        setFeedbackMessage(msg);
        setTimeout(() => {
            setFeedbackMessage(null);
        }, 2500);
    };

    const handleShare = async () => {
        const shared = await mobileLoggerService.shareLogs();
        if (shared) {
            showFeedback('Sharing logs...');
        } else {
            Alert.alert('Sharing Unavailable', 'Unable to open system share dialog.');
        }
    };

    const handleCopy = async () => {
        const copied = await mobileLoggerService.copyLogs();
        if (copied) {
            showFeedback('Copied to clipboard');
        } else {
            showFeedback('No logs to copy');
        }
    };

    const handleRefresh = async () => {
        await loadLogs();
    };

    const scrollToBottom = () => {
        flatListRef.current?.scrollToEnd?.({ animated: true });
    };

    const handleClear = () => {
        Alert.alert(
            'Clear Logs',
            'Are you sure you want to clear all application logs?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        await mobileLoggerService.clearLogs();
                        setRawLogs('');
                        showFeedback('Logs cleared');
                    },
                },
            ]
        );
    };

    const lines = useMemo(() => {
        if (!rawLogs) return [];
        return rawLogs.split('\n').filter(Boolean);
    }, [rawLogs]);

    const filteredLines = useMemo(() => {
        if (!filterQuery.trim()) return lines;
        const q = filterQuery.toLowerCase();
        return lines.filter(line => line.toLowerCase().includes(q));
    }, [lines, filterQuery]);

    const renderLine = ({ item }: { item: string }) => {
        let lineColor = colors.textSecondary;
        if (item.includes('[ERROR]')) {
            lineColor = '#ef4444';
        } else if (item.includes('[WARN]')) {
            lineColor = '#f59e0b';
        } else if (item.includes('[INFO]')) {
            lineColor = '#38bdf8';
        }

        return (
            <View style={styles.logLine}>
                <Text style={[styles.logText, { color: lineColor }]}>{item}</Text>
            </View>
        );
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={[styles.modalOverlay, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
                <View style={[styles.modalContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <View style={styles.headerLeft}>
                            <Text style={[styles.title, { color: colors.text }]}>Logs</Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                {filteredLines.length} {filteredLines.length === 1 ? 'line' : 'lines'}
                                {filterQuery.trim() ? ` (filtered from ${lines.length})` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.iconButton, { backgroundColor: colors.input }]}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close logs"
                        >
                            <X size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
                        <View style={[styles.searchContainer, { backgroundColor: colors.input }]}>
                            <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                placeholder="Search logs..."
                                placeholderTextColor={colors.textSecondary}
                                value={filterQuery}
                                onChangeText={setFilterQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {filterQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setFilterQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <X size={16} color={colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <View style={styles.content}>
                        {isLoading ? (
                            <View style={styles.centerContainer}>
                                <ActivityIndicator size="large" color={colors.accent} />
                            </View>
                        ) : filteredLines.length === 0 ? (
                            <View style={styles.centerContainer}>
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    {lines.length === 0 ? 'No logs recorded yet.' : 'No matching log lines.'}
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                ref={flatListRef}
                                data={filteredLines}
                                renderItem={renderLine}
                                keyExtractor={(_, index) => index.toString()}
                                style={styles.logList}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                initialNumToRender={50}
                                maxToRenderPerBatch={50}
                            />
                        )}
                    </View>

                    {feedbackMessage && (
                        <View style={[styles.feedbackBadge, { backgroundColor: colors.accent }]}>
                            <Text style={styles.feedbackText}>{feedbackMessage}</Text>
                        </View>
                    )}

                    <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.input }]}
                            onPress={handleShare}
                            accessibilityRole="button"
                            accessibilityLabel="Share logs"
                        >
                            <Share2 size={16} color={colors.text} style={{ marginRight: 4 }} />
                            <Text style={[styles.actionBtnText, { color: colors.text }]}>Share</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.input }]}
                            onPress={handleCopy}
                            accessibilityRole="button"
                            accessibilityLabel="Copy logs"
                        >
                            <Copy size={16} color={colors.text} style={{ marginRight: 4 }} />
                            <Text style={[styles.actionBtnText, { color: colors.text }]}>Copy</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.input }]}
                            onPress={handleRefresh}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh logs"
                        >
                            <RefreshCw size={16} color={colors.text} style={{ marginRight: 4 }} />
                            <Text style={[styles.actionBtnText, { color: colors.text }]}>Refresh</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.input }]}
                            onPress={scrollToBottom}
                            accessibilityRole="button"
                            accessibilityLabel="Scroll to bottom"
                        >
                            <ChevronDown size={16} color={colors.text} style={{ marginRight: 4 }} />
                            <Text style={[styles.actionBtnText, { color: colors.text }]}>Bottom</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}
                            onPress={handleClear}
                            accessibilityRole="button"
                            accessibilityLabel="Clear logs"
                        >
                            <Trash2 size={16} color="#ef4444" style={{ marginRight: 4 }} />
                            <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    modalContainer: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerLeft: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchRow: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 38,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
    },
    content: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 14,
    },
    logList: {
        flex: 1,
        padding: 12,
    },
    logLine: {
        marginBottom: 4,
    },
    logText: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 11,
        lineHeight: 16,
    },
    feedbackBadge: {
        position: 'absolute',
        bottom: 70,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    feedbackText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        flex: 1,
    },
    actionBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
