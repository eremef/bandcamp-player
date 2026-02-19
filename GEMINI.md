# Bandcamp Desktop Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, auto-updates via GitHub, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. React Native matches `react` 19.1.0. Test files must be in `mobile/__tests__`.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`
- **Updates**: Desktop auto-updates handled by `UpdaterService` using `electron-updater` and GitHub Releases. The app checks for updates 15 seconds after startup and every 24 hours thereafter.
- **Web Remote**: Static files in `src/assets/remote/` (index.html, client.js, styles.css). Icons injected at runtime via `RemoteService`.
- **Simulation Mode**: Run with `npm run dev:large` to simulate a large collection (5000 items) with network errors for testing scalability and resilience.
- **Mobile Lazy Loading**: Mobile app uses infinite scroll and paginated fetching to handle large collections efficiently.
- **Collection Caching**: Collections > 100 items are cached in SQLite. Cache is refreshed daily in the background (stale-while-revalidate) to ensure fast startup without sacrificing data freshness.
- **Chromecast Robustness**: `CastService` handles rapid reconnection and session de-syncs (INVALID_MEDIA_SESSION_ID) with automatic state recovery to prevent crashes.
- **Artist Collection Fetching**: Mobile app fetches the full artist collection from the server, bypassing local pagination limits to ensure all albums are visible.
- **Mobile UI**: Unified headerless design with standardized Search Bars clearing the Android camera bar. Added a **Mode Switch Badge** in the Player UI for toggling between Remote and Standalone.
- **Theme Support**: System/Light/Dark theme support with persistent settings.
- **Standalone Queue Persistence**: The mobile app saves the current track and playback queue to `AsyncStorage` on modification. Both are restored automatically upon relaunch.
- **Persistent Remote Connection**: The mobile app attempts to maintain or re-establish its WebSocket connection to the desktop server even when in Standalone mode, allowing seamless switching back to Remote.
- **Improved Player Engine**: `MobilePlayerService` supports `loadTrack` for initializing the player (track info + URL) without auto-playing. Android notifications now support Stop, Jump Forward, and Jump Backward capabilities.

## E2E Tests

- **Framework**: Playwright with custom Electron fixtures in `e2e/fixtures.ts`. Run with `npx playwright test --workers=1`.
- **Toggle Switch Checkboxes**: Settings checkboxes are styled as toggle switches with `opacity: 0; width: 0; height: 0` on the `<input>`. Playwright's `setChecked()` fails with "Element is outside of the viewport". Use `evaluate(el => el.click())` instead.
- **Avoid CSS Module Selectors**: Selectors like `[class*="SettingsModal_modal"]` are fragile in Electron's production build. Prefer role-based (`getByRole`, `getByTitle`) and text-based (`locator('text=...')`, `locator('p').filter({ hasText: /regex/ })`) locators.
- **Scrollable Modals**: The Settings modal is scrollable. Elements below the fold need `scrollIntoViewIfNeeded()` on their visible label before interacting with nearby hidden inputs.
- **Radio Card Playback**: The play button overlay inside radio cards has **no onClick handler**. Only the card's root `onClick` calls `playRadioStation()`. Click the card, not the inner button.
- **Album Detail Play Button**: Multiple "Play" buttons exist (album detail + player bar). Avoid `getByRole('button', { name: 'Play', exact: true })` as it matches multiple elements.
- **Context Menus**: Right-click (`click({ button: 'right' })`) is more reliable than hover → menu button click for triggering context menus on album cards.
- **Fixture Teardown**: `fixtures.ts` teardown calls `electronApp.close()`. Tests that close and relaunch the app (persistence tests) cause double-close. The teardown wraps `.close()` in try/catch.
- **Checkbox Ordering**: Settings checkboxes by `getByRole('checkbox').nth(n)`: 0=Enable Caching, 1=Minimize to Tray, 2=Start Minimized, 3=Show Notifications, 4=Enable Remote Control.
- **Back Button Navigation**: The Back button in album detail view needs an explicit visibility wait before clicking — it's not immediately available after navigation.
- **Audio Streaming**: Real Bandcamp audio streaming doesn't work in the E2E test environment. Tests should verify UI state (station cards, track info) rather than actual playback.
- **App Relaunch (Persistence Tests)**: When relaunching the app, reuse the same `--user-data-dir`, `NODE_ENV`, `E2E_TEST`, and `REMOTE_PORT`. Always handle potential login flow again after relaunch.

## User Rules

- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
- **ESM Imports Only**: Never use CommonJS `require()` in TypeScript files.
- **Mobile Tests**: Place all mobile unit tests in `mobile/__tests__/` to avoid bundling errors with Expo Router.
- Use linter and typecheck every time you make a change to the code.
- Do not git add automatically after changing something.
