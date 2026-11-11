import { useEffect, useId, useRef, useState } from 'react';
import { Check, Grid2X2, Grid3X3, LayoutGrid, Rows2, Rows3, Square } from 'lucide-react';
import type { CollectionViewMode, CoverSize } from '../../../shared/types';
import styles from './ViewLayoutControl.module.css';

interface ViewLayoutControlProps {
    viewMode: CollectionViewMode;
    coverSize: CoverSize;
    onViewModeChange: (mode: CollectionViewMode) => void;
    onCoverSizeChange: (size: CoverSize) => void;
    testIdPrefix?: string;
}

export function ViewLayoutControl({
    viewMode,
    coverSize,
    onViewModeChange,
    onCoverSizeChange,
    testIdPrefix,
}: ViewLayoutControlProps) {
    const [open, setOpen] = useState(false);
    const [offset, setOffset] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const testId = (suffix: string) => testIdPrefix ? `${testIdPrefix}-${suffix}` : suffix;
    const closeAndFocus = () => {
        setOpen(false);
        triggerRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const dismiss = (event: MouseEvent | FocusEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        const position = () => {
            const root = rootRef.current?.getBoundingClientRect();
            const popover = popoverRef.current;
            if (!root || !popover) return;
            const left = root.right - popover.offsetWidth;
            setOffset(Math.max(8 - left, Math.min(0, window.innerWidth - 8 - root.right)));
        };
        position();
        popoverRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
        document.addEventListener('mousedown', dismiss);
        document.addEventListener('focusin', dismiss);
        rootRef.current?.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', position);
        const root = rootRef.current;
        return () => {
            document.removeEventListener('mousedown', dismiss);
            document.removeEventListener('focusin', dismiss);
            root?.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', position);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={styles.root}>
            <button
                ref={triggerRef}
                type="button"
                className={styles.trigger}
                title="Layout and cover size"
                aria-label="Layout and cover size"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                data-testid={testId('view-toggle-btn')}
                onClick={() => setOpen(value => !value)}
            >
                {viewMode === 'list' ? <Rows3 size={14} /> : <LayoutGrid size={14} />}
            </button>
            {open && (
                <div id={id} ref={popoverRef} className={styles.popover} style={{ transform: `translateX(${offset}px)` }}>
                    <div role="group" aria-labelledby={`${id}-layout`}>
                        <div id={`${id}-layout`} className={styles.label}>Layout</div>
                        {(['grid', 'list'] as const).map(mode => {
                            const Icon = mode === 'grid' ? LayoutGrid : Rows3;
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    className={styles.option}
                                    aria-pressed={viewMode === mode}
                                    data-testid={testId(`view-${mode}-btn`)}
                                    onClick={() => { onViewModeChange(mode); closeAndFocus(); }}
                                >
                                    <span className={styles.check}>{viewMode === mode && <Check size={10} strokeWidth={3} />}</span>
                                    <Icon size={13} />
                                    {mode === 'grid' ? 'Grid' : 'List'}
                                </button>
                            );
                        })}
                    </div>
                    <div className={styles.divider} />
                    <div role="group" aria-labelledby={`${id}-size`}>
                        <div id={`${id}-size`} className={styles.label}>{viewMode === 'list' ? 'Thumbnail Size' : 'Cover Size'}</div>
                        {([
                            { size: 'small', icon: viewMode === 'list' ? Rows3 : Grid3X3 },
                            { size: 'medium', icon: viewMode === 'list' ? Rows2 : Grid2X2 },
                            { size: 'large', icon: Square },
                        ] as const).map(({ size, icon: Icon }) => (
                            <button
                                key={size}
                                type="button"
                                className={styles.option}
                                aria-pressed={coverSize === size}
                                data-testid={testId(`cover-${size}-btn`)}
                                onClick={() => { onCoverSizeChange(size); closeAndFocus(); }}
                            >
                                <span className={styles.check}>{coverSize === size && <Check size={10} strokeWidth={3} />}</span>
                                <Icon size={13} />
                                {size.charAt(0).toUpperCase() + size.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
