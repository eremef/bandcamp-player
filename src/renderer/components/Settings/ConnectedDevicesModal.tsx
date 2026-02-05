import React, { useEffect, useState } from 'react';
import { X, Smartphone, Monitor, Globe, Clock, Trash2 } from 'lucide-react';
import styles from './ConnectedDevicesModal.module.css';
import { useStore } from '../../store/store';

interface ConnectedDevicesModalProps {
    onClose: () => void;
}

export default function ConnectedDevicesModal({ onClose }: ConnectedDevicesModalProps) {
    const {
        connectedDevices,
        fetchConnectedDevices,
        disconnectDevice,
        remoteStatus
    } = useStore();

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            await fetchConnectedDevices();
            setIsLoading(false);
        };
        load();

        // Timer to refresh "connected at" times if we wanted relative time, 
        // but for absolute time it's fine. 
        // We rely on store updates for list changes.
    }, []);

    const handleDisconnect = async (clientId: string) => {
        try {
            await disconnectDevice(clientId);
        } catch (error) {
            console.error('Failed to disconnect device:', error);
        }
    };

    const formatTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Unknown time';
        }
    };

    const getDeviceIcon = (userAgent: string) => {
        const ua = (userAgent || '').toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return <Smartphone size={20} />;
        }
        return <Globe size={20} />;
    };

    const getDeviceName = (userAgent: string) => {
        const ua = (userAgent || '').toLowerCase();
        if (ua.includes('android')) return 'Android Device';
        if (ua.includes('iphone')) return 'iPhone';
        if (ua.includes('ipad')) return 'iPad';
        if (ua.includes('windows')) return 'Windows PC';
        if (ua.includes('mac')) return 'Mac';
        if (ua.includes('linux')) return 'Linux PC';
        return 'Unknown Device';
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Connected Devices</h2>
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
                            <p>No devices connected</p>
                        </div>
                    ) : (
                        <div className={styles.deviceList}>
                            {connectedDevices.map((device) => (
                                <div key={device.id} className={styles.deviceItem}>
                                    <div className={styles.deviceIcon}>
                                        {getDeviceIcon(device.userAgent)}
                                    </div>
                                    <div className={styles.deviceInfo}>
                                        <span className={styles.deviceName}>
                                            {getDeviceName(device.userAgent)}
                                        </span>
                                        <div className={styles.deviceMeta}>
                                            <span className={styles.deviceIp}>{device.ip}</span>
                                            <span className={styles.deviceTime}>
                                                <Clock size={12} />
                                                {formatTime(device.connectedAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className={styles.disconnectBtn}
                                        onClick={() => handleDisconnect(device.id)}
                                        title="Disconnect"
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
