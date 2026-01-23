import { useStore } from '../../store/store';
import styles from './QueuePanel.module.css';

export function QueuePanel() {
    const { queue, player, playQueueIndex, removeFromQueue, clearQueue, toggleQueue } = useStore();

    return (
        <div className={styles.panel}>
            <header className={styles.header}>
                <h2>Queue</h2>
                <div className={styles.headerActions}>
                    <button className={styles.clearBtn} onClick={() => clearQueue()} title="Clear queue">
                        Clear
                    </button>
                    <button className={styles.closeBtn} onClick={toggleQueue} title="Close">
                        ✕
                    </button>
                </div>
            </header>

            <div className={styles.content}>
                {queue.items.length === 0 ? (
                    <div className={styles.empty}>
                        <p>Queue is empty</p>
                        <p className={styles.emptyHint}>Add songs from your collection</p>
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {queue.items.map((item, index) => (
                            <li
                                key={item.id}
                                className={`${styles.item} ${index === queue.currentIndex
                                    ? styles.current
                                    : index < queue.currentIndex
                                        ? styles.played
                                        : ''
                                    }`}
                            >
                                <button
                                    className={styles.playBtn}
                                    onClick={() => playQueueIndex(index)}
                                    title="Play"
                                >
                                    {index === queue.currentIndex && player.isPlaying ? (
                                        <span className={styles.playing}>▶</span>
                                    ) : (
                                        <span className={styles.trackNumber}>{index + 1}</span>
                                    )}
                                </button>
                                <div className={styles.trackInfo}>
                                    <img src={item.track.artworkUrl} alt="" className={styles.artwork} />
                                    <div className={styles.details}>
                                        <span className={styles.title}>{item.track.title}</span>
                                        <span className={styles.artist}>{item.track.artist}</span>
                                    </div>
                                </div>
                                <button
                                    className={styles.removeBtn}
                                    onClick={() => removeFromQueue(item.id)}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <footer className={styles.footer}>
                <span>{queue.items.length} tracks</span>
            </footer>
        </div>
    );
}
