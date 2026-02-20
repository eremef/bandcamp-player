# Bandcamp Desktop Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, auto-updates via GitHub, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. React Native matches `react` 19.1.0. Test files must be in `mobile/__tests__`.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`
- **Updates**: Desktop auto-updates handled by `UpdaterService` using `electron-updater` and GitHub Releases. The app checks for updates 15 seconds after startup and every 24 hours thereafter.
- **Web Remote**: Static files in `src/assets/remote/` (index.html, client.js, styles.css). Icons injected at runtime via `RemoteService`.
- **Simulation Mode**: Run with `npm run dev:large` to simulate a large collection (5000 items) with network errors for testing scalability and resilience.
- **Mobile Standalone Mode**: Dedicated native audio engine allows the mobile app to function as an independent Bandcamp player. Supports track navigation, volume control, and background playback.
- **Hybrid Connectivity**: Mobile app maintains a background WebSocket connection to the desktop server even in Standalone mode, enabling seamless switching between Remote and local playback.
- **Scalable Collection Caching**: Large collections are persisted in SQLite with FTS5 for instant, high-performance searching. Cache refreshes daily in the background.
- **Chromecast Robustness**: `CastService` handles rapid reconnection and session de-syncs (INVALID_MEDIA_SESSION_ID) with automatic state recovery to prevent crashes.
- **Artist Collection Fetching**: Mobile app fetches the full artist collection from the server, bypassing local pagination limits to ensure all albums are visible.
- **Mobile UI**: Unified headerless design with standardized Search Bars clearing the Android camera bar. Added a **Mode Switch Badge** in the Player UI for toggling between Remote and Standalone.
- **Theme Support**: System/Light/Dark theme support with persistent settings.
- **Standalone Queue Persistence**: The mobile app saves the current track and playback queue to `AsyncStorage` on modification. Both are restored automatically upon relaunch.
- **Persistent Remote Connection**: The mobile app attempts to maintain or re-establish its WebSocket connection to the desktop server even when in Standalone mode, allowing seamless switching back to Remote.
- **Improved Player Engine**: `MobilePlayerService` supports `loadTrack` for initializing the player (track info + URL) without auto-playing. Android notifications now support Stop, Jump Forward, and Jump Backward capabilities.
- **Remote Config Pattern**: CSS selectors, regexes, and script keys used by `ScraperService` and `MobileScraperService` are defined in `remote-config.json` at the root. `RemoteConfigService` falls back to the local file but fetches the live version from GitHub `main` in the background to instantly fix broken scraping without redeployments.

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

## Mobile Test Learnings (v1.7.3-alpha)

- **State Isolation**: Zustand stores and `AsyncStorage` can leak state between tests. Always use `useStore.setState()` to reset critical connection flags (`connectionStatus`, `hostIp`, `skipAutoLogin`) in `beforeEach` or before specific tests.
- **`act()` with `RefreshControl`**: Triggering pull-to-refresh on `VirtualizedList` via `props.onRefresh()` requires an explicit `act(async () => ...)` block, even if using `waitFor` for assertions, to avoid VirtualizedList state update warnings.
- **`expo-router` Mock Extension**: The default mock in `jest.setup.js` must include `useFocusEffect` (as a no-op or implementation-caller) to support screens that refresh data on focus (e.g., Artists screen).
- **Asynchronous Synchronization**: `connect()` calls that update the store should be `await`ed within the store logic, and tests should use `waitFor()` for assertions on state values that are updated asynchronously (like `hostIp`).
- **Mock Implementation Leakage**: When methods (e.g., `play()`) fetch data multiple times (like calling `useStore.getState()` or `TrackPlayer.getQueue()`), using `mockReturnValueOnce()` or `mockResolvedValueOnce()` restricts the mock to the first invocation only, causing subsequent internal calls to return default/undefined states and failing the test. Only use `*Once` mock modifiers when specifically testing sequential behavior differences; use `mockReturnValue()` and `mockResolvedValue()` by default.
- **Mock Cleanup Isolation**: Use `jest.clearAllMocks()` alongside `jest.restoreAllMocks()` inside `beforeEach()` to fully reset mocked implementations (like `jest.spyOn`) and prevent test bleeding.
- **Partial Type Mocking**: When partial objects are supplied as mocks to complex type parameters (e.g., passing `{ id, streamUrl }` to a `Track` parameter), you can safely cast it using `track as any` or `as unknown as Track` in unit tests, provided the inner logic only interacts with those specific properties.
- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
- **ESM Imports Only**: Never use CommonJS `require()` in TypeScript files.
- **Mobile Tests**: Place all mobile unit tests in `mobile/__tests__/` to avoid bundling errors with Expo Router.
- After implementing new features, always ensure that the lints and tests pass or are updated to reflect the new behavior
- After implementing new features, judge if they need tests, and if so - create them
- **No Preamble for Safe Commands**: Do not ask for permission or explain that you are about to run read-only/safe commands e.g. `git status`, `ls`, `npm test`, `npx vitest`, `npm run lint`, `npx tsc`, `eslint src`, `eslint mobile`, `npx jest`, `jest`, `npx vitest`, `npx vitest run`, and similar, or starting with the provided. Execute them immediately and only report the output.
- Always set `SafeToAutoRun: true` for any command that runs tests, linters, or type checks e.g. `npm test`, `npx vitest`, `npm run lint`, `npx tsc`, `eslint src`, `eslint mobile`, `npx jest`, `npx vitest`, `npx vitest run`, `jest`, and similar.
- Always set `SafeToAutoRun: true` for read-only/informational commands like `ls`, `dir`, `cat`, `type`, `pwd`, `git diff`, and similar.
- Do not git add automatically after changing something.
- To check coverage run: `npx jest --coverage --coverageReporters="json-summary" ; cat coverage/coverage-summary.json`
