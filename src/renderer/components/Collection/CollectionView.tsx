import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/store";
import {
  Search,
  X,
  RefreshCw,
  WifiOff,
  ArrowUpDown,
  SlidersHorizontal,
  Disc,
  Music,
  Heart,
  Check,
  Calendar,
  Drum,
  Disc3,
  ArrowUp,
  ArrowDown,
  Quote,
} from "lucide-react";
import { ItemsGrid } from "./ItemsGrid";
import styles from "./CollectionView.module.css";
import type { SortKey } from "../../../shared/types";
import { dedupeCollectionItems, sortCollectionItems } from "../../utils/collection-utils";


export function CollectionView() {
  const {
    collection,
    isLoadingCollection,
    collectionError,
    fetchCollection,
    searchQuery,
    setSearchQuery,
    getAlbumDetails,
    settings,
    collection_sort_key: sortKey,
    collection_sort_direction: sortDirection,
    collectionFilterAlbums,
    collectionFilterTracks,
    collectionFilterWishlist,
    setCollectionSortKey: setSortKey,
    setCollectionSortDirection: setSortDirection,
    setCollectionFilterAlbums,
    setCollectionFilterTracks,
    setCollectionFilterWishlist,
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;

  useEffect(() => {
    if (!collection && !isLoadingCollection) {
      fetchCollection();
    }
  }, [fetchCollection, collection, isLoadingCollection]);

  const dedupedItems = useMemo(
    () => (settings?.deduplicateCollection ? dedupeCollectionItems(collection?.items ?? []) : (collection?.items ?? [])),
    [collection?.items, settings?.deduplicateCollection],
  );

  const filteredItems = useMemo(() => {
    let items = dedupedItems;

    // Apply type/wishlist filters
    items = items.filter((item) => {
      if (item.isWishlist) {
        return collectionFilterWishlist;
      }
      if (item.type === "album") {
        return collectionFilterAlbums;
      }
      if (item.type === "track") {
        return collectionFilterTracks;
      }
      return true;
    });

    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
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
          track.artist.toLowerCase().includes(query) ||
          track.album?.toLowerCase().includes(query)
        );
      }

      return false;
    });
  }, [
    dedupedItems,
    searchQuery,
    collectionFilterAlbums,
    collectionFilterTracks,
    collectionFilterWishlist,
  ]);

  const sortedItems = useMemo(
    () => sortCollectionItems(filteredItems, sortKey, sortDirection),
    [filteredItems, sortKey, sortDirection],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasActiveFilter = !collectionFilterAlbums || !collectionFilterTracks || !collectionFilterWishlist;

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen && !sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen, sortOpen]);

  const handleRefresh = () => {
    fetchCollection(true);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
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
              {dedupedItems.length} {dedupedItems.length === 1 ? "item" : "items"}
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
            <div className={styles.filterDropdownWrapper} ref={filterRef}>
              <button
                className={`${styles.filterToggleBtn} ${hasActiveFilter ? styles.active : ""}`}
                onClick={() => setFilterOpen((o) => !o)}
                title="Filter collection"
              >
                <SlidersHorizontal size={14} />
                {hasActiveFilter && <span className={styles.filterDot} />}
              </button>
              {filterOpen && (
                <div className={styles.filterDropdown}>
                  <button
                    className={styles.filterRow}
                    onClick={() => setCollectionFilterAlbums(!collectionFilterAlbums)}
                  >
                    <span className={`${styles.filterCheck} ${collectionFilterAlbums ? styles.checked : ""}`}>
                      {collectionFilterAlbums && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Disc size={13} />
                    <span>Albums</span>
                  </button>
                  <button
                    className={styles.filterRow}
                    onClick={() => setCollectionFilterTracks(!collectionFilterTracks)}
                  >
                    <span className={`${styles.filterCheck} ${collectionFilterTracks ? styles.checked : ""}`}>
                      {collectionFilterTracks && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Music size={13} />
                    <span>Tracks</span>
                  </button>
                  <button
                    className={styles.filterRow}
                    onClick={() => setCollectionFilterWishlist(!collectionFilterWishlist)}
                  >
                    <span className={`${styles.filterCheck} ${collectionFilterWishlist ? styles.checked : ""}`}>
                      {collectionFilterWishlist && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Heart size={13} />
                    <span>Wishlist</span>
                  </button>
                </div>
              )}
            </div>

            <div className={styles.sortDropdownWrapper} ref={sortRef}>
              <button
                className={styles.sortToggleBtn}
                onClick={() => setSortOpen((o) => !o)}
                title="Sort collection"
              >
                <ArrowUpDown size={14} />
                {/* <span className={styles.sortLabel}>{getSortLabel(sortKey)}</span>
                <span className={styles.sortDirectionBadge}>
                  {sortDirection === "asc" ? "A-Z" : "Z-A"}
                </span> */}
              </button>
              {sortOpen && (
                <div className={styles.sortDropdown}>
                  <div className={styles.dropdownLabel}>Sort By</div>
                  <button
                    className={styles.dropdownRow}
                    onClick={() => { setSortKey("default"); setSortOpen(false); }}
                  >
                    <span className={`${styles.dropdownCheck} ${sortKey === "default" ? styles.checked : ""}`}>
                      {sortKey === "default" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Calendar size={13} />
                    <span>Purchase Date</span>
                  </button>
                  <button
                    className={styles.dropdownRow}
                    onClick={() => { setSortKey("artist"); setSortOpen(false); }}
                  >
                    <span className={`${styles.dropdownCheck} ${sortKey === "artist" ? styles.checked : ""}`}>
                      {sortKey === "artist" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Drum size={13} />
                    <span>Artist Name</span>
                  </button>
                  <button
                    className={styles.dropdownRow}
                    onClick={() => { setSortKey("album"); setSortOpen(false); }}
                  >
                    <span className={`${styles.dropdownCheck} ${sortKey === "album" ? styles.checked : ""}`}>
                      {sortKey === "album" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <Quote size={13} />
                    <span>Album Title</span>
                  </button>

                  <div className={styles.dropdownDivider} />
                  <div className={styles.dropdownLabel}>Order</div>
                  <button
                    className={styles.dropdownRow}
                    onClick={() => { setSortDirection("asc"); setSortOpen(false); }}
                  >
                    <span className={`${styles.dropdownCheck} ${sortDirection === "asc" ? styles.checked : ""}`}>
                      {sortDirection === "asc" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <ArrowUp size={13} />
                    <span>Ascending (A-Z)</span>
                  </button>
                  <button
                    className={styles.dropdownRow}
                    onClick={() => { setSortDirection("desc"); setSortOpen(false); }}
                  >
                    <span className={`${styles.dropdownCheck} ${sortDirection === "desc" ? styles.checked : ""}`}>
                      {sortDirection === "desc" && <Check size={10} strokeWidth={3} />}
                    </span>
                    <ArrowDown size={13} />
                    <span>Descending (Z-A)</span>
                  </button>
                </div>
              )}
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
