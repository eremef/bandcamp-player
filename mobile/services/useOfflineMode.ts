import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { useStore } from '../store';

export function useOfflineMode() {
    const { 
        isOfflineMode, 
        manualOfflineOverride,
        setOfflineMode,
        loadCachedTrackIds 
    } = useStore();

    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        loadCachedTrackIds();

        const checkNetworkState = async () => {
            const state = await Network.getNetworkStateAsync();
            const isConnected = state.isConnected ?? false;
            const offline = !isConnected || manualOfflineOverride;
            setOfflineMode(offline);
            setIsInitialized(true);
        };

        checkNetworkState();

        const subscription = Network.addNetworkStateListener((state) => {
            const isConnected = state.isConnected ?? false;
            const offline = !isConnected || manualOfflineOverride;
            setOfflineMode(offline);
        });

        return () => {
            subscription.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [manualOfflineOverride]);

    const isOffline = isOfflineMode || manualOfflineOverride;

    return { isOffline, isOfflineMode, manualOfflineOverride, isInitialized };
}
