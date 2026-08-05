import { useEffect, useState } from "react";
import { useStore } from "../../store/store";
import {
  ArrowLeft,
  Music,
  Play,
  List,
  MoreHorizontal,
  Download,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { AddToPlaylistModal } from "../Playlist/AddToPlaylistModal";
import styles from "./AlbumDetailView.module.css";

export function AlbumDetailView() {
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState<any | null>(null);
  const {
    selectedAlbum,
    setView,
    play,
    addAlbumToQueue,
    addTracksToQueue,
    clearQueue,
    playQueueIndex,

    getAlbumDetails,
    updateAlbumInCollection,
    addToQueue,
    addTracksToPlaylist,
    downloadTrack,
    downloadAlbum,
    deleteAlbum,
    albumDetailSourceView,
    cachedTrackIds,
    cachedAlbumIds,
    downloadingTracks,
    downloadingAlbumIds,
    settings,
    selectArtist,
    goBack,
  } = useStore();

  const isOfflineMode = settings?.offlineMode ?? false;

  const [isLoading, setIsLoading] = useState(false);
  const [albumDetails, setAlbumDetails] = useState(selectedAlbum);
  const [activeTrackMenu, setActiveTrackMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAlbum) return;

    setAlbumDetails(selectedAlbum);
    setIsLoading(false);

    // If album already has detailed tracks (including pre-order unstreamable tracks), don't re-fetch
    if (selectedAlbum.tracks.length > 0 && selectedAlbum.tracks.length >= (selectedAlbum.trackCount || 0)) {
      return;
    }

    const fetchDetails = async () => {
      const isAlbumFullyCached = cachedAlbumIds.has(selectedAlbum.id);

      // In offline mode with fully cached album, get tracks from cache
      if (isOfflineMode && isAlbumFullyCached) {
        const cachedTracks = await window.electron.cache.getCachedTracksByAlbum(selectedAlbum.id);
        if (cachedTracks.length > 0) {
          setAlbumDetails({ ...selectedAlbum, tracks: cachedTracks, trackCount: cachedTracks.length });
        }
        return;
      }

      if (selectedAlbum.bandcampUrl) {
        setIsLoading(true);
        try {
          const details = await getAlbumDetails(selectedAlbum.bandcampUrl);
          if (details) {
            setAlbumDetails(details);
            // Write full tracks back into the collection store so the next
            // open of this album skips the network fetch entirely, and so
            // deriveCachedAlbumIds has the real trackCount to compare against.
            updateAlbumInCollection(details);
          }
        } catch (error) {
          console.error("Error fetching album details:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlbum?.id, selectedAlbum?.tracks?.length, isOfflineMode]);

  if (!selectedAlbum) {
    return (
      <div className={styles.container}>
        <p>Album not found</p>
        <button onClick={() => setView(albumDetailSourceView || "collection")}>
          Back to{" "}
          {albumDetailSourceView === "artists" ? "artists" : "collection"}
        </button>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${mins} min`;
    }
    return `${mins} min`;
  };

  const handlePlayAll = async () => {
    if (albumDetails && albumDetails.tracks.length > 0) {
      await clearQueue(false);
      await addTracksToQueue(albumDetails.tracks);
      await playQueueIndex(0);
    }
  };

  const handleAddToQueue = async () => {
    if (albumDetails) {
      await addAlbumToQueue(albumDetails);
    }
  };

  const handleTrackAddToQueue = async (track: any) => {
    setActiveTrackMenu(null);
    await addToQueue(track);
  };

  const handleTrackAddToPlaylist = async (playlistId: string, track: any) => {
    setActiveTrackMenu(null);
    await addTracksToPlaylist(playlistId, [track]);
  };

  const handleTrackDownload = async (track: any) => {
    setActiveTrackMenu(null);
    await downloadTrack(track);
  };

  const handleTrackRemoveFromCache = async (track: any) => {
    setActiveTrackMenu(null);
    await downloadTrack(track);
    await useStore.getState().deleteFromCache(track.id);
  };

  const handleAlbumDownload = async () => {
    if (albumDetails) {
      await downloadAlbum(albumDetails);
    }
  };

  const handleAlbumRemoveFromCache = async () => {
    if (albumDetails?.id) {
      await deleteAlbum(albumDetails.id);
    }
  };

  const isAlbumDownloaded = selectedAlbum
    ? cachedAlbumIds?.has(selectedAlbum.id)
    : false;
  const isAlbumDownloading = selectedAlbum
    ? downloadingAlbumIds?.has(selectedAlbum.id)
    : false;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => goBack()}
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className={styles.headerContent}>
          <div className={styles.artwork}>
            {albumDetails?.artworkUrl ? (
              <img src={albumDetails.artworkUrl} alt={albumDetails.title} />
            ) : (
              <div className={styles.placeholderArtwork}>
                <Music size={48} />
              </div>
            )}
          </div>
          <div className={styles.info}>
            <div className={styles.labelRow}>
              <span className={styles.label}>Album</span>
              {albumDetails?.isPreorder && (
                <span className={styles.preorderBadge} title="Pre-order Album">
                  Pre-order
                </span>
              )}
            </div>
            <h1 className={styles.title}>{albumDetails?.title}</h1>
            <h2
              className={`${styles.artist} ${styles.link}`}
              onClick={() => {
                if (albumDetails) {
                  selectArtist(albumDetails.artist);
                }
              }}
              title="Go to artist"
            >
              {albumDetails?.artist}
            </h2>

            <p className={styles.meta}>
              {albumDetails?.tracks.length || 0} tracks
              {albumDetails?.tracks.length
                ? ` • ${formatDuration(albumDetails.tracks.reduce((acc, t) => acc + t.duration, 0))}`
                : ""}
            </p>
            <div className={styles.actions}>
              <button
                className={styles.playBtn}
                onClick={handlePlayAll}
                disabled={isLoading || !albumDetails?.tracks.some((t) => !!t.streamUrl || cachedTrackIds.has(t.id))}
              >
                <Play size={18} fill="currentColor" />
                <span>Play</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleAddToQueue}
                disabled={isLoading}
              >
                <List size={18} />
                <span>Add to Queue</span>
              </button>
              {isAlbumDownloaded ? (
                <button
                  className={styles.actionBtn}
                  onClick={handleAlbumRemoveFromCache}
                  disabled={isLoading}
                  title="Remove from cache"
                >
                  <Trash2 size={18} />
                  <span>Downloaded</span>
                </button>
              ) : isAlbumDownloading ? (
                <button className={styles.actionBtn} disabled>
                  <Download size={18} className={styles.spinningIcon} />
                  <span>Downloading...</span>
                </button>
              ) : !isOfflineMode ? (
                <button
                  className={styles.actionBtn}
                  onClick={handleAlbumDownload}
                  disabled={isLoading}
                  title="Download album for offline"
                >
                  <Download size={18} />
                  <span>Download Album</span>
                </button>
              ) : null}
              {albumDetails?.bandcampUrl && (
                <button
                  className={styles.actionBtn}
                  onClick={() => {
                    window.electron.system.openExternal(albumDetails.bandcampUrl);
                  }}
                  title="View on Bandcamp"
                >
                  <ExternalLink size={18} />
                  <span>Bandcamp</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Track list */}
      <div className={styles.trackList}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className="spinner" />
            <p>Loading tracks...</p>
          </div>
        ) : !albumDetails?.tracks.length ? (
          <div className={styles.empty}>
            <p>No tracks found for this album</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colNum}>#</th>
                <th className={styles.colTitle}>Title</th>
                <th className={styles.colDuration}>Duration</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {albumDetails.tracks.map((track, index) => {
                const isUnreleased = !track.streamUrl && !cachedTrackIds.has(track.id);
                return (
                  <tr
                    key={`${track.id}-${index}`}
                    className={`${styles.trackRow} ${isUnreleased ? styles.unreleasedTrackRow : ""}`}
                    onMouseLeave={() => setActiveTrackMenu(null)}
                    onContextMenu={(e) => {
                      if (isUnreleased) return;
                      e.preventDefault();
                      setActiveTrackMenu(track.id);
                    }}
                  >
                    <td className={styles.colNum}>
                      {isUnreleased ? (
                        <span className={styles.trackNumberMuted}>{index + 1}</span>
                      ) : (
                        <button
                          data-testid="play-track-btn"
                          className={styles.playTrackBtn}
                          onClick={() => play(track)}
                        >
                          <span className={styles.trackNumber}>{index + 1}</span>
                          <span className={styles.playIcon}>
                            <Play size={14} fill="currentColor" />
                          </span>
                        </button>
                      )}
                    </td>
                    <td className={styles.colTitle}>
                      <div className={styles.trackTitle}>
                        {downloadingTracks.has(track.id) ? (
                          <span
                            className={`${styles.cachedDot} ${styles.cachedDotDownloading}`}
                            title="Downloading…"
                          />
                        ) : cachedTrackIds.has(track.id) ? (
                          <span
                            className={styles.cachedDot}
                            title="Available offline"
                          />
                        ) : null}
                        <span className={isUnreleased ? styles.unreleasedTitle : ""}>
                          {track.title}
                        </span>
                        {isUnreleased && (
                          <span className={styles.unreleasedBadge}>Unreleased</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.colDuration}>
                      {track.duration > 0
                        ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, "0")}`
                        : "—"}
                    </td>
                    <td className={styles.colActions}>
                      <div className={styles.menuContainer}>
                        <button
                          className={styles.menuBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTrackMenu(
                              activeTrackMenu === track.id ? null : track.id,
                            );
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {activeTrackMenu === track.id && (
                          <div
                            className={styles.menu}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setActiveTrackMenu(null);
                                addToQueue(track, true);
                              }}
                            >
                              <Play size={14} /> Play Next
                            </button>
                            <button onClick={() => handleTrackAddToQueue(track)}>
                              <List size={14} /> Add to Queue
                            </button>

                            <div className={styles.menuDivider} />
                            <button onClick={() => {
                              setActiveTrackMenu(null);
                              setSelectedTrackForPlaylist(track);
                            }}>
                              <Music size={14} /> Add to Playlist
                            </button>

                            <div className={styles.menuDivider} />
                            {!cachedTrackIds.has(track.id) ? (
                              !isOfflineMode && (
                                <button onClick={() => handleTrackDownload(track)}>
                                  <Download size={14} /> Download
                                </button>
                              )
                            ) : (
                              <button onClick={() => handleTrackRemoveFromCache(track)}>
                                <Trash2 size={14} /> Remove from cache
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AddToPlaylistModal
        isOpen={!!selectedTrackForPlaylist}
        onClose={() => setSelectedTrackForPlaylist(null)}
        onSelectPlaylist={(playlistId) => {
          if (selectedTrackForPlaylist) {
            handleTrackAddToPlaylist(playlistId, selectedTrackForPlaylist);
            setSelectedTrackForPlaylist(null);
          }
        }}
      />
    </div>
  );
}
