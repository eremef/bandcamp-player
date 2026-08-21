import React, { useCallback, useState } from "react";
import { useStore } from "../store/store";
import type { BulkQueueAction, CollectionItem } from "../../shared/types";
import { ItemsGrid } from "./Collection/ItemsGrid";
import { AddToPlaylistModal } from "./Playlist/AddToPlaylistModal";
import { BulkProgressButton } from "./Collection/BulkProgressButton";
import {
  ArrowLeft,
  ExternalLink,
  Search,
  Play,
  SkipForward,
  List,
  Music,
  MoreHorizontal,
  Download,
} from "lucide-react";
import styles from "./ArtistsView.module.css";
import { dedupeCollectionItems } from "../utils/collection-utils";

interface DerivedArtist {
  id: string;
  name: string;
  imageUrl?: string;
  items: CollectionItem[];
}

export const ArtistsView: React.FC = () => {
  const [playlistTargetArtistItems, setPlaylistTargetArtistItems] = useState<CollectionItem[] | null>(null);
  const {
    collection,
    selectedArtistId,
    selectArtist,
    startBulkAction,
    bulkJob,
    cachedTrackIds,
    cachedAlbumIds,
    downloadingTracks,
    downloadingAlbumIds,
    settings,
    goBack,
  } = useStore();

  const isBulkRunning = !!bulkJob;

  const isOfflineMode = settings?.offlineMode ?? false;
  const [filter, setFilter] = useState("");
  const [showDetailMenu, setShowDetailMenu] = useState(false);
  const [cardMenuArtistId, setCardMenuArtistId] = useState<string | null>(null);

  const dedupedItems = React.useMemo(
    () => (settings?.deduplicateCollection ? dedupeCollectionItems(collection?.items ?? []) : (collection?.items ?? [])),
    [collection?.items, settings?.deduplicateCollection],
  );

  // Derive artists directly from collection items, keyed by artist name
  const derivedArtists = React.useMemo((): DerivedArtist[] => {
    const artistMap = new Map<string, DerivedArtist>();
    dedupedItems.forEach((item) => {
      const data = item.type === "album" ? item.album : item.track;
      if (!data || !data.artist?.trim()) return;
      const name = data.artist.trim();
      const id = `name-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (!artistMap.has(id)) {
        artistMap.set(id, { id, name, imageUrl: data.artworkUrl || undefined, items: [] });
      }
      const entry = artistMap.get(id)!;
      entry.items.push(item);
      if (!entry.imageUrl && data.artworkUrl) entry.imageUrl = data.artworkUrl;
    });
    return Array.from(artistMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [dedupedItems]);

  const filteredArtists = React.useMemo(
    () =>
      filter
        ? derivedArtists.filter((a) =>
          a.name.toLowerCase().includes(filter.toLowerCase()),
        )
        : derivedArtists,
    [derivedArtists, filter],
  );

  // Compute which artists have ALL their items fully cached
  const cachedArtistIds = React.useMemo(() => {
    const result = new Set<string>();
    for (const artist of derivedArtists) {
      if (artist.items.length === 0) continue;
      let allCached = true;
      let hasAtLeastOneTrack = false;
      outer: for (const item of artist.items) {
        if (item.type === "album" && item.album) {
          if (cachedAlbumIds.has(item.album.id)) {
            hasAtLeastOneTrack = true;
            continue;
          }
          if (item.album.tracks.length === 0) {
            allCached = false;
            break;
          }
          for (const track of item.album.tracks) {
            hasAtLeastOneTrack = true;
            if (!cachedTrackIds.has(track.id)) {
              allCached = false;
              break outer;
            }
          }
        } else if (item.type === "track" && item.track) {
          hasAtLeastOneTrack = true;
          if (!cachedTrackIds.has(item.track.id)) {
            allCached = false;
            break;
          }
        }
      }
      if (allCached && hasAtLeastOneTrack) result.add(artist.id);
    }
    return result;
  }, [derivedArtists, cachedTrackIds, cachedAlbumIds]);

  // Compute which artists have content currently downloading
  const downloadingArtistIds = React.useMemo(() => {
    const result = new Set<string>();
    for (const artist of derivedArtists) {
      for (const item of artist.items) {
        if (item.type === "album" && item.album) {
          if (
            downloadingAlbumIds.has(item.album.id) ||
            item.album.tracks.some((t) => downloadingTracks.has(t.id))
          ) {
            result.add(artist.id);
            break;
          }
        } else if (item.type === "track" && item.track) {
          if (downloadingTracks.has(item.track.id)) {
            result.add(artist.id);
            break;
          }
        }
      }
    }
    return result;
  }, [derivedArtists, downloadingTracks, downloadingAlbumIds]);

  // Group filtered artists by first letter
  const groupedArtists = React.useMemo(() => {
    const groups: Record<string, DerivedArtist[]> = {};
    filteredArtists.forEach((artist) => {
      const firstLetter = artist.name.trim().charAt(0).toUpperCase();
      const key = /\p{L}/u.test(firstLetter) ? firstLetter : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(artist);
    });
    return Object.keys(groups)
      .sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      })
      .map((letter) => ({ letter, artists: groups[letter] }));
  }, [filteredArtists]);

  const getItemsForArtist = useCallback(
    (artistId: string) => derivedArtists.find((a) => a.id === artistId)?.items ?? [],
    [derivedArtists],
  );

  const runArtistBulkAction = useCallback(
    (
      artistId: string,
      action: BulkQueueAction,
      playlistId?: string,
    ) => {
      const items = getItemsForArtist(artistId);
      if (items.length === 0) return;
      const label = derivedArtists.find((a) => a.id === artistId)?.name;
      // Fire and forget — the job runs in the main process and reports progress.
      void startBulkAction({ action, items, playlistId, label });
    },
    [getItemsForArtist, derivedArtists, startBulkAction],
  );

  const handleCardAction = useCallback(
    (
      artistId: string,
      action: BulkQueueAction,
      playlistId?: string,
    ) => {
      setCardMenuArtistId(null);
      runArtistBulkAction(artistId, action, playlistId);
    },
    [runArtistBulkAction],
  );

  // Detail View
  if (selectedArtistId) {
    const targetId = selectedArtistId.startsWith('name-') ? selectedArtistId : `name-${selectedArtistId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const artist = derivedArtists.find((a) => a.id === selectedArtistId || a.id === targetId || a.name.toLowerCase() === selectedArtistId.trim().toLowerCase());
    const artistItems = artist?.items ?? [];

    if (!artist) {
      return (
        <div className={styles.notFound}>
          <button onClick={() => goBack()} className={styles.backBtn}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <div className={styles.emptyState}>
            <h2>Artist not found</h2>
            <div style={{ marginTop: '20px', textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <p><strong>Debug Info:</strong></p>
              <p>selectedArtistId: &quot;{selectedArtistId}&quot;</p>
              <p>targetId: &quot;{targetId}&quot;</p>
              <p>derivedCount: {derivedArtists.length}</p>
              <p>Sample IDs: {derivedArtists.slice(0, 5).map(a => `"${a.id}"`).join(', ')}</p>
              <p>Sample Names: {derivedArtists.slice(0, 5).map(a => `"${a.name}"`).join(', ')}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.container}>
        <div className={styles.detailHeader}>
          <button
            onClick={() => goBack()}
            className={styles.backBtn}
          >
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className={styles.detailImageContainer}>
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt={artist.name}
                className={styles.artistImage}
              />
            ) : (
              <div className={styles.placeholder} style={{ fontSize: "2rem" }}>
                {artist.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className={styles.detailInfo}>
            <h1>{artist.name}</h1>
            <div className={styles.meta}>
              <span>
                {artistItems.length}{" "}
                {artistItems.length === 1 ? "item" : "items"} in collection
              </span>
              <span className={styles.dot}>•</span>
              <a
                href={`https://bandcamp.com/search?q=${encodeURIComponent(artist.name)}`}
                target="_blank"
                rel="noreferrer"
                className={styles.link}
              >
                Search on Bandcamp <ExternalLink size={12} className="ml-1" />
              </a>
            </div>
          </div>

          {artistItems.length > 0 && (
            <div className={styles.detailActions}>
              <button
                className={styles.playAllButton}
                disabled={isBulkRunning}
                onClick={() =>
                  void startBulkAction({
                    action: "play",
                    items: artistItems,
                    label: artist?.name,
                  })
                }
              >
                <Play size={16} /> Play All
              </button>
              <div
                className={styles.moreButtonContainer}
                onMouseLeave={() => setShowDetailMenu(false)}
              >
                <BulkProgressButton
                  onToggleMenu={() => setShowDetailMenu(!showDetailMenu)}
                  title="More options"
                  className={styles.moreButton}
                  iconSize={20}
                />
                {showDetailMenu && (
                  <div
                    className={styles.detailMenu}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setShowDetailMenu(false);
                        void startBulkAction({
                          action: "playNext",
                          items: artistItems,
                          label: artist?.name,
                        });
                      }}
                    >
                      <SkipForward size={16} /> Play Next
                    </button>
                    <button
                      onClick={() => {
                        setShowDetailMenu(false);
                        void startBulkAction({
                          action: "addToQueue",
                          items: artistItems,
                          label: artist?.name,
                        });
                      }}
                    >
                      <List size={16} /> Add to Queue
                    </button>
                    <div className={styles.menuDivider} />
                    <button onClick={() => {
                      setShowDetailMenu(false);
                      setPlaylistTargetArtistItems(artistItems);
                    }}>
                      <Music size={14} /> Add to Playlist
                    </button>
                    {!cachedArtistIds.has(selectedArtistId) && (
                      <>
                        <div className={styles.menuDivider} />
                        <button
                          onClick={() => {
                            setShowDetailMenu(false);
                            void startBulkAction({
                              action: "download",
                              items: artistItems,
                              label: artist?.name,
                            });
                          }}
                        >
                          <Download size={16} /> Download for Offline
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`${styles.scrollContainer} custom-scrollbar`}>
          <ItemsGrid
            items={artistItems}
            emptyMessage="No items found for this artist in your collection."
          />
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Artists</h1>
          <div className={styles.searchContainer}>
            <Search className={styles.searchIcon} size={18} />
            <input
              type="text"
              placeholder="Search.."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
      </div>

      <div className={`${styles.scrollContainer} custom-scrollbar`}>
        {groupedArtists.map((group) => (
          <div key={group.letter} className={styles.group}>
            <h2 className={styles.groupHeader}>{group.letter}</h2>
            <div className={styles.grid}>
              {group.artists.map((artist) => (
                <div
                  key={artist.id}
                  className={styles.artistCard}
                  onClick={() => selectArtist(artist.id)}
                  onMouseLeave={() => {
                    if (cardMenuArtistId === artist.id) setCardMenuArtistId(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCardMenuArtistId(artist.id);
                  }}
                >
                  <div className={styles.imageWrapper}>
                    <div className={styles.imageContainer}>
                      {artist.imageUrl ? (
                        <img
                          src={artist.imageUrl}
                          alt={artist.name}
                          className={styles.artistImage}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.placeholder}>
                          {artist.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={styles.cardOverlay}>
                        <button
                          className={styles.cardPlayButton}
                          disabled={isBulkRunning}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardAction(artist.id, "play");
                          }}
                          title="Play"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    className={styles.cardMenuButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCardMenuArtistId(cardMenuArtistId === artist.id ? null : artist.id);
                    }}
                    title="More options"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  <div className={styles.artistName} title={artist.name}>
                    {artist.name}
                  </div>
                  <div className={styles.itemCount}>
                    {artist.items.length}{" "}
                    {artist.items.length === 1 ? "item" : "items"}
                  </div>
                  {downloadingArtistIds.has(artist.id) ? (
                    <div
                      className={`${styles.cachedDot} ${styles.cachedDotDownloading}`}
                      title="Downloading…"
                    />
                  ) : cachedArtistIds.has(artist.id) ? (
                    <div
                      className={styles.cachedDot}
                      title="All content available offline"
                    />
                  ) : null}
                  {cardMenuArtistId === artist.id && (
                    <div
                      className={styles.cardMenu}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => handleCardAction(artist.id, "play")}>
                        <Play size={16} /> Play Now
                      </button>
                      <button onClick={() => handleCardAction(artist.id, "playNext")}>
                        <SkipForward size={16} /> Play Next
                      </button>
                      <button onClick={() => handleCardAction(artist.id, "addToQueue")}>
                        <List size={16} /> Add to Queue
                      </button>
                      <div className={styles.menuDivider} />
                      <button onClick={() => {
                        setCardMenuArtistId(null);
                        setPlaylistTargetArtistItems(artist.items);
                      }}>
                        <Music size={14} /> Add to Playlist
                      </button>
                      {!cachedArtistIds.has(artist.id) && !isOfflineMode && (
                        <>
                          <div className={styles.menuDivider} />
                          <button onClick={() => handleCardAction(artist.id, "download")}>
                            <Download size={16} /> Download for Offline
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredArtists.length === 0 && (
          <div className={styles.emptyState}>
            <p className="text-lg">No artists found</p>
            {filter && <p className="text-sm">Try a different search term</p>}
          </div>
        )}
      </div>

      <AddToPlaylistModal
        isOpen={!!playlistTargetArtistItems}
        onClose={() => setPlaylistTargetArtistItems(null)}
        onSelectPlaylist={(playlistId) => {
          if (playlistTargetArtistItems) {
            void startBulkAction({
              action: "addToPlaylist",
              items: playlistTargetArtistItems,
              playlistId,
            });
          }
          setPlaylistTargetArtistItems(null);
        }}
      />
    </div>
  );
};
