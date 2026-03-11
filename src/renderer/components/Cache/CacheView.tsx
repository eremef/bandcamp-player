import { useEffect, useState } from "react";
import { useStore } from "../../store/store";
import {
  Download,
  Trash2,
  Music,
  HardDrive,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import styles from "./CacheView.module.css";

export function CacheView() {
  const {
    cacheStats,
    cachedTracksDetailed,
    fetchCacheStats,
    fetchCachedTracksDetailed,
    deleteFromCache,
    deleteAlbum,
    clearCache,
    play,
  } = useStore();

  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCacheStats();
    fetchCachedTracksDetailed();
  }, [fetchCacheStats, fetchCachedTracksDetailed]);

  const toggleAlbum = (albumId: string) => {
    setExpandedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) {
        next.delete(albumId);
      } else {
        next.add(albumId);
      }
      return next;
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleClearCache = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setIsClearing(true);
    try {
      await clearCache();
      setConfirmClear(false);
    } finally {
      setIsClearing(false);
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    await deleteFromCache(trackId);
    fetchCachedTracksDetailed();
  };

  const handlePlayTrack = async (track: any) => {
    await play(track);
  };

  const groupTracksByAlbum = () => {
    const grouped = new Map<string, typeof cachedTracksDetailed>();
    for (const track of cachedTracksDetailed) {
      const albumId = track.albumId || "unknown";
      if (!grouped.has(albumId)) {
        grouped.set(albumId, []);
      }
      grouped.get(albumId)!.push(track);
    }
    return grouped;
  };

  const groupedTracks = groupTracksByAlbum();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Offline Storage</h1>
          <button
            className={`${styles.clearBtn} ${confirmClear ? styles.clearBtnConfirm : ""}`}
            onClick={handleClearCache}
            disabled={isClearing || cachedTracksDetailed.length === 0}
          >
            {confirmClear ? (
              <>
                <AlertCircle size={16} />
                Confirm Clear All
              </>
            ) : (
              <>
                <Trash2 size={16} />
                Clear All Cache
              </>
            )}
          </button>
        </div>

        {cacheStats && (
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <Music size={16} />
              <span>
                <strong>{cacheStats.trackCount}</strong> tracks cached
              </span>
            </div>
            <div className={styles.statItem}>
              <HardDrive size={16} />
              <span>
                <strong>{formatSize(cacheStats.totalSize)}</strong> used
              </span>
            </div>
            <div className={styles.statItem}>
              <span>
                <strong>{cacheStats.usagePercent.toFixed(1)}%</strong> of{" "}
                {formatSize(cacheStats.maxSize)}
              </span>
            </div>
          </div>
        )}
      </header>

      {cachedTracksDetailed.length === 0 ? (
        <div className={styles.emptyState}>
          <Download size={48} strokeWidth={1} />
          <h2>No cached tracks</h2>
          <p>
            Browse your collection and download albums for offline listening
          </p>
        </div>
      ) : (
        <div className={styles.content}>
          {Array.from(groupedTracks.entries()).map(([albumId, tracks]) => {
            const isExpanded = expandedAlbums.has(albumId);
            return (
              <div key={albumId} className={styles.albumGroup}>
                <div className={styles.albumHeader}>
                  <div className={styles.albumInfo}>
                    <button
                      className={styles.expandBtn}
                      onClick={() => toggleAlbum(albumId)}
                      aria-label={isExpanded ? "Collapse album" : "Expand album"}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {tracks[0].artworkUrl && (
                      <img
                        src={tracks[0].artworkUrl}
                        alt=""
                        className={styles.albumArt}
                      />
                    )}
                    <div>
                      <h3 className={styles.albumTitle}>
                        {tracks[0].album || "Unknown Album"}
                      </h3>
                      <p className={styles.albumMeta}>
                        {tracks.length} track{tracks.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    className={styles.removeAlbumBtn}
                    onClick={() => deleteAlbum(albumId)}
                    title="Remove album from cache"
                  >
                    <Trash2 size={14} />
                    Remove Album
                  </button>
                </div>

                {isExpanded && (
                  <div className={styles.trackList}>
                    {tracks.map((track) => (
                      <div
                        key={track.id}
                        className={styles.trackItem}
                        onClick={() => handlePlayTrack(track)}
                      >
                        <div className={styles.trackInfo}>
                          <span className={styles.trackTitle}>{track.title}</span>
                          <span className={styles.trackArtist}>{track.artist}</span>
                        </div>
                        <div className={styles.trackActions}>
                          <button
                            className={styles.removeBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTrack(track.id);
                            }}
                            title="Remove from cache"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
