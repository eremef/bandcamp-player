import { useStore } from '../../store/store';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '../Player/QueuePanel';
import { SettingsModal } from '../Settings/SettingsModal';
import { Toast } from '../UI/Toast';
import styles from './Layout.module.css';

const isLinux = window.electron.system.platform === 'linux';

function WindowControls() {
    const { minimize, maximize, close } = window.electron.window;
    return (
        <div className={styles.windowControls}>
            <button className={styles.windowButton} onClick={minimize} title="Minimize">
                <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
            </button>
            <button className={styles.windowButton} onClick={maximize} title="Maximize">
                <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
            </button>
            <button className={`${styles.windowButton} ${styles.closeButton}`} onClick={close} title="Close">
                <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" /><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" /></svg>
            </button>
        </div>
    );
}

export function Layout() {
    const { isQueueVisible, isSettingsOpen, toggleSettings } = useStore();

    return (
        <div className={styles.layout}>
            {/* Title bar drag region */}
            <div className={styles.titleBar}>
                <span className={styles.title}>Beta Player</span>
                <div className={styles.dragRegion} />
                {isLinux && <WindowControls />}
            </div>

            {/* Main content area */}
            <div className={styles.main}>
                <Sidebar />
                <MainContent />
                {isQueueVisible && <QueuePanel />}
            </div>

            {/* Player bar */}
            <PlayerBar />

            {/* Settings modal */}
            {/* Settings modal */}
            {isSettingsOpen && <SettingsModal onClose={toggleSettings} />}

            {/* Toast notifications */}
            <Toast />
        </div>
    );
}
