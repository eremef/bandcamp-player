import { useRef, useEffect } from 'react';
import { useStore } from '../../store/store';
import styles from './PlayerBar.module.css';

export function PlayerBar() {
    const {
        player,
        togglePlay,
        next,
        previous,
        seek,
        setVolume,
        toggleMute,
        toggleShuffle,
        setRepeat,
        toggleQueue,
        toggleMiniPlayer,
        isQueueVisible,
    } = useStore();

    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, isShuffled, repeatMode } = player;

    // Sync audio element with player state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack) return;

        if (audio.src !== currentTrack.streamUrl) {
            audio.src = currentTrack.streamUrl;
        }

        if (isPlaying) {
            console.log('Attempting to play URL:', currentTrack.streamUrl);
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error('Playback error:', error);
                        if (audio.error) {
                            console.error('Audio element error:', audio.error.code, audio.error.message);
                        }
                    }
                });
            }
        } else {
            audio.pause();
        }
    }, [isPlaying, currentTrack]);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = isMuted ? 0 : volume;
        }
    }, [volume, isMuted]);

    // Handle audio time updates
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            window.electron.player.updateTime(audio.currentTime, audio.duration);
        };

        const handleLoadedMetadata = () => {
            window.electron.player.updateTime(audio.currentTime, audio.duration);
        };

        const handleEnded = () => {
            next();
        };

        const handleError = (e: Event) => {
            const target = e.target as HTMLAudioElement;
            console.error('Audio error event:', e);
            if (target.error) {
                console.error('Audio error details:', target.error.code, target.error.message);
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('error', handleError);
        };
    }, [next]);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || !duration) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        seek(percent * duration);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setVolume(parseFloat(e.target.value));
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className={styles.playerBar}>
            {/* Hidden audio element */}
            <audio ref={audioRef} />

            {/* Track info */}
            <div className={styles.trackInfo}>
                {currentTrack ? (
                    <>
                        <div className={styles.artwork}>
                            <img src={currentTrack.artworkUrl} alt="" />
                        </div>
                        <div className={styles.trackDetails}>
                            <div className={styles.trackTitle}>{currentTrack.title}</div>
                            <div className={styles.trackArtist}>{currentTrack.artist}</div>
                        </div>
                    </>
                ) : (
                    <div className={styles.noTrack}>No track playing</div>
                )}
            </div>

            {/* Player controls */}
            <div className={styles.controls}>
                <div className={styles.controlButtons}>
                    <button
                        className={`${styles.controlBtn} ${isShuffled ? styles.active : ''}`}
                        onClick={toggleShuffle}
                        title="Shuffle"
                    >
                        🔀
                    </button>
                    <button className={styles.controlBtn} onClick={previous} title="Previous">
                        ⏮️
                    </button>
                    <button className={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button className={styles.controlBtn} onClick={next} title="Next">
                        ⏭️
                    </button>
                    <button
                        className={`${styles.controlBtn} ${repeatMode !== 'off' ? styles.active : ''}`}
                        onClick={() => {
                            const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
                            const currentIndex = modes.indexOf(repeatMode);
                            setRepeat(modes[(currentIndex + 1) % modes.length]);
                        }}
                        title={`Repeat: ${repeatMode}`}
                    >
                        {repeatMode === 'one' ? '🔂' : '🔁'}
                    </button>
                </div>

                <div className={styles.progressContainer}>
                    <span className={styles.time}>{formatTime(currentTime)}</span>
                    <div className={styles.progressBar} ref={progressRef} onClick={handleProgressClick}>
                        <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                            <div className={styles.progressThumb} style={{ left: `${progress}%` }} />
                        </div>
                    </div>
                    <span className={styles.time}>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & extras */}
            <div className={styles.extras}>
                <button className={styles.controlBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                <input
                    type="range"
                    className={styles.volumeSlider}
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                />
                <button
                    className={`${styles.controlBtn} ${isQueueVisible ? styles.active : ''}`}
                    onClick={toggleQueue}
                    title="Queue"
                >
                    📋
                </button>
                <button className={styles.controlBtn} onClick={toggleMiniPlayer} title="Mini Player">
                    🔲
                </button>
            </div>
        </div>
    );
}
