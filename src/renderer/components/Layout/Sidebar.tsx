import { useState } from 'react';
import { useStore } from '../../store/store';
import type { ViewType } from '../../../shared/types';
import { Library, ListMusic, Radio, Music, User, Settings, Plus, Check, X } from 'lucide-react';
import styles from './Sidebar.module.css';

export function Sidebar() {
    const {
        currentView,
        setView,
        playlists,
        selectPlaylist,
        auth,
        toggleSettings,
        createPlaylist
    } = useStore();

    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');

    const handleCreateClick = () => {
        setIsCreating(true);
    };

    const handleCreateSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (newPlaylistName.trim()) {
            await createPlaylist(newPlaylistName.trim());
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const handleCreateCancel = () => {
        setIsCreating(false);
        setNewPlaylistName('');
    };

    const navItems: { view: ViewType; label: string; icon: React.ReactNode }[] = [
        { view: 'collection', label: 'Collection', icon: <Library size={20} /> },
        { view: 'artists', label: 'Artists', icon: <User size={20} /> },
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
                    {isCreating ? (
                        <form className={styles.createFormInline} onSubmit={handleCreateSubmit}>
                            <input
                                className={styles.createInputInline}
                                type="text"
                                placeholder="Playlist name..."
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') handleCreateCancel();
                                }}
                            />
                            <div className={styles.createActionsInline}>
                                <button type="submit" title="Save"><Check size={16} /></button>
                                <button type="button" onClick={handleCreateCancel} title="Cancel"><X size={16} /></button>
                            </div>
                        </form>
                    ) : (
                        <>
                            <h3>Your Playlists</h3>
                            <button
                                className={styles.addButton}
                                onClick={handleCreateClick}
                                title="Create Playlist"
                            >
                                <Plus size={18} />
                            </button>
                        </>
                    )}
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
