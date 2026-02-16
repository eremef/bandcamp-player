import { useEffect, useMemo } from 'react';
import { useStore } from '../../store/store';
import { Search, X, RefreshCw } from 'lucide-react';
import { ItemsGrid } from './ItemsGrid';
import styles from './CollectionView.module.css';

export function CollectionView() {
    const { collection, isLoadingCollection, collectionError, fetchCollection, searchQuery, setSearchQuery } = useStore();

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

            <ItemsGrid
                items={filteredItems}
                isLoading={isLoadingCollection}
                emptyMessage={searchQuery ? `No results for "${searchQuery}"` : "Your collection is empty"}
                emptyHint={!searchQuery ? "Purchase music on Bandcamp to see it here" : undefined}
            />
        </div>
    );
}
