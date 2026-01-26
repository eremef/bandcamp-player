import { useStore } from '../../store/store';
import type { ViewType } from '../../../shared/types';
import { Library, ListMusic, Radio, Music, User, Settings, Plus } from 'lucide-react';
import styles from './Sidebar.module.css';

export function Sidebar() {
    const {
        currentView,
        setView,
        playlists,
        selectPlaylist,
        auth,
        toggleSettings,
    } = useStore();

    const navItems: { view: ViewType; label: string; icon: React.ReactNode }[] = [
        { view: 'collection', label: 'Collection', icon: <Library size={20} /> },
        { view: 'playlists', label: 'Playlists', icon: <ListMusic size={20} /> },
        { view: 'radio', label: 'Radio', icon: <Radio size={20} /> },
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
                        <Plus size={18} />
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
                                <span className={styles.playlistIcon}><Music size={16} /></span>
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
                            <User size={24} />
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
                        <Settings size={20} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
