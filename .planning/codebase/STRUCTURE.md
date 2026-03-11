# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
bandcamp-player/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.ts           # Entry point
│   │   ├── preload.ts        # IPC bridge
│   │   ├── ipc-handlers.ts   # IPC request handlers
│   │   ├── database/         # SQLite layer
│   │   └── services/         # Business logic services
│   ├── renderer/             # React UI (Vite bundled)
│   │   ├── main.tsx          # React entry
│   │   ├── App.tsx           # Root component
│   │   ├── components/       # React components
│   │   ├── store/            # Zustand store
│   │   └── styles/           # CSS modules
│   ├── shared/               # Shared types and utilities
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── ipc-channels.ts   # IPC channel constants
│   │   └── remote-config.service.ts
│   ├── assets/               # Icons, images
│   └── test/                # Test setup
├── mobile/                   # React Native mobile app
│   ├── app/                  # Expo app structure
│   ├── services/             # Mobile services
│   ├── store/                # Zustand (mobile)
│   └── __tests__/           # Mobile tests
├── e2e/                      # Playwright E2E tests
├── scripts/                  # Build scripts
├── .planning/codebase/       # This documentation
├── package.json
├── tsconfig*.json
├── vitest.config.ts
├── eslint.config.js
└── electron-builder.yml
```

## Directory Purposes

**`src/main/`:**
- Purpose: Electron main process
- Contains: main.ts, preload.ts, ipc-handlers.ts, services/, database/
- Key files: `src/main/main.ts`, `src/main/ipc-handlers.ts`

**`src/main/services/`:**
- Purpose: Domain services (business logic)
- Contains: All .service.ts files
- Key files: `player.service.ts`, `scraper.service.ts`, `cache.service.ts`, `auth.service.ts`

**`src/main/database/`:**
- Purpose: SQLite database layer
- Contains: database.ts, migrations
- Key files: `src/main/database/database.ts`

**`src/renderer/`:**
- Purpose: React UI application
- Contains: Components, store, styles
- Key files: `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/store/store.ts`

**`src/renderer/store/`:**
- Purpose: Zustand state management
- Contains: store.ts (main store with slices)
- Key files: `src/renderer/store/store.ts` (966 lines)

**`src/shared/`:**
- Purpose: Shared TypeScript types and utilities
- Contains: types.ts, ipc-channels.ts, remote-config.service.ts
- Key files: `src/shared/types.ts` (315 lines)

**`mobile/`:**
- Purpose: React Native Android app
- Contains: Expo app, mobile services, tests
- Key files: `mobile/App.tsx`, `mobile/store/index.test.ts`

**`e2e/`:**
- Purpose: Playwright E2E tests
- Contains: .spec.ts test files
- Key files: `e2e/player.spec.ts`

## Key File Locations

**Entry Points:**
- `src/main/main.ts` - Desktop Electron main process
- `src/renderer/main.tsx` - Desktop React entry
- `mobile/App.tsx` - Mobile Expo entry

**Configuration:**
- `package.json` - Dependencies, scripts, electron-builder config
- `tsconfig.main.json` - Main process TypeScript
- `tsconfig.renderer.json` - Renderer TypeScript
- `vitest.config.ts` - Test configuration
- `eslint.config.js` - Linting rules

**Core Logic:**
- `src/shared/types.ts` - Domain types (Track, Album, Playlist, etc.)
- `src/main/services/player.service.ts` - Playback logic
- `src/main/services/scraper.service.ts` - Bandcamp scraping (1293 lines)
- `src/main/services/cache.service.ts` - Offline caching
- `src/main/database/database.ts` - SQLite operations

**Testing:**
- `src/main/services/player.test.ts` - Player unit tests
- `src/test/setup.ts` - Test setup
- `mobile/__tests__/` - Mobile Jest tests

## Naming Conventions

**Files:**
- Services: `kebab-case.service.ts` (e.g., `player.service.ts`)
- Components: `PascalCase.tsx` (e.g., `PlayerBar.tsx`)
- Types/Interfaces: `PascalCase.ts` (e.g., `types.ts`)
- Tests: `*.test.ts` or `*.spec.ts`

**Directories:**
- General: `kebab-case` (e.g., `src/main/services`)
- Components: `PascalCase` or `kebab-case` (e.g., `components/` or `player-controls/`)

## Where to Add New Code

**New Feature (Desktop):**
- Core logic: `src/main/services/` → new `.service.ts` file
- IPC handler: Add to `src/main/ipc-handlers.ts`
- Renderer UI: `src/renderer/components/`
- State: Add slice to `src/renderer/store/store.ts`

**New Service:**
- Implementation: `src/main/services/new-service.service.ts`
- Tests: `src/main/services/new-service.test.ts`
- Import in: `src/main/main.ts` or `src/main/ipc-handlers.ts`

**New Component:**
- Implementation: `src/renderer/components/ComponentName.tsx`
- Styles: `src/renderer/components/ComponentName.module.css`
- Tests: `src/renderer/components/ComponentName.test.tsx`

**Utilities:**
- Shared types: `src/shared/types.ts` (add interface)
- Shared utilities: `src/shared/` → new utility file

## Special Directories

**`mobile/`:**
- Purpose: React Native Android app
- Generated: No (source code committed)
- Committed: Yes

**`e2e/`:**
- Purpose: Playwright end-to-end tests
- Generated: No
- Committed: Yes

**`dist/`:**
- Purpose: Compiled output (TypeScript, Vite)
- Generated: Yes (build output)
- Committed: No (.gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-10*
