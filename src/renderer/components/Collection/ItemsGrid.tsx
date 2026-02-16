import { useState, useCallback } from 'react';
import { CollectionItem } from '../../../shared/types';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { AlbumCard } from './AlbumCard';
import styles from './ItemsGrid.module.css';

interface ItemsGridProps {
    items: CollectionItem[];
    isLoading?: boolean;
    emptyMessage?: string;
    emptyHint?: string;
}

export function ItemsGrid({ items, isLoading = false, emptyMessage = "No items found", emptyHint }: ItemsGridProps) {
    const [visibleCount, setVisibleCount] = useState(20);

    const handleLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + 20);
    }, []);

    const targetRef = useIntersectionObserver({
        onIntersect: handleLoadMore,
        enabled: items.length > visibleCount,
    });

    return (
        <div className={styles.gridContainer}>
            {isLoading && (
                <div className={styles.bufferingOverlay}>
                    <div className={styles.spinner} />
                </div>
            )}

            {items.length > 0 ? (
                <div className={styles.grid}>
                    {items.slice(0, visibleCount).map((item) =>
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
                                } as any}
                            />
                        ) : null
                    )}
                </div>
            ) : (
                <div className={styles.empty}>
                    <p>{emptyMessage}</p>
                    {emptyHint && <p className={styles.emptyHint}>{emptyHint}</p>}
                </div>
            )}

            {items.length > visibleCount && (
                <div ref={targetRef} className={styles.loadMoreContainer} style={{ height: '20px', margin: '20px 0' }}>
                    {/* Sentinel element for infinite scroll */}
                </div>
            )}
        </div>
    );
}
