# Bandcamp Desktop Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, auto-updates via GitHub, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Tech Stack

- **Desktop**: Electron 40, React 19, TypeScript 5.9, Zustand 5, Vite 7
- **Database**: better-sqlite3 (SQLite with FTS5 for full-text search)
- **Scraping**: Cheerio (no official Bandcamp API exists)
- **Testing**: Vitest + happy-dom (unit), Playwright (E2E)
- **Mobile**: React Native via Expo 54, expo-router, react-native-track-player

## Repository Structure

```
src/
  main/           # Electron main process (Node.js backend)
    services/     # Feature services (auth, player, scraper, cache, etc.)
    database/     # SQLite operations
    main.ts       # App entry, window management
    preload.ts    # IPC bridge (context bridge to renderer)
    ipc-handlers.ts
  renderer/       # React frontend
    components/   # Feature-grouped UI components
    store/        # Zustand state slices
    hooks/        # Custom React hooks
  shared/
    types.ts      # All TypeScript interfaces (Track, Album, Playlist, etc.)
    ipc-channels.ts  # IPC channel name constants
    remote-config.service.ts
  assets/
    remote/       # Web remote interface (index.html, client.js, styles.css)
    icons/        # App icons for all platforms
mobile/           # React Native (Expo) app
  __tests__/      # All mobile unit tests must live here
e2e/              # Playwright end-to-end tests
  fixtures.ts     # Custom Electron app launcher fixture
scripts/          # Build/release utilities
docs/             # SPEC.md, REMOTE_SPEC.md, TEST_SPEC.md
remote-config.json  # CSS selectors and regexes used by ScraperService
```

## Development Commands

```bash
# Development
npm run dev              # Watch all + launch Electron
npm run dev:large        # Same with --simulate-large-collection (5000 items)

# Build
npm run build            # Full production build (main + renderer + assets)
npm run build:main       # TypeScript compilation only
npm run build:renderer   # Vite bundler only
npm run package          # test + build + electron-builder installer

# Testing
npm test                 # Unit tests (vitest run + build:main, concurrent)
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report
npm run test:e2e         # Playwright E2E
npm run test:mobile      # Mobile Jest tests

# Quality
npm run lint             # ESLint on src/
npm run lint:mobile      # ESLint on mobile/
npm run typecheck        # tsc --build

# Utilities
npm run release <ver>    # Bump version, copy assets, test, commit, tag
npm rebuild              # Rebuild native modules (required after node_modules changes)
```

## Architecture

### IPC Communication Pattern

All desktop features follow this pattern:

1. **Constants**: `src/shared/ipc-channels.ts` — typed channel name objects per feature (`AUTH_CHANNELS`, `PLAYER_CHANNELS`, etc.)
2. **Handlers**: `src/main/ipc-handlers.ts` — registers `ipcMain.handle()` for each channel
3. **Bridge**: `src/main/preload.ts` — exposes typed API on `window.electron` via `contextBridge`
4. **Types**: `src/renderer/electron.d.ts` — TypeScript declarations for the exposed API
5. **Usage**: Renderer calls `window.electron.<feature>.<method>()`

Never use CommonJS `require()` in TypeScript files — ESM imports only.

### State Management

Zustand store in `src/renderer/store/store.ts` with slices for: auth, player, queue, collection, playlists, settings, radio, cache, scrobbler, remote, cast.

### Remote Config Pattern

`remote-config.json` at the root defines CSS selectors and regexes used by `ScraperService` and `MobileScraperService`. `RemoteConfigService` uses the local file immediately but fetches the live version from GitHub `main` in the background — allowing scraping fixes without app redeployments.

### Key Services (src/main/services/)

| Service | Purpose |
|---------|---------|
| `auth.service.ts` | Bandcamp session authentication |
| `scraper.service.ts` | HTML scraping via Cheerio |
| `player.service.ts` | Audio playback (HTMLAudioElement) |
| `cache.service.ts` | Offline caching (1–50 GB configurable) |
| `playlist.service.ts` | Playlist CRUD |
| `scrobbler.service.ts` | Last.fm integration |
| `remote.service.ts` | WebSocket-based remote control |
| `cast.service.ts` | Chromecast discovery and casting |
| `tray.service.ts` | System tray |
| `updater.service.ts` | Auto-updates via electron-updater + GitHub Releases |
| `simulation.service.ts` | Synthetic 5000-item collection for testing |

## Critical Notes

- **Shell**: Use `;` for sequential commands on Windows (PowerShell). On Linux/macOS use `&&`.
- **Android**: Requires OpenJDK 17 (`JAVA_HOME` must point to Java 17). Java 24+ is NOT supported. Also requires CMake 3.22.1. React Native version must match `react` 19.1.0.
- **Mobile Tests**: All mobile unit tests must be in `mobile/__tests__/` to avoid Expo Router bundling errors.
- **Native Module Rebuilds**: Run `npm rebuild` if E2E tests fail with "The specified module could not be found" (e.g., `better-sqlite3`). Native bindings must match the Electron version.
- **Updates**: `UpdaterService` checks for updates 15 seconds after startup and every 24 hours thereafter using `electron-updater` + GitHub Releases.
- **Web Remote**: Static files in `src/assets/remote/`. Icons are injected at runtime by `RemoteService`.
- **Simulation Mode**: `npm run dev:large` simulates 5000 items with network errors to test scalability and resilience.
- **Scalable Collection Caching**: Large collections are persisted in SQLite with FTS5 for instant full-text search. Cache refreshes daily in the background.
- **Chromecast Robustness**: `CastService` handles rapid reconnections and `INVALID_MEDIA_SESSION_ID` errors with automatic state recovery.
- **Mobile Standalone Mode**: Mobile app has a native audio engine (react-native-track-player) for independent Bandcamp playback with background playback support.
- **Hybrid Connectivity**: Mobile maintains a background WebSocket to the desktop server even in Standalone mode for seamless mode switching.
- **Standalone Queue Persistence**: Mobile saves track/queue to `AsyncStorage` on modification and restores on relaunch.
- **Persistent Remote Connection**: Mobile re-establishes its WebSocket connection even in Standalone mode.
- **Theme Support**: System/Light/Dark themes with persistent settings.

## Testing

### Running Tests

```bash
# Unit tests (run concurrently with build:main)
npm test

# E2E tests
npx playwright test

# Coverage reports (JSON format preferred)
npx vitest --coverage --coverage.reporter=json-summary
npx jest --coverage --coverageReporters="json-summary"
```

### After Implementing Features

- Always run lint and tests, and update them to reflect new behavior
- Decide if new features need tests; if so, create them
- Update CLAUDE.md with new learnings

### E2E Test Conventions (Playwright)

- **Toggle switches**: `setChecked()` fails on `opacity:0` inputs. Use `evaluate(el => el.click())` instead.
- **Selectors**: Avoid CSS module selectors like `[class*="SettingsModal_modal"]` — they break in production builds. Prefer `getByRole`, `getByTitle`, `locator('text=...')`.
- **Scrollable modals**: Settings modal requires `scrollIntoViewIfNeeded()` on visible labels before interacting with hidden inputs below the fold.
- **Radio cards**: Only the card root has `onClick` for `playRadioStation()`. Click the card, not the inner play button overlay.
- **Play button ambiguity**: Multiple "Play" buttons exist (album detail + player bar). Scope locators rather than using `getByRole('button', { name: 'Play', exact: true })`.
- **Context menus**: `click({ button: 'right' })` is more reliable than hover → menu button.
- **Fixture teardown**: `fixtures.ts` wraps `electronApp.close()` in try/catch — tests that relaunch the app cause double-close otherwise.
- **Checkbox order** (by `getByRole('checkbox').nth(n)`): 0=Enable Caching, 1=Minimize to Tray, 2=Start Minimized, 3=Show Notifications, 4=Enable Remote Control.
- **Back button**: Requires an explicit visibility wait before clicking — not immediately available after navigation.
- **Audio streaming**: Real Bandcamp audio doesn't work in E2E. Test UI state, not actual playback.
- **Zustand injection**: `window.evaluate` on `useStore` only works if the store is globally exposed. Use `CustomEvent` dispatch or mock `window.electron` IPC methods instead.
- **IPC mocking**: `contextBridge` makes `window.electron` read-only — `window.evaluate` assignments silently fail. Mock at the main process level instead: `electronApp.evaluate(({ ipcMain }, data) => { ipcMain.removeHandler('channel'); ipcMain.handle('channel', async () => data); }, data)`. Then click Refresh or trigger a re-fetch to load mock data.
- **Obstructed elements**: Elements near absolute-positioned overlays may need `{ force: true }` or `element.evaluate(el => el.click())`.
- **Strict mode**: `getByTitle`/`getByLabel` can match multiple elements on substring. Use `{ exact: true }` or scope to parent containers.
- **Conditional toggling**: Check if a panel (Queue, Settings, Playlists) is already open before clicking to avoid accidentally closing it.
- **Item counts**: Avoid hardcoding expected track counts — use `toBeGreaterThan(0)` unless mock data is fixed.
- **V8 Coverage Merging**: When merging coverage from multiple E2E runs, ensure hits from all runs are merged. Filtering by `scriptId` across JSON files can cause 0% reporting.

### Desktop Unit Test Conventions (Vitest)

- **HTMLAudioElement `duration`**: Defaults to `NaN` in happy-dom. Mock it explicitly: `Object.defineProperty(audio, 'duration', { value: 100, configurable: true })`.
- **Node environment**: Files requiring `http`, `dgram`, `os`, `ws` must declare `/** @vitest-environment node */` at the top.
- **Mocking HTTP servers**: Capture the request handler passed to `http.createServer` by intercepting `listen`. Invoke it with mocked `req`/`res` objects to test route logic.
- **Mocking WebSocketServer (`ws`)**: Use an `EventEmitter` for the server. Manage `wss.clients` Set manually — add on `connection`, remove on client `close`, clear on `wss.close()`. Prevents stale connections leaking between tests.

### Mobile Unit Test Conventions (Jest)

- **State isolation**: Zustand stores and `AsyncStorage` leak between tests. Reset with `useStore.setState()` in `beforeEach`.
- **`act()` with `RefreshControl`**: Triggering pull-to-refresh via `props.onRefresh()` requires `act(async () => ...)` to avoid VirtualizedList warnings.
- **`expo-router` mock**: Must include `useFocusEffect` (no-op or caller) to support screens that refresh on focus.
- **Async state updates**: `await` store `connect()` calls and use `waitFor()` for asynchronous state assertions.
- **Mock modifiers**: Use `mockReturnValue()`/`mockResolvedValue()` by default. Only use `*Once` variants when testing sequential behavior differences — `*Once` causes subsequent internal calls to return `undefined`.
- **Mock cleanup**: Use both `jest.clearAllMocks()` and `jest.restoreAllMocks()` in `beforeEach`.
- **Partial type mocks**: Cast partial objects with `as unknown as Track` when the logic only uses specific fields.

## Code Conventions

- **TypeScript strict mode** across all configs
- **Path aliases**: `@shared/*` → `src/shared/`, `@renderer/*` → `src/renderer/`
- **Tests colocated** with source: `*.test.ts` / `*.test.tsx` next to their source files (except mobile — see `mobile/__tests__/`)
- **No CommonJS `require()`** in TypeScript files — ESM only
- **Unused args**: Prefix with `_` to suppress ESLint warnings
- **Test logs**: Write temporary test files to the `test_logs/` folder
- **Coverage reports**: Use JSON format — `--coverage.reporter=json-summary` (Vitest), `--coverageReporters="json-summary"` (Jest). For multiple Vitest reporters, pass the flag multiple times.

## Release Process

```bash
npm run release <newVersion>
# Bumps version, copies assets, runs tests, commits, and creates git tag
```

## Git Workflow

- Do not `git add` automatically after making changes
- Always update CLAUDE.md with new learnings discovered while creating or fixing tests
