import React, { useState, useCallback, useMemo } from "react";
import {
  CollectionItem,
  CollectionViewMode,
  CoverSize,
} from "../../../shared/types";
import { useIntersectionObserver } from "../../hooks/useIntersectionObserver";
import { AlbumCard } from "./AlbumCard";
import styles from "./ItemsGrid.module.css";

interface ItemsGridProps {
  items: CollectionItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  emptyIcon?: React.ReactNode;
  onItemClick?: (item: CollectionItem) => void;
  viewMode?: CollectionViewMode;
  coverSize?: CoverSize;
}

/**
 * How many items to render before the first scroll. Denser layouts fit more
 * on screen, so a fixed count would leave small covers under a screenful and
 * never trip the infinite-scroll sentinel.
 */
const INITIAL_COUNT: Record<CollectionViewMode, Record<CoverSize, number>> = {
  grid: { small: 40, medium: 20, large: 12 },
  list: { small: 30, medium: 30, large: 30 },
};

const SIZE_CLASS: Record<CoverSize, string> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};

export function ItemsGrid({
  items,
  isLoading = false,
  emptyMessage = "No items found",
  emptyHint,
  emptyIcon,
  onItemClick,
  viewMode = "grid",
  coverSize = "medium",
}: ItemsGridProps) {
  const initialCount = INITIAL_COUNT[viewMode][coverSize];
  const [visibleCount, setVisibleCount] = useState(initialCount);

  // Searching or filtering swaps the item set out from under us; without this
  // the grid keeps rendering however far the previous list had been scrolled.
  // Keyed on length rather than the array identity so ordinary re-renders
  // (and the sort pipeline's new-but-equivalent arrays) don't reset scroll.
  // Adjusted during render rather than in an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect
  const resetKey = `${items.length}|${initialCount}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setVisibleCount(initialCount);
  }

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + initialCount);
  }, [initialCount]);

  const targetRef = useIntersectionObserver({
    onIntersect: handleLoadMore,
    enabled: items.length > visibleCount,
  });

  const containerClass = useMemo(
    () =>
      `${viewMode === "list" ? styles.list : styles.grid} ${SIZE_CLASS[coverSize]}`,
    [viewMode, coverSize],
  );

  return (
    <div className={styles.gridContainer}>
      {isLoading && (
        <div className={styles.bufferingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}

      {items.length > 0 ? (
        <div className={containerClass}>
          {items.slice(0, visibleCount).map((item) =>
            item.type === "album" && item.album ? (
              <AlbumCard
                key={item.id}
                album={item.album}
                isTrackItem={false}
                isWishlist={item.isWishlist}
                variant={viewMode}
                coverSize={coverSize}
                onClick={() => onItemClick?.(item)}
              />
            ) : item.type === "track" && item.track ? (
              <AlbumCard
                key={item.id}
                isTrackItem
                isWishlist={item.isWishlist}
                variant={viewMode}
                coverSize={coverSize}
                onClick={() => onItemClick?.(item)}
                album={
                  {
                    id: item.track.id,
                    title: item.track.title,
                    artist: item.track.artist,
                    artworkUrl: item.track.artworkUrl,
                    bandcampUrl: item.track.bandcampUrl,
                    tracks: [item.track],
                    trackCount: 1,
                  } as any
                }
              />
            ) : null,
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          {emptyIcon}
          <p>{emptyMessage}</p>
          {emptyHint && <p className={styles.emptyHint}>{emptyHint}</p>}
        </div>
      )}

      {items.length > visibleCount && (
        <div
          ref={targetRef}
          className={styles.loadMoreContainer}
          style={{ height: "20px", margin: "20px 0" }}
        >
          {/* Sentinel element for infinite scroll */}
        </div>
      )}
    </div>
  );
}
