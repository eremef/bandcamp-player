import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { AlbumCard } from './AlbumCard';
import { Search, X, RefreshCw } from 'lucide-react';
import styles from './CollectionView.module.css';

export function CollectionView() {
    const { collection, isLoadingCollection, collectionError, fetchCollection, searchQuery, setSearchQuery } = useStore();
    const [visibleCount, setVisibleCount] = useState(20);

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

    const handleLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + 20);
    }, []);

    const targetRef = useIntersectionObserver({
        onIntersect: handleLoadMore,
        enabled: filteredItems.length > visibleCount,
    });

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

            {/* Collection grid */}
            <div className={styles.gridContainer}>
                {isLoadingCollection && collection && (
                    <div className={styles.bufferingOverlay}>
                        <div className={styles.spinner} />
                        <p>Updating collection...</p>
                    </div>
                )}

                {filteredItems.length > 0 ? (
                    <div className={styles.grid}>
                        {filteredItems.slice(0, visibleCount).map((item) =>
                            item.type === 'album' && item.album ? (
                                <AlbumCard key={item.id} album={item.album} />
                            ) : item.type === 'track' && item.track ? (
                                <AlbumCard
                                    key={item.id}
                                    album={{
                                        id: item.track.id,
                                        title: item.track.title,
                                        artist: item.track.artist,
                                        artworkUrl: item.track.artworkUrl,
                                        bandcampUrl: item.track.bandcampUrl,
                                        tracks: [item.track],
                                        trackCount: 1,
                                    }}
                                />
                            ) : null
                        )}
                    </div>
                ) : (
                    <div className={styles.empty}>
                        {searchQuery ? (
                            <p>No results for &quot;{searchQuery}&quot;</p>
                        ) : (
                            <>
                                <p>Your collection is empty</p>
                                <p className={styles.emptyHint}>
                                    Purchase music on Bandcamp to see it here
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {filteredItems.length > visibleCount && (
                <div ref={targetRef} className={styles.loadMoreContainer} style={{ height: '20px', margin: '20px 0' }}>
                    {/* Sentinel element for infinite scroll */}
                </div>
            )}
        </div>
    );
}
