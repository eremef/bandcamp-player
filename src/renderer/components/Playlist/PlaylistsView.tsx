import { useState } from 'react';
import { useStore } from '../../store/store';
import styles from './PlaylistsView.module.css';

export function PlaylistsView() {
    const { playlists, selectPlaylist, createPlaylist, deletePlaylist } = useStore();

    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');

    const handleCreate = () => {
        setIsCreating(true);
        // Focus will be handled by autoFocus on input
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
                            ✔️
                        </button>
                        <button type="button" className={`${styles.iconBtn} ${styles.cancelBtn}`} onClick={handleCancel} title="Cancel">
                            ❌
                        </button>
                    </form>
                ) : (
                    <button className={styles.createBtn} onClick={handleCreate}>
                        <span>+</span> Create Playlist
                    </button>
                )}
            </header>

            {playlists.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}>📝</div>
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
                                    <div className={styles.placeholderArtwork}>🎵</div>
                                )}
                                <div className={styles.cardOverlay}>
                                    <button className={styles.playBtn} title="Play">
                                        ▶️
                                    </button>
                                </div>
                            </div>
                            <div className={styles.cardInfo}>
                                <h3 className={styles.cardTitle}>{playlist.name}</h3>
                                <p className={styles.cardMeta}>
                                    {playlist.trackCount} tracks
                                    {playlist.description && ` • ${playlist.description}`}
                                </p>
                            </div>
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
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
