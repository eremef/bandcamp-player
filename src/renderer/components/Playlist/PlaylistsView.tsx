import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/store';
import { useShallow } from 'zustand/react/shallow';
import { Check, X, Plus, ListMusic, Music, Play, Trash2, Pencil, RefreshCw, Upload, Download } from 'lucide-react';
import styles from './PlaylistsView.module.css';

export function PlaylistsView() {
    const { playlists, selectPlaylist, createPlaylist, deletePlaylist, playPlaylist, updatePlaylist, bandcampPlaylists, fetchBandcampPlaylists, importPlaylist, exportPlaylist } = useStore(useShallow(state => ({
        playlists: state.playlists,
        selectPlaylist: state.selectPlaylist,
        createPlaylist: state.createPlaylist,
        deletePlaylist: state.deletePlaylist,
        playPlaylist: state.playPlaylist,
        updatePlaylist: state.updatePlaylist,
        bandcampPlaylists: state.bandcampPlaylists,
        fetchBandcampPlaylists: state.fetchBandcampPlaylists,
        importPlaylist: state.importPlaylist,
        exportPlaylist: state.exportPlaylist
    })));

    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const createInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [importConflictData, setImportConflictData] = useState<{data: any, existingId: string} | null>(null);

    const handleRefreshBandcamp = async () => {
        setIsRefreshing(true);
        await fetchBandcampPlaylists();
        setIsRefreshing(false);
    };

    const handleImportClick = async () => {
        const importedData = await importPlaylist();
        if (!importedData) return;

        const existing = playlists.find((p: any) => p.name === importedData.name);
        if (existing) {
            setImportConflictData({ data: importedData, existingId: existing.id });
        } else {
            // Create new
            const newPlaylist = await createPlaylist(importedData.name, importedData.description);
            await useStore.getState().addTracksToPlaylist(newPlaylist.id, importedData.tracks);
        }
    };

    const handleImportMerge = async () => {
        if (!importConflictData) return;
        
        const fullExistingPlaylist = await window.electron.playlist.getById(importConflictData.existingId);
        const existingTrackIds = new Set(fullExistingPlaylist?.tracks?.map((t: any) => t.id) || []);
        const newTracks = importConflictData.data.tracks.filter((t: any) => !existingTrackIds.has(t.id));

        if (newTracks.length > 0) {
            await useStore.getState().addTracksToPlaylist(importConflictData.existingId, newTracks);
        }
        
        setImportConflictData(null);
    };

    const handleImportCreateNew = async () => {
        if (!importConflictData) return;
        const newPlaylist = await createPlaylist(importConflictData.data.name, importConflictData.data.description);
        await useStore.getState().addTracksToPlaylist(newPlaylist.id, importConflictData.data.tracks);
        setImportConflictData(null);
    };

    useEffect(() => {
        if (isCreating) {
            // Use setTimeout to ensure the element is in the DOM and ready to be focused
            const timer = setTimeout(() => {
                if (createInputRef.current) {
                    createInputRef.current.focus();
                    createInputRef.current.select();
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isCreating]);

    useEffect(() => {
        if (isEditingId) {
            const timer = setTimeout(() => {
                if (editInputRef.current) {
                    editInputRef.current.focus();
                    editInputRef.current.select();
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isEditingId]);

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
                <div className={styles.headerActions}>
                    {isCreating ? (
                        <form className={styles.createForm} onSubmit={handleSubmit}>
                            <input
                                ref={createInputRef}
                                className={styles.createInput}
                                type="text"
                                placeholder="Playlist Name"
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') handleCancel();
                                }}
                                autoFocus
                            />
                            <button type="submit" className={`${styles.iconBtn} ${styles.saveBtn}`} title="Save">
                                <Check size={18} />
                            </button>
                            <button type="button" className={`${styles.iconBtn} ${styles.cancelBtn}`} onClick={handleCancel} title="Cancel">
                                <X size={18} />
                            </button>
                        </form>
                    ) : (
                        <>
                            <button className={styles.createBtn} onClick={handleCreate}>
                                <Plus size={18} />
                                <span>Create Playlist</span>
                            </button>
                            <button className={styles.createBtn} onClick={handleImportClick} style={{ marginLeft: '10px' }}>
                                <Upload size={18} />
                                <span>Import Playlist</span>
                            </button>
                        </>
                    )}
                    <button
                        className={styles.actionButton}
                        onClick={handleRefreshBandcamp}
                        disabled={isRefreshing}
                        title="Refresh Bandcamp playlists"
                    >
                        <RefreshCw
                            size={20}
                            className={isRefreshing ? styles.spinning : ""}
                            data-testid="icon-refresh"
                        />
                    </button>
                </div>
            </header>

            <div className={`${styles.scrollContainer} custom-scrollbar`}>
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
                                            ref={editInputRef}
                                            className={styles.cardEditInput}
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveRename(e, playlist.id);
                                                if (e.key === 'Escape') handleCancelRename(e as any);
                                            }}
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
                                    className={styles.actionBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        exportPlaylist(playlist.id);
                                    }}
                                    title="Export playlist"
                                >
                                    <Download size={18} />
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

            {bandcampPlaylists.length > 0 && (
                <>
                    <header className={styles.header} style={{ marginTop: '2rem' }}>
                        <div className={styles.headerContent}>
                            <h2>Bandcamp Playlists</h2>
                            <p>{bandcampPlaylists.length} playlists</p>
                        </div>
                    </header>
                    <div className={styles.grid}>
                        {bandcampPlaylists.map((playlist) => (
                            <div key={playlist.id} className={styles.card} onClick={() => selectPlaylist(playlist.id)}>
                                <div className={styles.cardArtwork}>
                                    {playlist.artworkUrl ? (
                                        <img src={playlist.artworkUrl} alt="" />
                                    ) : (
                                        <div className={styles.placeholderArtwork}><Music size={48} /></div>
                                    )}
                                </div>
                                <div className={styles.cardInfo}>
                                    <h3 className={styles.cardTitle}>{playlist.name}</h3>
                                    <p className={styles.cardMeta}>
                                        {playlist.trackCount} tracks
                                        {playlist.description && ` • ${playlist.description}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
            </div>

            {importConflictData && (
                <div className={styles.modalOverlay} onClick={() => setImportConflictData(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3>Playlist Exists</h3>
                        <p>A playlist named &quot;{importConflictData.data.name}&quot; already exists. Do you want to merge the imported tracks into the existing playlist, or create a new one?</p>
                        <div className={styles.modalActions}>
                            <button className={styles.saveBtnSmall} onClick={handleImportMerge}>Merge</button>
                            <button className={styles.createBtnLarge} onClick={handleImportCreateNew}>Create New</button>
                            <button className={styles.cancelBtnSmall} onClick={() => setImportConflictData(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
