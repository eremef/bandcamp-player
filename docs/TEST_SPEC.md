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

## Commands

| Command | Description | Scope |
| --- | --- | --- |
| `npm test` | Runs all desktop unit tests. | Desktop |
| `npm run test:watch` | Runs desktop tests in watch mode. | Desktop |
| `npm run test:coverage` | Generates coverage report for desktop. | Desktop |
| `npm run test:mobile` | Runs all mobile unit tests. | Mobile |
| `npm run build` | Runs desktop tests before building. | Desktop |

## Directory Structure

Tests for Desktop are co-located with the source code (`*.test.ts`).
Tests for Mobile are located in `mobile/__tests__/` to prevent checking them into production bundles or conflicting with Expo Router file-based routing.

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
- `mobile/jest.setup.js`: Mocks `react-native-track-player`, `AsyncStorage`, and Expo modules.

## Current Test Coverage

The project has comprehensive coverage across core logic, stores, and critical UI paths.

### Desktop (`npm test` - Vitest)

**Overall Coverage:** ~71%

| Test File | Description | Tests | Coverage Highlight |
| ----------- | ------------- | ------- | ------------------ |
| `src/main/database/database.test.ts` | Database CRUD operations | 20 | ~70% |
| `src/main/services/auth.test.ts` | Authentication & Cookies | 7 | ~64% |
| `src/main/services/playlist.test.ts` | Playlist Management | 9 | 100% |
| `src/main/services/scrobbler.test.ts` | Last.fm Scrobbling | 8 | ~68% |
| `src/main/services/scraper.test.ts` | HTML Parsing & Pagination | 17 | ~85% |
| `src/main/services/player.test.ts` | Audio & Queue Logic | 19 | ~58% |
| `src/main/services/cache.test.ts` | Download & File Mgmt | 14 | ~89% |
| `src/main/services/remote.test.ts` | Remote Interface Logic | 10 | ~85% |
| `src/renderer/store/store.test.ts` | Zustand State & IPC | 25 | ~95% |
| `src/renderer/components/Collection/CollectionView.test.tsx` | Grid, Search, Loading | 8 | ~91% |
| `src/renderer/components/Playlist/PlaylistsView.test.tsx` | List, Create, Delete | 6 | ~90% |
| `src/renderer/components/Player/QueuePanel.test.tsx` | Queue Management UI | 7 | ~86% |
| `src/renderer/components/Layout/PlayerBar.test.tsx` | Playback Controls UI | 9 | ~59% |
| `src/renderer/components/Radio/RadioView.test.tsx` | Radio Station UI | 3 | ~62% |
| `src/renderer/components/Settings/ConnectedDevicesModal.test.tsx` | Connected Devices UI | 5 | ~90% |

### Mobile (`npm run test:mobile` - Jest)

**Overall Coverage:** ~25% (Store Logic: ~95%)

| Test File | Description | Tests | Coverage Highlight |
| ----------- | ------------- | ------- | ------------------ |
| `mobile/store/index.test.ts` | State, WebSocket, Playback | 28 | ~95% |
| `mobile/services/WebSocketService.test.ts` | Connection & Events | 12 | ~95% |
| `mobile/services/discovery.service.test.ts` | mDNS Discovery | 4 | ~90% |
| `mobile/services/player.test.ts` | TrackPlayer Integration | 6 | 100% |
| `mobile/services/TrackPlayerService.test.ts` | Remote Event Handlers | 9 | 100% |
| `mobile/app/(tabs)/player.test.tsx` | Player Screen UI | 14 | ~70% |
| `mobile/app/(tabs)/collection.test.tsx` | Collection Screen UI | 6 | ~70% |
| `mobile/app/album_detail.test.tsx` | Album Detail UI | 4 | ~50% |
| `mobile/components/PlaylistSelectionModal.test.tsx` | Playlist Modal UI | 3 | 100% |
| `mobile/app/about.test.tsx` | About Screen UI | 5 | 100% |
| `mobile/app/license.test.tsx` | License Screen UI | 3 | 100% |
| `mobile/__tests__/app/(tabs)/artists.test.tsx` | Artists Screen UI | 4 | 100% |
| `mobile/__tests__/app/artist/[id].test.tsx` | Artist Detail & Nav | 5 | 100% |

**Total:** 305 tests across both platforms.

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
