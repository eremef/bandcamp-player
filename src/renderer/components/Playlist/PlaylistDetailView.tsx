import React, { useState } from 'react';
import { useStore } from '../../store/store';
import { ArrowLeft, Music, Play, Pencil, Trash2, MoreHorizontal, List, Download, Clock } from 'lucide-react';
import { TableVirtuoso } from 'react-virtuoso';
import styles from './PlaylistDetailView.module.css';

interface DraggableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    index: number;
    track: any;
    dragIndex: number | null;
    dragOverIndex: number | null;
    onDragStartRow: (index: number) => void;
    onDragOverRow: (e: React.DragEvent, index: number) => void;
    onDropRow: (index: number) => void;
    onDragEndRow: () => void;
    setActiveTrackMenu: (id: string | null) => void;
    isDraggable?: boolean;
}

const DraggableRow = React.forwardRef<HTMLTableRowElement, DraggableRowProps>(({
    index, track, dragIndex, dragOverIndex, onDragStartRow, onDragOverRow, onDropRow, onDragEndRow, setActiveTrackMenu, isDraggable = true, className, children, ...rest
}, ref) => {
    const isDragOver = dragOverIndex === index;

    return (
        <tr
            {...rest}
            ref={ref}
            className={`${className} ${styles.trackRow} ${dragIndex === index ? styles.dragging : ''} ${isDragOver ? styles.dragOver : ''}`}
            onMouseLeave={() => setActiveTrackMenu(null)}
            onContextMenu={(e) => {
                e.preventDefault();
                setActiveTrackMenu(track.id);
            }}
            draggable={isDraggable}
            onDragStart={isDraggable ? () => onDragStartRow(index) : undefined}
            onDragOver={isDraggable ? (e) => onDragOverRow(e, index) : undefined}
            onDrop={isDraggable ? (e) => {
                e.preventDefault();
                onDropRow(index);
            } : undefined}
            onDragEnd={isDraggable ? onDragEndRow : undefined}
        >
            {children}
        </tr>
    );
});
DraggableRow.displayName = 'DraggableRow';

const VirtuosoTable = (props: any) => (
    <table {...props} className={styles.table} style={{ ...props.style, width: '100%', tableLayout: 'fixed' }} />
);
VirtuosoTable.displayName = 'VirtuosoTable';

const VirtuosoTableHead = React.forwardRef<HTMLTableSectionElement, any>((props, ref) => (
    <thead {...props} ref={ref} style={props.style} />
));
VirtuosoTableHead.displayName = 'VirtuosoTableHead';

const VirtuosoTableBody = React.forwardRef<HTMLTableSectionElement, any>((props, ref) => (
    <tbody {...props} ref={ref} />
));
VirtuosoTableBody.displayName = 'VirtuosoTableBody';

const VirtuosoTableRow = React.forwardRef<HTMLTableRowElement, any>((props, ref) => {
    const { context } = props;
    const index = props['data-index'] as number;
    const track = context.tracks[index];

    return (
        <DraggableRow
            {...props}
            ref={ref}
            index={index}
            track={track}
            dragIndex={context.dragIndex}
            dragOverIndex={context.dragOverIndex}
            onDragStartRow={context.handleDragStart}
            onDragOverRow={context.handleDragOverRow}
            onDropRow={context.handleDrop}
            onDragEndRow={context.handleDragEnd}
            setActiveTrackMenu={context.setActiveTrackMenu}
            isDraggable={context.isDraggable}
        />
    );
});
VirtuosoTableRow.displayName = 'VirtuosoTableRow';

const VirtuosoTableFoot = React.forwardRef<HTMLTableSectionElement, any>((props, ref) => (
    <tfoot {...props} ref={ref} />
));
VirtuosoTableFoot.displayName = 'VirtuosoTableFoot';

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
        selectArtist,
        navigateToAlbumFromTrack,
        exportPlaylist,
        deletePlaylist,
        goBack,
        knownArtists,
        knownAlbums,
        loadingBandcampPlaylistId
    } = useStore();

    const [activeTrackMenu, setActiveTrackMenu] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragStart = (index: number) => {
        setDragIndex(index);
    };

    const handleDragOverRow = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = async (toIndex: number) => {
        if (dragIndex !== null && dragIndex !== toIndex && selectedPlaylist) {
            const fromIndex = dragIndex;
            setDragIndex(null);
            setDragOverIndex(null);
            const { reorderPlaylistTracks } = useStore.getState();
            try {
                const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
                await reorderPlaylistTracks(selectedPlaylist.id, fromIndex, adjustedToIndex);
            } catch (err) {
                console.error('Failed to reorder playlist tracks:', err);
            }
        } else {
            setDragIndex(null);
            setDragOverIndex(null);
        }
    };

    const handleDragEnd = () => {
        setDragIndex(null);
        setDragOverIndex(null);
    };

    if (!selectedPlaylist) {
        return (
            <div className={styles.container}>
                <p>Playlist not found</p>
                <button onClick={() => setView('playlists')}>Back to playlists</button>
            </div>
        );
    }

    const isLoadingTracks = loadingBandcampPlaylistId === selectedPlaylist.id;

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
                <button className={styles.backBtn} onClick={() => goBack()}>
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
                            {!isEditing && !selectedPlaylist.isBandcampPlaylist && (
                                <>
                                    <button className={styles.actionBtn} onClick={handleRenameClick}>
                                        <Pencil size={18} />
                                        <span>Rename</span>
                                    </button>
                                    <button className={styles.actionBtn} onClick={() => exportPlaylist(selectedPlaylist.id)}>
                                        <Download size={18} />
                                        <span>Export</span>
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={() => {
                                            if (confirm(`Delete "${selectedPlaylist.name}"?`)) {
                                                deletePlaylist(selectedPlaylist.id);
                                            }
                                        }}
                                        style={{ color: 'var(--color-error)' }}
                                    >
                                        <Trash2 size={18} />
                                        <span>Delete</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Track list */}
            <div className={styles.trackList}>
                {isLoadingTracks && selectedPlaylist.tracks.length === 0 ? (
                    <div className={styles.loading} data-testid="playlist-tracks-loading">
                        <div className={styles.spinner} />
                        <p>Loading tracks from Bandcamp…</p>
                    </div>
                ) : selectedPlaylist.tracks.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No tracks in this playlist</p>
                        <p className={styles.emptyHint}>Add tracks from your collection</p>
                    </div>
                ) : (
                    <TableVirtuoso
                        data={selectedPlaylist.tracks}
                        className={styles.table}
                        style={{ flex: 1 }}
                        initialItemCount={selectedPlaylist.tracks.length}
                        useWindowScroll={false}
                        context={{
                            tracks: selectedPlaylist.tracks,
                            dragIndex,
                            dragOverIndex,
                            handleDragStart,
                            handleDragOverRow,
                            handleDrop,
                            handleDragEnd,
                            setActiveTrackMenu,
                            isDraggable: !selectedPlaylist.isBandcampPlaylist
                        }}
                        components={{
                            Table: VirtuosoTable,
                            TableHead: VirtuosoTableHead as any,
                            TableBody: VirtuosoTableBody as any,
                            TableRow: VirtuosoTableRow as any,
                            TableFoot: VirtuosoTableFoot as any
                        }}
                        fixedFooterContent={() => !selectedPlaylist.isBandcampPlaylist ? (
                            <tr
                                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(selectedPlaylist.tracks.length); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const toIndex = selectedPlaylist.tracks.length - 1;
                                    if (dragIndex !== null && dragIndex !== toIndex) {
                                        const { reorderPlaylistTracks } = useStore.getState();
                                        reorderPlaylistTracks(selectedPlaylist.id, dragIndex, toIndex).catch(
                                            (err: unknown) => console.error('Failed to reorder playlist tracks:', err)
                                        );
                                    }
                                    setDragIndex(null);
                                    setDragOverIndex(null);
                                }}
                                onDragLeave={() => { if (dragOverIndex === selectedPlaylist.tracks.length) setDragOverIndex(null); }}
                            >
                                <td
                                    colSpan={6}
                                    style={{
                                        height: '24px',
                                        borderTop: dragOverIndex === selectedPlaylist.tracks.length
                                            ? '3px solid var(--accent-primary)'
                                            : '3px solid transparent',
                                        transition: 'border-color 0.1s',
                                    }}
                                />
                            </tr>
                        ) : null}
                        fixedHeaderContent={() => (
                            <tr>
                                <th className={styles.colNum}>#</th>
                                <th className={styles.colTitle}>Title</th>
                                <th className={styles.colArtist}>Artist</th>
                                <th className={styles.colAlbum}>Album</th>
                                <th className={styles.colDuration}><Clock size={16} /></th>
                                <th className={styles.colActions}></th>
                            </tr>
                        )}
                        itemContent={(index, track) => (
                            <>
                                <td className={styles.colNum}>
                                    <button data-testid="play-track-btn" className={styles.playTrackBtn} onClick={() => play(track)}>
                                        <span className={styles.trackNumber}>{index + 1}</span>
                                        <span className={styles.playIcon}><Play size={14} fill="currentColor" /></span>
                                    </button>
                                </td>
                                <td className={styles.colTitle}>
                                    <div className={styles.trackTitle}>
                                        <span>{track.title}</span>
                                    </div>
                                </td>
                                <td className={styles.colArtist}>
                                    <span
                                        className={knownArtists.has(track.artist) ? styles.link : ''}
                                        onClick={(e) => { 
                                            if (!knownArtists.has(track.artist)) return;
                                            e.stopPropagation(); 
                                            selectArtist(track.artist); 
                                        }}
                                        title={knownArtists.has(track.artist) ? "Go to artist" : undefined}
                                    >
                                        {track.artist}
                                    </span>
                                </td>
                                <td className={styles.colAlbum}>
                                    {track.album && (
                                        <span
                                            className={knownAlbums.has(`${track.artist}|${track.album}`) ? styles.link : ''}
                                            onClick={(e) => { 
                                                if (!knownAlbums.has(`${track.artist}|${track.album}`)) return;
                                                e.stopPropagation(); 
                                                navigateToAlbumFromTrack(track); 
                                            }}
                                            title={knownAlbums.has(`${track.artist}|${track.album}`) ? "Go to album" : undefined}
                                        >
                                            {track.album}
                                        </span>
                                    )}
                                </td>
                                <td className={styles.colDuration}>
                                    {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
                                </td>
                                <td className={styles.colActions}>
                                    <div className={styles.actionsWrapper}>

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
                                                    {!selectedPlaylist.isBandcampPlaylist && (
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
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {!selectedPlaylist.isBandcampPlaylist && (
                                            <button
                                                className={styles.rowRemoveBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeTrackFromPlaylist(selectedPlaylist.id, track.playlistEntryId || track.id);
                                                }}
                                                title="Remove from playlist"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </>
                        )}
                    />
                )}
            </div>
        </div>
    );
}
