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
- **Bulk queue jobs run in the main process**: "Add to Queue / Play All / Play Next / Add to Playlist / Download All" over a whole collection or artist are owned by `QueueJobService` (`src/main/services/queue-job.service.ts`), not by the view. The renderer only dispatches `bulk:start` and renders progress. This replaced a renderer-driven `for…of` loop that awaited one `collection:get-album` per album — 2 IPC round trips each, no concurrency, no cancellation, and it died on navigation. **`start()` is synchronous by contract**: it returns the seed `BulkJobProgress` before any `await`, which is what keeps the click from blocking. Do not make it async.
- **Ordered prefix flush, not mobile's out-of-order appends**: albums are fetched with bounded concurrency (`scraping.albumDetailConcurrency`, default 4) but flushed to the queue strictly in input order via a `nextToFlush` pointer over a buffer. Mobile (`mobile/store/index.ts` `addAlbumToQueue`) instead fires unbounded fire-and-forget fetches that append as they land — responsive, but the queue order is arbitrary. Keep the prefix flush.
- **`beforeNetwork` gates only real HTTP**: `ScraperService.getAlbumDetailsWithSource(url, id, { signal, beforeNetwork })` awaits `beforeNetwork` immediately before *every* request on that path (page scrape, mobile-API stream refresh, and the per-track `resolveRedirect`), so a warm album-cache hit consumes no rate-limit budget. `getAlbumDetails` is unchanged and delegates. An aborted fetch returns `{ album: null, source: 'none' }` — callers must classify `signal.aborted` as **cancelled**, not **failed**.
- **`queueEpoch` is the queue-ownership guard**: `PlayerService.getQueueEpoch()` bumps in `clearQueue()` and in `play(track, true)`. A bulk job captures it at start and self-cancels with `cancelReason: 'queue-replaced'` when it changes. Without this, `store.play` (which calls `clearQueue(false)` first) would wipe a partially built queue while the job kept appending into it.
- **`savedQueue` no longer lives in `app_settings`**: it has its own `saved_queue` settings row (`Database.getSavedQueue`/`setSavedQueue`), migrated one-way on startup. It was inside the single settings blob, so **every** `persistQueue()` re-read + re-parsed + re-stringified the whole queue, and `PlayerService.play()` → `isOfflineMode()` → `getSettings()` re-parsed it on every playback start. `offlineMode` is now cached in `PlayerService` and refreshed via `applySettings()` from the `settings:set` handler (the only writer). Never reintroduce a DB read on the play path. `persistQueue` also has a 10s max-wait so a long job's continuous mutations can't defer the write forever.
- **Queue insertion is one splice, one shuffle extension, one broadcast**: `insertItems`/`insertTracksAt` replaced the per-track loop. `addToQueue` keeps its dual-signature shim (used by `remote.service.ts` and radio) and delegates. `extendShuffleOrder` remaps existing indices instead of calling `generateShuffleOrder()` per track — that was O(n²) *and* re-randomized tracks the listener hadn't reached yet, so **shuffle semantics deliberately changed**: existing upcoming order is now preserved. `emitQueueUpdate()` stays synchronous for existing callers but clears any pending coalesced emit; only `{ coalesce: true }` inserts use the 150 ms `scheduleQueueUpdate`.
- **Radio bulk actions don't need a job**: `addRadioToQueue` only builds a placeholder track (stream URLs resolve at play time), so `RadioView`'s bulk path uses `PlayerService.addStationsToQueue` via `radio:add-stations-to-queue` — one IPC call, one broadcast, one toast instead of N of each (`store.addRadioToQueue` toasts per station). `RadioView`'s `bulk-extract`-to-playlist path *does* scrape per station and is still a serial loop.
- **"Download All" over a collection used to download nothing**: `CacheService.downloadAlbum` iterates `album.tracks`, which is always `[]` for collection items, so the old bulk download silently no-oped for every album. `QueueJobService` resolves tracks first (concurrency forced to 1) and fixes it.
- **Bulk progress must not re-render the grid**: `CollectionView` destructures `useStore()` with no selector, so it re-renders on *any* store change including every progress tick. `BulkProgressButton` subscribes to `bulkJob` with a narrow selector and `ItemsGrid` is `React.memo`'d, with `onItemClick` wrapped in `useCallback` — the memo only holds because those props are referentially stable. `CollectionView.bulk.test.tsx` locks both in.

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
- **Bulk jobs bypass `collection:get-album`**: `QueueJobService` calls `ScraperService` directly inside the main process, so stubbing that IPC handler has **no effect** on a bulk job (it did on the old renderer-driven loop). To keep bulk specs off the real network, give mock albums tracks that already have `streamUrl` so the job takes the no-fetch path; test concurrency/ordering/cancellation timing in `queue-job.test.ts` instead.
- **Don't wait on the progress button disappearing**: with no network to wait for, a job can finish before `bulk-progress` ever renders, so `expect(...).not.toBeVisible()` passes while the queue is still filling. Poll the queue itself (`waitForFunction` on `queue.get()`) instead.
- **Known-failing specs**: `artist-bulk-actions` (3), `collection-bulk-actions` (2), `player-controls` ("toggle queue panel"), `playlist`, and `radio-interaction` fail on a clean checkout. Specs that hit real Bandcamp (`radio-player`, `navigation`, `collection-search`) additionally flake in full-suite runs but pass in isolation — always compare against a baseline run before blaming a change.
- **V8 Coverage Merging**: When merging coverage from multiple E2E runs, ensure hits from all runs are merged. Filtering by `scriptId` across JSON files can cause 0% reporting.

### Desktop Unit Test Conventions (Vitest)

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

### Desktop Unit Test Conventions (Vitest) — Bulk Queue Jobs

- **A mocked `useStore` must honour selectors.** `(useStore as any).mockReturnValue(mockStore)` hands the *whole store* to `useStore(s => s.bulkJob)`, making it truthy and silently rendering the running-state branch — which is how `CollectionView.test.tsx` started reporting "found multiple elements by [data-testid=icon-refresh]". Use `mockImplementation((sel) => sel ? sel(state) : state)`.
- **`mockDatabase` needs `getSavedQueue`/`setSavedQueue`** or every test in `player.test.ts` dies in the constructor. Same class of failure as the `clearAlbumCaches` one.
- **`offlineMode` is cached at construction**, so a test that changes the `getSettings` mock must rebuild `PlayerService` (or call `applySettings`) — the outer `beforeEach` has already constructed it. Assert `expect(mockDatabase.getSettings).not.toHaveBeenCalled()` after construction to prove the play path is DB-free.
- **`run()` args for `saved_queue` are `(key, value)`**, the opposite of `setSettings`'s `(value, key)`. Assert on `c[0] === 'saved_queue'`.
- **Testing the non-blocking contract**: mock the fetch to return a never-resolving promise, then assert `start()` already returned a `running` progress object and that nothing was queued yet. That directly encodes "synchronous by contract".
- **Testing ordered flush**: give items deliberately shuffled fetch delays (e.g. completion order 3,1,4,0,2) and assert `insertTracksAt` was called in input order — plus that *nothing* was inserted before item 0 landed.
- **`vi.mock` replaces the component wholesale, so it bypasses `React.memo`.** A render-count test against a mocked `ItemsGrid` measures the mock, not your memoization. Either wrap the mock in `memo` too, or assert the thing your code actually controls: that the props handed to the grid keep the same identity across renders.
- **Insert new tests into the `describe` that owns the fixtures.** `scraper.test.ts` has several blocks; only "Album Detail Cache" defines `mockDatabase`, `cachedAlbum` and `albumUrl`.

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
