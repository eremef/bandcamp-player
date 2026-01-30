import { useEffect, useRef } from 'react';
import { VolumeManager } from 'react-native-volume-manager';
import { useStore } from '../store';

/**
 * Custom hook that listens to hardware volume button presses
 * and sends volume changes to the desktop app via WebSocket.
 * 
 * The volume is mapped from the device's music volume (0-1) to the desktop player.
 */
export function useVolumeButtons() {
    const { setVolume, volume, connectionStatus } = useStore();
    const lastVolume = useRef<number>(volume ?? 1);

    useEffect(() => {
        if (connectionStatus !== 'connected') {
            return;
        }

        // Initialize: sync the device volume with the current player volume
        const initVolume = async () => {
            try {
                await VolumeManager.setVolume(volume ?? 1, { showUI: false });
            } catch (e) {
                console.warn('Failed to sync initial volume:', e);
            }
        };
        initVolume();

        // Listen for volume changes from hardware buttons
        const subscription = VolumeManager.addVolumeListener((result) => {
            const newVolume = result.volume;

            // Only send if the volume actually changed significantly
            if (Math.abs(newVolume - lastVolume.current) > 0.01) {
                lastVolume.current = newVolume;
                setVolume(newVolume);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [connectionStatus, setVolume, volume]);

    // Update ref when store volume changes (from desktop)
    useEffect(() => {
        if (volume !== undefined) {
            lastVolume.current = volume;
        }
    }, [volume]);
}
