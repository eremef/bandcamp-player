import { useState } from 'react';
import { useStore } from '../../store/store';
import { Check, X, Plus, ListMusic, Music, Play, Trash2, Pencil } from 'lucide-react';
import styles from './PlaylistsView.module.css';

export function PlaylistsView() {
    const { playlists, selectPlaylist, createPlaylist, deletePlaylist, playPlaylist, updatePlaylist } = useStore();

    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleCreate = () => {
        setIsCreating(true);
        // Focus will be handled by autoFocus on input
    };

    const handleRenameClick = (e: React.MouseEvent, playlist: any) => {
        e.stopPropagation();
        setEditName(playlist.name);
        setIsEditingId(playlist.id);
    };

    const handleSaveRename = async (e: React.MouseEvent | React.FormEvent, id: string) => {
        if (e) e.stopPropagation();
        const trimmedName = editName.trim();
        if (trimmedName) {
            await updatePlaylist(id, trimmedName);
        }
        setIsEditingId(null);
    };

    const handleCancelRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingId(null);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (newPlaylistName.trim()) {
            createPlaylist(newPlaylistName.trim());
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const handleCancel = () => {
        setIsCreating(false);
        setNewPlaylistName('');
    };

    const formatDuration = (seconds: number) => {
        if (!seconds) return '0 min';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes} min`;
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1>Playlists</h1>
                    <p>{playlists.length} playlists</p>
                </div>
                {isCreating ? (
                    <form className={styles.createForm} onSubmit={handleSubmit}>
                        <input
                            className={styles.createInput}
                            type="text"
                            placeholder="Playlist Name"
                            value={newPlaylistName}
                            onChange={(e) => setNewPlaylistName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') handleCancel();
                            }}
                        />
                        <button type="submit" className={`${styles.iconBtn} ${styles.saveBtn}`} title="Save">
                            <Check size={18} />
                        </button>
                        <button type="button" className={`${styles.iconBtn} ${styles.cancelBtn}`} onClick={handleCancel} title="Cancel">
                            <X size={18} />
                        </button>
                    </form>
                ) : (
                    <button className={styles.createBtn} onClick={handleCreate}>
                        <Plus size={18} />
                        <span>Create Playlist</span>
                    </button>
                )}
            </header>

            {playlists.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><ListMusic size={48} /></div>
                    <h3>No playlists yet</h3>
                    <p>Create a playlist to organize your favorite tracks</p>
                    <button className={styles.createBtnLarge} onClick={handleCreate}>
                        Create your first playlist
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {playlists.map((playlist) => (
                        <div key={playlist.id} className={styles.card} onClick={() => selectPlaylist(playlist.id)}>
                            <div className={styles.cardArtwork}>
                                {playlist.artworkUrl ? (
                                    <img src={playlist.artworkUrl} alt="" />
                                ) : (
                                    <div className={styles.placeholderArtwork}><Music size={48} /></div>
                                )}
                                <div className={styles.cardOverlay}>
                                    <button
                                        className={styles.playBtn}
                                        title="Play"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            playPlaylist(playlist.id);
                                        }}
                                    >
                                        <Play size={32} fill="currentColor" />
                                    </button>
                                </div>
                            </div>
                            <div className={styles.cardInfo}>
                                {isEditingId === playlist.id ? (
                                    <div className={styles.cardEditInfo} onClick={e => e.stopPropagation()}>
                                        <input
                                            className={styles.cardEditInput}
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveRename(e, playlist.id);
                                                if (e.key === 'Escape') handleCancelRename(e as any);
                                            }}
                                            autoFocus
                                        />
                                        <div className={styles.cardEditActions}>
                                            <button className={styles.saveBtnSmall} onClick={e => handleSaveRename(e, playlist.id)}>Save</button>
                                            <button className={styles.cancelBtnSmall} onClick={handleCancelRename}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className={styles.cardTitle}>{playlist.name}</h3>
                                        <p className={styles.cardMeta}>
                                            {playlist.trackCount} tracks • {formatDuration(playlist.totalDuration)}
                                            {playlist.description && ` • ${playlist.description}`}
                                        </p>
                                    </>
                                )}
                            </div>
                            <div className={styles.cardActions}>
                                <button
                                    className={styles.actionBtn}
                                    onClick={(e) => handleRenameClick(e, playlist)}
                                    title="Rename playlist"
                                >
                                    <Pencil size={18} />
                                </button>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete "${playlist.name}"?`)) {
                                            deletePlaylist(playlist.id);
                                        }
                                    }}
                                    title="Delete playlist"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
