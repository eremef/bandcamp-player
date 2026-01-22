import { useStore } from '../../store/store';
import type { ViewType } from '../../../shared/types';
import styles from './Sidebar.module.css';

export function Sidebar() {
    const {
        currentView,
        setView,
        playlists,
        selectPlaylist,
        auth,
        logout,
        toggleSettings,
    } = useStore();

    const navItems: { view: ViewType; label: string; icon: string }[] = [
        { view: 'collection', label: 'Collection', icon: '📚' },
        { view: 'playlists', label: 'Playlists', icon: '📝' },
        { view: 'radio', label: 'Radio', icon: '📻' },
    ];

    return (
        <aside className={styles.sidebar}>
            {/* Navigation */}
            <nav className={styles.nav}>
                <ul className={styles.navList}>
                    {navItems.map((item) => (
                        <li key={item.view}>
                            <button
                                className={`${styles.navItem} ${currentView === item.view ? styles.active : ''}`}
                                onClick={() => setView(item.view)}
                            >
                                <span className={styles.navIcon}>{item.icon}</span>
                                <span className={styles.navLabel}>{item.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Playlists */}
            <div className={styles.playlists}>
                <div className={styles.playlistsHeader}>
                    <h3>Your Playlists</h3>
                    <button
                        className={styles.addButton}
                        onClick={() => {
                            const name = prompt('Playlist name:');
                            if (name) {
                                useStore.getState().createPlaylist(name);
                            }
                        }}
                        title="Create Playlist"
                    >
                        +
                    </button>
                </div>
                <ul className={styles.playlistList}>
                    {playlists.map((playlist) => (
                        <li key={playlist.id}>
                            <button
                                className={`${styles.playlistItem} ${currentView === 'playlist-detail' &&
                                        useStore.getState().selectedPlaylistId === playlist.id
                                        ? styles.active
                                        : ''
                                    }`}
                                onClick={() => selectPlaylist(playlist.id)}
                            >
                                <span className={styles.playlistIcon}>🎵</span>
                                <span className={styles.playlistName}>{playlist.name}</span>
                                <span className={styles.playlistCount}>{playlist.trackCount}</span>
                            </button>
                        </li>
                    ))}
                    {playlists.length === 0 && (
                        <li className={styles.emptyPlaylists}>
                            No playlists yet
                        </li>
                    )}
                </ul>
            </div>

            {/* User section */}
            <div className={styles.userSection}>
                <div className={styles.userInfo}>
                    <div className={styles.userAvatar}>
                        {auth.user?.avatarUrl ? (
                            <img src={auth.user.avatarUrl} alt="" />
                        ) : (
                            <span>👤</span>
                        )}
                    </div>
                    <div className={styles.userName}>
                        {auth.user?.displayName || auth.user?.username || 'User'}
                    </div>
                </div>
                <div className={styles.userActions}>
                    <button
                        className={styles.iconButton}
                        onClick={toggleSettings}
                        title="Settings"
                    >
                        ⚙️
                    </button>
                    <button
                        className={styles.iconButton}
                        onClick={logout}
                        title="Logout"
                    >
                        🚪
                    </button>
                </div>
            </div>
        </aside>
    );
}
