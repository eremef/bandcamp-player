import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme';

interface InputModalProps {
    visible: boolean;
    title: string;
    initialValue?: string;
    placeholder?: string;
    onClose: () => void;
    onSubmit: (value: string) => void;
    submitLabel?: string;
}

function InputModalContent({
    title,
    initialValue = '',
    placeholder = '',
    onClose,
    onSubmit,
    submitLabel = 'Submit'
}: Omit<InputModalProps, 'visible'>) {
    const colors = useTheme();
    const [value, setValue] = useState(initialValue);

    const handleSubmit = () => {
        if (value.trim()) {
            onSubmit(value.trim());
            // No need to clear value here as the modal will close/unmount
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.overlay}
        >
            <View style={[styles.content, { backgroundColor: colors.card }]}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.input, color: colors.text }]}
                    value={value}
                    onChangeText={setValue}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    autoFocus={true}
                    onSubmitEditing={handleSubmit}
                />
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.button} onPress={onClose}>
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.submitButton, { backgroundColor: colors.accent }]} onPress={handleSubmit}>
                        <Text style={[styles.submitText, { color: '#fff' }]}>{submitLabel}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export function InputModal(props: InputModalProps) {
    const { visible, onClose, ...contentProps } = props;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            {visible && (
                <InputModalContent
                    {...contentProps}
                    onClose={onClose}
                />
            )}
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
        padding: 20,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
    },
    input: {
        backgroundColor: '#2C2C2C',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginLeft: 8,
    },
    submitButton: {
        backgroundColor: '#fff',
        borderRadius: 8,
    },
    cancelText: {
        color: '#888',
        fontSize: 16,
        fontWeight: '600',
    },
    submitText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '600',
    },
});
