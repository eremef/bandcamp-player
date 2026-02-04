import { useEffect, useState } from 'react';
import { useStore } from '../../store/store';
import { ArrowLeft, Music, Play, List, MoreHorizontal, Download } from 'lucide-react';
import styles from './AlbumDetailView.module.css';

export function AlbumDetailView() {
    const {
        selectedAlbum,
        setView,
        play,
        addAlbumToQueue,
        addTracksToQueue,
        clearQueue,
        playQueueIndex,

        getAlbumDetails,
        addToQueue,
        addTracksToPlaylist,
        playlists,
        downloadTrack
    } = useStore();

    const [isLoading, setIsLoading] = useState(false);
    const [albumDetails, setAlbumDetails] = useState(selectedAlbum);
    const [activeTrackMenu, setActiveTrackMenu] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedAlbum) return;

        setAlbumDetails(selectedAlbum);
        setIsLoading(false);

        const fetchDetails = async () => {
            // If we have no tracks, or we have tracks but they are missing stream URLs, we need to fetch
            const hasValidTracks = selectedAlbum.tracks.length > 0 && selectedAlbum.tracks.every(t => !!t.streamUrl || !!t.isCached);

            if (!hasValidTracks && selectedAlbum.bandcampUrl) {
                setIsLoading(true);
                try {
                    const details = await getAlbumDetails(selectedAlbum.bandcampUrl);
                    if (details) {
                        setAlbumDetails(details);
                    }
                } catch (error) {
                    console.error('Error fetching album details:', error);
                } finally {
                    setIsLoading(false);
                }
            }
        };

        fetchDetails();
    }, [selectedAlbum, getAlbumDetails]);

    if (!selectedAlbum) {
        return (
            <div className={styles.container}>
                <p>Album not found</p>
                <button onClick={() => setView('collection')}>Back to collection</button>
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
        if (albumDetails && albumDetails.tracks.length > 0) {
            await clearQueue(false);
            await addTracksToQueue(albumDetails.tracks);
            await playQueueIndex(0);
        }
    };

    const handleAddToQueue = async () => {
        if (albumDetails) {
            await addAlbumToQueue(albumDetails);
        }
    };

    const handleTrackAddToQueue = async (track: any) => {
        setActiveTrackMenu(null);
        await addToQueue(track);
    };

    const handleTrackAddToPlaylist = async (playlistId: string, track: any) => {
        setActiveTrackMenu(null);
        await addTracksToPlaylist(playlistId, [track]);
    };

    const handleTrackDownload = async (track: any) => {
        setActiveTrackMenu(null);
        await downloadTrack(track);
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => setView('collection')}>
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>
                <div className={styles.headerContent}>
                    <div className={styles.artwork}>
                        {albumDetails?.artworkUrl ? (
                            <img src={albumDetails.artworkUrl} alt={albumDetails.title} />
                        ) : (
                            <div className={styles.placeholderArtwork}><Music size={48} /></div>
                        )}
                    </div>
                    <div className={styles.info}>
                        <span className={styles.label}>Album</span>
                        <h1 className={styles.title}>{albumDetails?.title}</h1>
                        <h2 className={styles.artist}>{albumDetails?.artist}</h2>

                        <p className={styles.meta}>
                            {albumDetails?.tracks.length || 0} tracks
                            {albumDetails?.tracks.length ? ` • ${formatDuration(albumDetails.tracks.reduce((acc, t) => acc + t.duration, 0))}` : ''}
                        </p>
                        <div className={styles.actions}>
                            <button
                                className={styles.playBtn}
                                onClick={handlePlayAll}
                                disabled={isLoading || !albumDetails?.tracks.length}
                            >
                                <Play size={18} fill="currentColor" />
                                <span>Play</span>
                            </button>
                            <button
                                className={styles.actionBtn}
                                onClick={handleAddToQueue}
                                disabled={isLoading}
                            >
                                <List size={18} />
                                <span>Add to Queue</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Track list */}
            <div className={styles.trackList}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <div className="spinner" />
                        <p>Loading tracks...</p>
                    </div>
                ) : !albumDetails?.tracks.length ? (
                    <div className={styles.empty}>
                        <p>No tracks found for this album</p>
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.colNum}>#</th>
                                <th className={styles.colTitle}>Title</th>
                                <th className={styles.colDuration}>Duration</th>
                                <th className={styles.colActions}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {albumDetails.tracks.map((track, index) => (
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
                                            <span>{track.title}</span>
                                        </div>
                                    </td>
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
                                                    <button onClick={() => handleTrackAddToQueue(track)}>
                                                        <List size={14} /> Add to Queue
                                                    </button>

                                                    {playlists.length > 0 && (
                                                        <>
                                                            <div className={styles.menuDivider} />
                                                            <span className={styles.menuLabel}>Add to Playlist</span>
                                                            {playlists.map((playlist) => (
                                                                <button key={playlist.id} onClick={() => handleTrackAddToPlaylist(playlist.id, track)}>
                                                                    <Music size={14} /> {playlist.name}
                                                                </button>
                                                            ))}
                                                        </>
                                                    )}

                                                    <div className={styles.menuDivider} />
                                                    <button onClick={() => handleTrackDownload(track)}>
                                                        <Download size={14} /> Download
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
