import { useState } from 'react';
import { useStore } from '../../store/store';
import { ArrowLeft, Music, Play, Pencil, Trash2, MoreHorizontal, List } from 'lucide-react';
import styles from './PlaylistDetailView.module.css';

export function PlaylistDetailView() {
    const {
        selectedPlaylist,
        setView,
        play,
        addToQueue,
        removeTrackFromPlaylist,
        updatePlaylist,
        clearQueue,
        addTracksToQueue,
        playQueueIndex,
    } = useStore();

    const [activeTrackMenu, setActiveTrackMenu] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');

    if (!selectedPlaylist) {
        return (
            <div className={styles.container}>
                <p>Playlist not found</p>
                <button onClick={() => setView('playlists')}>Back to playlists</button>
            </div>
        );
    }

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours} hr ${mins} min`;
        }
        return `${mins} min`;
    };

    const handlePlayAll = async () => {
        if (selectedPlaylist.tracks.length > 0) {
            // Replace entire queue with playlist
            await clearQueue(false); // Clear and stop
            await addTracksToQueue(selectedPlaylist.tracks);
            await playQueueIndex(0);
        }
    };

    const handleRenameClick = () => {
        setEditName(selectedPlaylist.name);
        setIsEditing(true);
    };

    const handleSaveRename = async () => {
        const trimmedName = editName.trim();
        if (!trimmedName) {
            return;
        }
        
        if (trimmedName !== selectedPlaylist.name) {
            try {
                await updatePlaylist(selectedPlaylist.id, trimmedName);
            } catch (error) {
                console.error('PlaylistDetailView: Rename failed', error);
            }
        }
        setIsEditing(false);
    };

    const handleCancelRename = () => {
        setIsEditing(false);
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => setView('playlists')}>
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>
                <div className={styles.headerContent}>
                    <div className={styles.artwork}>
                        {selectedPlaylist.artworkUrl ? (
                            <img src={selectedPlaylist.artworkUrl} alt="" />
                        ) : (
                            <div className={styles.placeholderArtwork}><Music size={48} /></div>
                        )}
                    </div>
                    <div className={styles.info}>
                        <span className={styles.label}>Playlist</span>
                        {isEditing ? (
                            <div className={styles.editTitleContainer}>
                                <input
                                    className={styles.titleInput}
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRename();
                                        if (e.key === 'Escape') handleCancelRename();
                                    }}
                                    autoFocus
                                />
                                <div className={styles.editActions}>
                                    <button className={styles.saveBtn} onClick={handleSaveRename}>Save</button>
                                    <button className={styles.cancelBtn} onClick={handleCancelRename}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <h1 className={styles.title}>{selectedPlaylist.name}</h1>
                        )}
                        {selectedPlaylist.description && (
                            <p className={styles.description}>{selectedPlaylist.description}</p>
                        )}
                        <p className={styles.meta}>
                            {selectedPlaylist.trackCount} tracks • {formatDuration(selectedPlaylist.totalDuration)}
                        </p>
                        <div className={styles.actions}>
                            <button className={styles.playBtn} onClick={handlePlayAll} disabled={selectedPlaylist.tracks.length === 0}>
                                <Play size={18} fill="currentColor" />
                                <span>Play All</span>
                            </button>
                            {!isEditing && (
                                <button className={styles.actionBtn} onClick={handleRenameClick}>
                                    <Pencil size={18} />
                                    <span>Rename</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Track list */}
            <div className={styles.trackList}>
                {selectedPlaylist.tracks.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No tracks in this playlist</p>
                        <p className={styles.emptyHint}>Add tracks from your collection</p>
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.colNum}>#</th>
                                <th className={styles.colTitle}>Title</th>
                                <th className={styles.colArtist}>Artist</th>
                                <th className={styles.colDuration}>Duration</th>
                                <th className={styles.colActions}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedPlaylist.tracks.map((track, index) => (
                                <tr 
                                    key={`${track.id}-${index}`} 
                                    className={styles.trackRow}
                                    onMouseLeave={() => setActiveTrackMenu(null)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setActiveTrackMenu(track.id);
                                    }}
                                >
                                    <td className={styles.colNum}>
                                        <button data-testid="play-track-btn" className={styles.playTrackBtn} onClick={() => play(track)}>
                                            <span className={styles.trackNumber}>{index + 1}</span>
                                            <span className={styles.playIcon}><Play size={14} fill="currentColor" /></span>
                                        </button>
                                    </td>
                                    <td className={styles.colTitle}>
                                        <div className={styles.trackTitle}>
                                            <img src={track.artworkUrl} alt="" className={styles.trackArtwork} />
                                            <span>{track.title}</span>
                                        </div>
                                    </td>
                                    <td className={styles.colArtist}>{track.artist}</td>
                                    <td className={styles.colDuration}>
                                        {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
                                    </td>
                                    <td className={styles.colActions}>
                                        <div className={styles.menuContainer}>
                                            <button
                                                className={styles.menuBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveTrackMenu(activeTrackMenu === track.id ? null : track.id);
                                                }}
                                            >
                                                <MoreHorizontal size={16} />
                                            </button>

                                            {activeTrackMenu === track.id && (
                                                <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => {
                                                        setActiveTrackMenu(null);
                                                        addToQueue(track, true);
                                                    }}>
                                                        <Play size={14} /> Play Next
                                                    </button>
                                                    <button onClick={() => {
                                                        setActiveTrackMenu(null);
                                                        addToQueue(track);
                                                    }}>
                                                        <List size={14} /> Add to Queue
                                                    </button>
                                                    <div className={styles.menuDivider} />
                                                    <button
                                                        className={styles.removeBtn}
                                                        onClick={() => {
                                                            setActiveTrackMenu(null);
                                                            removeTrackFromPlaylist(selectedPlaylist.id, track.playlistEntryId || track.id);
                                                        }}
                                                        title="Remove from playlist"
                                                    >
                                                        <Trash2 size={14} /> Remove from Playlist
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
