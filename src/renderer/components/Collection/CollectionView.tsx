import { useEffect, useState } from 'react';
import { useStore } from '../../store/store';
import { AlbumCard } from './AlbumCard';
import styles from './CollectionView.module.css';

export function CollectionView() {
    const { collection, isLoadingCollection, collectionError, fetchCollection, searchQuery, setSearchQuery } = useStore();
    const [filteredItems, setFilteredItems] = useState(collection?.items || []);
    const [visibleCount, setVisibleCount] = useState(20);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 20);
    };

    useEffect(() => {
        if (!collection) {
            fetchCollection();
        }
    }, [collection, fetchCollection]);

    useEffect(() => {
        if (!collection) return;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            setFilteredItems(
                collection.items.filter((item) => {
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
                })
            );
        } else {
            setFilteredItems(collection.items);
        }
    }, [collection, searchQuery]);

    if (isLoadingCollection) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className="spinner" />
                    <p>Loading your collection...</p>
                </div>
            </div>
        );
    }

    if (collectionError) {
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
                        <span className={styles.searchIcon}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search your collection..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                                ✕
                            </button>
                        )}
                    </div>
                    <button className={styles.refreshBtn} onClick={() => fetchCollection(true)} title="Refresh">
                        🔄
                    </button>
                </div>
            </header>

            {/* Collection grid */}
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

            {filteredItems.length > visibleCount && (
                <div className={styles.loadMoreContainer}>
                    <button
                        className={styles.loadMoreBtn}
                        onClick={handleLoadMore}
                    >
                        Load More Items
                    </button>
                </div>
            )}
        </div>
    );
}
