import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { Radio, Play, Pause, MoreHorizontal, Search, X, ExternalLink, RefreshCw, List, SkipForward, Music, Download } from 'lucide-react';
import styles from './RadioView.module.css';

export function RadioView() {
    const {
        radioStations,
        fetchRadioStations,
        refreshRadioStations,
        isLoadingRadioStations,
        playRadioStation,
        radioState,
        addRadioToQueue,
        addRadioToPlaylist,
        playlists,
        fetchPlaylists,
        radioSearchQuery,
        setRadioSearchQuery,
        clearQueue,
        playQueueIndex,
    } = useStore();
    const [visibleCount, setVisibleCount] = useState(20);
    const [contextMenu, setContextMenu] = useState<{ station: any } | null>(null);
    const [showBulkMenu, setShowBulkMenu] = useState(false);

    const filteredStations = useMemo(() => {
        if (!radioSearchQuery.trim()) return radioStations;
        const query = radioSearchQuery.toLowerCase();
        return radioStations.filter(s =>
            s.name.toLowerCase().includes(query) ||
            (s.description && s.description.toLowerCase().includes(query))
        );
    }, [radioStations, radioSearchQuery]);

    const handleLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + 20);
    }, []);

    const targetRef = useIntersectionObserver({
        onIntersect: handleLoadMore,
        enabled: visibleCount < filteredStations.length,
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
        setContextMenu({ station });
    };

    const handleMenuClick = (e: React.MouseEvent, station: any) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ station });
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

    const handleDownload = async (station: any) => {
        if (station.streamUrl) {
            await window.electron.cache.downloadTrack({
                id: station.id,
                title: station.name,
                artist: station.description || 'Bandcamp Radio',
                album: station.name,
                duration: station.duration || 0,
                streamUrl: station.streamUrl,
                artworkUrl: station.imageUrl,
            } as any);
        }
        setContextMenu(null);
    };

    const handleBulkAction = async (action: 'play' | 'playNext' | 'addToQueue' | 'addToPlaylist' | 'download', playlistId?: string) => {
        setShowBulkMenu(false);
        const stations = filteredStations;
        
        switch (action) {
            case 'play':
                if (stations.length > 0) {
                    await clearQueue(false);
                    for (const station of stations) {
                        await addRadioToQueue(station, false);
                    }
                    await playQueueIndex(0);
                }
                break;
            case 'playNext':
                for (const station of stations) {
                    await addRadioToQueue(station, true);
                }
                break;
            case 'addToQueue':
                for (const station of stations) {
                    await addRadioToQueue(station, false);
                }
                break;
            case 'addToPlaylist':
                if (playlistId) {
                    for (const station of stations) {
                        await addRadioToPlaylist(playlistId, station);
                    }
                }
                break;
            case 'download':
                for (const station of stations) {
                    if (station.streamUrl) {
                        await window.electron.cache.downloadTrack({
                            id: station.id,
                            title: station.name,
                            artist: station.description || 'Bandcamp Radio',
                            album: station.name,
                            duration: station.duration || 0,
                            streamUrl: station.streamUrl,
                            artworkUrl: station.imageUrl,
                        } as any);
                    }
                }
                break;
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1><Radio size={32} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '12px' }} /> Bandcamp Radio</h1>
                    <p>Discover new music curated by Bandcamp</p>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.searchBox}>
                        <Search className={styles.searchIcon} size={18} />
                        <input
                            type="text"
                            placeholder="Search radio shows..."
                            value={radioSearchQuery}
                            onChange={(e) => setRadioSearchQuery(e.target.value)}
                        />
                        {radioSearchQuery && (
                            <button className={styles.clearSearch} onClick={() => setRadioSearchQuery('')}>
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    {radioSearchQuery.trim() && filteredStations.length > 0 && (
                        <div className={styles.bulkActions} onMouseLeave={() => setShowBulkMenu(false)}>
                            <div className={styles.bulkMenuContainer}>
                                <button
                                    className={styles.bulkMoreButton}
                                    onClick={() => setShowBulkMenu(!showBulkMenu)}
                                    title="More actions for search results"
                                >
                                    <MoreHorizontal size={18} />
                                </button>
                                {showBulkMenu && (
                                    <div className={styles.bulkMenu} onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleBulkAction('play')}>
                                            <Play size={16} /> Play All
                                        </button>
                                        <button onClick={() => handleBulkAction('playNext')}>
                                            <SkipForward size={16} /> Play Next
                                        </button>
                                        <button onClick={() => handleBulkAction('addToQueue')}>
                                            <List size={16} /> Add to Queue
                                        </button>
                                        {playlists.length > 0 && (
                                            <>
                                                <div className={styles.bulkMenuDivider} />
                                                <span className={styles.bulkMenuLabel}>Add to Playlist</span>
                                                {playlists.map((playlist) => (
                                                    <button key={playlist.id} onClick={() => handleBulkAction('addToPlaylist', playlist.id)}>
                                                        <Music size={14} /> {playlist.name}
                                                    </button>
                                                ))}
                                                <div className={styles.bulkMenuDivider} />
                                            </>
                                        )}
                                        <button onClick={() => handleBulkAction('download')}>
                                            <Download size={16} /> Download for Offline
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <button
                        className={`${styles.refreshBtn} ${isLoadingRadioStations ? styles.spinning : ''}`}
                        onClick={() => !isLoadingRadioStations && refreshRadioStations()}
                        title="Refresh"
                        disabled={isLoadingRadioStations}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </header>

            {/* Stations grid */}
            <div className={styles.grid}>
                {filteredStations.slice(0, visibleCount).map((station: any) => (
                    <div
                        key={station.id}
                        className={`${styles.card} ${radioState.currentStation?.id === station.id ? styles.active : ''}`}
                        onClick={() => playRadioStation(station)}
                        onContextMenu={(e) => handleContextMenu(e, station)}
                        onMouseLeave={() => setContextMenu(null)}
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
                                <button
                                    className={styles.externalLink}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.electron.system.openExternal(`https://bandcamp.com/?show=${station.id}`);
                                    }}
                                    title="View on Bandcamp"
                                >
                                    <ExternalLink size={16} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.cardInfo}>
                            <h3 className={styles.cardTitle}>{station.name}</h3>
                            {station.date && (
                                <p className={styles.cardDate}>
                                    {station.date}
                                    {station.duration ? ` • ${Math.floor(station.duration / 3600)}h ${Math.floor((station.duration % 3600) / 60)}m` : ''}
                                </p>
                            )}
                            {station.description && (
                                <p className={styles.cardDescription}>{station.description}</p>
                            )}
                        </div>
                        {contextMenu?.station?.id === station.id && (
                            <div className={styles.contextMenu} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { playRadioStation(station); setContextMenu(null); }}>
                                    <Play size={16} /> Play Now
                                </button>
                                <button onClick={() => { handlePlayNext(station); }}>
                                    <SkipForward size={16} /> Play Next
                                </button>
                                <button onClick={() => { handleAddToQueue(station); }}>
                                    <List size={16} /> Add to Queue
                                </button>
                                <div className={styles.menuDivider} />
                                {playlists.length > 0 && (
                                    <>
                                        <span className={styles.menuLabel}>Add to Playlist</span>
                                        {playlists.map((playlist) => (
                                            <button key={playlist.id} onClick={() => { handleAddToPlaylist(playlist.id, station); }}>
                                                <Music size={14} /> {playlist.name}
                                            </button>
                                        ))}
                                        <div className={styles.menuDivider} />
                                    </>
                                )}
                                <button onClick={() => { handleDownload(station); }}>
                                    <Download size={16} /> Download for Offline
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {visibleCount < filteredStations.length && (
                <div ref={targetRef} className={styles.loadMoreContainer} style={{ height: '20px', margin: '20px 0' }}>
                    {/* Sentinel element for infinite scroll */}
                </div>
            )}

            {filteredStations.length === 0 && radioStations.length > 0 && (
                <div className={styles.loading}>
                    <p>No radio shows match your search.</p>
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
