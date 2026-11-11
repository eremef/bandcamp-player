import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { Radio, Play, MoreHorizontal, Search, X, ExternalLink, RefreshCw, List, SkipForward, Music, ListPlus } from 'lucide-react';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import { ViewLayoutControl } from '../UI/ViewLayoutControl';
import type { RadioStation } from '../../../shared/types';
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
        radio_view_mode: viewMode,
        radio_cover_size: coverSize,
        setRadioViewMode,
        setRadioCoverSize,
    } = useStore();
    const [visibleCount, setVisibleCount] = useState(20);
    const [contextMenu, setContextMenu] = useState<{ station: any; side: 'left' | 'right' } | null>(null);
    const [showBulkMenu, setShowBulkMenu] = useState(false);

    // Add to Playlist modal states
    const [playlistModalTarget, setPlaylistModalTarget] = useState<{
        type: 'single-mix' | 'single-extract' | 'bulk-mix' | 'bulk-extract';
        station?: any;
    } | null>(null);

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

    const getContextMenuSide = (target: Element): 'left' | 'right' => {
        const card = target.closest<HTMLElement>('[data-testid="radio-card"]');
        const layout = card?.closest<HTMLElement>('[data-testid="radio-layout"]');
        if (!card || !layout) return 'left';
        const cardRect = card.getBoundingClientRect();
        const layoutRect = layout.getBoundingClientRect();
        return cardRect.left + cardRect.width / 2 > layoutRect.left + layoutRect.width / 2 ? 'right' : 'left';
    };

    const handleContextMenu = (e: React.MouseEvent, station: any) => {
        e.preventDefault();
        setContextMenu({ station, side: getContextMenuSide(e.currentTarget) });
    };

    const handleMenuClick = (e: React.MouseEvent, station: any) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ station, side: getContextMenuSide(e.currentTarget) });
    };

    const renderStationActions = (station: RadioStation) => (
        <div className={styles.cardActions} data-testid="radio-card-actions">
            <div className={styles.playButtons}>
                <button
                    className={`${styles.cardAction} ${styles.playBtn}`}
                    onClick={(e) => { e.stopPropagation(); playRadioStation(station); }}
                    title="Play Mix"
                    aria-label={`Play Mix: ${station.name}`}
                >
                    <Play size={32} fill="currentColor" />
                </button>
                <button
                    className={`${styles.cardAction} ${styles.playBtn}`}
                    onClick={(e) => { e.stopPropagation(); window.electron.radio.extractTracks(station, false); }}
                    title="Play Tracks"
                    aria-label={`Play Tracks: ${station.name}`}
                >
                    <ListPlus size={32} />
                </button>
            </div>
            <button
                className={`${styles.cardAction} ${styles.menuButton}`}
                onClick={(e) => handleMenuClick(e, station)}
                title="More options"
                aria-label={`More options: ${station.name}`}
            >
                <MoreHorizontal size={20} />
            </button>
            <button
                className={`${styles.cardAction} ${styles.externalLink}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.electron.system.openExternal(`https://bandcamp.com/?show=${station.id}`);
                }}
                title="View on Bandcamp"
                aria-label={`View ${station.name} on Bandcamp`}
            >
                <ExternalLink size={16} />
            </button>
        </div>
    );

    const handlePlayNext = async (station: any) => {
        await addRadioToQueue(station, true);
        setContextMenu(null);
    };

    const handleAddToQueue = async (station: any) => {
        await addRadioToQueue(station, false);
        setContextMenu(null);
    };

    const handlePlaylistSelect = async (playlistId: string) => {
        if (!playlistModalTarget) return;

        if (playlistModalTarget.type === 'single-mix' && playlistModalTarget.station) {
            await addRadioToPlaylist(playlistId, playlistModalTarget.station);
        } else if (playlistModalTarget.type === 'single-extract' && playlistModalTarget.station) {
            await extractRadioToPlaylist(playlistId, playlistModalTarget.station);
        } else if (playlistModalTarget.type === 'bulk-mix') {
            for (const station of filteredStations) {
                await addRadioToPlaylist(playlistId, station);
            }
        } else if (playlistModalTarget.type === 'bulk-extract') {
            for (const station of filteredStations) {
                await extractRadioToPlaylist(playlistId, station);
            }
        }

        setPlaylistModalTarget(null);
    };

    const handleBulkAction = async (action: 'play' | 'playNext' | 'addToQueue') => {
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
                            <button className={styles.clearSearch} onClick={() => setRadioSearchQuery('')} title="Clear search" aria-label="Clear search">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <ViewLayoutControl
                        viewMode={viewMode}
                        coverSize={coverSize}
                        onViewModeChange={setRadioViewMode}
                        onCoverSizeChange={setRadioCoverSize}
                        testIdPrefix="radio"
                    />

                    <button
                        className={styles.refreshBtn}
                        onClick={refreshRadioStations}
                        disabled={isLoadingRadioStations}
                        title="Refresh radio stations"
                    >
                        <RefreshCw size={18} className={isLoadingRadioStations ? styles.spinning : ''} />
                    </button>

                    {filteredStations.length > 0 && (
                        <div className={styles.bulkMenuContainer} onMouseLeave={() => setShowBulkMenu(false)}>
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
                                        <Play size={16} /> Play
                                    </button>
                                    <button onClick={() => handleBulkAction('playNext')}>
                                        <SkipForward size={16} /> Play Next
                                    </button>
                                    <button onClick={() => handleBulkAction('addToQueue')}>
                                        <List size={16} /> Add to Queue
                                    </button>
                                    <button onClick={() => {
                                        setShowBulkMenu(false);
                                        setPlaylistModalTarget({ type: 'bulk-mix' });
                                    }}>
                                        <Music size={14} /> Add to Playlist
                                    </button>
                                    <div className={styles.menuDivider} />
                                    <span className={styles.menuLabel}>Extracted Tracks</span>
                                    <button onClick={() => {
                                        filteredStations.forEach(station => {
                                            window.electron.radio.extractTracks(station, false);
                                        });
                                        setShowBulkMenu(false);
                                    }}>
                                        <Play size={16} /> Play
                                    </button>
                                    <button onClick={() => {
                                        filteredStations.forEach(station => {
                                            window.electron.radio.extractTracks(station, true);
                                        });
                                        setShowBulkMenu(false);
                                    }}>
                                        <ListPlus size={16} /> Add to Queue
                                    </button>
                                    <button onClick={() => {
                                        setShowBulkMenu(false);
                                        setPlaylistModalTarget({ type: 'bulk-extract' });
                                    }}>
                                        <Music size={14} /> Add to Playlist
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className={`${styles.scrollContainer} custom-scrollbar`}>
                {/* Stations grid */}
                <div
                    className={`${styles.grid} ${viewMode === 'list' ? styles.listMode : styles.gridMode} ${styles[`size${coverSize.charAt(0).toUpperCase()}${coverSize.slice(1)}`]}`}
                    data-testid="radio-layout"
                    data-layout={viewMode}
                    data-size={coverSize}
                >
                    {filteredStations.slice(0, visibleCount).map((station: any) => (
                        <div
                            key={station.id}
                            className={`${styles.card} ${radioState.currentStation?.id === station.id ? styles.active : ''}`}
                            onClick={() => selectRadioStation(station)}
                            onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    selectRadioStation(station);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={station.name}
                            onContextMenu={(e) => handleContextMenu(e, station)}
                            onMouseLeave={() => setContextMenu(null)}
                            style={{ zIndex: contextMenu?.station?.id === station.id ? 50 : 1 }}
                            data-testid="radio-card"
                            title={station.name}
                        >
                            <div className={styles.cardImage} data-testid="radio-card-image">
                                {station.imageUrl ? (
                                    <img src={station.imageUrl} alt="" loading="lazy" />
                                ) : (
                                    <div className={styles.placeholderImage}><Radio size={48} /></div>
                                )}
                                {viewMode === 'grid' && renderStationActions(station)}
                            </div>
                            <div className={styles.cardInfo}>
                                <h3 className={styles.cardTitle} title={station.name}>{station.name}</h3>
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
                            {viewMode === 'list' && renderStationActions(station)}
                            {contextMenu?.station?.id === station.id && (
                                <div
                                    className={`${styles.contextMenu} ${contextMenu?.side === 'right' ? styles.contextMenuRight : styles.contextMenuLeft}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <span className={styles.menuLabel}>Mix</span>
                                    <button onClick={() => { playRadioStation(station); setContextMenu(null); }}>
                                        <Play size={16} /> Play
                                    </button>
                                    <button onClick={() => { handlePlayNext(station); }}>
                                        <SkipForward size={16} /> Play Next
                                    </button>
                                    <button onClick={() => { handleAddToQueue(station); }}>
                                        <List size={16} /> Add to Queue
                                    </button>
                                    <button onClick={() => {
                                        setContextMenu(null);
                                        setPlaylistModalTarget({ type: 'single-mix', station });
                                    }}>
                                        <Music size={14} /> Add to Playlist
                                    </button>
                                    <div className={styles.menuDivider} />
                                    <span className={styles.menuLabel}>Extracted Tracks</span>
                                    <button onClick={() => { window.electron.radio.extractTracks(station, false); setContextMenu(null); }}>
                                        <Play size={16} /> Play
                                    </button>
                                    <button onClick={() => { window.electron.radio.extractTracks(station, true); setContextMenu(null); }}>
                                        <ListPlus size={16} /> Add to Queue
                                    </button>
                                    <button onClick={() => {
                                        setContextMenu(null);
                                        setPlaylistModalTarget({ type: 'single-extract', station });
                                    }}>
                                        <Music size={14} /> Add to Playlist
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {visibleCount < filteredStations.length && (
                    <div
                        key={`${radioSearchQuery}-${viewMode}-${coverSize}`}
                        ref={targetRef}
                        className={styles.loadMoreContainer}
                        data-testid="radio-load-more-sentinel"
                    />
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

            <AddToPlaylistModal
                isOpen={!!playlistModalTarget}
                onClose={() => setPlaylistModalTarget(null)}
                onSelectPlaylist={handlePlaylistSelect}
            />
        </div>
    );
}
