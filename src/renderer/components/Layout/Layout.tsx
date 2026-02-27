import { useStore } from '../../store/store';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '../Player/QueuePanel';
import { SettingsModal } from '../Settings/SettingsModal';
import { Toast } from '../UI/Toast';
import styles from './Layout.module.css';

export function Layout() {
    const { isQueueVisible, isSettingsOpen, toggleSettings } = useStore();

    return (
        <div className={styles.layout}>
            {/* Title bar drag region */}
            <div className={styles.titleBar}>
                <span className={styles.title}>Beta Player</span>
                <div className={styles.dragRegion} />
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
