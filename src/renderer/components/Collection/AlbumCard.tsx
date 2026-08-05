import { useState } from "react";
import { useStore } from "../../store/store";
import type {
  Album,
  CollectionViewMode,
  CoverSize,
} from "../../../shared/types";
import {
  MoreHorizontal,
  Play,
  SkipForward,
  List,
  Music,
  Download,
  Heart,
} from "lucide-react";
import { AddToPlaylistModal } from "../Playlist/AddToPlaylistModal";
import { getArtworkUrl, getCoverVariant } from "../../utils/artwork";
import styles from "./AlbumCard.module.css";

interface AlbumCardProps {
  album: Album;
  isTrackItem?: boolean;
  isWishlist?: boolean;
  variant?: CollectionViewMode;
  coverSize?: CoverSize;
  onClick?: () => void;
}

export function AlbumCard({
  album,
  isTrackItem = false,
  isWishlist = false,
  variant = "grid",
  coverSize = "medium",
  onClick,
}: AlbumCardProps) {
  const {
    getAlbumDetails,
    addAlbumToQueue,
    addTracksToPlaylist,
    downloadAlbum,
    clearQueue,
    playQueueIndex,
    selectAlbum,
    cachedTrackIds,
    cachedAlbumIds,
    downloadingTracks,
    downloadingAlbumIds,
    settings,
    selectArtist,
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<"left" | "right">("left");
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!showMenu) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isRightSide = rect.right > window.innerWidth / 2;
      setMenuPosition(isRightSide ? "right" : "left");
    }
    setShowMenu(!showMenu);
  };

  // An album is fully cached if its ID appears in cachedAlbumIds (derived from
  // DB counts vs trackCount — works even when album.tracks is still empty).
  // Fall back to checking loaded tracks for albums not yet in the DB map.
  const isCached =
    cachedAlbumIds.has(album.id) ||
    (album.tracks.length > 0 &&
      album.tracks.every((t) => cachedTrackIds.has(t.id)));
  const isDownloading =
    downloadingAlbumIds.has(album.id) ||
    (album.tracks.length > 0 &&
      album.tracks.some((t) => downloadingTracks.has(t.id)));

  // Bandcamp serves the original 1200px upload by default; ask for a variant
  // sized to how this card actually renders.
  const artworkSrc = getArtworkUrl(
    album.artworkUrl,
    getCoverVariant(variant, coverSize),
  );


  const ensureAlbumTracks = async () => {
    const isAlbumFullyCached = cachedAlbumIds.has(album.id);

    // If album has loaded tracks with valid streamUrls, use them directly
    if (album.tracks.length > 0 && album.tracks.every((t) => !!t.streamUrl)) {
      return album;
    }

    // In offline mode with fully cached album, get tracks from cache
    if (isOfflineMode && isAlbumFullyCached) {
      const cachedTracks = await window.electron.cache.getCachedTracksByAlbum(album.id);
      if (cachedTracks.length > 0) {
        return { ...album, tracks: cachedTracks, trackCount: cachedTracks.length };
      }
      // If no cached tracks found but album is marked as cached, return album anyway
      // The player will handle playing from cache
      return album;
    }

    if (album.bandcampUrl) {
      setIsLoading(true);
      try {
        const details = await getAlbumDetails(album.bandcampUrl);
        if (details) {
          return details;
        }
      } catch (error) {
        console.error("Error fetching album details:", error);
      } finally {
        setIsLoading(false);
      }
    }
    return album;
  };

  const handlePlay = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const albumWithTracks = await ensureAlbumTracks();

    if (albumWithTracks.tracks.length > 0) {
      if (albumWithTracks.trackCount === 1) {
        // For singles, just play the track directly which adds it to the queue
        useStore.getState().play(albumWithTracks.tracks[0]);
      } else {
        await clearQueue(false);
        await addAlbumToQueue(albumWithTracks);
        await playQueueIndex(0);
      }
    }
  };

  const handleCardClick = async () => {
    if (onClick) {
      onClick();
    }

    // If tracks > 1, open details. If 1 (single), just play?
    // User request: "for albums with more than 1 track when you click on it, it should open a new view"
    // Implies single track albums might be treated differently or just ignored.
    // But consistent behavior is usually better.
    // However, looking at the code, single track items are often just tracks.
    // Let's check if it's an album type or just 1 track.
    // The CollectionView passes a constructed album object for tracks.
    // For actual albums with > 1 track:
    // If tracks > 1, open details. If 0 (unknown/DOM parse), also open details to fetch.
    // Only if explicitly 1 (Single) do we play directly.
    if (album.trackCount !== 1) {
      selectAlbum(album);
    } else {
      handlePlay();
    }
  };

  const handlePlayNext = async () => {
    setShowMenu(false);
    const albumWithTracks = await ensureAlbumTracks();
    await addAlbumToQueue(albumWithTracks, true);
  };

  const handleAddToQueue = async () => {
    setShowMenu(false);
    const albumWithTracks = await ensureAlbumTracks();
    await addAlbumToQueue(albumWithTracks);
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    setShowMenu(false);
    const albumWithTracks = await ensureAlbumTracks();
    await addTracksToPlaylist(playlistId, albumWithTracks.tracks);
  };

  const handleDownload = async () => {
    setShowMenu(false);
    const albumWithTracks = await ensureAlbumTracks();
    console.debug(
      `[AlbumCard] downloading album id="${album.id}", title="${album.title}"`,
    );
    await downloadAlbum(albumWithTracks);
  };

  // Shared by both variants — only the positioning class differs.
  const contextMenu = (extraClass = "") => (
    <div
      className={`${styles.menu} ${menuPosition === "right" ? styles.menuRight : styles.menuLeft} ${extraClass}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handlePlay();
        }}
      >
        <Play size={16} /> Play Now
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handlePlayNext();
        }}
      >
        <SkipForward size={16} /> Play Next
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleAddToQueue();
        }}
      >
        <List size={16} /> Add to Queue
      </button>
      <div className={styles.menuDivider} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(false);
          setShowPlaylistModal(true);
        }}
      >
        <Music size={14} /> Add to Playlist
      </button>
      {!isCached && !isOfflineMode && (
        <>
          <div className={styles.menuDivider} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          >
            <Download size={16} /> Download for Offline
          </button>
        </>
      )}
    </div>
  );

  // Rendered by both variants so the modal survives either layout.
  const playlistModal = (
    <AddToPlaylistModal
      isOpen={showPlaylistModal}
      onClose={() => setShowPlaylistModal(false)}
      onSelectPlaylist={(playlistId) => handleAddToPlaylist(playlistId)}
    />
  );

  if (variant === "list") {
    return (
      <div
        className={`${styles.card} ${styles.row} ${isTrackItem ? styles.trackCard : ""}`}
        onClick={handleCardClick}
        onMouseLeave={() => setShowMenu(false)}
        onContextMenu={toggleMenu}
        data-testid="album-card"
      >
        <div className={styles.rowArtwork}>
          <img
            src={artworkSrc}
            alt={album.title}
            className={styles.artwork}
            loading="lazy"
            decoding="async"
          />
          {(isCached || isDownloading) && (
            <div
              className={`${styles.cachedDot} ${isDownloading ? styles.cachedDotDownloading : ""}`}
              title={isDownloading ? "Downloading…" : "Available offline"}
            />
          )}
        </div>

        <div className={styles.rowInfo}>
          <h3 className={styles.title}>{album.title}</h3>
          <p className={styles.artist}>{album.artist}</p>
        </div>

        {isTrackItem && <span className={styles.rowItemType}>Track</span>}
        {isWishlist && (
          <span className={styles.rowWishlistBadge} title="Wishlist">
            <Heart size={14} fill="currentColor" />
          </span>
        )}

        <div className={styles.rowActions}>
          <button
            className={styles.rowPlayButton}
            onClick={handlePlay}
            disabled={isLoading}
            title="Play"
          >
            {isLoading ? (
              <span className={styles.spinner} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            className={styles.rowMenuButton}
            onClick={toggleMenu}
            title="More options"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {showMenu && contextMenu(styles.menuList)}
        {playlistModal}
      </div>
    );
  }

  return (
    <div
      className={`${styles.card} ${isTrackItem ? styles.trackCard : ""}`}
      onClick={handleCardClick}
      onMouseLeave={() => setShowMenu(false)}
      onContextMenu={toggleMenu}
      data-testid="album-card"
    >
      {/* Artwork */}
      <div className={styles.artworkWrapper}>
        {isTrackItem && <span className={styles.itemType}>Track</span>}
        <div className={styles.artworkContainer}>
          <img
            src={artworkSrc}
            alt={album.title}
            className={styles.artwork}
            loading="lazy"
            decoding="async"
          />
          {isWishlist && (
            <div className={styles.wishlistBadge} title="Wishlist">
              <Heart size={16} fill="currentColor" />
            </div>
          )}
          <div className={styles.overlay}>
            <button
              className={styles.playButton}
              onClick={handlePlay}
              disabled={isLoading}
              title="Play"
            >
              {isLoading ? (
                <span className={styles.spinner} />
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              className={styles.menuButton}
              onClick={toggleMenu}
              title="More options"
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
        {(isCached || isDownloading) && (
          <div
            className={`${styles.cachedDot} ${isDownloading ? styles.cachedDotDownloading : ""}`}
            title={isDownloading ? "Downloading…" : "Available offline"}
          />
        )}
      </div>

      {/* Info */}
      <div className={styles.info}>
        <h3 className={styles.title}>
          {album.title}
          {album.isPreorder && (
            <span className={styles.preorderBadge} title="Pre-order Album">
              Pre-order
            </span>
          )}
        </h3>
        <p
          className={`${styles.artist} ${styles.link}`}
          onClick={(e) => {
            e.stopPropagation();
            selectArtist(album.artist);
          }}
          title="Go to artist"
        >
          {album.artist}
        </p>
      </div>

      {/* Context menu */}
      {showMenu && contextMenu()}
      {playlistModal}
    </div>
  );
}
