# Beta Player

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
- **Collection Sorting Persistence**: The desktop and mobile apps persist `collectionSortKey` and `collectionSortDirection` in their respective `settings` tables. These are restored automatically on startup to maintain the user's preferred view.
- **Cross-Platform Sync**: Collection sorting and filtering (Albums/Tracks/Wishlist) are synchronized in real-time between Desktop and Mobile via WebSocket. This ensures a consistent view when switching between devices.
- **Bulk Operations**: The Desktop Collection view supports multi-selection and bulk actions (Play, Queue, Download, Add to Playlist). When a filter is active, users can operate on all matching items simultaneously.
- **Database Integrity**: Bulk operations that affect multiple records (like deletions or playlist updates) should always ensure `PRAGMA foreign_keys = ON` is set to prevent orphaned records and maintain constraint integrity. Scoping switch cases with `{}` prevents `no-case-declarations` ESLint errors when declaring constants inside bulk action handlers.
- **Windows Taskbar Icon**: On Windows, the AppUserModelID set via `app.setAppUserModelId()` MUST match the packaged application's `appId` defined in `package.json` (`xyz.eremef.beta.app`). If they don't match, Windows won't map the running window to the shortcut, causing the taskbar to display the default Electron/fallback icon. Additionally, use `.ico` format natively for the main window class on Windows and `.png` on other platforms.

## Expo & Native Configuration Learnings

- **Continuous Native Generation (CNG)**: Even if the `android` or `ios` directories are checked into source control (Bare workflow), they should be treated as ephemeral when encountering native build/plugin errors.
- **Gradle Plugin Resolution Errors**: If you encounter errors like `Could not find com.facebook.react:react-native-gradle-plugin` or AGP/Kotlin version mismatches after updating `package.json` dependencies (like `expo` or `react-native`), **DO NOT** manually patch `android/build.gradle` or `android/settings.gradle`.
- **Prebuild Recovery**: Always use `npx expo prebuild --clean -p android` (or `ios`) to delete and cleanly regenerate the native projects. This perfectly synchronizes the native configurations with the versions declared in your current `node_modules`.
- **Expo config**: Use `app.config.js` to configure the Expo application instead of `app.json`.

## Expo Web Build Learnings

- **React Native Track Player Path Fix**: In nightly/alpha versions of `react-native-track-player`, the `NativeTrackPlayer.web.js` (in `lib/module/`) may have a broken relative import `require('../web')`. This should be patched to `require('../../web')` to correctly point to the root `web` directory, allowing its own relative imports to `../src` to resolve correctly.
- **WASM Support**: If using `expo-sqlite` on web, Metro must be configured to handle `.wasm` files. Add `wasm` to `config.resolver.assetExts` in `metro.config.js`.
- **Missing Peer Dependencies**: `react-native-track-player` web support requires `shaka-player`. Ensure it is installed in the dependencies if web support is enabled.

## Security & TypeScript Learnings

- **Dependency Overrides**: Use the `overrides` field in the root `package.json` to force specific versions of transitive dependencies (e.g., `protobufjs`) when they have security vulnerabilities and parent packages (like `castv2`) are unmaintained.
- **Axios Header Types**: Axios headers can return `string | number | boolean | string[] | AxiosHeaders`. When using values like `content-length` with `parseInt`, explicitly convert them to a string using `String()` to avoid TypeScript errors (`TS2345`). Always specify a radix (e.g., `10`) in `parseInt`.

## E2E Tests

- **Framework**: Playwright with custom Electron fixtures in `e2e/fixtures.ts`. Run with `npx playwright test`.
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
- **Zustand State Injection**: In E2E tests, `window.evaluate` on `useStore` only works if the store is globally exposed. An alternative is dispatching `CustomEvent` or mocking IPC methods like `window.electron.cast.getDevices`.
- **Obstructed Elements**: Electron UI elements near absolute-positioned sliders or overlays (like in the PlayerBar) may require `{ force: true }` or `element.evaluate(el => el.click())` if Playwright thinks they are obstructed.
- **Native Module Rebuilds**: If E2E tests fail with "The specified module could not be found" (e.g., `better-sqlite3`), run `npm rebuild` or delete `node_modules` and re-install to ensure native bindings match the Electron version.
- **V8 Coverage Merging**: When generating E2E coverage from V8 data, ensure hits from *all* test runs are merged. Filtering by unique `scriptId` across different JSON files can lead to 0% reporting if the same bundled script (e.g., `index.js`) is targetted by different tests with varying coverage requirements.
- **Scraper Purchase Dates**: The `ScraperService` uses `new Date().toISOString()` as a fallback when parsing items from the DOM if the real purchase date is missing. This can lead to incorrect "current" dates in the collection for items that were not included in the initial data script on the page. Updated the code to use `undefined` instead of a fallback date to maintain data integrity.
- **Strict Mode violations**: `getByTitle` and `getByLabel` can easily match multiple elements if titles are substrings (e.g., "Queue" matching both a "Queue" toggle and a "Clear queue" button). Always use `{ exact: true }` or scope lookups to parent containers (e.g., `locator('footer')` or `locator('div[class*="playerBar"]')`).
- **Conditional Toggling**: When testing UI panels (Queue, Settings, Playlists), avoid blind clicks. Check if the panel is already open (e.g., via `classList.contains('active')`) to prevent the test from accidentally closing it.
- **Robust Item Counting**: When adding albums to the queue, the number of tracks can vary. Use `expect(count).toBeGreaterThan(0)` or loop through items instead of hardcoding expected counts (like `toHaveCount(1)`), unless the mock data is strictly fixed.

## Mobile Test Learnings

- **State Isolation**: Zustand stores and `AsyncStorage` can leak state between tests. Always use `useStore.setState()` to reset critical connection flags (`connectionStatus`, `hostIp`, `skipAutoLogin`) in `beforeEach` or before specific tests.
- **`act()` with `RefreshControl`**: Triggering pull-to-refresh on `VirtualizedList` via `props.onRefresh()` requires an explicit `act(async () => ...)` block, even if using `waitFor` for assertions, to avoid VirtualizedList state update warnings.
- **`expo-router` Mock Extension**: The default mock in `jest.setup.js` must include `useFocusEffect` (as a no-op or implementation-caller) to support screens that refresh data on focus (e.g., Artists screen).
- **Asynchronous Synchronization**: `connect()` calls that update the store should be `await`ed within the store logic, and tests should use `waitFor()` for assertions on state values that are updated asynchronously (like `hostIp`).
- **Mock Implementation Leakage**: When methods (e.g., `play()`) fetch data multiple times (like calling `useStore.getState()` or `TrackPlayer.getQueue()`), using `mockReturnValueOnce()` or `mockResolvedValueOnce()` restricts the mock to the first invocation only, causing subsequent internal calls to return default/undefined states and failing the test. Only use `*Once` mock modifiers when specifically testing sequential behavior differences; use `mockReturnValue()` and `mockResolvedValue()` by default.
- **Mock Cleanup Isolation**: Use `jest.clearAllMocks()` alongside `jest.restoreAllMocks()` inside `beforeEach()` to fully reset mocked implementations (like `jest.spyOn`) and prevent test bleeding.
- **Mobile Wishlist Integration**: Mirroring the desktop feature, the mobile app now supports wishlist visibility in the collection. This required adding an `is_wishlist` column to the `collection_items` table (with migration), updating the `MobileScraperService` to fetch from both collection and wishlist endpoints, and adding a `Heart` icon badge to `CollectionGridItem`.
- **Database Settings Consistency**: User preferences persisted in the `settings` table should use **camelCase** keys (e.g., `includeWishlistInCollection`, `scrobblingEnabled`, `deduplicateCollection`)
- **Collection Settings**: Desktop `SettingsModal` organizes collection-related preferences (Deduplication, Wishlist integration) into a dedicated **Collection** section for better visibility.
- **Store-Database Sync**: When adding new persistent settings to the mobile `useStore`, ensure they are:
    1. Initialized in `initialState`.
    2. Restored in `restoreStandaloneState` by calling `mobileDatabase.getSettings()`.
    3. Saved in their toggle/setter actions using `mobileDatabase.setSetting('key', value)`.
- **Standard Sorting Comparator**: When implementing sort logic with `asc/desc` toggles, always use a standard `a - b` comparator for ascending order. Then, return `-comparison` for descending order. This ensures consistent behavior across all data types (numbers, dates, strings).
- **Mobile Collection Sorting**: To ensure stable, deterministic sorting that aligns with desktop, the database uses a multi-tiered `ORDER BY` clause. For "Purchase Date" sorting, `NULL` dates are treated as the oldest. In SQLite, `NULL` is the smallest value, so `ci.purchase_date ASC` puts them first (Oldest first), and `ci.purchase_date DESC` puts them last (Newest first). This matches the desktop app's behavior of treating missing dates as timestamp `0`.
- **Artist Metadata Derivation**: `ArtistDetailScreen` now derives artist info by checking the store's `artists` array first (populated by the Artists screen) and falling back to `collection.items`. This resolves "Artist not found" errors when navigating between screens where the full collection might not be loaded in the store. Also ensured that the `artistId` (or `id`) passed via the router is consistently used for lookups, avoiding mismatches between numeric IDs and URI-encoded strings.
- **Test Matching Sensitivity**: When using `getAllByText` with regex (e.g. `/Album/`), be aware of header text or sort labels that might match the pattern and appear before the actual list items. Use `.filter()` to exclude UI boilerplate from data assertions.
- **Artist Grouping by Name**: To ensure that artist aliases (e.g., "Aphex Twin" vs. "AFX") are treated as separate entities in the UI, use name-based IDs (`name-xxx`) for the `artists` table and collection items' `artistId`. This prevents merging based on Bandcamp's internal `band_id` when the user wants them separated by name. Use `/\p{L}/u` regex for alphabet headers to correctly support national characters (Ś, Ł, etc.) instead of restricted `[A-Z]` ranges.
- **Scraper Date Integrity**: Removed `new Date().toISOString()` fallbacks from `ScraperService` to prevent "fake" recent dates for items missing metadata. Missing dates are now correctly handled as `undefined`/`null` by the database sorting logic. In the mobile `MobileScraperService`, added validation (`!isNaN(dateObj.getTime())`) before calling `toISOString()` to prevent `RangeError: Date value out of bounds` crashes when Bandcamp returns invalid date strings.
- **React Hook Order**: Always declare all React Hooks (useState, useMemo, useCallback, etc.) at the top level of the component, *before* any conditional early returns (e.g., `if (!data) return ...`). Defining hooks after a conditional return violates the "Rules of Hooks" because it changes the order/number of hooks between renders, leading to runtime errors and linting failures.

## Desktop Test Learnings

- **HTMLAudioElement Mocks**: In the `jsdom`/`happydom` environment, simulated `<audio>` elements have a `duration` of `NaN` by default. If a test relies on the duration being a number (e.g., for `timeUpdate` events), explicitly mock it using `Object.defineProperty(audio, 'duration', { value: 100, configurable: true });` before triggering the event.
- **Vitest Node Environment**: Tests requiring Node.js core modules (like `http`, `dgram`, `os`, `ws`) should explicitly set `/** @vitest-environment node */` at the top of the file to ensure the correct environment is used.
- **Mocking HTTP Servers**: When mocking `http.createServer` in unit tests, capture the request handler passed to it by intercepting the `listen` method (or saving it during `createServer()`). This allows you to manually invoke the handler with mocked `Request` and `Response` objects to accurately test HTTP route/serving logic.
- **Mocking WebSocketServer (ws)**: When mocking the `ws` module, explicitly manage the `wss.clients` Set. Use an `EventEmitter` for the server and listen for the `connection` event to add the mock `ws` client to the `clients` Set. The client's `close` event should remove it from the Set, and `wss.close()` should call `wss.clients.clear()`. This prevents broadcast test failures caused by stale connections leaking across tests.

## Rules

- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
- **ESM Imports Only**: Never use CommonJS `require()` in TypeScript files.
- **Mobile Tests**: Place all mobile unit tests in `mobile/__tests__/` to avoid bundling errors with Expo Router.
- After implementing new features, always ensure that the lints and tests pass or are updated to reflect the new behavior
- After implementing new features, judge if they need tests, and if so - create them
- **No Preamble for Safe Commands**: Do not ask for permission or explain that you are about to run read-only/safe commands e.g. `git status`, `ls`, `npm test`, `npx vitest`, `npm run lint`, `npx tsc`, `eslint src`, `eslint mobile`, `npx jest`, `jest`, `npx vitest`, `npx vitest run`, and similar, or starting with the provided. Execute them immediately and only report the output.
- Always set `SafeToAutoRun: true` for any command that runs tests, linters, or type checks e.g. `npm test`, `npx vitest`, `npm run lint`, `npx tsc`, `eslint src`, `eslint mobile`, `npx jest`, `npx vitest`, `npx vitest run`, `jest`, and similar.
- Always set `SafeToAutoRun: true` for read-only/informational commands like `ls`, `dir`, `cat`, `type`, `pwd`, `git diff`, and similar.
- Do not git add automatically after changing something.
- Always update the GEMINI.md file with the new knowledge when you learn something during creating and fixing tests.
- When you are creating txt files for testing purposes, make sure to write them in the `test_logs` folder.
- Use JSON for test coverage reports, e.g. mobile: `npx jest --coverage --coverageReporters="json-summary"`, desktop: `npx vitest --coverage --coverage.reporter="json-summary"`. For multiple Vitest reporters, pass the flag multiple times: `--coverage.reporter=text --coverage.reporter=json-summary`.
- To release new version (bump version, copy assets, run tests, commit, and tag)
npm run release <newVersion>.
- when running a command in terminal that has `(tabs)` somewhere in the path, remember to use proper quotes to avoid errors.
