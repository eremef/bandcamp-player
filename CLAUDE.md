# Beta Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, auto-updates via GitHub, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Tech Stack

- **Desktop**: Electron 40, React 19, TypeScript 5.9, Zustand 5, Vite 7
- **Database**: better-sqlite3 (SQLite). FTS5 full-text search is **mobile-only** (`mobile/services/MobileDatabase.ts`); desktop search filters in memory
- **Scraping**: Cheerio (no official Bandcamp API exists)
- **Testing**: Vitest + happy-dom (unit), Playwright (E2E)
- **Mobile**: React Native via Expo (version in mobile/package.json), expo-router, react-native-track-player

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
- **Scalable Collection Caching**: Collections are persisted in `collection_cache` as one JSON blob per cache key and served **cache-first** on startup, so the grid renders without a network round-trip. `ScraperService.maybeBackgroundRefresh()` triggers a background refresh only when the cached row is >24h old, and it is reached from both the DB-hit and warm-memory paths (the latter is what makes the 4h timer in `main.ts` effective). Never call `fetchCollection(true)` on a launch path — `forceRefresh` skips all three cache layers.
- **Chromecast Robustness**: `CastService` handles rapid reconnections and `INVALID_MEDIA_SESSION_ID` errors with automatic state recovery.
- **Mobile Standalone Mode**: Mobile app has a native audio engine (react-native-track-player) for independent Bandcamp playback with background playback support.
- **Hybrid Connectivity**: Mobile maintains a background WebSocket to the desktop server even in Standalone mode for seamless mode switching.
- **Standalone Queue Persistence**: Mobile saves track/queue to `AsyncStorage` on modification and restores on relaunch.
- **Persistent Remote Connection**: Mobile re-establishes its WebSocket connection even in Standalone mode.
- **Theme Support**: System/Light/Dark themes with persistent settings.
- **Two Distinct Caches**: `audio_cache` holds downloaded MP3s and is **manual-only** — nothing caches on play, and `downloadTrack` is reached solely from explicit UI actions. `collection_cache` holds scraped metadata (collection blobs, plus album details under `album:<id>` keys with `type='album'`). Users conflate them; keep the distinction clear when discussing "the cache".
- **Album Detail Persistence**: `getAlbumDetails(url, albumId?)` serves from `collection_cache` when the id is supplied (the URL is not a usable key — trailing slashes, `?from=` params, and the track→album redirect all differ per album). Metadata TTL is 30 days, stream URLs 6h, and pre-orders are never served from cache since their tracks gain stream URLs at release. **Bandcamp stream URLs expire**, so an expired cache entry is repaired by one bulk `tralbum_type=a` mobile-API call; if that fails, `streamUrl` is blanked while `hasStream` is preserved so `PlayerService` resolves it at play time. Treat `hasStream` as the playability signal, never the presence of a `streamUrl`.
- **Cache Key Fragility**: `userId` comes from the menubar API and is not stable across launches (it falls back to the cookie fan id on failure, and is the *band* id for artist accounts). `getCollectionCacheIds()` builds every candidate key and `readCollectionCache()` tries `cacheId` → `fanCacheId` → `anonymous`, self-healing to the primary key only on a fan-id hit — never from `anonymous`, which would stamp an anonymous collection onto a real user.
- **Bandcamp Playlist Loading**: Bandcamp playlists arrive from `getBandcampPlaylists()` as stubs with `tracks: []`; the tracks are scraped lazily on first open. `selectPlaylist()` therefore **navigates to `playlist-detail` first**, sets `loadingBandcampPlaylistId`, and only then awaits the scrape — awaiting before navigating made the click look dead for seconds. The scrape result is applied to `selectedPlaylist` only while `selectedPlaylistId` still matches, so navigating away mid-scrape can't yank the user's view back. `loadingBandcampPlaylistId` drives all three indicators (PlaylistsView card overlay, Sidebar row spinner, PlaylistDetailView track-list spinner) and is also set by `playPlaylist()` for Bandcamp playlists.
- **Infinite Scroll Re-arming**: `useIntersectionObserver` **re-observes the sentinel after every positive hit**. An `IntersectionObserver` only reports intersection *changes*, so on a window tall enough that the newly loaded page still doesn't overflow, the sentinel stays visible, no second callback arrives, and loading stalls until the user resizes — the bug this fixes in `ItemsGrid` (and `RadioView`, same hook). Re-arming forces a fresh initial notification against the post-render layout, so pages keep filling until the sentinel is pushed out of view.
- **Re-arm must be scheduled through state, never inline**: the callback bumps a `rearmCount` state counter, which re-runs the effect and builds a new observer (so `rearmCount` is in the dep array but is never read in the body). An inline `unobserve` + `observe` pair looks equivalent and is not: the IO callback runs in its own task, so the browser can deliver the re-armed notification *before* React commits the new page. It then measures against the pre-load layout, still sees the sentinel intersecting, and fires again — one scroll jumps several pages, worst on `--simulate-large-collection` at large cover size where a commit can exceed a frame. Going through state defers the re-arm until after commit. `useIntersectionObserver.test.tsx` locks this in with two `flush()` calls inside one `act()` (two frames, no commit between): it must load exactly one page. That test is the only one that fails if the re-arm is moved back inline — verify any change to this hook against it.
- **Infinite scroll caller contract**: re-arming turns a passive observer into a self-driving loop, so **callers must make progress in `onIntersect` and stop the hook when the list is exhausted** — a caller that does neither gets a repeating callback, and one whose `onIntersect` starts an async fetch it can't cancel gets duplicate requests until `enabled` flips. Both call sites stop it twice over: `enabled` goes false (`items.length > visibleCount`) *and* the sentinel unmounts on the same predicate, which re-runs the effect and disconnects. Only the `enabled` guard is load-bearing by design; the unmount is incidental, so don't rely on it. The hook is generic — if you ever use it for something that isn't paging (lazy images, analytics pings), remember the callback repeats while the element is visible.
- **Queue "follow the playing track"**: both queue views highlight the current row (left accent bar + tinted background + bold accent title) and auto-scroll to it. The scroll fires on open (desktop: the panel *unmounts* when closed, so mount-time positioning is enough) / on tab focus (mobile: tab screens stay mounted, so `useFocusEffect` is what covers "opening the queue"), and again on every track change. The follow is guarded by one rule on both platforms: **skip if a drag is in progress, or if the *outgoing* current row was not on screen** — so it follows while you watch the playing area and leaves you alone once you scroll off to browse. The "was it visible" range comes from Virtuoso's `rangeChanged` (desktop) and `onViewableItemsChanged` (mobile), and both refs start as `null` meaning *unknown → allow*; seeding `{startIndex:0,endIndex:0}` instead reads as "only row 0 is visible" and silently suppresses legitimate follows before the first callback fires. Accepted limitation: a track change that lands mid-drag is dropped, not replayed.
- **`initialTopMostItemIndex` can render past the end of the data**: Virtuoso renders `initialItemCount` rows **starting at** `initialTopMostItemIndex` and does **not** clamp that window against the data length, so `itemContent` gets handed `undefined` and throws. This is reachable for any queue shorter than the count with the current track off the first row (a 12-track album playing track 5). `QueuePanel` therefore derives both props together — `initialTopMostIndex = clamp(currentIndex, 0, len-1)` and `initialItemCount = min(50, max(1, len - initialTopMostIndex))` — plus an `!item` bail in `itemContent` as a net. Also note `initialTopMostItemIndex` is **mount-only** (its one-shot subscription is reset only by `didMount`), so re-scrolling on track change *must* go through the `VirtuosoHandle` ref; and pass it as a **plain number** — any object form (even `{index:0, align:'center'}`) is treated as non-trivial and renders the list with inline `visibility:hidden` until the initial scroll settles.
- **`react-native-draggable-flatlist` prop forwarding is not uniform**: it spreads `{...props}` onto the inner FlatList and *then* overrides some, so `onScroll` and `removeClippedSubviews` you pass are **silently discarded** (use its own `onScrollOffsetChange` instead). `onViewableItemsChanged` *is* honoured — DFL wraps its own and forwards to yours — and `getItemLayout`, `onLayout`, `keyExtractor` pass straight through. Its `ref` must be a **ref object, not a callback ref** (`refContext.tsx` dereferences `.current` for its own drag-autoscroll), typed with the `FlatList` from `react-native-gesture-handler`. With `getItemLayout` supplied, `onScrollToIndexFailed` is unreachable — but `scrollToIndex` still **throws** an invariant for an out-of-range index, so range-check before calling.
- **Mobile row height is pinned, deliberately**: `mobile/app/(tabs)/queue.tsx` derives `ITEM_HEIGHT` from `ARTWORK_SIZE`/`ROW_PADDING_V`/`ROW_BORDER` and sets `height: ITEM_HEIGHT` on the row, so `getItemLayout` cannot drift. Without the explicit height, 65px only holds while the text column stays under the artwork height — OS font scaling breaks that silently. Both `Text`s are already `numberOfLines={1}`.
- **Mobile `high-contrast` needs its own highlight token**: in that palette `colors.input === colors.background === '#000000'`, so the queue's old `backgroundColor: colors.input` current-row tint was **invisible**. `mobile/theme/index.ts` now carries a `highlight` token in all three palettes (`ColorTheme = typeof Colors.dark`, so adding it to only one is a type error). Never reuse `input`/`card` as a "slightly different from the background" colour — neither is, under high contrast.

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
- **Cache-first vs forced refresh is invisible in most specs**: every pre-existing spec stubs `collection:fetch` and `collection:refresh` with the *same* fixture, so a regression swapping one for the other passes. `e2e/collection-cache.spec.ts` deliberately stubs them with **different** fixtures (and a delayed refresh) to assert which path ran.
- **Known-failing specs**: `artist-bulk-actions` (3), `collection-bulk-actions` (2), `player-controls` ("toggle queue panel"), `playlist`, and `radio-interaction` fail on a clean checkout. Specs that hit real Bandcamp (`radio-player`, `navigation`, `collection-search`) additionally flake in full-suite runs but pass in isolation — always compare against a baseline run before blaming a change.
- **V8 Coverage Merging**: When merging coverage from multiple E2E runs, ensure hits from all runs are merged. Filtering by `scriptId` across JSON files can cause 0% reporting.

### Desktop Unit Test Conventions (Vitest)

- **Never write a ref (or any outer variable) during render — the lint rules are errors, not warnings**: `react-hooks/refs` ("Cannot access refs during render") and `react-hooks/immutability` ("This value cannot be modified") both fail `npm run lint`. This bites **test mocks too**: a `vi.mock('react-virtuoso')` stub that captures `props` into a module-level ref during render is an error — capture it in a `useEffect` instead (`render()` flushes effects, so the props are still available to assertions). In components, mirror state into a ref via an effect, or just add the state to the effect's dep array when an extra no-op run is harmless.
- **Virtuoso scrolling cannot be asserted against the real component**: its scroll callback early-returns while the scroller's `offsetHeight` is 0, which is always true under happy-dom, and `VirtuosoMockContext` mocks the *system's* measurements, not the DOM node's. `vi.mock` is also hoisted per file, so it cannot be scoped to one `describe`. The split used for the queue is the pattern: `QueuePanel.test.tsx` keeps rendering the **real** Virtuoso (its `initialItemCount` is what makes rows appear at all), and `QueuePanel.autoscroll.test.tsx` mocks `react-virtuoso` with a ~20-line stub that exposes `scrollToIndex` through `useImperativeHandle` and records the props, so `initialTopMostItemIndex`, `rangeChanged` and the imperative scroll can all be asserted directly.
- **Mutation-test a guard before trusting it**: both queue auto-scroll guards were verified by deleting the guard line and confirming that *exactly* the one intended test failed. A guard test that passes against the mutated code is asserting nothing.

- **HTMLAudioElement `duration`**: Defaults to `NaN` in happy-dom. Mock it explicitly: `Object.defineProperty(audio, 'duration', { value: 100, configurable: true })`.
- **Node environment**: Files requiring `http`, `dgram`, `os`, `ws` must declare `/** @vitest-environment node */` at the top.
- **Mocking HTTP servers**: Capture the request handler passed to `http.createServer` by intercepting `listen`. Invoke it with mocked `req`/`res` objects to test route logic.
- **Mocking WebSocketServer (`ws`)**: Use an `EventEmitter` for the server. Manage `wss.clients` Set manually — add on `connection`, remove on client `close`, clear on `wss.close()`. Prevents stale connections leaking between tests.
- **A newly added `vi.fn()` on the `mockElectron` object is not inert**: in `store.test.ts` the missing `playlist.getBandcampPlaylists` used to throw (caught, state untouched). Adding the mock made it resolve `undefined`, which `set({ bandcampPlaylists: playlists })` wrote straight into state and broke an *unrelated* test with `Cannot read properties of undefined`. Give new mock methods a `mockResolvedValue` in `beforeEach`, and default IPC results in the store (`playlists ?? []`).
- **`store.test.ts`'s `beforeEach` state reset is a hand-written allowlist**, not a full store reset — new slice fields leak across tests until they're added there.
- **Testing "navigate first, load later"**: hold the IPC promise open with a captured `resolve`, `await act()` the un-awaited `selectPlaylist(...)` call to assert the intermediate loading state, then resolve inside a second `act()` and await the stored promise.
- **`vi.mock('lucide-react')` is an explicit allowlist**: `PlayerBar.test.tsx` (and similar) enumerate every icon. Rendering a *child* component pulls in the child's icons too — `AddToPlaylistModal` needs `X`, `Music`, `Plus`. A missing entry is `undefined` at render time ("Element type is invalid") and only fails once the child actually renders, so a closed modal hides the problem. Likewise add the child's store fields (`playlists`, `createPlaylist`) to the parent's `mockStore`.

### Desktop Unit Test Conventions (Vitest) — Async Rejection Traps

- **`return promise` inside `try` does NOT hit the enclosing `catch`**: only `return await` does. This caused a real bug where `CacheService.downloadTrack` leaked `activeDownloads` entries on failure, making every retry a silent no-op. When a method registers cleanup state, use `await` + `finally`, and add an identity check (`if (map.get(k) === myController)`) so a dying attempt can't clear a newer one's entry.
- **Never do file I/O or DB writes inside a stream's `finish` listener**: a throw there becomes an uncaught main-process exception instead of a rejection. Do it after `await`ing the stream promise.
- **axios `responseType: "stream"` breaks `AbortController`**: axios resolves on headers and tears down its own abort plumbing before the stream-error hook exists, so `controller.abort()` silently does nothing. Register your own `signal.addEventListener("abort", ...)` inside the promise executor.
- **Test doubles for streams are bare `EventEmitter`s** with no `destroy`. Guard teardown helpers with `typeof s?.destroy === "function"` or existing tests crash with a TypeError.
- **Assert cleanup, not just rejection**: `expect(promise).rejects.toThrow()` passed happily while the leak persisted. The test that actually catches it retries the operation and asserts `expect(axios).toHaveBeenCalledTimes(2)`.
- **Mocked databases need every method the code touches**: adding `clearAlbumCaches`/`getAlbumCache` to `CacheService` broke `cache.test.ts` until the mock object gained them. Same for `replaceArtists` in `scraper.test.ts`.
- **Don't stub globals without restoring**: a `global.AbortController = vi.fn()` stub with no teardown poisons every later test in the file that needs a real one.
- **Counting axios calls is ambiguous in `scraper.test.ts`**: a successful `fetchCollection` also fires a radio-station refresh through the same mock. Filter `mock.calls` by URL instead of asserting a total.

### Desktop Unit Test Conventions (Vitest) — Cache Indicators

- **Album-level cache detection**: Collection view albums often have `tracks: []` before being opened. To detect fully-cached albums without loading tracks, `album_id` is stored in `audio_cache` DB entries. `getCachedTracks()` returns this `albumId` on each stub Track so the store can build a `cachedAlbumIds` set by comparing cached-track-counts-per-album against `album.trackCount`.
- **`cachedAlbumIds` derivation**: Computed via a module-level `_cachedTrackCountByAlbum` map (albumId → cached track count) populated in `fetchCachedTrackIds()`. A standalone `deriveCachedAlbumIds(collection)` helper re-evaluates the Set from that map without a second IPC call. It is invoked in three places: `fetchCachedTrackIds()`, `fetchCollection()` (after `set({ collection })`), and the `onUpdated` collection event handler — ensuring the indicator is correct regardless of whether the cache or the collection loads first.
- **`downloadingAlbumIds` tracking**: A module-level `Map<string, string>` (`_downloadingTrackAlbums`: trackId → albumId) lives outside Zustand state. It is updated in `downloadTrack` and used to recompute `downloadingAlbumIds` after each track finishes — avoids needing a full map in serialisable Zustand state.
- **Cache cleared eagerly**: `clearCache()` immediately sets `cachedTrackIds` and `cachedAlbumIds` to empty Sets before the async `fetchCachedTrackIds` re-confirms, so indicators disappear instantly.
- **AlbumCard mock fields**: Tests must include `cachedAlbumIds: new Set<string>()` and `downloadingAlbumIds: new Set<string>()` in the store mock object alongside the existing `cachedTrackIds` / `downloadingTracks`.
- **`addCacheEntry` albumId assertion**: Use `expect.objectContaining({ trackId, albumId })` — the field is `undefined` for radio/playlist tracks that have no `albumId`.

### Mobile Unit Test Conventions (Jest)

- **State isolation**: Zustand stores and `AsyncStorage` leak between tests. Reset with `useStore.setState()` in `beforeEach`.
- **`act()` with `RefreshControl`**: Triggering pull-to-refresh via `props.onRefresh()` requires `act(async () => ...)` to avoid VirtualizedList warnings.
- **`expo-router` mock**: Must include `useFocusEffect` (no-op or caller) to support screens that refresh on focus.
- **Async state updates**: `await` store `connect()` calls and use `waitFor()` for asynchronous state assertions.
- **Mock modifiers**: Use `mockReturnValue()`/`mockResolvedValue()` by default. Only use `*Once` variants when testing sequential behavior differences — `*Once` causes subsequent internal calls to return `undefined`.
- **Mock cleanup**: Use both `jest.clearAllMocks()` and `jest.restoreAllMocks()` in `beforeEach`.
- **Partial type mocks**: Cast partial objects with `as unknown as Track` when the logic only uses specific fields.
- **`jest.mock('lucide-react-native')` is an explicit allowlist**, exactly like the desktop `lucide-react` mocks: every screen test enumerates the icons it expects (`player.test.tsx`, `collection.test.tsx`, …). Adding an icon to a screen without adding it to that mock makes it `undefined` at render, which fails *every* test in the file, not just the new one.
- **Run mobile tests with the local jest** (`npm run test:mobile`, or `npx jest` from `mobile/`). Running `npx jest --config mobile/jest.config.js` from the repo root pulls a different jest version and every suite dies with `this._moduleMocker.clearMocksOnScope is not a function`.
- **The global `useFocusEffect` mock fires during render, on every render**: `mobile/jest.setup.js` mocks it as `(callback) => { callback(); }` — so it runs *before refs are attached* on the first render, repeats on every subsequent one, and its cleanup never runs. Fine for the "refresh on focus" screens, useless for asserting focus-triggered behaviour. Override it locally in the test file with real semantics (`useFocusEffect: (cb) => require('react').useEffect(cb, [cb])`) when focus timing is what's under test.
- **Out-of-scope variables in a `jest.mock()` factory must be `mock`-prefixed** (case-insensitive) or the suite dies with `The module factory of jest.mock() is not allowed to reference any out-of-scope variables`. `mockScrollSpy` / `mockListProps` are fine; `scrollSpy` / `listProps` are not. (The pre-existing `dragEndRef` in `queue.test.tsx` escapes this only because it is never read inside the factory body's own scope check.)
- **To assert list scrolling, hand the component a spy handle**: the `react-native-draggable-flatlist` mock in `queue.test.tsx` returns a `useImperativeHandle(ref, () => mockScrollSpy)` instead of forwarding `ref` to the inner real `FlatList` — RN's real `scrollToIndex` is meaningless without layout and its invariants throw. The mock also captures `props` so tests can drive `onViewableItemsChanged` / `onDragBegin` directly, and destructures non-FlatList props (`onDragBegin`, `onViewableItemsChanged`) out of the `{...rest}` spread.
- **Assert highlight styling through `StyleSheet.flatten`**: give rows a `testID` (`queue-item-${index}`) and flatten `props.style` to check `backgroundColor`/`borderLeftColor`. Since `mockStore` has no `theme` key, `useTheme()` falls through to `Colors.dark`; add `theme: 'high-contrast'` to the mocked store to cover that palette.

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
