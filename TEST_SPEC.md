# Test Specification

## Owerview

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
|dev|---|---|
| `npm test` | Runs all desktop unit tests. | Desktop |
| `npm run test:watch` | Runs desktop tests in watch mode. | Desktop |
| `npm run test:coverage` | Generates coverage report for desktop. | Desktop |
| `npm run test:mobile` | Runs all mobile unit tests. | Mobile |
| `npm run build` | Runs desktop tests before building. | Desktop |

## Directory Structure

Tests are co-located with the source code they test, using the `*.test.ts` or `*.test.tsx` naming convention.

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
└── store/
    ├── index.ts
    └── index.test.ts            # Mobile Store Tests
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

## Best Practices

1. **Co-location**: Keep test files next to the implementation.
2. **Isolation**: Mock all external dependencies (API calls, Database, native modules).
3. **Naming**: Use `describe` blocks to group tests by function/component and `it` blocks for specific behaviors.
4. **Async**: Use `async/await` for async operations and `act()` for strict React state updates.
5. **Strictness**: Ensure tests are deterministic and do not rely on global state leaking between tests.

## Current Test Coverage

### Desktop (`npm test` - Vitest)

| Test File | Description | Tests |
|-----------|-------------|-------|
| `src/main/database/database.test.ts` | Database CRUD operations (mocked) | 20 |
| `src/main/services/auth.test.ts` | Authentication flow, cookies, login window | 5 |
| `src/main/services/playlist.test.ts` | Playlist CRUD operations | 9 |
| `src/main/services/scrobbler.test.ts` | Last.fm scrobbling, offline queue | 8 |
| `src/main/services/scraper.test.ts` | HTML parsing, collection fetching | 4 |
| `src/main/services/player.test.ts` | Playback controls, queue management | 12 |
| `src/main/services/cache.test.ts` | Audio caching, cleanup | 7 |
| `src/renderer/store/store.test.ts` | Frontend Zustand store | 3 |

**Total: 68 tests passed, 1 skipped**

### Mobile (`npm run test:mobile` - Jest)

| Test File | Description | Tests |
|-----------|-------------|-------|
| `mobile/store/index.test.ts` | Zustand store, WebSocket actions | 3 |
| `mobile/services/WebSocketService.test.ts` | Connection, reconnection, messages | 12 |
| `mobile/services/discovery.service.test.ts` | mDNS discovery | 4 |
| `mobile/services/player.test.ts` | TrackPlayer setup, addTrack | 6 |
| `mobile/services/TrackPlayerService.test.ts` | Remote event handlers | 8 |

**Total: 30 tests passed**
