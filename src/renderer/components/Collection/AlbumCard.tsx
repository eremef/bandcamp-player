import { useState } from 'react';
import { useStore } from '../../store/store';
import type { Album } from '../../../shared/types';
import { MoreHorizontal, Play, List, Music, Download } from 'lucide-react';
import styles from './AlbumCard.module.css';

interface AlbumCardProps {
    album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
    const { getAlbumDetails, addAlbumToQueue, playlists, addTrackToPlaylist, addTracksToPlaylist, downloadTrack, clearQueue, playQueueIndex } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const ensureAlbumTracks = async () => {
        // If we have no tracks, or we have tracks but they are missing stream URLs (and not cached), we need to fetch
        const hasValidTracks = album.tracks.length > 0 && album.tracks.every(t => !!t.streamUrl || !!t.isCached);

        if (hasValidTracks) {
            return album;
        }

        if (album.bandcampUrl) {
            setIsLoading(true);
            try {
                const details = await getAlbumDetails(album.bandcampUrl);
                if (details) {
                    return details;
                }
            } catch (error) {
                console.error('Error fetching album details:', error);
            } finally {
                setIsLoading(false);
            }
        }
        return album;
    };

    const handlePlay = async () => {
        const albumWithTracks = await ensureAlbumTracks();

        if (albumWithTracks.tracks.length > 0) {
            await clearQueue(false);
            await addAlbumToQueue(albumWithTracks);
            await playQueueIndex(0);
        }
    };

    const handleAddToQueue = async () => {
        setShowMenu(false);
        const albumWithTracks = await ensureAlbumTracks();
        await addAlbumToQueue(albumWithTracks);
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        setShowMenu(false);
        const albumWithTracks = await ensureAlbumTracks();
        await addTracksToPlaylist(playlistId, albumWithTracks.tracks);
    };

    const handleDownload = async () => {
        setShowMenu(false);
        const albumWithTracks = await ensureAlbumTracks();
        for (const track of albumWithTracks.tracks) {
            await downloadTrack(track);
        }
    };

    return (
        <div className={styles.card} onMouseLeave={() => setShowMenu(false)}>
            {/* Artwork */}
            <div className={styles.artworkContainer}>
                <img src={album.artworkUrl} alt={album.title} className={styles.artwork} />
                <div className={styles.overlay}>
                    <button
                        className={styles.playButton}
                        onClick={handlePlay}
                        disabled={isLoading}
                        title="Play"
                    >
                        {isLoading ? (
                            <span className={styles.spinner} />
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>
                    <button
                        className={styles.menuButton}
                        onClick={() => setShowMenu(!showMenu)}
                        title="More options"
                    >
                        <MoreHorizontal size={20} />
                    </button>
                </div>
            </div>

            {/* Info */}
            <div className={styles.info}>
                <h3 className={styles.title}>{album.title}</h3>
                <p className={styles.artist}>{album.artist}</p>
            </div>

            {/* Context menu */}
            {showMenu && (
                <div className={styles.menu}>
                    <button onClick={handlePlay}><Play size={16} /> Play Now</button>
                    <button onClick={handleAddToQueue}><List size={16} /> Add to Queue</button>
                    <div className={styles.menuDivider} />
                    {playlists.length > 0 && (
                        <>
                            <span className={styles.menuLabel}>Add to Playlist</span>
                            {playlists.map((playlist) => (
                                <button key={playlist.id} onClick={() => handleAddToPlaylist(playlist.id)}>
                                    <Music size={14} /> {playlist.name}
                                </button>
                            ))}
                            <div className={styles.menuDivider} />
                        </>
                    )}
                    <button onClick={handleDownload}><Download size={16} /> Download for Offline</button>
                </div>
            )}
        </div>
    );
}
