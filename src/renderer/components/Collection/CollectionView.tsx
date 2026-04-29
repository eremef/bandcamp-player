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

type SortKey = "default" | "artist" | "album" | "purchaseDate";
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

function getSortDate(item: CollectionItem): number {
  const timestamp = Date.parse(item.purchaseDate);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeDedupeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBandcampPath(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.replace(/\?.*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function getAlbumDedupeKey(item: CollectionItem): string | null {
  if (item.type !== "album" || !item.album) {
    return null;
  }

  const artist = normalizeDedupeText(item.album.artist);
  const title = normalizeDedupeText(item.album.title);
  if (artist && title) {
    return `album-meta:${artist}::${title}`;
  }

  const bandcampPath = getBandcampPath(item.album.bandcampUrl);
  if (bandcampPath) {
    return `album-url:${bandcampPath}`;
  }

  if (item.album.id) {
    return `album-id:${item.album.id}`;
  }

  return null;
}

function choosePreferredDuplicate(current: CollectionItem, next: CollectionItem): CollectionItem {
  const currentDate = getSortDate(current);
  const nextDate = getSortDate(next);
  if (nextDate !== currentDate) {
    return nextDate > currentDate ? next : current;
  }

  const currentScore =
    (current.album?.trackCount ?? 0) + (current.token ? 1 : 0);
  const nextScore = (next.album?.trackCount ?? 0) + (next.token ? 1 : 0);
  return nextScore > currentScore ? next : current;
}

function dedupeCollectionItems(items: CollectionItem[]): CollectionItem[] {
  const preferredByKey = new Map<string, CollectionItem>();

  for (const item of items) {
    const key = getAlbumDedupeKey(item);
    if (!key) {
      continue;
    }

    const existing = preferredByKey.get(key);
    if (!existing) {
      preferredByKey.set(key, item);
      continue;
    }

    const preferred = choosePreferredDuplicate(existing, item);
    // Preserve the wishlist flag if either duplicate is in the wishlist
    if (existing.isWishlist || item.isWishlist) {
      preferred.isWishlist = true;
    }
    preferredByKey.set(key, preferred);
  }

  return items.filter((item) => {
    const key = getAlbumDedupeKey(item);
    if (!key) {
      return true;
    }

    return preferredByKey.get(key) === item;
  });
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
    if (sortKey === "purchaseDate") {
      return (getSortDate(a) - getSortDate(b)) * directionFactor;
    }

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
    settings,
    isOnline,
    cachedTrackIds,
    cachedAlbumIds,
    collectionSortKey: sortKey,
    collectionSortDirection: sortDirection,
    setCollectionSortKey: setSortKey,
    setCollectionSortDirection: setSortDirection,
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const dedupedItems = useMemo(
    () => dedupeCollectionItems(collection?.items ?? []),
    [collection?.items],
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return dedupedItems;

    const query = searchQuery.toLowerCase();
    return dedupedItems.filter((item) => {
      if (item.type === "album" && item.album) {
        return (
          item.album.title.toLowerCase().includes(query) ||
          item.album.artist.toLowerCase().includes(query)
        );
      }
      if (item.type === "track" && item.track) {
        return (
          item.track.title.toLowerCase().includes(query) ||
          item.track.artist.toLowerCase().includes(query)
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

  const getAllFilteredTracks = useCallback(
    async (items: CollectionItem[]) => {
      const allTracks: Track[] = [];
      for (const item of items) {
        if (item.type === "album" && item.album) {
          const isAlbumFullyCached = cachedAlbumIds.has(item.album.id);

          // If album has loaded tracks with valid streamUrls, use them
          if (item.album.tracks.length > 0 && item.album.tracks.every((t) => !!t.streamUrl)) {
            allTracks.push(...item.album.tracks);
            continue;
          }

          // In offline mode with fully cached album, get tracks from cache
          if (isOfflineMode && isAlbumFullyCached) {
            const cachedTracks = await window.electron.cache.getCachedTracksByAlbum(item.album.id);
            if (cachedTracks.length > 0) {
              allTracks.push(...cachedTracks);
              continue;
            }
          }

          // Otherwise try network fetch
          if (item.album.bandcampUrl) {
            const details = await getAlbumDetails(item.album.bandcampUrl);
            if (details) allTracks.push(...details.tracks);
          }
        } else if (item.type === "track" && item.track) {
          if (item.track.streamUrl || cachedTrackIds.has(item.track.id)) {
            allTracks.push(item.track);
          } else if (item.track.bandcampUrl) {
            const details = await getAlbumDetails(item.track.bandcampUrl);
            if (details) allTracks.push(...details.tracks);
          }
        }
      }
      return allTracks;
    },
    [getAlbumDetails, cachedTrackIds, cachedAlbumIds, isOfflineMode],
  );

  const handleBulkAction = useCallback(
    async (
      action: "play" | "playNext" | "addToQueue" | "addToPlaylist" | "download",
      playlistId?: string,
    ) => {
      setShowBulkMenu(false);
      setIsBulkLoading(true);
      try {
        const tracks = await getAllFilteredTracks(sortedItems);
        if (tracks.length === 0) return;

        switch (action) {
          case "play":
            await clearQueue(false);
            await addTracksToQueue(tracks);
            await playQueueIndex(0);
            break;
          case "playNext":
            await addTracksToQueue(tracks, true);
            break;
          case "addToQueue":
            await addTracksToQueue(tracks);
            break;
          case "addToPlaylist":
            if (playlistId) await addTracksToPlaylist(playlistId, tracks);
            break;
          case "download":
            for (const track of tracks) {
              await downloadTrack(track);
            }
            break;
        }
      } finally {
        setIsBulkLoading(false);
      }
    },
    [
      sortedItems,
      getAllFilteredTracks,
      clearQueue,
      addTracksToQueue,
      playQueueIndex,
      addTracksToPlaylist,
      downloadTrack,
    ],
  );

  useEffect(() => {
    if (!collection) {
      fetchCollection();
    }
  }, [collection, fetchCollection]);

  // Re-fetch when offline mode is toggled on (so the DB cache is loaded)
  // or when the app comes back online after being offline.
  useEffect(() => {
    fetchCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOfflineMode, isOnline]);

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

  const showBulkActions = hasSearchQuery && filteredItems.length > 0;

  // Determine empty-state messaging based on connectivity / offline mode
  const emptyMessage = isOfflineMode
    ? "No cached tracks available offline"
    : searchQuery
      ? `No results for "${searchQuery}"`
      : "Your collection is empty";

  const emptyHint = isOfflineMode
    ? "Download tracks while online to make them available in offline mode"
    : !searchQuery
      ? "Purchase music on Bandcamp to see it here"
      : undefined;

  const emptyIcon = isOfflineMode ? (
    <WifiOff size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
  ) : undefined;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Your Collection</h1>
          <p>{headerCount} albums & tracks</p>
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
              <button
                className={styles.clearSearch}
                onClick={() => setSearchQuery("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className={styles.sortControls}>
            <ArrowUpDown size={16} />
            <select
              aria-label="Sort collection"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="default">Buy order</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="purchaseDate">Purchase date</option>
            </select>
            <button
              className={styles.sortDirectionBtn}
              onClick={() =>
                setSortDirection(sortDirection === "asc" ? "desc" : "asc")
              }
              title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            >
              {sortDirection === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>
          {showBulkActions && (
            <div
              className={styles.bulkActions}
              onMouseLeave={() => setShowBulkMenu(false)}
            >
              <div className={styles.bulkMenuContainer}>
                <button
                  className={styles.bulkMoreButton}
                  onClick={() => setShowBulkMenu(!showBulkMenu)}
                  title="More actions for search results"
                >
                  <MoreHorizontal size={18} />
                </button>
                {showBulkMenu && (
                  <div
                    className={styles.bulkMenu}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button onClick={() => handleBulkAction("play")}>
                      <Play size={16} /> Play All
                    </button>
                    <button onClick={() => handleBulkAction("playNext")}>
                      <SkipForward size={16} /> Play Next
                    </button>
                    <button
                      className={styles.bulkButton}
                      disabled={isBulkLoading}
                      onClick={() => handleBulkAction("addToQueue")}
                      title="Add all search results to queue"
                    >
                      <List size={16} /> Add to Queue
                    </button>
                    {playlists.length > 0 && (
                      <>
                        <div className={styles.bulkMenuDivider} />
                        <span className={styles.bulkMenuLabel}>
                          Add to Playlist
                        </span>
                        {playlists.map((playlist) => (
                          <button
                            key={playlist.id}
                            onClick={() =>
                              handleBulkAction("addToPlaylist", playlist.id)
                            }
                          >
                            <Music size={14} /> {playlist.name}
                          </button>
                        ))}
                        <div className={styles.bulkMenuDivider} />
                      </>
                    )}
                    <button onClick={() => handleBulkAction("download")}>
                      <Download size={16} /> Download for Offline
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            className={`${styles.refreshBtn} ${isLoadingCollection ? styles.spinning : ""}`}
            onClick={() => !isLoadingCollection && fetchCollection(true)}
            title="Refresh"
            disabled={isLoadingCollection}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <ItemsGrid
        items={sortedItems}
        isLoading={isLoadingCollection}
        emptyMessage={emptyMessage}
        emptyHint={emptyHint}
        emptyIcon={emptyIcon}
      />
    </div>
  );
}
