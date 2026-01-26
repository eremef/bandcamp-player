import { useEffect } from 'react';
import { useStore, initializeStoreSubscriptions } from './store/store';
import { Layout } from './components/Layout/Layout';
import { MiniPlayer } from './components/Player/MiniPlayer';
import { LoginPrompt } from './components/Auth/LoginPrompt';
import './App.css';

function App() {
    const { auth, checkSession, fetchSettings, fetchRadioStations } = useStore();

    useEffect(() => {
        // Initialize IPC subscriptions
        initializeStoreSubscriptions();

        // Check existing session and fetch initial data
        checkSession();
        fetchSettings();
        fetchRadioStations();
    }, [checkSession, fetchSettings, fetchRadioStations]);

    // Show login prompt if not authenticated
    if (!auth.isAuthenticated) {
        return <LoginPrompt />;
    }

    // Check for mini-player route
    if (window.location.hash === '#/mini-player') {
        return <MiniPlayer />;
    }

    return <Layout />;
}

export default App;
