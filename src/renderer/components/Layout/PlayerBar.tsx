import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store/store';
import {
    Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
    VolumeX, Volume1, Volume2, List, Minimize2, Cast, ListPlus
} from 'lucide-react';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import styles from './PlayerBar.module.css';

export function PlayerBar() {
    const {
        player,
        queue,
        settings,
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
        selectArtist,
        navigateToAlbumFromTrack,
        knownArtists,
        knownAlbums,
        addTrackToPlaylist,
    } = useStore();

    const audio1Ref = useRef<HTMLAudioElement>(null);
    const audio2Ref = useRef<HTMLAudioElement>(null);
    const activeAudioRef = useRef<1 | 2>(1);
    const hasRequestedNextRef = useRef<boolean>(false);
    const fadeOutIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const progressRef = useRef<HTMLDivElement>(null);
    const volumeRef = useRef<HTMLDivElement>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverVolume, setHoverVolume] = useState<number | null>(null);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const [isCastMenuOpen, setIsCastMenuOpen] = useState(false);
    const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);

    const { isPlaying, currentTrack, currentTime, duration, volume, isMuted, isShuffled, repeatMode } = player;

    const crossfadeEnabled = settings?.crossfadeEnabled || false;
    const crossfadeDuration = settings?.crossfadeDuration || 0;

    const clearFades = useCallback(() => {
        if (fadeOutIntervalRef.current) clearInterval(fadeOutIntervalRef.current);
        if (fadeInIntervalRef.current) clearInterval(fadeInIntervalRef.current);
    }, []);

    const fadeAudio = useCallback((audio: HTMLAudioElement, startVol: number, endVol: number, durationSec: number, onComplete?: () => void) => {
        if (durationSec <= 0) {
            audio.volume = endVol;
            if (onComplete) onComplete();
            return;
        }

        const steps = 20;
        const stepTime = (durationSec * 1000) / steps;
        const volStep = (endVol - startVol) / steps;
        let currentStep = 0;
        audio.volume = startVol;

        const interval = setInterval(() => {
            currentStep++;
            let newVol = startVol + (volStep * currentStep);
            newVol = Math.max(0, Math.min(1, newVol));
            audio.volume = newVol;

            if (currentStep >= steps) {
                clearInterval(interval);
                if (onComplete) onComplete();
            }
        }, stepTime);

        return interval;
    }, []);

    // Sync audio element with player state
    useEffect(() => {
        const nextAudioNode = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;
        const currentAudioNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;

        if (!nextAudioNode || !currentAudioNode) return;

        if (currentTrack) {
            if (nextAudioNode.src !== currentTrack.streamUrl && currentAudioNode.src !== currentTrack.streamUrl) {
                activeAudioRef.current = activeAudioRef.current === 1 ? 2 : 1;
                hasRequestedNextRef.current = false;

                nextAudioNode.src = currentTrack.streamUrl;
                clearFades();

                const targetVolume = isMuted ? 0 : Math.pow(volume, 3);

                if (crossfadeEnabled && crossfadeDuration > 0 && isPlaying && currentAudioNode.src && !currentAudioNode.paused) {
                    fadeInIntervalRef.current = fadeAudio(nextAudioNode, 0, targetVolume, crossfadeDuration);
                    fadeOutIntervalRef.current = fadeAudio(currentAudioNode, currentAudioNode.volume, 0, crossfadeDuration, () => {
                        currentAudioNode.pause();
                        currentAudioNode.src = '';
                    });
                } else {
                    nextAudioNode.volume = targetVolume;
                    currentAudioNode.pause();
                    currentAudioNode.src = '';
                }

                if (isPlaying && !player.isCasting) {
                    nextAudioNode.play().catch(error => {
                        if (error.name !== 'AbortError') console.error('Playback error:', error);
                    });
                } else {
                    nextAudioNode.pause();
                }
            }
        } else {
            audio1Ref.current?.pause();
            audio2Ref.current?.pause();
            if (audio1Ref.current) audio1Ref.current.src = '';
            if (audio2Ref.current) audio2Ref.current.src = '';
            clearFades();
        }
    }, [currentTrack, clearFades, crossfadeDuration, crossfadeEnabled, fadeAudio, isMuted, isPlaying, player.isCasting, volume]);

    useEffect(() => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (!activeNode) return;

        if (isPlaying && !player.isCasting) {
            if (activeNode.src) {
                activeNode.play().catch(e => {
                    if (e.name !== 'AbortError') console.error('Play error:', e);
                });
            }
        } else {
            activeNode.pause();
            const otherNode = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;
            if (otherNode) otherNode.pause();
            clearFades();
        }
    }, [isPlaying, player.isCasting, clearFades]);

    useEffect(() => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (activeNode) {
            activeNode.volume = isMuted ? 0 : Math.pow(volume, 3);
        }
    }, [volume, isMuted]);

    // Handle audio time updates
    useEffect(() => {
        const audio1 = audio1Ref.current;
        const audio2 = audio2Ref.current;
        if (!audio1 || !audio2) return;

        const attachListeners = (nodeNum: 1 | 2, audioNode: HTMLAudioElement) => {
            const handleTimeUpdate = () => {
                if (activeAudioRef.current !== nodeNum || player.isCasting) return;

                window.electron.player.updateTime(audioNode.currentTime, audioNode.duration);

                const remaining = audioNode.duration - audioNode.currentTime;
                if (crossfadeEnabled && crossfadeDuration > 0 && remaining > 0) {
                    const hasNextTrack = player.repeatMode !== 'off' || (queue?.currentIndex ?? 0) < (queue?.items?.length ?? 0) - 1;

                    if (hasNextTrack && remaining <= crossfadeDuration && !hasRequestedNextRef.current) {
                        hasRequestedNextRef.current = true;
                        window.electron.player.trackEnded();
                    }
                }
            };

            const handleLoadedMetadata = () => {
                if (activeAudioRef.current !== nodeNum) return;
                window.electron.player.updateTime(audioNode.currentTime, audioNode.duration);
            };

            const handleEnded = () => {
                if (activeAudioRef.current !== nodeNum) return;
                if (!hasRequestedNextRef.current) {
                    hasRequestedNextRef.current = true;
                    window.electron.player.trackEnded();
                }
            };

            const handleError = (e: Event) => {
                const target = e.target as HTMLAudioElement;
                const srcAttr = target.getAttribute('src');
                if (target.error?.code === 4 && (srcAttr === '' || srcAttr === null)) return;
                if (target.error?.message?.includes('Empty src')) return;
                console.error('[PlayerBar] Audio playback error:', target.error, 'src:', srcAttr);
                window.electron.player.reportPlaybackError(currentTrack?.id);
            };

            audioNode.addEventListener('timeupdate', handleTimeUpdate);
            audioNode.addEventListener('loadedmetadata', handleLoadedMetadata);
            audioNode.addEventListener('ended', handleEnded);
            audioNode.addEventListener('error', handleError);

            return () => {
                audioNode.removeEventListener('timeupdate', handleTimeUpdate);
                audioNode.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audioNode.removeEventListener('ended', handleEnded);
                audioNode.removeEventListener('error', handleError);
            };
        };

        const cleanup1 = attachListeners(1, audio1);
        const cleanup2 = attachListeners(2, audio2);

        return () => {
            cleanup1();
            cleanup2();
        };
    }, [crossfadeEnabled, crossfadeDuration, queue?.currentIndex, queue?.items?.length, player.repeatMode, player.isCasting, currentTrack?.id]);

    useEffect(() => {
        const unsubscribe = window.electron.player.onSeek((time) => {
            const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
            if (activeNode && Math.abs(activeNode.currentTime - time) > 0.5) {
                activeNode.currentTime = time;
            }
        });
        return () => {
            unsubscribe();
        };
    }, []);

    // Keep local audio in sync with Chromecast progress for seamless handover
    useEffect(() => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (player.isCasting && activeNode && Math.abs(activeNode.currentTime - currentTime) > 1) {
            activeNode.currentTime = currentTime;
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
            const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
            if (details.seekTime !== undefined && activeNode) {
                activeNode.currentTime = details.seekTime;
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
        if (!('mediaSession' in navigator)) return;

        if (!currentTrack) {
            navigator.mediaSession.playbackState = 'none';
        } else {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }, [isPlaying, currentTrack]);

    // Update Media Session position state for OS controls/scrubbing
    useEffect(() => {
        if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;

        if (duration && !isNaN(duration) && duration > 0) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: duration,
                    playbackRate: 1.0,
                    position: Math.max(0, Math.min(currentTime, duration)),
                });
            } catch {
                // Ignore invalid duration/position state errors if browser rejects invalid numbers
            }
        }
    }, [currentTime, duration]);

    // Manage Cast discovery when cast menu is toggled
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

    // Never leave the playlist picker open for a track that is no longer loaded
    useEffect(() => {
        if (!currentTrack) setIsAddToPlaylistOpen(false);
    }, [currentTrack]);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const activeNode = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
        if (!progressRef.current || !duration || !activeNode) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekTime = percent * duration;
        activeNode.currentTime = seekTime;
        seek(seekTime);
    }, [duration, seek]);

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
            {/* Dual Audio Elements for Crossfade */}
            <audio ref={audio1Ref} />
            <audio ref={audio2Ref} />

            {/* Track info */}
            <div className={styles.trackInfo}>
                {currentTrack ? (
                    <>
                        <div className={styles.artwork}>
                            <img src={currentTrack.artworkUrl} alt="" />
                        </div>
                        <div className={styles.trackDetails}>
                            <div className={styles.trackTitle}>{currentTrack.title}</div>
                            <div
                                className={`${styles.trackArtist} ${knownArtists.has(currentTrack.artist) ? styles.link : ''}`}
                                onClick={(e) => {
                                    if (!knownArtists.has(currentTrack.artist)) return;
                                    e.stopPropagation();
                                    selectArtist(currentTrack.artist);
                                }}
                                title={knownArtists.has(currentTrack.artist) ? "Go to artist" : undefined}
                            >
                                {currentTrack.artist}
                            </div>
                            {currentTrack.album && (
                                <div
                                    className={`${styles.trackAlbum} ${knownAlbums.has(`${currentTrack.artist}|${currentTrack.album}`) ? styles.link : ''}`}
                                    onClick={(e) => {
                                        if (!knownAlbums.has(`${currentTrack.artist}|${currentTrack.album}`)) return;
                                        e.stopPropagation();
                                        navigateToAlbumFromTrack(currentTrack);
                                    }}
                                    title={knownAlbums.has(`${currentTrack.artist}|${currentTrack.album}`) ? "Go to album" : undefined}
                                >
                                    {currentTrack.album}
                                </div>
                            )}
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
                        data-testid="player-shuffle-btn"
                    >
                        <Shuffle size={18} />
                    </button>
                    <button className={styles.controlBtn} onClick={previous} title="Previous" data-testid="player-prev-btn">
                        <SkipBack size={20} fill="currentColor" />
                    </button>
                    <button className={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'} data-testid="player-play-btn">
                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    <button className={styles.controlBtn} onClick={next} title="Next" data-testid="player-next-btn">
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
                        data-testid="player-repeat-btn"
                    >
                        {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                    </button>
                    <button
                        className={styles.controlBtn}
                        onClick={() => setIsAddToPlaylistOpen(true)}
                        disabled={!currentTrack}
                        title={currentTrack ? 'Add to Playlist' : 'No track playing'}
                        data-testid="player-add-to-playlist-btn"
                    >
                        <ListPlus size={20} />
                    </button>
                    <div className={styles.volumeControls}>
                        <button className={styles.volumeBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
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
                    </div>
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
            {/* extras */}
            <div className={styles.extras}>
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
                    data-testid="player-queue-btn"
                >
                    <List size={20} />
                </button>
                <button className={styles.controlBtn} onClick={toggleMiniPlayer} title="Mini Player" data-testid="player-mini-btn">
                    <Minimize2 size={20} />
                </button>
            </div>

            <AddToPlaylistModal
                isOpen={isAddToPlaylistOpen && !!currentTrack}
                onClose={() => setIsAddToPlaylistOpen(false)}
                onSelectPlaylist={async (playlistId) => {
                    if (!currentTrack) return;
                    await addTrackToPlaylist(playlistId, currentTrack);
                    setIsAddToPlaylistOpen(false);
                }}
            />
        </div >
    );
}
