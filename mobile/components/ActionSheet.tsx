import { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { useTheme } from '../theme';
import type { LucideIcon } from 'lucide-react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface Action {
    text: string;
    onPress: () => void;
    style?: 'default' | 'cancel' | 'destructive';
    icon?: LucideIcon;
}

interface ActionSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    actions: Action[];
}

export function ActionSheet({ visible, onClose, title, subtitle, actions }: ActionSheetProps) {
    const colors = useTheme();
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT));
    const backdropAnim = useRef(new Animated.Value(0));

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim.current, {
                    toValue: 0,
                    damping: 28,
                    stiffness: 300,
                    mass: 0.8,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim.current, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            slideAnim.current.setValue(SCREEN_HEIGHT);
            backdropAnim.current.setValue(0);
        }
    }, [visible, slideAnim, backdropAnim]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(slideAnim.current, {
                toValue: SCREEN_HEIGHT,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim.current, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => onClose());
    };

    const mainActions = actions.filter(a => a.style !== 'cancel');
    const cancelAction = actions.find(a => a.style === 'cancel');

    const cardBg = colors.card === '#1a1a1a' ? '#2a2a2e' : colors.card;
    const destructiveColor = colors.card === '#1a1a1a' ? '#FF453A' : '#d32f2f';

    return (
        <Modal
            animationType="none"
            transparent={true}
            visible={visible}
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                <Animated.View
                    style={[styles.backdrop, { opacity: backdropAnim.current }]}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.sheetContainer,
                        { transform: [{ translateY: slideAnim.current }] },
                    ]}
                >
                    {/* Main actions group */}
                    <View style={[styles.group, { backgroundColor: cardBg }]}>
                        {(title || subtitle) && (
                            <View style={[styles.header, { borderBottomColor: colors.border + '40' }]}>
                                {title && (
                                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                                        {title}
                                    </Text>
                                )}
                                {subtitle && (
                                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {subtitle}
                                    </Text>
                                )}
                            </View>
                        )}

                        {mainActions.map((action, index) => {
                            const isDestructive = action.style === 'destructive';
                            const actionColor = isDestructive ? destructiveColor : colors.text;
                            const IconComponent = action.icon;

                            return (
                                <TouchableOpacity
                                    key={index}
                                    activeOpacity={0.6}
                                    style={[
                                        styles.actionButton,
                                        index < mainActions.length - 1 && {
                                            borderBottomWidth: StyleSheet.hairlineWidth,
                                            borderBottomColor: colors.border + '40',
                                        },
                                    ]}
                                    onPress={() => {
                                        handleClose();
                                        // Delay action to allow animation to complete
                                        setTimeout(() => action.onPress(), 220);
                                    }}
                                >
                                    {IconComponent && (
                                        <IconComponent
                                            size={20}
                                            color={actionColor}
                                            style={styles.actionIcon}
                                        />
                                    )}
                                    <Text style={[
                                        styles.actionText,
                                        { color: actionColor },
                                        isDestructive && styles.destructiveText,
                                    ]}>
                                        {action.text}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Cancel button - separated group */}
                    {cancelAction && (
                        <View style={[styles.group, styles.cancelGroup, { backgroundColor: cardBg }]}>
                            <TouchableOpacity
                                activeOpacity={0.6}
                                style={styles.cancelButton}
                                onPress={handleClose}
                            >
                                <Text style={[styles.cancelText, { color: colors.text }]}>
                                    {cancelAction.text}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheetContainer: {
        paddingHorizontal: 10,
        paddingBottom: 34,
    },
    group: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    cancelGroup: {
        marginTop: 8,
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 12,
        marginTop: 2,
        textAlign: 'center',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    actionIcon: {
        marginRight: 10,
    },
    actionText: {
        fontSize: 18,
        fontWeight: '400',
    },
    destructiveText: {
        fontWeight: '500',
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    cancelText: {
        fontSize: 18,
        fontWeight: '600',
    },
});
