import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { X, Plus } from 'lucide-react-native';
import { useTheme } from '../theme';
import { Playlist } from '@shared/types';

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (playlistId: string) => void;
    onCreateNew: () => void;
    playlists: Playlist[];
}

export function PlaylistSelectionModal({ visible, onClose, onSelect, onCreateNew, playlists }: PlaylistSelectionModalProps) {
    const colors = useTheme();
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Add to Playlist</Text>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.createItem, { borderBottomColor: colors.border }]}
                        onPress={onCreateNew}
                    >
                        <Plus size={20} color={colors.accent} />
                        <Text style={[styles.createItemText, { color: colors.accent }]}>Create New Playlist</Text>
                    </TouchableOpacity>

                    {playlists.length > 0 ? (
                        <FlatList
                            data={playlists}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.playlistItem, { borderBottomColor: colors.border }]}
                                    onPress={() => onSelect(item.id)}
                                >
                                    <Text style={[styles.playlistName, { color: colors.text }]}>{item.name}</Text>
                                    <Text style={[styles.playlistCount, { color: colors.textSecondary }]}>{item.tracks.length} tracks</Text>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No playlists available</Text>
                        </View>
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
        marginBottom: 8,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    createItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2a2a2a',
        gap: 12,
    },
    createItemText: {
        fontSize: 16,
        fontWeight: '600',
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
    emptyContainer: {
        paddingVertical: 32,
        alignItems: 'center',
    },
    emptyText: {
        color: '#888',
        fontSize: 16,
        textAlign: 'center',
    },
});
