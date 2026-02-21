import { useState, useEffect } from 'react';
import { useStore } from '../../store/store';
import { X, Trash2, Music, User, LogOut, Copy, Check, RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './SettingsModal.module.css';
import { QRCodeCanvas } from 'qrcode.react';
import ConnectedDevicesModal from './ConnectedDevicesModal';

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
        updateStatus,
        checkForUpdates,
        installUpdate,
        remoteConfig,
        fetchRemoteConfig,
        refreshRemoteConfig,
    } = useStore();

    const [appVersion, setAppVersion] = useState<string>('1.0.0');
    const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showDevicesModal, setShowDevicesModal] = useState(false);

    useEffect(() => {
        window.electron.system.getAppVersion().then(setAppVersion);
        if (!remoteConfig) {
            fetchRemoteConfig();
        }
    }, []);

    const handleRefreshConfig = async () => {
        setIsRefreshingConfig(true);
        try {
            await refreshRemoteConfig();
        } finally {
            setIsRefreshingConfig(false);
        }
    };

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

    const handleOpenLink = (url: string) => {
        window.electron.system.openExternal(url);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const renderUpdateSection = () => {
        const { status, info, progress, error } = updateStatus;

        switch (status) {
            case 'checking':
                return (
                    <div className={styles.updateStatus}>
                        <RefreshCw size={16} className={styles.spin} />
                        <span>Checking for updates...</span>
                    </div>
                );
            case 'available':
                return (
                    <div className={styles.updateStatus}>
                        <Download size={16} />
                        <span>Update available: {info?.version}</span>
                        <button className={styles.updateBtn} disabled>Downloading...</button>
                    </div>
                );
            case 'downloading':
                return (
                    <div className={styles.updateStatus}>
                        <RefreshCw size={16} className={styles.spin} />
                        <span>Downloading update: {Math.round(progress?.percent || 0)}%</span>
                        <div className={styles.progressBar}>
                            <div className={styles.progressFill} style={{ width: `${progress?.percent || 0}%` }} />
                        </div>
                    </div>
                );
            case 'downloaded':
                return (
                    <div className={styles.updateStatus}>
                        <CheckCircle size={16} color="var(--accent-primary)" />
                        <span>Update downloaded!</span>
                        <button className={styles.installBtn} onClick={installUpdate}>
                            Restart & Install
                        </button>
                    </div>
                );
            case 'error':
                return (
                    <div className={styles.updateStatus}>
                        <AlertCircle size={16} color="#ff4444" />
                        <span className={styles.errorText}>Error: {error}</span>
                        <button className={styles.checkBtn} onClick={() => checkForUpdates(true)}>
                            Retry
                        </button>
                    </div>
                );
            case 'not-available':
                return (
                    <div className={styles.updateStatus}>
                        <CheckCircle size={16} color="var(--accent-primary)" />
                        <span>You&apos;re up to date!</span>
                        <button className={styles.checkBtn} onClick={() => checkForUpdates(true)}>
                            Check Again
                        </button>
                    </div>
                );
            default:
                return (
                    <button className={styles.checkBtn} onClick={() => checkForUpdates(true)}>
                        <RefreshCw size={16} />
                        <span>Check for Updates</span>
                    </button>
                );
        }
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
                    {/* Update Alert */}
                    {(updateStatus.status === 'available' || updateStatus.status === 'downloading' || updateStatus.status === 'downloaded') && (
                        <div className={`${styles.updateAlert} ${updateStatus.status === 'downloaded' ? styles.updateReady : ''}`}>
                            <div className={styles.updateAlertInfo}>
                                <AlertCircle size={20} />
                                <div>
                                    <span className={styles.updateAlertTitle}>
                                        {updateStatus.status === 'downloaded' ? 'Update Ready to Install' : 'New Version Available'}
                                    </span>
                                    <span className={styles.updateAlertVersion}>
                                        {updateStatus.info?.version ? `Version ${updateStatus.info.version}` : 'A new update is available'}
                                    </span>
                                </div>
                            </div>
                            <button
                                className={updateStatus.status === 'downloaded' ? styles.installBtnInline : styles.downloadBtnInline}
                                onClick={updateStatus.status === 'downloaded' ? installUpdate : undefined}
                                disabled={updateStatus.status !== 'downloaded'}
                            >
                                {updateStatus.status === 'downloaded' ? 'Restart & Install' : 'Downloading...'}
                            </button>
                        </div>
                    )}

                    {/* Appearance */}
                    <section className={styles.section}>
                        <h3>Appearance</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Theme</span>
                                <span className={styles.settingHint}>Choose application color theme</span>
                            </div>
                            <select
                                className={styles.selectInput}
                                value={settings?.theme || 'system'}
                                onChange={(e) => updateSettings({ theme: e.target.value as any })}
                            >
                                <option value="system">System Default</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
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
                        <div className={styles.apiConfig}>
                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>Last.fm API Key</label>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="Enter your API Key"
                                    value={settings?.lastfmApiKey || ''}
                                    onChange={(e) => updateSettings({ lastfmApiKey: e.target.value })}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>Last.fm API Secret</label>
                                <input
                                    type="password"
                                    className={styles.textInput}
                                    placeholder="Enter your API Secret"
                                    value={settings?.lastfmApiSecret || ''}
                                    onChange={(e) => updateSettings({ lastfmApiSecret: e.target.value })}
                                />
                            </div>
                            <p className={styles.settingHint}>
                                You can get your own API credentials at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>last.fm/api</a>
                            </p>
                        </div>
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
                                        <div className={styles.remoteUrlContainer}>
                                            <p className={styles.remoteUrl} onClick={() => handleOpenLink(remoteStatus.url)}>
                                                {remoteStatus.url}
                                            </p>
                                            <button
                                                className={styles.copyBtn}
                                                onClick={() => handleCopy(remoteStatus.url)}
                                                title="Copy to clipboard"
                                            >
                                                {copied ? <Check size={16} color="#4bb543" /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <p className={styles.remoteHint}>Scan this QR code or open the URL in your mobile browser</p>
                                        <div className={styles.remoteConnections} onClick={() => remoteStatus.connections > 0 && setShowDevicesModal(true)} style={remoteStatus.connections > 0 ? { cursor: 'pointer' } : {}}>
                                            <span className={remoteStatus.connections > 0 ? styles.connected : styles.disconnected}>
                                                ● {remoteStatus.connections} connected {remoteStatus.connections === 1 ? 'device' : 'devices'}
                                            </span>
                                            {remoteStatus.connections > 0 && (
                                                <span className={styles.manageLink}> (Manage)</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {showDevicesModal && (
                        <ConnectedDevicesModal onClose={() => setShowDevicesModal(false)} />
                    )}

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
                            <p><strong>Bandcamp Desktop Player</strong></p>
                            <p className={styles.version}>Version {appVersion}</p>
                            {remoteConfig && (
                                <p className={styles.version}>
                                    Config {remoteConfig.version}
                                    <button
                                        className={styles.inlineRefreshBtn}
                                        onClick={handleRefreshConfig}
                                        disabled={isRefreshingConfig}
                                        title="Refresh remote configuration"
                                    >
                                        <RefreshCw size={12} className={isRefreshingConfig ? styles.spin : ''} />
                                    </button>
                                </p>
                            )}
                            <div className={styles.updateContainer}>
                                {renderUpdateSection()}
                            </div>
                            <p className={styles.copyright} onClick={() => handleOpenLink('https://eremef.xyz')}>© {new Date().getFullYear()} eremef.xyz</p>
                            <p className={styles.copyright} onClick={() => handleOpenLink('https://github.com/eremef/bandcamp-player/blob/main/LICENSE.txt')}>
                                Licensed under the MIT License.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
