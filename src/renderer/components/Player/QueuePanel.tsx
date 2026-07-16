import { useState, forwardRef, useRef, useEffect } from 'react';
import { useStore } from '../../store/store';
import { X, Play, Trash2 } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import styles from './QueuePanel.module.css';

interface DraggableQueueItemProps extends React.HTMLAttributes<HTMLLIElement> {
    index: number;
    _item: any;
    dragIndex: number | null;
    dragOverIndex: number | null;
    currentIndex: number;
    onDragStartItem: (index: number) => void;
    onDragOverItem: (e: React.DragEvent, index: number) => void;
    onDropItem: (index: number) => void;
    onDragEndItem: () => void;
    onDoubleClickItem: (index: number) => void;
}

const DraggableQueueItem = forwardRef<HTMLLIElement, DraggableQueueItemProps>(({
    index, _item, dragIndex, dragOverIndex, currentIndex, onDragStartItem, onDragOverItem, onDropItem, onDragEndItem, onDoubleClickItem, className, children, ...rest
}, ref) => {
    const isDragOver = dragOverIndex === index;

    return (
        <li
            {...rest}
            ref={ref}
            className={[
                className,
                styles.item,
                index === currentIndex ? styles.current : '',
                index < currentIndex ? styles.played : '',
                isDragOver ? styles.dragOver : '',
                dragIndex === index ? styles.dragging : '',
            ].filter(Boolean).join(' ')}
            draggable
            onDragStart={() => onDragStartItem(index)}
            onDragOver={(e) => onDragOverItem(e, index)}
            onDrop={(e) => {
                e.preventDefault();
                onDropItem(index);
            }}
            onDragEnd={onDragEndItem}
            onDoubleClick={() => onDoubleClickItem(index)}
        >
            {children}
        </li>
    );
});
DraggableQueueItem.displayName = 'DraggableQueueItem';

const VirtuosoList = forwardRef<HTMLDivElement, any>((props, ref) => (
    <div {...props} ref={ref} className={styles.list} style={props.style} />
));
VirtuosoList.displayName = 'VirtuosoList';

const VirtuosoItem = forwardRef<HTMLLIElement, any>((props, ref) => {
    const { context } = props;
    const index = props['data-index'] as number;
    const item = context.queueItems[index];

    return (
        <DraggableQueueItem
            {...props}
            ref={ref}
            index={index}
            _item={item}
            dragIndex={context.dragIndex}
            dragOverIndex={context.dragOverIndex}
            currentIndex={context.currentIndex}
            onDragStartItem={context.handleDragStart}
            onDragOverItem={context.handleDragOver}
            onDropItem={context.handleDrop}
            onDragEndItem={context.handleDragEnd}
            onDoubleClickItem={context.playQueueIndex}
        />
    );
});
VirtuosoItem.displayName = 'VirtuosoItem';

const VirtuosoQueueFooter = ({ context }: any) => (
    <div
        onDragOver={(e) => { e.preventDefault(); context.setDragOverIndex(context.totalItems); }}
        onDrop={(e) => {
            e.preventDefault();
            context.handleDropSentinel();
        }}
        onDragLeave={() => { if (context.dragOverIndex === context.totalItems) context.setDragOverIndex(null); }}
        style={{
            minHeight: '24px',
            width: '100%',
            borderTop: context.dragOverIndex === context.totalItems
                ? '3px solid var(--accent-primary)'
                : '3px solid transparent',
            transition: 'border-color 0.1s',
        }}
    />
);
VirtuosoQueueFooter.displayName = 'VirtuosoQueueFooter';


export function QueuePanel() {
    const { queue, player, playQueueIndex, removeFromQueue, clearQueue, toggleQueue, reorderQueue, selectArtist, navigateToAlbumFromTrack, settings, updateSettings } = useStore();

    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [width, setWidth] = useState(settings?.queueWidth ?? 300);
    const isResizing = useRef(false);
    const currentWidth = useRef(width);

    useEffect(() => {
        if (settings?.queueWidth && !isResizing.current) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setWidth(settings.queueWidth);
        }
    }, [settings?.queueWidth]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.max(250, Math.min(800, window.innerWidth - e.clientX));
            setWidth(newWidth);
            currentWidth.current = newWidth;
        };
        
        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            updateSettings({ queueWidth: currentWidth.current });
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

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
            const adjustedToIndex = dragIndex < toIndex ? toIndex - 1 : toIndex;
            reorderQueue(dragIndex, adjustedToIndex);
        }
        setDragIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDragIndex(null);
        setDragOverIndex(null);
    };

    const handleDropSentinel = () => {
        const toIndex = queue.items.length - 1;
        if (dragIndex !== null && dragIndex !== toIndex) {
            reorderQueue(dragIndex, toIndex);
        }
        setDragIndex(null);
        setDragOverIndex(null);
    };

    return (
        <div className={styles.panel} style={{ width }}>
            <div className={styles.resizer} onMouseDown={handleMouseDown} />
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
                    <Virtuoso
                        data={queue.items}
                        style={{ height: '100%' }}
                        initialItemCount={Math.min(queue.items.length, 50)}
                        context={{
                            queueItems: queue.items,
                            currentIndex: queue.currentIndex,
                            dragIndex,
                            dragOverIndex,
                            totalItems: queue.items.length,
                            handleDragStart,
                            handleDragOver,
                            handleDrop,
                            handleDragEnd,
                            playQueueIndex,
                            setDragOverIndex,
                            handleDropSentinel
                        }}
                        components={{
                            List: VirtuosoList as any,
                            Item: VirtuosoItem as any,
                            Footer: VirtuosoQueueFooter
                        }}
                        itemContent={(index, item) => (
                            <>
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
                                    <div className={styles.details}>
                                        <span className={styles.title}>{item.track.title}</span>
                                        <span
                                            className={`${styles.artist} ${styles.link}`}
                                            onClick={(e) => { e.stopPropagation(); selectArtist(item.track.artist); }}
                                        >
                                            {item.track.artist}
                                        </span>
                                        {item.track.album && (
                                            <span
                                                className={`${styles.album} ${styles.link}`}
                                                onClick={(e) => { e.stopPropagation(); navigateToAlbumFromTrack(item.track); }}
                                            >
                                                {item.track.album}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className={styles.removeBtn}
                                    onClick={() => removeFromQueue(item.id)}
                                    title="Remove"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                    />
                )}
            </div>

            <footer className={styles.footer}>
                <span>{queue.items.length} tracks</span>
            </footer>
        </div>
    );
}
