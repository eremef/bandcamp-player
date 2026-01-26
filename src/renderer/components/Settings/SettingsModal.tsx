import { useState, useEffect } from 'react';
import { useStore } from '../../store/store';
import { X, Trash2, Music, User, LogOut } from 'lucide-react';
import styles from './SettingsModal.module.css';
import { QRCodeCanvas } from 'qrcode.react';

interface SettingsModalProps {
    onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
    const {
        settings,
        updateSettings,
        lastfm,
        connectLastfm,
        disconnectLastfm,
        cacheStats,
        clearCache,
        fetchCacheStats,
        auth,
        logout,
        remoteStatus,
        fetchRemoteStatus,
    } = useStore();

    const [appVersion, setAppVersion] = useState<string>('1.0.0');

    useEffect(() => {
        window.electron.system.getAppVersion().then(setAppVersion);
    }, []);

    // Fetch cache stats on mount
    if (!cacheStats) {
        fetchCacheStats();
    }

    // Fetch remote status on mount
    if (!remoteStatus && settings?.remoteEnabled) {
        fetchRemoteStatus();
    }

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.header}>
                    <h2>Settings</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </header>

                <div className={styles.content}>
                    {/* Playback */}
                    <section className={styles.section}>
                        <h3>Playback</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Default Volume</span>
                                <span className={styles.settingValue}>{Math.round((settings?.defaultVolume || 0.8) * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={settings?.defaultVolume || 0.8}
                                onChange={(e) => updateSettings({ defaultVolume: parseFloat(e.target.value) })}
                            />
                        </div>
                    </section>

                    {/* Cache */}
                    <section className={styles.section}>
                        <h3>Offline Cache</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Enable Caching</span>
                                <span className={styles.settingHint}>Download tracks for offline playback</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.cacheEnabled ?? true}
                                    onChange={(e) => updateSettings({ cacheEnabled: e.target.checked })}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Max Cache Size</span>
                                <span className={styles.settingValue}>{settings?.cacheMaxSizeGB || 5} GB</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="50"
                                step="1"
                                value={settings?.cacheMaxSizeGB || 5}
                                onChange={(e) => updateSettings({ cacheMaxSizeGB: parseInt(e.target.value) })}
                            />
                        </div>
                        {cacheStats && (
                            <div className={styles.cacheInfo}>
                                <div className={styles.cacheBar}>
                                    <div
                                        className={styles.cacheFill}
                                        style={{ width: `${Math.min(cacheStats.usagePercent, 100)}%` }}
                                    />
                                </div>
                                <div className={styles.cacheStats}>
                                    <span>{formatBytes(cacheStats.totalSize)} / {formatBytes(cacheStats.maxSize)}</span>
                                    <span>{cacheStats.trackCount} tracks cached</span>
                                </div>
                                <button className={styles.clearCacheBtn} onClick={clearCache}>
                                    <Trash2 size={16} />
                                    <span>Clear Cache</span>
                                </button>
                            </div>
                        )}
                    </section>

                    {/* Last.fm */}
                    <section className={styles.section}>
                        <h3>Last.fm Scrobbling</h3>
                        {lastfm.isConnected && lastfm.user ? (
                            <div className={styles.lastfmConnected}>
                                <div className={styles.lastfmUser}>
                                    {lastfm.user.imageUrl && <img src={lastfm.user.imageUrl} alt="" />}
                                    <div>
                                        <span className={styles.lastfmName}>{lastfm.user.name}</span>
                                        <span className={styles.lastfmStatus}>Connected</span>
                                    </div>
                                </div>
                                <button className={styles.disconnectBtn} onClick={disconnectLastfm}>
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <div className={styles.lastfmDisconnected}>
                                <p>Connect your Last.fm account to scrobble tracks</p>
                                <button className={styles.connectBtn} onClick={connectLastfm}>
                                    <Music size={18} />
                                    <span>Connect to Last.fm</span>
                                </button>
                            </div>
                        )}
                        {lastfm.isConnected && (
                            <div className={styles.setting}>
                                <div className={styles.settingInfo}>
                                    <span className={styles.settingLabel}>Enable Scrobbling</span>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings?.scrobblingEnabled ?? true}
                                        onChange={(e) => updateSettings({ scrobblingEnabled: e.target.checked })}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>
                        )}
                    </section>

                    {/* Window */}
                    <section className={styles.section}>
                        <h3>Window</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Minimize to Tray</span>
                                <span className={styles.settingHint}>Keep running in the background</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.minimizeToTray ?? true}
                                    onChange={(e) => updateSettings({ minimizeToTray: e.target.checked })}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Start Minimized</span>
                                <span className={styles.settingHint}>Start application minimized to tray</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.startMinimized ?? false}
                                    onChange={(e) => updateSettings({ startMinimized: e.target.checked })}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Show Notifications</span>
                                <span className={styles.settingHint}>Display track change notifications</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.showNotifications ?? true}
                                    onChange={(e) => updateSettings({ showNotifications: e.target.checked })}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                    </section>

                    {/* Remote Control */}
                    <section className={styles.section}>
                        <h3>Remote Control</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Enable Remote Control</span>
                                <span className={styles.settingHint}>Control playback from your mobile device</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.remoteEnabled ?? false}
                                    onChange={(e) => updateSettings({ remoteEnabled: e.target.checked })}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>

                        {settings?.remoteEnabled && remoteStatus && (
                            <div className={styles.remoteInfo}>
                                <div className={styles.remoteDetails}>
                                    <div className={styles.remoteQr}>
                                        <QRCodeCanvas
                                            value={remoteStatus.url}
                                            size={128}
                                            bgColor="#ffffff"
                                            fgColor="#000000"
                                            level="L"
                                            includeMargin={true}
                                        />
                                    </div>
                                    <div className={styles.remoteText}>
                                        <p className={styles.remoteUrl}>{remoteStatus.url}</p>
                                        <p className={styles.remoteHint}>Scan this QR code or open the URL in your mobile browser</p>
                                        <div className={styles.remoteConnections}>
                                            <span className={remoteStatus.connections > 0 ? styles.connected : styles.disconnected}>
                                                ● {remoteStatus.connections} connected {remoteStatus.connections === 1 ? 'device' : 'devices'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Account */}
                    <section className={styles.section}>
                        <h3>Account</h3>
                        <div className={styles.userProfile}>
                            <div className={styles.userInfo}>
                                <div className={styles.userAvatar}>
                                    {auth.user?.avatarUrl ? (
                                        <img src={auth.user.avatarUrl} alt="" />
                                    ) : (
                                        <User size={32} />
                                    )}
                                </div>
                                <div className={styles.userDetails}>
                                    <span className={styles.userName}>{auth.user?.displayName || auth.user?.username || 'User'}</span>
                                    <span className={styles.userStatus}>Logged In</span>
                                </div>
                            </div>
                            <button
                                className={styles.logoutBtn}
                                onClick={() => {
                                    logout();
                                    onClose();
                                }}
                            >
                                <LogOut size={18} />
                                <span>Logout</span>
                            </button>
                        </div>
                    </section>

                    {/* About */}
                    <section className={styles.section}>
                        <h3>About</h3>
                        <div className={styles.about}>
                            <p><strong>Bandcamp Player</strong></p>
                            <p className={styles.version}>Version {appVersion}</p>
                            <p className={styles.copyright}>© {new Date().getFullYear()} Bandcamp Desktop Player</p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
