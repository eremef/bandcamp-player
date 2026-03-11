import { useState } from "react";
import { useStore } from "../../store/store";
import type { Album } from "../../../shared/types";
import {
  MoreHorizontal,
  Play,
  SkipForward,
  List,
  Music,
  Download,
} from "lucide-react";
import styles from "./AlbumCard.module.css";

interface AlbumCardProps {
  album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const {
    getAlbumDetails,
    addAlbumToQueue,
    playlists,
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
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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

  // DEBUG — remove once indicator is confirmed working
  console.debug(
    `[AlbumCard] id="${album.id}" title="${album.title}" trackCount=${album.trackCount}` +
    ` isCached=${isCached} cachedAlbumIds=[${[...cachedAlbumIds].join(",")}]`,
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

  return (
    <div
      className={styles.card}
      onClick={handleCardClick}
      onMouseLeave={() => setShowMenu(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(true);
      }}
    >
      {/* Artwork */}
      <div className={styles.artworkWrapper}>
        <div className={styles.artworkContainer}>
          <img
            src={album.artworkUrl}
            alt={album.title}
            className={styles.artwork}
          />
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
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
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
        <h3 className={styles.title}>{album.title}</h3>
        <p className={styles.artist}>{album.artist}</p>
      </div>

      {/* Context menu */}
      {showMenu && (
        <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
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
          {playlists.length > 0 && (
            <>
              <span className={styles.menuLabel}>Add to Playlist</span>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToPlaylist(playlist.id);
                  }}
                >
                  <Music size={14} /> {playlist.name}
                </button>
              ))}
            </>
          )}
          {!isCached && (
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
      )}
    </div>
  );
}
