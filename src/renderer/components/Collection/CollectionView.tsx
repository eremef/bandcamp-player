import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import type { CollectionItem, Track } from '../../../shared/types';
import { Search, X, RefreshCw, List, SkipForward, Play, Music, MoreHorizontal, Download } from 'lucide-react';
import { ItemsGrid } from './ItemsGrid';
import styles from './CollectionView.module.css';

export function CollectionView() {
    const {
        collection, isLoadingCollection, collectionError, fetchCollection, searchQuery, setSearchQuery,
        getAlbumDetails, clearQueue, addTracksToQueue, playQueueIndex, addTracksToPlaylist, playlists,
        downloadTrack,
    } = useStore();
    const [showBulkMenu, setShowBulkMenu] = useState(false);
    const [isBulkLoading, setIsBulkLoading] = useState(false);

    const filteredItems = useMemo(() => {
        if (!collection?.items) return [];
        if (!searchQuery.trim()) return collection.items;

        const query = searchQuery.toLowerCase();
        return collection.items.filter((item) => {
            if (item.type === 'album' && item.album) {
                return (
                    item.album.title.toLowerCase().includes(query) ||
                    item.album.artist.toLowerCase().includes(query)
                );
            }
            if (item.type === 'track' && item.track) {
                return (
                    item.track.title.toLowerCase().includes(query) ||
                    item.track.artist.toLowerCase().includes(query)
                );
            }
            return false;
        });
    }, [collection, searchQuery]);

    const getAllFilteredTracks = useCallback(async (items: CollectionItem[]) => {
        const allTracks: Track[] = [];
        for (const item of items) {
            if (item.type === 'album' && item.album) {
                const hasValidTracks = item.album.tracks.length > 0 && item.album.tracks.every(t => !!t.streamUrl || !!t.isCached);
                if (hasValidTracks) {
                    allTracks.push(...item.album.tracks);
                } else if (item.album.bandcampUrl) {
                    const details = await getAlbumDetails(item.album.bandcampUrl);
                    if (details) allTracks.push(...details.tracks);
                }
            } else if (item.type === 'track' && item.track) {
                if (item.track.streamUrl || item.track.isCached) {
                    allTracks.push(item.track);
                } else if (item.track.bandcampUrl) {
                    const details = await getAlbumDetails(item.track.bandcampUrl);
                    if (details) allTracks.push(...details.tracks);
                }
            }
        }
        return allTracks;
    }, [getAlbumDetails]);

    const handleBulkAction = useCallback(async (action: 'play' | 'playNext' | 'addToQueue' | 'addToPlaylist' | 'download', playlistId?: string) => {
        setShowBulkMenu(false);
        setIsBulkLoading(true);
        try {
            const tracks = await getAllFilteredTracks(filteredItems);
            if (tracks.length === 0) return;

            switch (action) {
                case 'play':
                    await clearQueue(false);
                    await addTracksToQueue(tracks);
                    await playQueueIndex(0);
                    break;
                case 'playNext':
                    await addTracksToQueue(tracks, true);
                    break;
                case 'addToQueue':
                    await addTracksToQueue(tracks);
                    break;
                case 'addToPlaylist':
                    if (playlistId) await addTracksToPlaylist(playlistId, tracks);
                    break;
                case 'download':
                    for (const track of tracks) {
                        await downloadTrack(track);
                    }
                    break;
            }
        } finally {
            setIsBulkLoading(false);
        }
    }, [filteredItems, getAllFilteredTracks, clearQueue, addTracksToQueue, playQueueIndex, addTracksToPlaylist, downloadTrack]);

    useEffect(() => {
        if (!collection) {
            fetchCollection();
        }
    }, [collection, fetchCollection]);

    // If we have an error and no data, show error state
    if (collectionError && !collection) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <p>Failed to load collection</p>
                    <p className={styles.errorDetails}>{collectionError}</p>
                    <button onClick={() => fetchCollection(true)}>Retry</button>
                </div>
            </div>
        );
    }

    // If we have no collection data yet, show loading (initial start or fetching)
    if (!collection) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Loading your collection...</p>
                </div>
            </div>
        );
    }

    const showBulkActions = searchQuery.trim() && filteredItems.length > 0;

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1>Your Collection</h1>
                    <p>{collection?.totalCount || 0} albums & tracks</p>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.searchBox}>
                        <Search className={styles.searchIcon} size={18} />
                        <input
                            type="text"
                            placeholder="Search your collection..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    {showBulkActions && (
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
                                        <button
                                            className={styles.bulkButton}
                                            disabled={isBulkLoading}
                                            onClick={() => handleBulkAction('addToQueue')}
                                            title="Add all search results to queue"
                                        >
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
                        className={`${styles.refreshBtn} ${isLoadingCollection ? styles.spinning : ''}`}
                        onClick={() => !isLoadingCollection && fetchCollection(true)}
                        title="Refresh"
                        disabled={isLoadingCollection}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </header>

            <ItemsGrid
                items={filteredItems}
                isLoading={isLoadingCollection}
                emptyMessage={searchQuery ? `No results for "${searchQuery}"` : "Your collection is empty"}
                emptyHint={!searchQuery ? "Purchase music on Bandcamp to see it here" : undefined}
            />
        </div>
    );
}
