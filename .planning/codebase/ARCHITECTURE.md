# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Event-Driven Service-Oriented Architecture with IPC Communication

**Key Characteristics:**
- **Main/Renderer Split**: Electron main process handles all system interactions (database, network, filesystem); renderer process handles UI only
- **Service Layer**: Each domain (player, cache, auth, scraping) has dedicated service classes extending `EventEmitter`
- **IPC Bridge**: Communication via typed IPC channels with preload script bridge
- **State Management**: Zustand store in renderer subscribes to service events
- **Remote Control**: WebSocket server on port 9999 for external control

## Layers

**Main Process (`src/main/`):**
- Purpose: Backend logic, system integration, data persistence
- Location: `src/main/`
- Contains: Services, database, IPC handlers, window management
- Depends on: Node.js APIs, better-sqlite3, Electron APIs

**Service Layer:**
- Purpose: Domain-specific business logic
- Location: `src/main/services/*.service.ts`
- Contains: PlayerService, CacheService, ScraperService, AuthService, PlaylistService, etc.
- Depends on: Database, other services, external APIs
- Used by: IPC handlers, other services

**IPC Handler Layer:**
- Purpose: Bridge between renderer requests and services
- Location: `src/main/ipc-handlers.ts`
- Contains: Request handlers for each domain
- Used by: Renderer preload bridge

**Preload Bridge:**
- Purpose: Type-safe IPC exposure to renderer
- Location: `src/main/preload.ts`
- Contains: `window.electron` API with typed methods

**Renderer Process (`src/renderer/`):**
- Purpose: React UI
- Location: `src/renderer/`
- Contains: React components, Zustand store, CSS modules
- Depends on: Shared types, IPC bridge

**Shared Layer:**
- Purpose: Types and utilities shared between processes
- Location: `src/shared/`
- Contains: TypeScript interfaces, remote config service
- Used by: Main process, renderer, mobile

**Mobile (`mobile/`):**
- Purpose: React Native Android app
- Location: `mobile/`
- Contains: Expo app, Track Player service, mobile-specific services

## Data Flow

**Collection Fetch Flow:**

1. Renderer calls `window.electron.collection.fetch()`
2. IPC handler invokes `ScraperService.fetchCollection()`
3. Scraper checks authentication, fetches from Bandcamp
4. Results cached in SQLite database
5. Service emits `collection-updated` event
6. Renderer subscribes via `initializeStoreSubscriptions()`
7. Zustand store updates `collection` state

**Playback Flow:**

1. User clicks play → `store.play(track)`
2. IPC → `PlayerService.play(track)`
3. Player checks cache for offline mode
4. Stream URL resolved (cached or fresh from scraper)
5. Player emits `state-changed`, `track-changed`
6. Renderer audio element plays stream
7. Time updates sent back via IPC → `player.updateTime()`
8. Scrobbler triggered on track completion

**Remote Control Flow:**

1. External device connects via WebSocket (port 9999)
2. `RemoteService` receives command (play/pause/etc.)
3. Command forwarded to `PlayerService`
4. State changes broadcast to all connected clients

## Key Abstractions

**PlayerService:**
- Purpose: Audio playback orchestration
- Examples: `src/main/services/player.service.ts`
- Pattern: EventEmitter with state management

**ScraperService:**
- Purpose: Bandcamp data extraction via Cheerio
- Examples: `src/main/services/scraper.service.ts`
- Pattern: Cached collection with offline-first guard

**CacheService:**
- Purpose: Track offline caching via HTTP streaming
- Examples: `src/main/services/cache.service.ts`
- Pattern: LRU eviction, file-based storage

**Database:**
- Purpose: SQLite persistence layer
- Examples: `src/main/database/database.ts`
- Pattern: Direct SQL via better-sqlite3

## Entry Points

**Desktop Main:**
- Location: `src/main/main.ts`
- Triggers: Electron app launch
- Responsibilities: Window creation, service initialization, IPC setup

**Renderer Entry:**
- Location: `src/renderer/main.tsx`
- Triggers: Electron window loads
- Responsibilities: React app mount, store initialization

**Mobile Entry:**
- Location: `mobile/App.tsx` (or app entry)
- Triggers: Android app launch
- Responsibilities: Expo app setup, Track Player service

## Error Handling

**Strategy:** Try-catch with error logging and user-facing toasts

**Patterns:**
- Services emit error events via EventEmitter
- Renderer displays errors via Zustand toast system
- Errors logged to console with service prefix: `console.error('[ServiceName] Message:', err)`
- Network errors trigger offline mode fallback where applicable

## Cross-Cutting Concerns

**Logging:** Console logging with service prefixes (`[PlayerService]`, `[Scraper]`)

**Validation:** TypeScript strict mode, runtime checks for Bandcamp data parsing

**Authentication:** Electron session cookies, Bandcamp menubar API for user info

**Caching:** Three-tier (memory → SQLite → filesystem)

---

*Architecture analysis: 2026-03-10*
