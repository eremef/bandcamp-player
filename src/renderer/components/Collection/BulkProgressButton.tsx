import { MoreHorizontal, RefreshCw, X } from "lucide-react";
import { useStore } from "../../store/store";
import styles from "./CollectionView.module.css";

interface BulkProgressButtonProps {
  /** Toggles the caller's bulk action menu. Only called when idle. */
  onToggleMenu: () => void;
  title?: string;
  /** Idle-state class, so each view keeps its own button styling. */
  className?: string;
  iconSize?: number;
}

/**
 * The bulk-actions trigger, which turns into live progress plus a cancel
 * control while a bulk job runs.
 *
 * Renders only the button — the caller owns the positioned container so its
 * dropdown menu stays anchored.
 *
 * This is a separate component on purpose: it subscribes to `bulkJob` with a
 * narrow selector, so progress ticks re-render *only this button*. When the
 * progress lived in CollectionView's own state, every tick re-rendered the
 * whole (unvirtualized) item grid.
 */
export function BulkProgressButton({
  onToggleMenu,
  title = "Bulk actions for current view",
  className,
  iconSize = 18,
}: BulkProgressButtonProps) {
  const bulkJob = useStore((s) => s.bulkJob);
  const cancelBulkAction = useStore((s) => s.cancelBulkAction);

  if (bulkJob) {
    return (
      <button
        className={`${className ?? styles.bulkMoreButton} ${styles.isBulkOperating}`}
        onClick={() => void cancelBulkAction()}
        // "Stop adding" rather than "cancel": tracks already queued stay put.
        title={`Stop adding — ${bulkJob.completed} of ${bulkJob.total} done`}
        data-testid="bulk-progress"
      >
        <div className={styles.bulkProgressContainer}>
          <RefreshCw size={14} className={styles.spinning} />
          <span className={styles.bulkProgressText}>
            {bulkJob.completed}/{bulkJob.total}
          </span>
          <X size={14} />
        </div>
      </button>
    );
  }

  return (
    <button
      className={className ?? styles.bulkMoreButton}
      onClick={onToggleMenu}
      title={title}
    >
      <MoreHorizontal size={iconSize} />
    </button>
  );
}
