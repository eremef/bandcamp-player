import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/store';
import { X, Trash2, Music, User, LogOut, Copy, Check, RefreshCw, Download, CheckCircle, AlertCircle, ShieldAlert } from 'lucide-react';
import styles from './SettingsModal.module.css';
import { QRCodeCanvas } from 'qrcode.react';
import ConnectedDevicesModal from './ConnectedDevicesModal';
import PairingApprovalModal from './PairingApprovalModal';
import {
    formatPairingExpiration,
    getOrderedRemoteInterfaceNames,
    getSelectedRemoteInterfaceName,
    isPairingInviteExpired,
} from './pairing-utils';

interface SettingsModalProps {
    onClose: () => void;
}

type CopyableField = 'remoteUrl' | 'pairingCode' | 'fingerprint';

const getBannerCacheDay = () => Math.floor(Date.now() / 86_400_000);

export function SettingsModal({ onClose }: SettingsModalProps) {
    const isMac = window.electron.system.platform === 'darwin';
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
        pairingRequests,
        connectedDevices,
        fetchRemoteStatus,
        createPairingInvite,
        approvePairing,
        rejectPairing,
        updateStatus,
        checkForUpdates,
        installUpdate,
        remoteConfig,
        fetchRemoteConfig,
        refreshRemoteConfig,
    } = useStore();

    const [appVersion, setAppVersion] = useState<string>('1.0.0');
    const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);
    const [showUnsafeConfirmation, setShowUnsafeConfirmation] = useState(false);
    const [copiedFields, setCopiedFields] = useState<Record<string, boolean>>({
        remoteUrl: false,
        pairingCode: false,
        fingerprint: false,
    });
    const [showDevicesModal, setShowDevicesModal] = useState(false);
    const [pairingInvite, setPairingInvite] = useState<{ code: string; expiresAt: string; caCertificate: string; caFingerprint: string } | null>(null);
    const [pairingError, setPairingError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    const [bannerCacheDay, setBannerCacheDay] = useState(getBannerCacheDay);
    const unsafeConfirmationRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        window.electron.system.getAppVersion().then(setAppVersion);
        if (!remoteConfig) {
            fetchRemoteConfig();
        }
    }, [fetchRemoteConfig, remoteConfig]);

    useEffect(() => {
        fetchRemoteStatus();
    }, [fetchRemoteStatus]);

    useEffect(() => {
        if (settings?.remoteEnabled && remoteStatus?.isRunning && remoteStatus.securityMode === 'safe') {
            setPairingError(null);
            createPairingInvite().then(setPairingInvite).catch((error) => {
                setPairingError(error instanceof Error ? error.message : 'Could not create a pairing code.');
            });
        } else {
            setPairingInvite(null);
        }
    }, [settings?.remoteEnabled, remoteStatus?.isRunning, remoteStatus?.securityMode, remoteStatus?.generation, createPairingInvite]);

    useEffect(() => {
        if (!pairingInvite) return;

        const updateCurrentTime = () => setCurrentTime(Date.now());
        updateCurrentTime();
        const intervalId = window.setInterval(updateCurrentTime, 1000);
        return () => window.clearInterval(intervalId);
    }, [pairingInvite]);

    useEffect(() => {
        const intervalId = window.setInterval(() => setBannerCacheDay(getBannerCacheDay()), 60_000);
        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const dialog = unsafeConfirmationRef.current;
        if (!dialog) return;

        if (showUnsafeConfirmation && !dialog.open) {
            dialog.showModal();
            dialog.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus();
        } else if (!showUnsafeConfirmation && dialog.open) {
            dialog.close();
        }
    }, [showUnsafeConfirmation]);

    useEffect(() => {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dimmedColor = isDark ? '#080808' : '#626262';
        const dimmedSymbolColor = isDark ? '#ffffff' : '#000000';
        window.electron.window.setTitleBarOverlay(dimmedColor, dimmedSymbolColor);

        return () => {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const resetColor = isDark ? '#141414' : '#f5f5f5';
            const resetSymbolColor = isDark ? '#ffffff' : '#000000';
            window.electron.window.setTitleBarOverlay(resetColor, resetSymbolColor);
        };
    }, [settings?.theme]);

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

    const handleCopy = (text: string, field: CopyableField) => {
        navigator.clipboard.writeText(text);
        setCopiedFields((current) => ({ ...current, [field]: true }));
        setTimeout(() => setCopiedFields((current) => ({ ...current, [field]: false })), 2000);
    };

    const handleCreatePairingInvite = async () => {
        try {
            setPairingError(null);
            setPairingInvite(await createPairingInvite());
        } catch (error) {
            setPairingError(error instanceof Error ? error.message : 'Could not create a pairing code.');
        }
    };

    const handleDownloadRemoteCertificate = async () => {
        const certificate = await window.electron.remote.getPairingCertificate();
        if (!certificate) return;
        const objectUrl = URL.createObjectURL(new Blob([certificate], { type: 'application/x-x509-ca-cert' }));
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'beta-player-remote-ca.crt';
        link.click();
        URL.revokeObjectURL(objectUrl);
    };

    const pairingInviteExpired = pairingInvite
        ? isPairingInviteExpired(pairingInvite.expiresAt, currentTime)
        : false;
    const pairingExpirationText = pairingInvite
        ? formatPairingExpiration(pairingInvite.expiresAt, currentTime)
        : null;
    const pairingTicket = pairingInvite && !pairingInviteExpired && remoteStatus?.ip
        ? btoa(JSON.stringify({
            version: 1,
            host: remoteStatus.ip,
            port: remoteStatus.port,
            code: pairingInvite.code,
            caFingerprint: pairingInvite.caFingerprint,
        })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
        : '';
    const pairingQrValue = pairingTicket
        ? `beta-app://pair?ticket=${pairingTicket}`
        : '';

    const availableRemoteInterfaces = remoteStatus?.availableInterfaces ?? [];
    const remoteInterfaceNames = getOrderedRemoteInterfaceNames(availableRemoteInterfaces, remoteStatus?.recommendedAddress);
    const recommendedInterface = availableRemoteInterfaces.find((networkInterface) => networkInterface.address === remoteStatus?.recommendedAddress);
    const selectedRemoteInterfaceName = getSelectedRemoteInterfaceName(settings?.remoteInterfaceName, recommendedInterface?.name);
    const getInterfaceLabel = (name: string) => `${name} — ${availableRemoteInterfaces.filter((networkInterface) => networkInterface.name === name).map((networkInterface) => networkInterface.address).join(', ')}`;

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
                    {!isMac && (updateStatus.status === 'available' || updateStatus.status === 'downloading' || updateStatus.status === 'downloaded') && (
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

                    {/* Playback */}
                    <section className={styles.section}>
                        <h3>Playback</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Gapless Playback & Crossfade</span>
                                <span className={styles.settingHint}>Seamlessly transition between tracks</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.crossfadeEnabled ?? false}
                                    onChange={(e) => updateSettings({ crossfadeEnabled: e.target.checked })}
                                    data-testid="setting-crossfade-enabled"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        {settings?.crossfadeEnabled && (
                            <div className={styles.setting}>
                                <div className={styles.settingInfo}>
                                    <span className={styles.settingLabel}>Crossfade Duration</span>
                                    <span className={styles.settingValue}>{settings?.crossfadeDuration ?? 3}s</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="1"
                                    value={settings?.crossfadeDuration ?? 3}
                                    onChange={(e) => updateSettings({ crossfadeDuration: parseInt(e.target.value) })}
                                />
                            </div>
                        )}
                    </section>

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
                                data-testid="setting-theme"
                            >
                                <option value="system">System Default</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                                <option value="high-contrast">High Contrast (AAA)</option>
                            </select>
                        </div>
                    </section>

                    {/* Collection */}
                    <section className={styles.section}>
                        <h3>Collection</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Deduplicate Collection</span>
                                <span className={styles.settingHint}>Hide duplicate albums and tracks from the collection view</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.deduplicateCollection ?? true}
                                    onChange={(e) => updateSettings({ deduplicateCollection: e.target.checked })}
                                    data-testid="setting-deduplicate-collection"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Include Wishlist in Collection</span>
                                <span className={styles.settingHint}>Show Bandcamp wishlist items together with purchases</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.includeWishlistInCollection ?? false}
                                    onChange={(e) => updateSettings({ includeWishlistInCollection: e.target.checked })}
                                    data-testid="setting-wishlist"
                                />
                                <span className={styles.slider}></span>
                            </label>
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
                                    data-testid="setting-cache-enabled"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Offline Mode</span>
                                <span className={styles.settingHint}>Only play cached tracks (skips streaming)</span>
                            </div>
                            <label className={`${styles.switch} ${!settings?.cacheEnabled ? styles.switchDisabled : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={settings?.offlineMode ?? false}
                                    disabled={!settings?.cacheEnabled}
                                    onChange={(e) => updateSettings({ offlineMode: e.target.checked })}
                                    data-testid="setting-offline-mode"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Max Cache Size</span>
                                <span className={styles.settingValue}>{settings?.cacheMaxSizeGb || 5} GB</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                step="1"
                                value={settings?.cacheMaxSizeGb || 5}
                                onChange={(e) => updateSettings({ cacheMaxSizeGb: parseInt(e.target.value) })}
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
                                    <Music size={16} />
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
                                        data-testid="setting-scrobbling"
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
                                    data-testid="setting-minimize-tray"
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
                                    data-testid="setting-start-minimized"
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
                                    data-testid="setting-show-notifications"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>
                    </section>

                    {/* Integrations */}
                    <section className={styles.section}>
                        <h3>Integrations</h3>
                        <div className={styles.setting}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Discord Rich Presence</span>
                                <span className={styles.settingHint}>Show what you&apos;re listening to on Discord</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.discordRpcEnabled ?? false}
                                    onChange={(e) => updateSettings({ discordRpcEnabled: e.target.checked })}
                                    data-testid="setting-discord-rpc"
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
                                <span className={styles.settingHint}>Control playback from paired devices on your local network</span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={settings?.remoteEnabled ?? false}
                                    onChange={(e) => updateSettings({ remoteEnabled: e.target.checked })}
                                    data-testid="setting-remote-enabled"
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>

                        {settings?.remoteEnabled && (
                            <>

                                <div className={styles.setting}>
                                    <div className={styles.settingInfo}>
                                        <span className={styles.settingLabel}>Secure Mode</span>
                                        <span className={styles.settingHint}>Secure mode encrypts traffic and requires device approval.</span>
                                    </div>
                                    <label className={styles.switch}>
                                        <input
                                            type="checkbox"
                                            checked={settings?.remoteSecurityMode !== 'unsafe'}
                                            onChange={(event) => {
                                                if (!event.target.checked) {
                                                    setShowUnsafeConfirmation(true);
                                                    return;
                                                }
                                                updateSettings({ remoteSecurityMode: 'safe' });
                                            }}
                                            aria-label="Secure Mode"
                                            data-testid="setting-remote-security-mode"
                                        />
                                        <span className={styles.slider}></span>
                                    </label>
                                </div>

                                <div className={`${styles.setting} ${styles.networkInterfaceSetting}`}>
                                    <div className={styles.settingInfo}>
                                        <span className={styles.settingLabel}>Network interface</span>
                                        <span className={styles.settingHint}>Remote Control listens on this interface.</span>
                                    </div>
                                    <select
                                        className={styles.selectInput}
                                        value={selectedRemoteInterfaceName}
                                        onChange={(event) => updateSettings({ remoteInterfaceName: event.target.value })}
                                        data-testid="setting-remote-interface"
                                        disabled={remoteInterfaceNames.length === 0}
                                    >
                                        {remoteInterfaceNames.map((name) => (
                                            <option key={name} value={name}>
                                                {name === recommendedInterface?.name ? `Recommended · ${getInterfaceLabel(name)}` : getInterfaceLabel(name)}
                                            </option>
                                        ))}
                                        {settings?.remoteInterfaceName && !remoteInterfaceNames.includes(settings.remoteInterfaceName) && (
                                            <option value={settings.remoteInterfaceName} disabled>
                                                {settings.remoteInterfaceName} — unavailable
                                            </option>
                                        )}
                                    </select>
                                </div>

                                <dialog
                                    ref={unsafeConfirmationRef}
                                    className={styles.unsafeConfirmationDialog}
                                    aria-modal="true"
                                    aria-labelledby="unsafe-confirmation-title"
                                    aria-describedby="unsafe-confirmation-description"
                                    onCancel={(event) => {
                                        event.preventDefault();
                                        setShowUnsafeConfirmation(false);
                                    }}
                                    onClick={(event) => {
                                        if (event.target === event.currentTarget) {
                                            setShowUnsafeConfirmation(false);
                                        }
                                    }}
                                >
                                    <div className={styles.unsafeConfirmationContent}>
                                        <div className={styles.unsafeConfirmationHeading}>
                                            <ShieldAlert size={20} />
                                            <h2 id="unsafe-confirmation-title">Disable Secure Mode?</h2>
                                        </div>
                                        <p id="unsafe-confirmation-description" className={styles.unsafeConfirmationDescription}>
                                            Turning off Secure Mode means that Remote Control connections will not use encryption or device pairing. Other devices on the same network may read commands and control playback.
                                        </p>
                                        <div className={styles.unsafeConfirmationActions}>
                                            <button
                                                className={styles.unsafeCancelBtn}
                                                data-autofocus
                                                onClick={() => setShowUnsafeConfirmation(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                className={styles.unsafeConfirmBtn}
                                                onClick={() => {
                                                    setShowUnsafeConfirmation(false);
                                                    updateSettings({ remoteSecurityMode: 'unsafe' });
                                                }}
                                            >
                                                Disable
                                            </button>
                                        </div>
                                    </div>
                                </dialog>

                                <div className={styles.setting}>
                                    <div className={styles.settingInfo}>
                                        <span className={styles.settingLabel}>Playlist Sync</span>
                                        <span className={styles.settingHint}>Set here for all devices. Desktop &rarr; Mobile makes phones read-only.</span>
                                    </div>
                                    <select
                                        className={styles.selectInput}
                                        value={settings?.playlistSyncMode || 'two-way'}
                                        onChange={(e) => updateSettings({ playlistSyncMode: e.target.value as any })}
                                        data-testid="setting-playlist-sync-mode"
                                    >
                                        <option value="two-way">Two-way</option>
                                        <option value="desktop-to-mobile">Desktop &rarr; Mobile</option>
                                        <option value="mobile-to-desktop">Mobile &rarr; Desktop</option>
                                        <option value="disabled">Disabled</option>
                                    </select>
                                </div>

                                {settings?.remoteEnabled && remoteStatus?.isRunning && remoteStatus.securityMode === 'safe' && (
                                    <div className={styles.remoteInfo}>
                                        <div className={styles.safeModeHeading}>
                                            <span>Pairing</span>
                                            <span className={styles.expiresText}>
                                                {pairingInviteExpired ? (
                                                    <button type="button" className={styles.generatePairingCodeLink} onClick={handleCreatePairingInvite}>
                                                        Generate new code
                                                    </button>
                                                ) : pairingExpirationText ? `expires in: ${pairingExpirationText}` : 'N/A'}
                                            </span>
                                        </div>
                                        <div className={styles.remoteQr}>
                                            {pairingQrValue ? (
                                                <QRCodeCanvas
                                                    value={pairingQrValue}
                                                    size={240}
                                                    bgColor="#ffffff"
                                                    fgColor="#000000"
                                                    level="M"
                                                    marginSize={4}
                                                />
                                            ) : (
                                                <p className={styles.remoteHint}>
                                                    {pairingInviteExpired ? 'Pairing code expired. Generate a new code to continue.' : 'Choose an available pairing address above to create the QR code.'}
                                                </p>
                                            )}
                                        </div>
                                        <div className={styles.remoteDetails}>
                                            <div className={styles.remoteText}>
                                                <p className={styles.remoteHint}>Scan with the mobile app to pair. The desktop app will ask you to approve the device.</p>
                                                <details className={styles.manualPairingDetails}>
                                                    <summary>Can&apos;t scan? Enter details manually</summary>
                                                    <div className={styles.pairingCodeBlock}>
                                                        <span className={styles.settingLabel}>Host</span>
                                                        {remoteStatus.url ? (
                                                            <div className={styles.remoteUrlContainer}>
                                                                <p className={styles.remoteUrl} onClick={() => handleOpenLink(remoteStatus.url)}>
                                                                    {remoteStatus.url}
                                                                </p>
                                                                <button
                                                                    className={styles.copyBtn}
                                                                    onClick={() => handleCopy(remoteStatus.url, 'remoteUrl')}
                                                                    title="Copy host address"
                                                                >
                                                                    {copiedFields.remoteUrl ? <Check size={14} color="#4bb543" /> : <Copy size={14} />}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className={styles.settingHint}>Choose a pairing address above first.</span>
                                                        )}
                                                        {pairingInvite ? (
                                                            <>
                                                                <span className={styles.settingLabel}>Pairing code</span>
                                                                {pairingInviteExpired ? (
                                                                    <span className={styles.settingHint}>Pairing code expired. Generate a new code above.</span>
                                                                ) : (
                                                                    <div className={styles.remoteUrlContainer}>
                                                                        <code className={styles.pairingCode}>{pairingInvite.code}</code>
                                                                        <button className={styles.copyBtn} onClick={() => handleCopy(pairingInvite.code, 'pairingCode')} title="Copy pairing code">
                                                                            {copiedFields.pairingCode ? <Check size={14} color="#4bb543" /> : <Copy size={14} />}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <span className={styles.settingLabel}>Certificate fingerprint</span>
                                                                <div className={styles.remoteUrlContainer}>

                                                                    <code className={styles.fingerprint}>{pairingInvite.caFingerprint.match(/.{1,4}/g)?.join(':')}</code>
                                                                    <button
                                                                        className={styles.copyBtn}
                                                                        onClick={() => handleCopy(pairingInvite.caFingerprint, 'fingerprint')}
                                                                        title="Copy fingerprint"
                                                                    >
                                                                        {copiedFields.fingerprint ? <Check size={14} color="#4bb543" /> : <Copy size={14} />}
                                                                    </button>
                                                                </div>
                                                                <p className={styles.remoteHint}>To use the browser remote, install this local certificate in your operating system once; do not bypass browser certificate warnings.</p>
                                                                <button className={styles.remoteActionBtn} onClick={handleDownloadRemoteCertificate}>Download browser certificate</button>

                                                            </>
                                                        ) : (
                                                            <span className={styles.settingHint}>Manual pairing details are not available right now.</span>
                                                        )}
                                                    </div>
                                                </details>
                                                {pairingError && <p className={styles.remoteError}>{pairingError}</p>}
                                                <span className={styles.settingLabel}>Paired devices</span>
                                                <div className={styles.remoteConnections} onClick={() => connectedDevices.length > 0 && setShowDevicesModal(true)} style={connectedDevices.length > 0 ? { cursor: 'pointer' } : {}}>
                                                    <span className={remoteStatus.connections > 0 ? styles.connected : styles.disconnected}>
                                                        {remoteStatus.connections} online · {connectedDevices.length} paired
                                                    </span>
                                                    {connectedDevices.length > 0 && (
                                                        <span className={styles.manageLink}> (Manage)</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {settings?.remoteEnabled && remoteStatus?.isRunning && remoteStatus.securityMode === 'unsafe' && (
                                    <div className={styles.remoteInfo}>
                                        <div className={styles.remoteDetails}>
                                            <div className={styles.remoteQr}>
                                                {remoteStatus.url ? (
                                                    <QRCodeCanvas value={remoteStatus.url} size={160} bgColor="#ffffff" fgColor="#000000" level="M" includeMargin />
                                                ) : (
                                                    <p className={styles.remoteHint}>Choose a primary connection address above.</p>
                                                )}
                                            </div>
                                            <div className={styles.remoteText}>
                                                {remoteStatus.url && <p className={styles.remoteUrl} onClick={() => handleOpenLink(remoteStatus.url)}>{remoteStatus.url}</p>}
                                                <p className={styles.remoteHint}>Unsafe legacy connection. Select Unsafe in the mobile app to connect.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {settings?.remoteEnabled && !remoteStatus?.isRunning && (
                                    <p className={styles.remoteError}>{remoteStatus?.error || 'Remote control did not start. Check the desktop log or select Unsafe mode if desktop key storage is unavailable.'}</p>
                                )}
                            </>
                        )}
                    </section>

                    {settings?.remoteEnabled && showDevicesModal && (
                        <ConnectedDevicesModal onClose={() => setShowDevicesModal(false)} />
                    )}

                    {settings?.remoteEnabled && remoteStatus?.isRunning && remoteStatus.securityMode === 'safe' && pairingRequests[0] && (
                        <PairingApprovalModal
                            key={pairingRequests[0].id}
                            request={pairingRequests[0]}
                            approvePairing={approvePairing}
                            rejectPairing={rejectPairing}
                        />
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

                    {/* Updates */}
                    {!isMac && (
                        <section className={styles.section}>
                            <h3>Updates</h3>
                            <div className={styles.setting}>
                                <div className={styles.settingInfo}>
                                    <span className={styles.settingLabel}>Beta version updates</span>
                                    <span className={styles.settingHint}>Receive early access to new features and bug fixes</span>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings?.allowBetaUpdates ?? false}
                                        onChange={(e) => updateSettings({ allowBetaUpdates: e.target.checked })}
                                        data-testid="setting-beta-updates"
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>
                            <div className={styles.updateContainer}>
                                {renderUpdateSection()}
                            </div>
                        </section>
                    )}

                    {/* About */}
                    <section className={styles.section}>
                        <h3>About</h3>
                        <div className={styles.about}>
                            <p><strong>Beta Player</strong></p>
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

                            <div className={styles.supportBanner}>
                                <p>Like the app? Want it to be actively developed?</p>
                                <img
                                    src={`https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=eremef.xyz&button_colour=1da0c3&font_colour=ffffff&font_family=Cookie&outline_colour=ffffff&coffee_colour=FFDD00&v=${bannerCacheDay}`}
                                    alt="Buy me a coffee"
                                    title="Buy me a coffee"
                                    onClick={() => handleOpenLink('https://www.buymeacoffee.com/eremef.xyz')}
                                    style={{ cursor: 'pointer' }}
                                />
                            </div>

                            <p className={styles.copyright} onClick={() => handleOpenLink('https://eremef.xyz')}>© {new Date().getFullYear()} eremef.xyz</p>
                            <p className={styles.copyright} onClick={() => handleOpenLink('https://github.com/eremef/bandcamp-player/blob/main/LICENSE.txt')}>
                                Licensed under the MIT License.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div >
    );
}
