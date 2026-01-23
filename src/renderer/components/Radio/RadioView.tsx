import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store/store';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import styles from './RadioView.module.css';

export function RadioView() {
    const { radioStations, fetchRadioStations, playRadioStation, radioState, stopRadio } = useStore();
    const [visibleCount, setVisibleCount] = useState(20);

    const handleLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + 20);
    }, []);

    const targetRef = useIntersectionObserver({
        onIntersect: handleLoadMore,
        enabled: visibleCount < radioStations.length,
    });

    useEffect(() => {
        if (radioStations.length === 0) {
            fetchRadioStations();
        }
    }, [radioStations.length, fetchRadioStations]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <h1>📻 Bandcamp Radio</h1>
                    <p>Discover new music curated by Bandcamp</p>
                </div>
            </header>

            {/* Currently playing */}
            {radioState.isActive && radioState.currentStation && (
                <div className={styles.nowPlaying}>
                    <div className={styles.nowPlayingContent}>
                        <div className={styles.waveform}>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div className={styles.nowPlayingInfo}>
                            <span className={styles.nowPlayingLabel}>Now Playing</span>
                            <h3>{radioState.currentStation.name}</h3>
                            {radioState.currentTrack && (
                                <p>{radioState.currentTrack.title} - {radioState.currentTrack.artist}</p>
                            )}
                        </div>
                    </div>
                    <button className={styles.stopBtn} onClick={stopRadio}>
                        ⏹️ Stop
                    </button>
                </div>
            )}

            {/* Stations grid */}
            <div className={styles.grid}>
                {radioStations.slice(0, visibleCount).map((station) => (
                    <div
                        key={station.id}
                        className={`${styles.card} ${radioState.currentStation?.id === station.id ? styles.active : ''}`}
                        onClick={() => playRadioStation(station)}
                    >
                        <div className={styles.cardImage}>
                            {station.imageUrl ? (
                                <img src={station.imageUrl} alt="" loading="lazy" />
                            ) : (
                                <div className={styles.placeholderImage}>📻</div>
                            )}
                            <div className={styles.cardOverlay}>
                                <button className={styles.playBtn}>
                                    {radioState.currentStation?.id === station.id ? '⏸️' : '▶️'}
                                </button>
                            </div>
                        </div>
                        <div className={styles.cardInfo}>
                            <h3 className={styles.cardTitle}>{station.name}</h3>
                            {station.description && (
                                <p className={styles.cardDescription}>{station.description}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {visibleCount < radioStations.length && (
                <div ref={targetRef} className={styles.loadMoreContainer} style={{ height: '20px', margin: '20px 0' }}>
                    {/* Sentinel element for infinite scroll */}
                </div>
            )}

            {radioStations.length === 0 && (
                <div className={styles.loading}>
                    <div className="spinner" />
                    <p>Loading radio stations...</p>
                </div>
            )}
        </div>
    );
}
