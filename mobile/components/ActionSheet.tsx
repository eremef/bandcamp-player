import { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Animated, Dimensions, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import type { LucideIcon } from 'lucide-react-native';
import { Check } from 'lucide-react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface Action {
    text: string;
    onPress: () => void;
    style?: 'default' | 'cancel' | 'destructive';
    icon?: LucideIcon;
    type?: 'action' | 'label' | 'separator';
    keepOpen?: boolean;
    checked?: boolean;
}

interface ActionSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    actions: Action[];
}

// Animated.Value refs are intentionally used in JSX — standard React Native animation pattern
/* eslint-disable react-hooks/refs */
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
        Keyboard.dismiss();
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
    const insets = useSafeAreaInsets();

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
                    <View style={[styles.group, { backgroundColor: cardBg }]}>
                        {(title || subtitle) && (
                            <View style={[styles.header, { borderBottomColor: colors.textSecondary + '40' }]}>
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
                            if (action.type === 'separator') {
                                return <View key={index} style={[styles.separator, { backgroundColor: colors.border + '40' }]} />;
                            }

                            if (action.type === 'label') {
                                return (
                                    <View key={index} style={styles.labelContainer}>
                                        <Text style={[styles.labelText, { color: colors.textSecondary }]}>{action.text}</Text>
                                    </View>
                                );
                            }

                            const isDestructive = action.style === 'destructive';
                            const actionColor = isDestructive ? destructiveColor : colors.text;
                            const IconComponent = action.icon;

                            const showBorder = index < mainActions.length - 1 &&
                                mainActions[index + 1].type !== 'separator' &&
                                mainActions[index + 1].type !== 'label';

                            return (
                                <TouchableOpacity
                                    key={index}
                                    activeOpacity={0.6}
                                    style={[
                                        styles.actionButton,
                                        showBorder && {
                                            borderBottomWidth: StyleSheet.hairlineWidth,
                                            borderBottomColor: colors.border + '40',
                                        },
                                    ]}
                                    onPress={() => {
                                        if (!action.keepOpen) {
                                            handleClose();
                                            setTimeout(() => action.onPress(), 220);
                                        } else {
                                            action.onPress();
                                        }
                                    }}
                                >
                                    {typeof action.checked === 'boolean' && (
                                        <View style={[
                                            styles.checkbox,
                                            { borderColor: action.checked ? colors.accent : colors.border + '80' },
                                            action.checked && { backgroundColor: colors.accent }
                                        ]}>
                                            {action.checked && <Check size={12} color="white" strokeWidth={3} />}
                                        </View>
                                    )}
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
/* eslint-enable react-hooks/refs */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingBottom: 50
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
    },
    sheetContainer: {
        paddingHorizontal: 10,
        paddingBottom: 0,
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
        paddingVertical: 10,
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
    labelContainer: {
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 6,
    },
    labelText: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
