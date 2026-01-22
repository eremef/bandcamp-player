import { useEffect } from 'react';
import { useStore, initializeStoreSubscriptions } from './store/store';
import { Layout } from './components/Layout/Layout';
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
    }, []);

    // Show login prompt if not authenticated
    if (!auth.isAuthenticated) {
        return <LoginPrompt />;
    }

    return <Layout />;
}

export default App;
