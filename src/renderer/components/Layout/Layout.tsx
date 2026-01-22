import { useStore } from '../../store/store';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '../Player/QueuePanel';
import { SettingsModal } from '../Settings/SettingsModal';
import styles from './Layout.module.css';

export function Layout() {
    const { isQueueVisible, isSettingsOpen, toggleSettings } = useStore();

    return (
        <div className={styles.layout}>
            {/* Title bar drag region */}
            <div className={styles.titleBar}>
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
            {isSettingsOpen && <SettingsModal onClose={toggleSettings} />}
        </div>
    );
}
