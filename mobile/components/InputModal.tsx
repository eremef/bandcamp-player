import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

interface InputModalProps {
    visible: boolean;
    title: string;
    initialValue?: string;
    placeholder?: string;
    onClose: () => void;
    onSubmit: (value: string) => void;
    submitLabel?: string;
}

export function InputModal({ 
    visible, 
    title, 
    initialValue = '', 
    placeholder = '', 
    onClose, 
    onSubmit,
    submitLabel = 'Submit'
}: InputModalProps) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (visible) {
            setValue(initialValue);
        }
    }, [visible, initialValue]);

    const handleSubmit = () => {
        if (value.trim()) {
            onSubmit(value.trim());
            setValue('');
        }
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <View style={styles.content}>
                    <Text style={styles.title}>{title}</Text>
                    <TextInput
                        style={styles.input}
                        value={value}
                        onChangeText={setValue}
                        placeholder={placeholder}
                        placeholderTextColor="#666"
                        autoFocus={visible}
                        onSubmitEditing={handleSubmit}
                    />
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.button} onPress={onClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={handleSubmit}>
                            <Text style={styles.submitText}>{submitLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
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
