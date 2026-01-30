import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { Radio, Square, Play, Pause, MoreHorizontal } from 'lucide-react';
import styles from './RadioView.module.css';

export function RadioView() {
    const {
        radioStations,
        fetchRadioStations,
        playRadioStation,
        radioState,
        stopRadio,
        addRadioToQueue,
        addRadioToPlaylist,
        playlists,
        fetchPlaylists
    } = useStore();
    const [visibleCount, setVisibleCount] = useState(20);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; station: any } | null>(null);

    const handleLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + 20);
    }, []);

    const targetRef = useIntersectionObserver({
        onIntersect: handleLoadMore,
        enabled: visibleCount < radioStations.length,
    });

    useEffect(() => {
        if (radioStations.length === 0) {
            fetchRadioStations();
        }
        if (playlists.length === 0) {
            fetchPlaylists();
        }
    }, [radioStations.length, fetchRadioStations, playlists.length, fetchPlaylists]);

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, station: any) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent card click
        setContextMenu({ x: e.clientX, y: e.clientY, station });
    };

    const handleMenuClick = (e: React.MouseEvent, station: any) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, station });
    };

    const handlePlayNext = async (station: any) => {
        await addRadioToQueue(station, true);
        setContextMenu(null);
    };

    const handleAddToQueue = async (station: any) => {
        await addRadioToQueue(station, false);
        setContextMenu(null);
    };

    const handleAddToPlaylist = async (playlistId: string, station: any) => {
        await addRadioToPlaylist(playlistId, station);
        setContextMenu(null);
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1><Radio size={32} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '12px' }} /> Bandcamp Radio</h1>
                    <p>Discover new music curated by Bandcamp</p>
                </div>
            </header>

            {/* Currently playing */}
            {radioState.isActive && radioState.currentStation && (
                <div className={styles.nowPlaying}>
                    <div className={styles.nowPlayingContent}>
                        <div className={styles.waveform}>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div className={styles.nowPlayingInfo}>
                            <span className={styles.nowPlayingLabel}>Now Playing</span>
                            <h3>{radioState.currentStation.name}</h3>
                            {radioState.currentTrack && (
                                <p>{radioState.currentTrack.title} - {radioState.currentTrack.artist}</p>
                            )}
                        </div>
                    </div>
                    <button className={styles.stopBtn} onClick={stopRadio}>
                        <Square size={16} fill="currentColor" />
                        <span>Stop</span>
                    </button>
                </div>
            )}

            {/* Stations grid */}
            <div className={styles.grid}>
                {radioStations.slice(0, visibleCount).map((station) => (
                    <div
                        key={station.id}
                        className={`${styles.card} ${radioState.currentStation?.id === station.id ? styles.active : ''}`}
                        onClick={() => playRadioStation(station)}
                        onContextMenu={(e) => handleContextMenu(e, station)}
                    >
                        <div className={styles.cardImage}>
                            {station.imageUrl ? (
                                <img src={station.imageUrl} alt="" loading="lazy" />
                            ) : (
                                <div className={styles.placeholderImage}><Radio size={48} /></div>
                            )}
                            <div className={styles.cardOverlay}>
                                <button className={styles.playBtn}>
                                    {radioState.currentStation?.id === station.id ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
                                </button>
                                <button
                                    className={styles.menuButton}
                                    onClick={(e) => handleMenuClick(e, station)}
                                    title="More options"
                                >
                                    <MoreHorizontal size={20} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.cardInfo}>
                            <h3 className={styles.cardTitle}>{station.name}</h3>
                            {station.date && (
                                <p className={styles.cardDate}>{station.date}</p>
                            )}
                            {station.description && (
                                <p className={styles.cardDescription}>{station.description}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className={styles.contextMenu}
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.menuItem} onClick={() => {
                        playRadioStation(contextMenu.station);
                        setContextMenu(null);
                    }}>
                        <Play size={16} /> Play Now
                    </div>
                    <div className={styles.menuItem} onClick={() => handlePlayNext(contextMenu.station)}>
                        <div style={{ width: 16 }} /> Play Next
                    </div>
                    <div className={styles.menuItem} onClick={() => handleAddToQueue(contextMenu.station)}>
                        <div style={{ width: 16 }} /> Add to Queue
                    </div>

                    <div className={styles.menuSeparator} />

                    <div className={`${styles.menuItem} ${styles.submenuContainer}`}>
                        <div className={styles.submenuTrigger} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Add to Playlist</span>
                            <span>▶</span>
                        </div>
                        <div className={styles.submenu}>
                            {playlists.length > 0 ? (
                                playlists.map(playlist => (
                                    <div
                                        key={playlist.id}
                                        className={styles.menuItem}
                                        onClick={() => handleAddToPlaylist(playlist.id, contextMenu.station)}
                                    >
                                        {playlist.name}
                                    </div>
                                ))
                            ) : (
                                <div className={styles.menuItem} style={{ fontStyle: 'italic', cursor: 'default' }}>
                                    No playlists
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {visibleCount < radioStations.length && (
                <div ref={targetRef} className={styles.loadMoreContainer} style={{ height: '20px', margin: '20px 0' }}>
                    {/* Sentinel element for infinite scroll */}
                </div>
            )}

            {radioStations.length === 0 && (
                <div className={styles.loading}>
                    <div className="spinner" />
                    <p>Loading radio stations...</p>
                </div>
            )}
        </div>
    );
}
