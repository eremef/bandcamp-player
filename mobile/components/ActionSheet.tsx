import { View, Text, Modal, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useTheme } from '../theme';

export interface Action {
    text: string;
    onPress: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface ActionSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    actions: Action[];
}

export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
    const colors = useTheme();
    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={[styles.content, { backgroundColor: colors.card }]}>
                            {title && <Text style={[styles.title, { color: colors.textSecondary, borderBottomColor: colors.border }]}>{title}</Text>}
                            {actions.map((action, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.actionButton,
                                        { backgroundColor: colors.card, borderBottomColor: colors.border },
                                        index === actions.length - 1 && styles.lastButton
                                    ]}
                                    onPress={() => {
                                        action.onPress();
                                        onClose();
                                    }}
                                >
                                    <Text style={[
                                        styles.actionText,
                                        { color: colors.accent },
                                        action.style === 'destructive' && styles.destructiveText,
                                        action.style === 'cancel' && styles.cancelText
                                    ]}>
                                        {action.text}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 24,
    },
    content: {
        backgroundColor: '#1E1E1E',
        borderRadius: 14,
        overflow: 'hidden',
    },
    title: {
        color: '#888',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        padding: 16,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333',
    },
    actionButton: {
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    lastButton: {
        borderBottomWidth: 0,
    },
    actionText: {
        fontSize: 17,
        color: '#0A84FF',
        fontWeight: '400',
    },
    destructiveText: {
        color: '#FF453A',
    },
    cancelText: {
        fontWeight: '600',
    },
});
