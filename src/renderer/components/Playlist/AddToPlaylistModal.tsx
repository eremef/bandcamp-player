import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/store';
import { X, Music, Plus } from 'lucide-react';
import styles from './AddToPlaylistModal.module.css';

interface AddToPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPlaylist: (playlistId: string) => void | Promise<void>;
    title?: string;
}

export function AddToPlaylistModal({
    isOpen,
    onClose,
    onSelectPlaylist,
    title = 'Add to Playlist'
}: AddToPlaylistModalProps) {
    const { playlists, createPlaylist } = useStore();
    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreating) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isCreating]);

    if (!isOpen) return null;

    const handleCreateNew = async () => {
        const trimmed = newPlaylistName.trim();
        if (!trimmed) return;
        const newPl = await createPlaylist(trimmed);
        if (newPl?.id) {
            await onSelectPlaylist(newPl.id);
            setNewPlaylistName('');
            setIsCreating(false);
            onClose();
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>{title}</h3>
                    <button className={styles.closeBtn} onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.content}>
                    {isCreating ? (
                        <div className={styles.createForm}>
                            <input
                                ref={inputRef}
                                type="text"
                                className={styles.input}
                                placeholder="Playlist name..."
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateNew();
                                    if (e.key === 'Escape') setIsCreating(false);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                autoFocus
                            />
                            <div className={styles.createActions}>
                                <button className={styles.cancelBtn} onClick={() => setIsCreating(false)}>
                                    Cancel
                                </button>
                                <button className={styles.submitBtn} onClick={handleCreateNew} disabled={!newPlaylistName.trim()}>
                                    Create & Add
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <button className={styles.createNewBtn} onClick={() => setIsCreating(true)}>
                                <Plus size={16} />
                                <span>Create New Playlist</span>
                            </button>

                            <div className={`${styles.playlistList} custom-scrollbar`}>
                                {playlists.length === 0 ? (
                                    <p className={styles.emptyText}>No playlists yet. Create one to get started!</p>
                                ) : (
                                    playlists.map((playlist) => (
                                        <button
                                            key={playlist.id}
                                            className={styles.playlistItem}
                                            onClick={async () => {
                                                await onSelectPlaylist(playlist.id);
                                                onClose();
                                            }}
                                        >
                                            <div className={styles.iconWrapper}>
                                                {playlist.artworkUrl ? (
                                                    <img src={playlist.artworkUrl} alt="" className={styles.artwork} />
                                                ) : (
                                                    <Music size={18} />
                                                )}
                                            </div>
                                            <div className={styles.playlistInfo}>
                                                <span className={styles.playlistName}>{playlist.name}</span>
                                                <span className={styles.playlistMeta}>{playlist.trackCount || 0} tracks</span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
