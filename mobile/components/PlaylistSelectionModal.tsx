import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Playlist } from '@shared/types';

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (playlistId: string) => void;
    playlists: Playlist[];
}

export function PlaylistSelectionModal({ visible, onClose, onSelect, playlists }: PlaylistSelectionModalProps) {
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add to Playlist</Text>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {playlists.length > 0 ? (
                        <FlatList
                            data={playlists}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.playlistItem}
                                    onPress={() => onSelect(item.id)}
                                >
                                    <Text style={styles.playlistName}>{item.name}</Text>
                                    <Text style={styles.playlistCount}>{item.tracks.length} tracks</Text>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No playlists available</Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1e1e1e',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 16,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    playlistItem: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2a2a2a',
    },
    playlistName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    playlistCount: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
    emptyText: {
        color: '#888',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 20,
    },
});
