import { useEffect } from 'react';
import { useStore } from '../../store/store';
import { SkipBack, Play, Pause, SkipForward, ExternalLink, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import styles from './MiniPlayer.module.css';

export function MiniPlayer() {
    const {
        player,
        togglePlay,
        toggleShuffle,
        setRepeat,
        next,
        previous,
        toggleMiniPlayer,
    } = useStore();

    const { isPlaying, currentTrack, isShuffled, repeatMode } = player;

    // Apply mini-player specific global styles on mount
    useEffect(() => {
        document.body.style.backgroundColor = 'transparent';
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.backgroundColor = '';
            document.body.style.overflow = '';
        };
    }, []);

    return (
        <div className={styles.miniPlayer}>
            {/* Drag Region */}
            <div className={styles.dragRegion} />

            <div className={styles.content}>
                {/* Artwork */}
                <div className={styles.artwork}>
                    {currentTrack ? (
                        <img src={currentTrack.artworkUrl} alt="" />
                    ) : (
                        <div className={styles.placeholderArt} />
                    )}
                </div>

                {/* Info */}
                <div className={styles.info}>
                    <div className={styles.title}>{currentTrack?.title || 'Not Playing'}</div>
                    <div className={styles.artist}>{currentTrack?.artist || 'Beta Player'}</div>
                </div>

                {/* Controls */}
                <div className={styles.controls}>
                    <button
                        className={`${styles.controlBtn} ${isShuffled ? styles.active : ''}`}
                        onClick={toggleShuffle}
                        title="Shuffle"
                        data-testid="player-shuffle-btn"
                    >
                        <Shuffle size={18} />
                    </button>
                    <button className={styles.controlBtn} onClick={previous} title="Previous">
                        <SkipBack size={18} fill="currentColor" />
                    </button>
                    <button className={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '1px' }} />}
                    </button>
                    <button className={styles.controlBtn} onClick={next} title="Next">
                        <SkipForward size={18} fill="currentColor" />
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
                </div>

                {/* Window Control */}
                <button className={styles.restoreBtn} onClick={toggleMiniPlayer} title="Restore to Main Window">
                    <ExternalLink size={16} />
                </button>
            </div>
        </div>
    );
}
