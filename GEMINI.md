# Bandcamp Desktop Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, auto-updates via GitHub, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. React Native matches `react` 19.1.0. Test files must be in `mobile/__tests__`.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`
- **Updates**: Desktop auto-updates handled by `UpdaterService` using `electron-updater` and GitHub Releases. The app checks for updates 15 seconds after startup and every 24 hours thereafter.
- **Web Remote**: Static files in `src/assets/remote/` (index.html, client.js, styles.css). Icons injected at runtime via `RemoteService`.
- **Simulation Mode**: Run with `npm run dev:start` to simulate a large collection (5000 items) with network errors for testing scalability and resilience.
- **Mobile Lazy Loading**: Mobile app uses infinite scroll and paginated fetching to handle large collections efficiently.
- **Collection Caching**: Collections > 100 items are cached in SQLite. Cache is refreshed daily in the background (stale-while-revalidate) to ensure fast startup without sacrificing data freshness.
- **Chromecast Robustness**: `CastService` handles rapid reconnection and session de-syncs (INVALID_MEDIA_SESSION_ID) with automatic state recovery to prevent crashes.
- **Artist Collection Fetching**: Mobile app fetches the full artist collection from the server, bypassing local pagination limits to ensure all albums are visible.

## User Rules

- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
- **ESM Imports Only**: Never use CommonJS `require()` in TypeScript files.
- **Mobile Tests**: Place all mobile unit tests in `mobile/__tests__/` to avoid bundling errors with Expo Router.
