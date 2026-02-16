import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store/store';
import {
    Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
    VolumeX, Volume1, Volume2, List, Minimize2, Cast
} from 'lucide-react';
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
        castDevices,
        startCastDiscovery,
        stopCastDiscovery,
        connectCast,
        disconnectCast,
    } = useStore();

    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const volumeRef = useRef<HTMLDivElement>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverVolume, setHoverVolume] = useState<number | null>(null);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const [isCastMenuOpen, setIsCastMenuOpen] = useState(false);

    const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, isShuffled, repeatMode } = player;

    // Sync audio element with player state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (currentTrack) {
            if (audio.src !== currentTrack.streamUrl) {
                audio.src = currentTrack.streamUrl;
            }

            // Pause local playback if casting to avoid echo/delay
            if (isPlaying && !player.isCasting) {
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
        } else {
            // No track playing, ensure stopped
            audio.pause();
            audio.src = ''; // Clear source to stop buffering/loading
        }
    }, [isPlaying, currentTrack, player.isCasting]);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            // Use cubic volume curve for more natural volume control
            // Human hearing is logarithmic, so a linear volume slider feels unresponsive
            // at the high end and too sensitive at the low end.
            // pow(volume, 3) approximates a logarithmic curve nicely.
            audio.volume = isMuted ? 0 : Math.pow(volume, 3);
        }
    }, [volume, isMuted]);

    // Handle audio time updates
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            // If casting, don't report local time to main process to avoid jitter
            // Chromecast status will report its own time which the main process will broadcast
            if (player.isCasting) return;
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
            // Ignore empty src errors (happens on initial load or when track is cleared)
            // Check getAttribute because the .src property converts empty string to full page URL
            const srcAttr = target.getAttribute('src');
            if (target.error?.code === 4 && (srcAttr === '' || srcAttr === null)) return;
            // Also ignore if the error message indicates empty src
            if (target.error?.message?.includes('Empty src')) return;
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
    }, [next, player.isCasting]);

    useEffect(() => {
        const unsubscribe = window.electron.player.onSeek((time) => {
            if (audioRef.current && Math.abs(audioRef.current.currentTime - time) > 0.5) {
                audioRef.current.currentTime = time;
            }
        });
        return () => {
            unsubscribe();
        };
    }, []);

    // Keep local audio in sync with Chromecast progress for seamless handover
    useEffect(() => {
        const audio = audioRef.current;
        if (player.isCasting && audio && Math.abs(audio.currentTime - currentTime) > 1) {
            audio.currentTime = currentTime;
        }
    }, [player.isCasting, currentTime]);

    // Media Session API for Windows SMTC integration
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        // Set action handlers for media keys and Windows controls
        navigator.mediaSession.setActionHandler('play', () => {
            togglePlay();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            togglePlay();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            next();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            previous();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined && audioRef.current) {
                audioRef.current.currentTime = details.seekTime;
                seek(details.seekTime);
            }
        });

        return () => {
            // Clean up handlers
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('seekto', null);
        };
    }, [togglePlay, next, previous, seek]);

    // Update Media Session metadata when track changes
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        if (currentTrack) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title,
                artist: currentTrack.artist,
                album: currentTrack.album || '',
                artwork: currentTrack.artworkUrl ? [
                    { src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/jpeg' }
                ] : []
            });
        } else {
            navigator.mediaSession.metadata = null;
        }
    }, [currentTrack]);

    // Update Media Session playback state
    useEffect(() => {
        if (isCastMenuOpen) {
            startCastDiscovery();
        } else {
            stopCastDiscovery();
        }
    }, [isCastMenuOpen, startCastDiscovery, stopCastDiscovery]);

    // Close cast menu when clicking outside
    useEffect(() => {
        if (!isCastMenuOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest(`.${styles.castContainer}`)) {
                setIsCastMenuOpen(false);
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isCastMenuOpen]);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || !duration || !audioRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const seekTime = percent * duration;
        audioRef.current.currentTime = seekTime;
        seek(seekTime);
    };

    const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || !duration) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        setHoverTime(percent * duration);
    };

    const handleProgressLeave = () => {
        setHoverTime(null);
    };

    const updateVolumeFromMouse = useCallback((clientX: number) => {
        if (!volumeRef.current) return;
        const rect = volumeRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setVolume(percent);
    }, [setVolume]);

    const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsDraggingVolume(true);
        updateVolumeFromMouse(e.clientX);
    };

    useEffect(() => {
        if (!isDraggingVolume) return;

        const handleGlobalMove = (e: MouseEvent) => {
            updateVolumeFromMouse(e.clientX);
        };

        const handleGlobalUp = () => {
            setIsDraggingVolume(false);
        };

        window.addEventListener('mousemove', handleGlobalMove);
        window.addEventListener('mouseup', handleGlobalUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [isDraggingVolume, updateVolumeFromMouse]);

    const handleVolumeMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!volumeRef.current) return;
        const rect = volumeRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHoverVolume(percent);
    };

    const handleVolumeMouseLeave = () => {
        setHoverVolume(null);
    };

    const handleVolumeScroll = (e: React.WheelEvent<HTMLDivElement>) => {
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const newVolume = Math.max(0, Math.min(1, volume + delta));
        setVolume(newVolume);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

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
                        <Shuffle size={18} />
                    </button>
                    <button className={styles.controlBtn} onClick={previous} title="Previous">
                        <SkipBack size={20} fill="currentColor" />
                    </button>
                    <button className={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    <button className={styles.controlBtn} onClick={next} title="Next">
                        <SkipForward size={20} fill="currentColor" />
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
                        {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                    </button>
                </div>

                <div className={styles.progressContainer}>
                    <span className={styles.time}>{formatTime(currentTime)}</span>
                    <div
                        className={styles.progressBar}
                        ref={progressRef}
                        onClick={handleProgressClick}
                        onMouseMove={handleProgressHover}
                        onMouseLeave={handleProgressLeave}
                    >
                        <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                            {hoverTime !== null && (
                                <div
                                    className={styles.progressHover}
                                    style={{ left: `${(hoverTime / duration) * 100}%` }}
                                >
                                    <span className={styles.hoverTime}>{formatTime(hoverTime)}</span>
                                </div>
                            )}
                            <div className={styles.progressThumb} style={{ left: `${progress}%` }} />
                        </div>
                    </div>
                    <span className={styles.time}>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & extras */}
            <div className={styles.extras}>
                <button className={styles.controlBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted || volume === 0 ? (
                        <VolumeX size={20} />
                    ) : volume < 0.5 ? (
                        <Volume1 size={20} />
                    ) : (
                        <Volume2 size={20} />
                    )}
                </button>
                <div className={styles.volumeContainer}>
                    <div
                        className={styles.volumeSlider}
                        ref={volumeRef}
                        onMouseDown={handleVolumeMouseDown}
                        onMouseMove={handleVolumeMouseMove}
                        onMouseLeave={handleVolumeMouseLeave}
                        onWheel={handleVolumeScroll}
                    >
                        <div className={styles.volumeTrack}>
                            <div
                                className={styles.volumeFill}
                                style={{ width: `${volumePercent}%` }}
                            />
                            {hoverVolume !== null && (
                                <div
                                    className={styles.volumeHover}
                                    style={{ left: `${hoverVolume * 100}%` }}
                                >
                                    <span className={styles.volumeHoverText}>{Math.round(hoverVolume * 100)}%</span>
                                </div>
                            )}
                            <div
                                className={styles.volumeThumb}
                                style={{ left: `${volumePercent}%` }}
                            />
                        </div>
                    </div>
                    <span className={styles.volumeText}>{volumePercent}%</span>
                </div>
                <div className={styles.castContainer}>
                    <button
                        className={`${styles.controlBtn} ${player.isCasting ? styles.active : ''}`}
                        onClick={() => setIsCastMenuOpen(!isCastMenuOpen)}
                        title="Cast to Device"
                    >
                        <Cast size={20} />
                    </button>

                    {isCastMenuOpen && (
                        <div className={styles.castMenu}>
                            <div className={styles.castMenuHeader}>
                                <h3>Cast to device</h3>
                                <div className={styles.scanning} title="Scanning for devices..." />
                            </div>
                            <ul className={styles.castMenuList}>
                                {castDevices.length === 0 ? (
                                    <div className={styles.emptyDevices}>No devices found</div>
                                ) : (
                                    castDevices.map((device) => (
                                        <li
                                            key={device.id}
                                            className={`${styles.castMenuItem} ${player.castDevice?.id === device.id ? styles.active : ''}`}
                                            onClick={() => {
                                                if (player.castDevice?.id === device.id) {
                                                    disconnectCast();
                                                } else {
                                                    connectCast(device.id);
                                                }
                                                setIsCastMenuOpen(false);
                                            }}
                                        >
                                            <Cast size={18} />
                                            <div className={styles.deviceInfo}>
                                                <div className={styles.deviceName}>{device.friendlyName}</div>
                                                <div className={styles.deviceStatus}>
                                                    {player.castDevice?.id === device.id ? 'Connected' : 'Click to connect'}
                                                </div>
                                            </div>
                                        </li>
                                    ))
                                )}
                                {player.isCasting && (
                                    <li
                                        className={styles.castMenuItem}
                                        style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--error-primary)' }}
                                        onClick={() => {
                                            disconnectCast();
                                            setIsCastMenuOpen(false);
                                        }}
                                    >
                                        <div className={styles.deviceInfo}>
                                            <div className={styles.deviceName}>Disconnect</div>
                                        </div>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
                <button
                    className={`${styles.controlBtn} ${isQueueVisible ? styles.active : ''}`}
                    onClick={toggleQueue}
                    title="Queue"
                >
                    <List size={20} />
                </button>
                <button className={styles.controlBtn} onClick={toggleMiniPlayer} title="Mini Player">
                    <Minimize2 size={20} />
                </button>
            </div>
        </div >
    );
}
