# Test Specification

## Overview

This document outlines the testing strategy, architecture, and workflows for the Bandcamp Player project. The goal is to ensure code reliability across both the Electron desktop application and the React Native mobile application.

## Architecture

The project uses a split testing architecture to accommodate the distinct runtimes of Electron and React Native.

### Desktop (Electron/React)

- **Framework**: [Vitest](https://vitest.dev/)
- **Environment**: `happy-dom` (fast DOM simulation for React components)
- **Runner**: Node.js
- **Configuration**: `vitest.config.ts`
- **Setup**: `src/test/setup.ts`
  - Installs `@testing-library/jest-dom` matchers.
  - Mocks Electron IPC headers (`window.electron`) and API (`window.api`).
- **Scope**: Covers `src/main` (backend logic) and `src/renderer` (frontend UI/Store).
- **Environment Handling**:
  - `src/main/services/*.test.ts` should use `// @vitest-environment node` to avoid browser-only limitations (like missing `process.argv`).
  - `src/test/setup.ts` is cross-environment safe (checks for `window` before mocking).

### Mobile (React Native)

- **Framework**: [Jest](https://jestjs.io/)
- **Preset**: `react-native` (Standard Jest preset)
- **Environment**: Node.js with Native Module mocks
- **Configuration**: `mobile/jest.config.js`
- **Setup**: `mobile/jest.setup.js`
  - Mocks `AsyncStorage`.
  - Mocks `react-native-track-player`.
  - Mocks shared dependencies.
- **Scope**: Covers `mobile/` directory logic.

### E2E (Electron + Playwright)

- **Framework**: [Playwright](https://playwright.dev/) with custom Electron fixtures
- **Configuration**: `playwright.config.ts` (4 workers default, 1 retry, 60s timeout)
- **Fixtures**: `e2e/fixtures.ts` — launches Electron app, provides `electronApp` and `window` fixtures
- **Mock Authentication**: `E2E_TEST=true` env var makes `AuthService.login()` return a mock user ("Test User") without opening a real Bandcamp login window
- **User Data Isolation**: Each worker gets its own `--user-data-dir` and `REMOTE_PORT` to avoid conflicts in parallel runs
- **Scope**: Full application user flows against the built Electron app

## Commands

| Command | Description | Scope |
| --- | --- | --- |
| `npm test` | Runs all desktop unit tests. | Desktop |
| `npm run test:watch` | Runs desktop tests in watch mode. | Desktop |
| `npm run test:coverage` | Generates coverage report for desktop. | Desktop |
| `npm run test:mobile` | Runs all mobile unit tests. | Mobile |
| `npm run test:e2e` | Runs all E2E tests (Playwright). | E2E |
| `npx playwright test` | Runs E2E tests sequentially (more reliable). | E2E |
| `npm run build` | Runs desktop tests before building. | Desktop |

## Directory Structure

Tests for Desktop are co-located with the source code (`*.test.ts`).
Tests for Mobile are located in `mobile/__tests__/` to prevent checking them into production bundles or conflicting with Expo Router file-based routing.
E2E tests live in `e2e/` with shared Playwright fixtures in `e2e/fixtures.ts`.

```text
src/
├── main/
│   └── services/
│       ├── scraper.service.ts
│       └── scraper.test.ts      # Backend Service Tests
└── renderer/
    └── store/
        ├── store.ts
        └── store.test.ts        # Frontend Store Tests

e2e/
├── fixtures.ts                  # Shared Electron launch/teardown fixtures
├── album.spec.ts                # Album detail navigation
├── album-detail.spec.ts         # Track list & queue actions
├── artist-view.spec.ts          # Artist list & detail navigation
├── auth.spec.ts                 # Login/authenticated state
├── collection-search.spec.ts    # Collection search & filtering
├── navigation.spec.ts           # Sidebar navigation between views
├── player-controls.spec.ts      # Shuffle, repeat, mute, queue toggle
├── player-state.spec.ts         # Empty player state & controls
├── playlist.spec.ts             # Create playlist & add album
├── playlist-management.spec.ts  # Create, rename, delete playlists
├── queue.spec.ts                # Queue add, clear, empty state
├── radio.spec.ts                # Radio search
├── radio-player.spec.ts         # Radio station listing
├── remote.spec.ts               # Remote control toggle & URL/QR
├── settings.spec.ts             # Settings open/close & persistence
├── sidebar.spec.ts              # Sidebar nav, user info, playlists
└── theme.spec.ts                # Theme switching (dark/light/system)

mobile/
├── app/
│   └── (tabs)/artists.tsx
└── __tests__/
    └── app/
        └── (tabs)/
            └── artists.test.tsx # Mobile UI Tests
```

## Mocking Strategy

### Shared Code

Since the mobile app imports code from `src/shared` (outside its root), we use a path alias `^@shared/(.*)$`.

- **Desktop**: Vitest resolves this natively via `vite.config.ts` / `vitest.config.ts`.
- **Mobile**: Jest uses `moduleNameMapper` to map `@shared/types` to a local mock (`mobile/__mocks__/shared-types.ts`) to avoid importing files outside the project root context which triggers security errors in standard Metro/Expo setups.

### Native Modules

Native modules (Electron IPC, TrackPlayer) are mocked in the global setup files:

- `src/test/setup.ts`: Mocks `window.electron` methods (`invoke`, `on`, `removeListener`).
- `mobile/jest.setup.js`: Mocks `react-native-track-player`, `AsyncStorage`, and Expo modules (including `@expo/vector-icons`).

## Coverage Map

Test inventories and coverage percentages change as suites evolve, so this section lists representative coverage areas rather than fixed per-file counts.

### Desktop (`npm test` - Vitest)

| Test File | Coverage Focus |
| --- | --- |
| `src/main/services/player.test.ts` | Queue replacement, playback position, action-version guards, and rollback |
| `src/main/services/remote.test.ts` | Capability negotiation, queue chunks, prepare/commit/status, pause leases, and URL validation |
| `src/main/services/cast.service.test.ts` | Cast PLAYING/PAUSED acknowledgements and failures |
| `src/renderer/components/Layout/PlayerBar.test.tsx` | Local audio seek and playback acknowledgements |
| `src/renderer/store/store.test.ts` | Renderer state and IPC integration |

### E2E (`npx playwright test` - Playwright)

E2E tests run against the built Electron application with mock desktop authentication. The fixture does not create an authenticated mobile WebSocket client, so queue handoff protocol and audio acknowledgements are covered by Vitest/Jest. `e2e/remote.spec.ts` covers the QR-first pairing screen and collapsed manual pairing details.

| Spec File | Coverage Focus |
| --- | --- |
| `e2e/player-controls.spec.ts` | Shuffle, repeat, mute, and queue controls |
| `e2e/player.spec.ts` | Playback controls and selected-track playback |
| `e2e/cast.spec.ts` | Cast menu, discovery, and device selection |
| `e2e/remote.spec.ts` | Secure remote settings and QR/manual pairing UI |

### Mobile (`npm run test:mobile` - Jest)

| Test File | Coverage Focus |
| --- | --- |
| `mobile/store/index.test.ts` | Capability gating, both handoff directions, source pause semantics, chunk/status recovery, confirmation, and rollback |
| `mobile/__tests__/MobilePlayerService.test.ts` | Native queue readiness, final paused position, and playback restoration |
| `mobile/__tests__/app/(tabs)/queue.test.tsx` | Import/Export visibility, tap/hold actions, confirmation UI, and loading state |
| `mobile/__tests__/services/WebSocketService.test.ts` | Connection and message event handling |

The latest full unit runs for this update reported 30 desktop test files / 471 tests and 34 mobile suites / 448 tests. These are run snapshots, not fixed project totals.

### E2E Best Practices

- **Use role-based locators**: Prefer `getByRole`, `getByTitle`, `getByPlaceholder` over CSS class selectors (CSS modules generate dynamic class names).
- **Hidden toggle switches**: Settings checkboxes have `opacity: 0; width: 0; height: 0`. Use `evaluate(el => el.click())` instead of `setChecked()`.
- **Context menus**: Right-click (`click({ button: 'right' })`) is more reliable than hover→button click.
- **Scrollable modals**: Call `scrollIntoViewIfNeeded()` on the visible label before interacting with elements below the fold.
- **Audio streaming**: Real Bandcamp audio doesn't work in E2E. Test UI state instead of actual playback.
- **Fixture teardown**: `fixtures.ts` wraps `electronApp.close()` in try/catch to handle persistence tests that close and relaunch the app.
- **App relaunch**: When relaunching, reuse the same `--user-data-dir`, `NODE_ENV`, `E2E_TEST`, and `REMOTE_PORT`. Always handle potential login flow again after relaunch.

## Specialized Testing

### Mobile Standalone Persistence

Testing Standalone mode requires verifying state persistence across app restarts:

1. **State Snapshotting**: Tests in `mobile/store/index.test.ts` verify that `saveQueue` is called correctly on queue changes.
2. **Restoration**: `restoreStandaloneState` is tested by mocking `AsyncStorage.getItem('standalone_queue')` and verifying that the store and `TrackPlayer` are initialized with the correct track and position.
3. **Volume Persistence**: Tests verify that `standalone_volume` is correctly saved to and loaded from `MobileDatabase`.

### SQLite Scalability (Mobile)

1. **Concurrent Access**: Staggered data refreshes in `restoreStandaloneState` are used to prevent `database is locked` errors during startup.
2. **Large Collection Simulation**: Testing with `isSimulationMode: true` generates thousands of items to verify FTS5 search performance and scrolling smoothness.

## Best Practices

1. **Co-location**: Keep test files next to the implementation.
2. **Isolation**: Mock all external dependencies (API calls, Database, native modules).
3. **Naming**: Use `describe` blocks to group tests by function/component and `it` blocks for specific behaviors.
4. **Async**: Use `async/await` for async operations and `act()` for strict React state updates.
5. **Selector Mocking**: When testing Zustand stores in components, use `mockImplementation` to respect selector functions:

   ```typescript
   (useStore as unknown as jest.Mock).mockImplementation((selector) => {
       return selector ? selector(mockState) : mockState;
   });
   ```

### Manual Verification

For features that cannot be easily tested in local unit environments (like auto-updates), manual verification is performed:

- **Auto-Updates**:
  - Verification of IPC event flow (Main -> Preload -> Store -> UI).
  - Verification of GitHub Actions release configuration to include `latest.yml`.
  - Manual check of "Check for Updates" UI states (checking, error, not available).
