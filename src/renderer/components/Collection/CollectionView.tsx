import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../../store/store";
import type { CollectionItem, Track } from "../../../shared/types";
import {
  Search,
  X,
  RefreshCw,
  List,
  SkipForward,
  Play,
  Music,
  MoreHorizontal,
  Download,
  WifiOff,
  ArrowUpDown,
} from "lucide-react";
import { ItemsGrid } from "./ItemsGrid";
import styles from "./CollectionView.module.css";
import { dedupeCollectionItems } from "../../utils/dedupe";

type SortKey = "default" | "artist" | "album";
type SortDirection = "asc" | "desc";

function getSortText(item: CollectionItem, sortKey: SortKey): string {
  if (sortKey === "artist") {
    return item.album?.artist ?? item.track?.artist ?? "";
  }
  if (sortKey === "album") {
    return item.album?.title ?? item.track?.title ?? "";
  }
  return "";
}

function sortCollectionItems(
  items: CollectionItem[],
  sortKey: SortKey,
  sortDirection: SortDirection,
): CollectionItem[] {
  if (sortKey === "default") {
    return sortDirection === "asc" ? items : [...items].reverse();
  }

  const directionFactor = sortDirection === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    const left = getSortText(a, sortKey);
    const right = getSortText(b, sortKey);
    return left.localeCompare(right, undefined, { sensitivity: "base" }) * directionFactor;
  });

  return sorted;
}

export function CollectionView() {
  const {
    collection,
    isLoadingCollection,
    collectionError,
    fetchCollection,
    searchQuery,
    setSearchQuery,
    getAlbumDetails,
    clearQueue,
    addTracksToQueue,
    playQueueIndex,
    addTracksToPlaylist,
    playlists,
    downloadTrack,
    cachedTrackIds,
    cachedAlbumIds,
    downloadingTracks,
    downloadingAlbumIds,
    settings,
    collectionSortKey: sortKey,
    collectionSortDirection: sortDirection,
    setCollectionSortKey: setSortKey,
    setCollectionSortDirection: setSortDirection,
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;

  useEffect(() => {
    if (!collection && !isLoadingCollection) {
      fetchCollection();
    }
  }, [fetchCollection, collection, isLoadingCollection]);

  const dedupedItems = useMemo(
    () => dedupeCollectionItems(collection?.items ?? []),
    [collection?.items],
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return dedupedItems;

    const query = searchQuery.toLowerCase();
    return dedupedItems.filter((item) => {
      const album = item.album;
      const track = item.track;

      if (album) {
        return (
          album.title.toLowerCase().includes(query) ||
          album.artist.toLowerCase().includes(query)
        );
      }

      if (track) {
        return (
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query)
        );
      }

      return false;
    });
  }, [dedupedItems, searchQuery]);

  const sortedItems = useMemo(
    () => sortCollectionItems(filteredItems, sortKey, sortDirection),
    [filteredItems, sortKey, sortDirection],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;
  const headerCount = hasSearchQuery ? filteredItems.length : dedupedItems.length;

  const handleRefresh = () => {
    fetchCollection(true);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const toggleSortDirection = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  };

  if (isLoadingCollection && !collection?.items.length) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>Loading your collection...</div>
      </div>
    );
  }

  if (collectionError && !collection?.items.length) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <h3>Failed to load collection</h3>
          <p>{collectionError}</p>
          <button onClick={handleRefresh} className={styles.refreshButton}>
            <RefreshCw size={20} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Collection</h1>
            <div className={styles.itemCount}>
              {dedupedItems.length} albums & tracks
              {isOfflineMode && (
                <span className={styles.offlineBadge} title="Offline Mode">
                  <WifiOff size={14} />
                </span>
              )}
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} size={18} data-testid="icon-search" />
              <input
                type="text"
                placeholder="Search your music..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {hasSearchQuery && (
                <button onClick={handleClearSearch} className={styles.clearSearch}>
                  <X size={16} data-testid="icon-x" />
                </button>
              )}
            </div>

            <div className={styles.sortControls}>
              <ArrowUpDown size={14} className={styles.sortIcon} />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="default">Purchase Date</option>
                <option value="artist">Artist Name</option>
                <option value="album">Album Title</option>
              </select>
              <button
                className={styles.sortDirectionBtn}
                onClick={toggleSortDirection}
                title={
                  sortDirection === "asc" ? "Sort Ascending" : "Sort Descending"
                }
              >
                {sortDirection === "asc" ? "A-Z" : "Z-A"}
              </button>
            </div>

            <button
              className={styles.actionButton}
              onClick={() => fetchCollection(true)}
              disabled={isLoadingCollection}
              title="Refresh collection"
            >
              <RefreshCw
                size={20}
                className={isLoadingCollection ? styles.spinning : ""}
                data-testid="icon-refresh"
              />
            </button>
          </div>
        </div>
      </div>

      <div className={`${styles.scrollContainer} custom-scrollbar`}>
        <ItemsGrid
          items={sortedItems}
          onItemClick={async (item) => {
            if (item.type === "album" && item.album) {
              await getAlbumDetails(item.album.bandcampUrl);
            }
          }}
          emptyMessage={
            hasSearchQuery
              ? `No results for "${searchQuery}"`
              : "Your collection is empty."
          }
        />
      </div>
    </div>
  );
}
