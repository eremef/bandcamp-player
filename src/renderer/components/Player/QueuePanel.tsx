import { useState } from 'react';
import { useStore } from '../../store/store';
import { X, Play, Trash2 } from 'lucide-react';
import styles from './QueuePanel.module.css';

export function QueuePanel() {
    const { queue, player, playQueueIndex, removeFromQueue, clearQueue, toggleQueue, reorderQueue } = useStore();

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragStart = (index: number) => {
        setDragIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = (toIndex: number) => {
        if (dragIndex !== null && dragIndex !== toIndex) {
            reorderQueue(dragIndex, toIndex);
        }
        setDragIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDragIndex(null);
        setDragOverIndex(null);
    };

    return (
        <div className={styles.panel}>
            <header className={styles.header}>
                <h2>Queue</h2>
                <div className={styles.headerActions}>
                    <button className={styles.clearBtn} onClick={() => clearQueue(false)} title="Clear queue">
                        Clear
                    </button>
                    <button className={styles.closeBtn} onClick={toggleQueue} title="Close">
                        <X size={18} />
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
                                className={[
                                    styles.item,
                                    index === queue.currentIndex ? styles.current : '',
                                    index < queue.currentIndex ? styles.played : '',
                                    dragOverIndex === index ? styles.dragOver : '',
                                    dragIndex === index ? styles.dragging : '',
                                ].filter(Boolean).join(' ')}
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={() => handleDrop(index)}
                                onDragEnd={handleDragEnd}
                                onDoubleClick={() => playQueueIndex(index)}
                            >
                                <button
                                    className={styles.playBtn}
                                    onClick={() => playQueueIndex(index)}
                                    title="Play"
                                >
                                    {index === queue.currentIndex && player.isPlaying ? (
                                        <span className={styles.playing}><Play size={14} fill="currentColor" /></span>
                                    ) : (
                                        <span className={styles.trackNumber}>{index + 1}.</span>
                                    )}
                                </button>
                                <img src={item.track.artworkUrl} alt="" className={styles.artwork} />
                                <div className={styles.trackInfo}>
                                    {/* <img src={item.track.artworkUrl} alt="" className={styles.artwork} /> */}
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
                                    <Trash2 size={16} />
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
