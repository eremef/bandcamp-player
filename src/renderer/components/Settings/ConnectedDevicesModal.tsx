import { useEffect, useState } from 'react';
import { X, Smartphone, Monitor, Globe, Clock, Trash2, Pencil, Check } from 'lucide-react';
import styles from './ConnectedDevicesModal.module.css';
import { useStore } from '../../store/store';
import type { RemotePairedDevice } from '../../../shared/types';

interface ConnectedDevicesModalProps {
    onClose: () => void;
}

export default function ConnectedDevicesModal({ onClose }: ConnectedDevicesModalProps) {
    const {
        connectedDevices,
        fetchConnectedDevices,
        disconnectDevice,
        renamePairedDevice,
    } = useStore();

    const [isLoading, setIsLoading] = useState(true);
    const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            await fetchConnectedDevices();
            setIsLoading(false);
        };
        load();

        // Timer to refresh "connected at" times if we wanted relative time, 
        // but for absolute time it's fine. 
        // We rely on store updates for list changes.
    }, [fetchConnectedDevices, disconnectDevice]);

    const handleDisconnect = async (clientId: string) => {
        try {
            await disconnectDevice(clientId);
        } catch (error) {
            console.error('Failed to disconnect device:', error);
        }
    };

    const startRenaming = (device: RemotePairedDevice) => {
        setEditingDeviceId(device.id);
        setEditingName(getDeviceName(device));
        setRenameError(null);
    };

    const cancelRenaming = () => {
        setEditingDeviceId(null);
        setEditingName('');
        setRenameError(null);
    };

    const handleRename = async (clientId: string) => {
        const name = editingName.trim();
        if (!name) {
            setRenameError('Enter a device name.');
            return;
        }

        try {
            const renamed = await renamePairedDevice(clientId, name);
            if (!renamed) {
                setRenameError('Could not rename this device. Try again.');
                return;
            }
            cancelRenaming();
        } catch {
            setRenameError('Could not rename this device. Try again.');
        }
    };

    const formatDateTime = (isoString: string) => {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return 'Unknown time';
        return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    };

    const getDeviceIcon = (platformName: string) => {
        const platform = platformName.toLowerCase();
        if (platform === 'android' || platform === 'ios') {
            return <Smartphone size={20} />;
        }
        return <Globe size={20} />;
    };

    const getDeviceName = (device: RemotePairedDevice) => {
        if (device.name && device.name !== 'unknown') return device.name;
        if (device.platform === 'android') return 'Android device';
        if (device.platform === 'ios') return 'iPhone or iPad';
        return 'Web browser';
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Paired Devices</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.content}>
                    {isLoading ? (
                        <div className={styles.loading}>Loading devices...</div>
                    ) : connectedDevices.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Monitor size={48} />
                            <p>No paired devices</p>
                        </div>
                    ) : (
                        <div className={styles.deviceList}>
                            {connectedDevices.map((device) => (
                                <div key={device.id} className={styles.deviceItem}>
                                    <div className={styles.deviceIcon}>
                                        {getDeviceIcon(device.platform)}
                                    </div>
                                    <div className={styles.deviceInfo}>
                                        {editingDeviceId === device.id ? (
                                            <div className={styles.deviceNameEditor}>
                                                <input
                                                    className={styles.renameInput}
                                                    aria-label="Device name"
                                                    autoFocus
                                                    maxLength={80}
                                                    value={editingName}
                                                    onChange={(event) => setEditingName(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') void handleRename(device.id);
                                                        if (event.key === 'Escape') cancelRenaming();
                                                    }}
                                                />
                                                <button
                                                    className={styles.saveNameBtn}
                                                    onClick={() => void handleRename(device.id)}
                                                    title="Save device name"
                                                    aria-label="Save device name"
                                                >
                                                    <Check size={16} />
                                                </button>
                                                <button
                                                    className={styles.cancelNameBtn}
                                                    onClick={cancelRenaming}
                                                    title="Cancel renaming"
                                                    aria-label="Cancel renaming"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className={styles.deviceNameRow}>
                                                <span className={styles.deviceName}>{getDeviceName(device)}</span>
                                                <button
                                                    className={styles.renameBtn}
                                                    onClick={() => startRenaming(device)}
                                                    title="Rename device"
                                                    aria-label={`Rename ${getDeviceName(device)}`}
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                            </div>
                                        )}
                                        {editingDeviceId === device.id && renameError && (
                                            <span className={styles.renameError} role="alert">{renameError}</span>
                                        )}
                                        <div className={styles.deviceMeta}>
                                            <span className={styles.deviceIp}>{device.platform} · {device.online ? 'Online' : 'Offline'}</span>
                                            <span className={styles.deviceTime}>
                                                <Clock size={12} />
                                                {device.lastConnectedAt ? `Paired: ${formatDateTime(device.lastConnectedAt)}` : `Paired ${formatDateTime(device.createdAt)}`}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className={styles.disconnectBtn}
                                        onClick={() => handleDisconnect(device.id)}
                                        title="Revoke pairing"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
