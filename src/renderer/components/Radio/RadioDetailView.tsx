import { useEffect, useState } from "react";
import { useStore } from "../../store/store";
import {
  ArrowLeft,
  Music,
  Play,
  List,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { AddToPlaylistModal } from "../Playlist/AddToPlaylistModal";
import styles from "./RadioDetailView.module.css";
import type { Track } from "../../../shared/types";

export function RadioDetailView() {
  const {
    selectedRadioStation,
    setView,
    play,
    addTracksToQueue,
    clearQueue,
    playQueueIndex,
    addToQueue,
    addTracksToPlaylist,
    playlists,
  } = useStore();

  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrackMenu, setActiveTrackMenu] = useState<string | null>(null);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState<any | null>(null);

  useEffect(() => {
    if (!selectedRadioStation) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const fetchedTracks = await window.electron.radio.getStationTracks(selectedRadioStation.id);
        setTracks(fetchedTracks);
      } catch (error) {
        console.error("Error fetching radio details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [selectedRadioStation]);

  if (!selectedRadioStation) {
    return (
      <div className={styles.container}>
        <p>Radio show not found</p>
        <button onClick={() => setView("radio")}>Back to Radio</button>
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
    if (tracks.length > 0) {
      await clearQueue(false);
      await addTracksToQueue(tracks);
      await playQueueIndex(0);
    }
  };

  const handleAddToQueue = async () => {
    if (tracks.length > 0) {
      await addTracksToQueue(tracks);
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

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => setView("radio")}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className={styles.headerContent}>
          <div className={styles.artwork}>
            {selectedRadioStation.imageUrl ? (
              <img src={selectedRadioStation.imageUrl} alt={selectedRadioStation.name} />
            ) : (
              <div className={styles.placeholderArtwork}>
                <Music size={48} />
              </div>
            )}
          </div>
          <div className={styles.info}>
            <span className={styles.label}>Radio Show</span>
            <h1 className={styles.title}>{selectedRadioStation.name}</h1>
            <h2 className={styles.artist}>Bandcamp Radio</h2>

            {selectedRadioStation.description && (
              <p className={styles.subtitle}>{selectedRadioStation.description}</p>
            )}

            {selectedRadioStation.longDescription && (
              <p className={styles.description}>{selectedRadioStation.longDescription}</p>
            )}

            {selectedRadioStation.imageCaption && (
              <p className={styles.description}>{selectedRadioStation.imageCaption}</p>
            )}

            <p className={styles.meta}>
              {selectedRadioStation.date ? `${selectedRadioStation.date} • ` : ""}
              {tracks.length || 0} tracks
              {tracks.length > 0
                ? ` • ${formatDuration(tracks.reduce((acc, t) => acc + t.duration, 0))}`
                : ""}
            </p>
            <div className={styles.actions}>
              <button
                className={styles.playBtn}
                onClick={handlePlayAll}
                disabled={isLoading || !tracks.length}
              >
                <Play size={18} fill="currentColor" />
                <span>Play Extracted</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleAddToQueue}
                disabled={isLoading || !tracks.length}
              >
                <List size={18} />
                <span>Add Extracted to Queue</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => {
                  window.electron.system.openExternal(`https://bandcamp.com/?show=${selectedRadioStation.id}`);
                }}
                title="View on Bandcamp"
              >
                <ExternalLink size={18} />
                <span>Bandcamp</span>
              </button>
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
        ) : !tracks.length ? (
          <div className={styles.empty}>
            <p>No tracks extracted from this radio show</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colNum}>#</th>
                <th className={styles.colTitle}>Title</th>
                <th className={styles.colArtist}>Artist</th>
                <th className={styles.colAlbum}>Album</th>
                <th className={styles.colDuration}>Duration</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track, index) => (
                <tr
                  key={`${track.id}-${index}`}
                  className={styles.trackRow}
                  onMouseLeave={() => setActiveTrackMenu(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveTrackMenu(track.id);
                  }}
                >
                  <td className={styles.colNum}>
                    <button
                      className={styles.playTrackBtn}
                      onClick={() => play(track)}
                    >
                      <span className={styles.trackNumber}>{index + 1}</span>
                      <span className={styles.playIcon}>
                        <Play size={14} fill="currentColor" />
                      </span>
                    </button>
                  </td>
                  <td className={styles.colTitle}>
                    <div className={styles.trackTitle}>
                      <span>{track.title}</span>
                    </div>
                  </td>
                  <td className={styles.colArtist}>
                    <span className={styles.trackArtist}>{track.artist}</span>
                  </td>
                  <td className={styles.colAlbum}>
                    <span className={styles.trackAlbum}>{track.album}</span>
                  </td>
                  <td className={styles.colDuration}>
                    {Math.floor(track.duration / 60)}:
                    {String(Math.floor(track.duration % 60)).padStart(2, "0")}
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
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
