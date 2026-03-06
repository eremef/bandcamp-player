import { WifiOff } from 'lucide-react';
import styles from './NoInternetDialog.module.css';

interface NoInternetDialogProps {
    onEnableOfflineMode: () => void;
    onQuit: () => void;
}

export function NoInternetDialog({ onEnableOfflineMode, onQuit }: NoInternetDialogProps) {
    return (
        <div className={styles.overlay}>
            <div className={styles.dialog}>
                <div className={styles.iconWrapper}>
                    <WifiOff size={40} className={styles.icon} />
                </div>

                <div className={styles.content}>
                    <h2 className={styles.title}>No Internet Connection</h2>
                    <p className={styles.message}>
                        Beta Player could not reach the internet. To continue, you must
                        enable <strong>Offline Mode</strong> — only locally cached tracks
                        will be available.
                    </p>
                    <p className={styles.hint}>
                        You can disable Offline Mode later from{' '}
                        <em>Settings → Offline Cache</em> once your connection is restored.
                    </p>
                </div>

                <div className={styles.actions}>
                    <button
                        className={styles.primaryButton}
                        onClick={onEnableOfflineMode}
                        autoFocus
                    >
                        <WifiOff size={16} />
                        Enable Offline Mode
                    </button>
                    <button
                        className={styles.secondaryButton}
                        onClick={onQuit}
                    >
                        Quit App
                    </button>
                </div>
            </div>
        </div>
    );
}
