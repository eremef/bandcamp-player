# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Services: `kebab-case.service.ts` (e.g., `player.service.ts`)
- React components: `PascalCase.tsx` (e.g., `PlayerBar.tsx`)
- TypeScript types: `PascalCase.ts` (e.g., `types.ts`, `ipc-channels.ts`)
- Test files: `*.test.ts` or `*.spec.ts`
- CSS modules: `ComponentName.module.css`

**Functions:**
- camelCase: `playTrack()`, `fetchCollection()`, `setVolume()`
- Private methods: Prefixed with `_`: `_internalMethod()`
- Event handlers: `handleEventName()`: `handlePlayClick()`

**Variables:**
- camelCase: `currentTrack`, `isPlaying`, `playlistId`
- Unused parameters: Prefix with underscore: `function foo(_unused: string)`
- Constants: UPPER_SNAKE_CASE: `IPC_CHANNELS`, `DEFAULT_VOLUME`

**Types:**
- Interfaces: PascalCase: `interface PlayerState`, `interface Track`
- Type aliases: PascalCase: `type RepeatMode = "off" | "one" | "all"`
- Enum-like unions: PascalCase: `type Theme = "light" | "dark" | "system"`

## Code Style

**Formatting:**
- Tool: Prettier (implied by Vite/ESLint)
- 4-space indentation (no tabs)
- Single quotes for strings
- Trailing commas in multiline objects/arrays
- Blank line before `return` statements
- Max line length: 100 characters (soft)

**Linting:**
- Tool: ESLint 9.x with TypeScript support
- Config: `eslint.config.js`
- Key rules enabled:
  - `react-hooks/rules-of-hooks`
  - `react-hooks/exhaustive-deps`
  - `@typescript-eslint/no-unused-vars` (warn)
  - `@typescript-eslint/no-explicit-any` (off)

## Import Organization

**Order (blank line between groups):**
1. Node.js built-ins: `import * as fs from "fs"`
2. External packages: `import axios from "axios"`
3. Shared types: `import type { Track, Album } from "../../shared/types"`
4. Internal services: `import { PlayerService } from "./player.service"`
5. Relative imports: `import { helper } from "../utils/helper"`

**Path Aliases:**
- `@shared/*` → `src/shared/*`
- `@renderer/*` → `src/renderer/*`
- Usage: `import { Track } from "@shared/types"`

**Example:**
```typescript
import * as fs from "fs";
import axios from "axios";

import type { Track, Album } from "../../shared/types";
import { CacheService } from "./cache.service";
import { ScraperService } from "./scraper.service";
```

## Error Handling

**Patterns:**
- Try-catch with meaningful error messages
- Log errors with service prefix: `console.error('[ServiceName] Message:', err)`
- Services extend `EventEmitter` for error events
- Renderer displays errors via Zustand toast system
- Return null/default on parsing failures rather than throwing

**Example:**
```typescript
try {
  const data = await this.fetchData();
  return data;
} catch (error) {
  console.error('[ScraperService] Failed to fetch collection:', error);
  return null;
}
```

## Logging

**Framework:** Console logging with service prefixes

**Patterns:**
- Prefix all logs with `[ServiceName]`: `[PlayerService] Playing track: ${title}`
- Use appropriate level: `console.log`, `console.warn`, `console.error`
- Debug logs for development: `console.debug('[CacheIndicator] ...')`

## Comments

**When to Comment:**
- Complex business logic
- Non-obvious workarounds (include issue reference)
- TODO comments for future work
- JSDoc for public APIs (services, handlers)

**JSDoc/TSDoc:**
- Use for service classes and public methods
- Include @param and @returns
- Example:
```typescript
/**
 * Download and cache a track for offline playback
 * @param track - Track to cache
 * @throws Error if caching is disabled
 */
async downloadTrack(track: Track): Promise<void>
```

**No Comments:**
- DO NOT ADD COMMENTS in code unless asked (per AGENTS.md rule #7)
- Self-documenting code preferred

## Function Design

**Size:** Keep functions under 50 lines; break complex functions into helpers

**Parameters:**
- Limit to 4-5 parameters max
- Use options objects for many parameters
- Prefix unused params with underscore: `function foo(_unused: string, used: number)`

**Return Values:**
- Return null rather than throwing for expected failures
- Use union types for multiple return states
- Document null/undefined behavior

## Module Design

**Exports:**
- Named exports preferred
- One primary export per file for services: `export class PlayerService`
- Type exports alongside implementations

**Barrel Files:**
- Use `index.ts` files for clean imports within directories
- Example: `src/main/services/index.ts` re-exports all services

**Service Pattern:**
- Extend `EventEmitter` for state changes
- Constructor accepts dependencies
- Private methods for internal logic
- Public API via methods and events

---

*Convention analysis: 2026-03-10*
