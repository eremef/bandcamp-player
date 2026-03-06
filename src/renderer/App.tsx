import { useEffect } from "react";
import { useStore, initializeStoreSubscriptions } from "./store/store";
import { Layout } from "./components/Layout/Layout";
import { MiniPlayer } from "./components/Player/MiniPlayer";
import { LoginPrompt } from "./components/Auth/LoginPrompt";
import "./App.css";

function App() {
  const {
    auth,
    checkSession,
    fetchSettings,
    fetchRadioStations,
    settings,
    isOnline,
  } = useStore();

  useEffect(() => {
    // Initialize IPC subscriptions
    initializeStoreSubscriptions();

    // Check existing session and fetch initial data
    checkSession();
    fetchSettings();
  }, [checkSession, fetchSettings]);

  // Fetch radio stations only when online — skip if we're known to be offline
  // (avoids ENOTFOUND errors flooding the console in offline mode)
  useEffect(() => {
    const isOfflineMode = settings?.offlineMode ?? false;
    if (isOnline === false && !isOfflineMode) return;
    fetchRadioStations();
  }, [fetchRadioStations, isOnline, settings?.offlineMode]);

  useEffect(() => {
    const applyTheme = () => {
      const theme = settings?.theme || "system";
      const root = document.documentElement;

      if (theme === "system") {
        const isDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        root.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        root.setAttribute("data-theme", theme);
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (settings?.theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [settings?.theme]);

  // Show login prompt if not authenticated
  if (!auth.isAuthenticated) {
    return <LoginPrompt />;
  }

  // Check for mini-player route
  if (window.location.hash === "#/mini-player") {
    return <MiniPlayer />;
  }

  return <Layout />;
}

export default App;
