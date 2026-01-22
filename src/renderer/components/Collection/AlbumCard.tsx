import { useState } from 'react';
import { useStore } from '../../store/store';
import type { Album } from '../../../shared/types';
import styles from './AlbumCard.module.css';

interface AlbumCardProps {
    album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
    const { getAlbumDetails, addAlbumToQueue, play, playlists, addTrackToPlaylist, downloadTrack } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const handlePlay = async () => {
        setIsLoading(true);
        try {
            // Fetch full album details if we don't have tracks
            let albumWithTracks = album;
            if (album.tracks.length === 0 && album.bandcampUrl) {
                const details = await getAlbumDetails(album.bandcampUrl);
                if (details) {
                    albumWithTracks = details;
                }
            }

            if (albumWithTracks.tracks.length > 0) {
                await addAlbumToQueue(albumWithTracks);
                await play(albumWithTracks.tracks[0]);
            }
        } catch (error) {
            console.error('Error playing album:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddToQueue = async () => {
        setShowMenu(false);
        let albumWithTracks = album;
        if (album.tracks.length === 0 && album.bandcampUrl) {
            const details = await getAlbumDetails(album.bandcampUrl);
            if (details) {
                albumWithTracks = details;
            }
        }
        await addAlbumToQueue(albumWithTracks);
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        setShowMenu(false);
        let albumWithTracks = album;
        if (album.tracks.length === 0 && album.bandcampUrl) {
            const details = await getAlbumDetails(album.bandcampUrl);
            if (details) {
                albumWithTracks = details;
            }
        }
        for (const track of albumWithTracks.tracks) {
            await addTrackToPlaylist(playlistId, track);
        }
    };

    const handleDownload = async () => {
        setShowMenu(false);
        let albumWithTracks = album;
        if (album.tracks.length === 0 && album.bandcampUrl) {
            const details = await getAlbumDetails(album.bandcampUrl);
            if (details) {
                albumWithTracks = details;
            }
        }
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
                        ⋯
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
                    <button onClick={handlePlay}>▶️ Play Now</button>
                    <button onClick={handleAddToQueue}>📋 Add to Queue</button>
                    <div className={styles.menuDivider} />
                    {playlists.length > 0 && (
                        <>
                            <span className={styles.menuLabel}>Add to Playlist</span>
                            {playlists.map((playlist) => (
                                <button key={playlist.id} onClick={() => handleAddToPlaylist(playlist.id)}>
                                    🎵 {playlist.name}
                                </button>
                            ))}
                            <div className={styles.menuDivider} />
                        </>
                    )}
                    <button onClick={handleDownload}>📥 Download for Offline</button>
                </div>
            )}
        </div>
    );
}
