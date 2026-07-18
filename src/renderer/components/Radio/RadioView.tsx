import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { Radio, Play, MoreHorizontal, Search, X, ExternalLink, RefreshCw, List, SkipForward, Music, ListPlus } from 'lucide-react';
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
        playQueueIndex,
        clearQueue,
        extractRadioToPlaylist,
        selectRadioStation,
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


    const handleBulkAction = async (action: 'play' | 'playNext' | 'addToQueue' | 'addToPlaylist', playlistId?: string) => {
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
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1><Radio size={32} style={{ display: 'inline', verticalAlign: 'middle' }} /> Bandcamp Radio</h1>
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
                                        <span className={styles.menuLabel}>Mixes</span>
                                        <button onClick={() => handleBulkAction('play')}>
                                            <Play size={16} /> Play Mixes
                                        </button>
                                        <button onClick={() => handleBulkAction('playNext')}>
                                            <SkipForward size={16} /> Play Mixes Next
                                        </button>
                                        <button onClick={() => handleBulkAction('addToQueue')}>
                                            <List size={16} /> Add Mixes to Queue
                                        </button>
                                        {playlists.length > 0 && (
                                            <>
                                                <span className={styles.menuLabel}>Add to Playlist</span>
                                                {playlists.map((playlist) => (
                                                    <button key={playlist.id} onClick={() => handleBulkAction('addToPlaylist', playlist.id)}>
                                                        <Music size={14} /> {playlist.name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        <div className={styles.menuDivider} />
                                        <span className={styles.menuLabel}>Extract Tracks</span>
                                        <button onClick={() => {
                                            filteredStations.forEach(station => {
                                                window.electron.radio.extractTracks(station, false);
                                            });
                                            setShowBulkMenu(false);
                                        }}>
                                            <Play size={16} /> Extract & Play
                                        </button>
                                        <button onClick={() => {
                                            filteredStations.forEach(station => {
                                                window.electron.radio.extractTracks(station, true);
                                            });
                                            setShowBulkMenu(false);
                                        }}>
                                            <ListPlus size={16} /> Extract & Add to Queue
                                        </button>
                                        {playlists.length > 0 && (
                                            <>
                                                <span className={styles.menuLabel}>Extract to Playlist</span>
                                                {playlists.map((playlist) => (
                                                    <button key={playlist.id} onClick={() => {
                                                        filteredStations.forEach(station => {
                                                            extractRadioToPlaylist(playlist.id, station);
                                                        });
                                                        setShowBulkMenu(false);
                                                    }}>
                                                        <Music size={14} /> {playlist.name}
                                                    </button>
                                                ))}
                                            </>
                                        )}
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

            <div className={`${styles.scrollContainer} custom-scrollbar`}>
            {/* Stations grid */}
            <div className={styles.grid}>
                {filteredStations.slice(0, visibleCount).map((station: any) => (
                    <div
                        key={station.id}
                        className={`${styles.card} ${radioState.currentStation?.id === station.id ? styles.active : ''}`}
                        onClick={() => selectRadioStation(station)}
                        onContextMenu={(e) => handleContextMenu(e, station)}
                        onMouseLeave={() => setContextMenu(null)}
                        style={{ zIndex: contextMenu?.station?.id === station.id ? 50 : 1 }}
                        data-testid="radio-card"
                    >
                        <div className={styles.cardImage}>
                            {station.imageUrl ? (
                                <img src={station.imageUrl} alt="" loading="lazy" />
                            ) : (
                                <div className={styles.placeholderImage}><Radio size={48} /></div>
                            )}
                            <div className={styles.cardOverlay}>
                                <div className={styles.playButtons}>
                                    <button 
                                        className={styles.playBtn} 
                                        onClick={(e) => { e.stopPropagation(); playRadioStation(station); }}
                                        title="Play Mix"
                                    >
                                        <Play size={32} fill="currentColor" />
                                    </button>
                                    <button 
                                        className={styles.playBtn} 
                                        onClick={(e) => { e.stopPropagation(); window.electron.radio.extractTracks(station, false); }}
                                        title="Play Extracted Tracks"
                                    >
                                        <ListPlus size={32} />
                                    </button>
                                </div>
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
                                <span className={styles.menuLabel}>Mix</span>
                                <button onClick={() => { playRadioStation(station); setContextMenu(null); }}>
                                    <Play size={16} /> Play Mix
                                </button>
                                <button onClick={() => { handlePlayNext(station); }}>
                                    <SkipForward size={16} /> Play Mix Next
                                </button>
                                <button onClick={() => { handleAddToQueue(station); }}>
                                    <List size={16} /> Add Mix to Queue
                                </button>
                                {playlists.length > 0 && (
                                    <>
                                        <span className={styles.menuLabel}>Add to Playlist</span>
                                        {playlists.map((playlist) => (
                                            <button key={playlist.id} onClick={() => { handleAddToPlaylist(playlist.id, station); }}>
                                                <Music size={14} /> {playlist.name}
                                            </button>
                                        ))}
                                    </>
                                )}
                                <div className={styles.menuDivider} />
                                <span className={styles.menuLabel}>Extract Tracks</span>
                                <button onClick={() => { window.electron.radio.extractTracks(station, false); setContextMenu(null); }}>
                                    <Play size={16} /> Extract & Play
                                </button>
                                <button onClick={() => { window.electron.radio.extractTracks(station, true); setContextMenu(null); }}>
                                    <ListPlus size={16} /> Extract & Add to Queue
                                </button>
                                {playlists.length > 0 && (
                                    <>
                                        <span className={styles.menuLabel}>Extract to Playlist</span>
                                        {playlists.map((playlist) => (
                                            <button key={playlist.id} onClick={() => { extractRadioToPlaylist(playlist.id, station); setContextMenu(null); }}>
                                                <Music size={14} /> {playlist.name}
                                            </button>
                                        ))}
                                    </>
                                )}
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
        </div>
    );
}
