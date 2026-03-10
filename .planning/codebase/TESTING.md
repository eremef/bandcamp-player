# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Desktop (Vitest):**
- Framework: Vitest 4.0.18
- Config: `vitest.config.ts`
- Environment: `happy-dom` for renderer, `node` for main process
- Setup file: `src/test/setup.ts`

**Mobile (Jest):**
- Framework: Jest 30.x (via Expo)
- Location: `mobile/__tests__/`
- Config: Jest config in `mobile/package.json` or jest.config.js

**E2E (Playwright):**
- Framework: Playwright 1.58.2
- Location: `e2e/*.spec.ts`
- Fixtures: `e2e/fixtures.ts`

## Run Commands

```bash
# Desktop Tests (Vitest)
npm test                             # Run all desktop tests
npm run test:watch                  # Watch mode
npm run test:coverage                # With coverage
npx vitest run src/main/services/player.test.ts      # Single test file
npx vitest run -t "should play track"                # Single test by name

# Mobile Tests (Jest)
npm run test:mobile                  # Run all mobile tests
cd mobile && npx jest store/index.test.ts            # Single test file
cd mobile && npx jest -t "should connect"            # Single test by name

# E2E Tests (Playwright)
npm run test:e2e                     # Run all E2E tests
npx playwright test --workers=1      # Sequential (more reliable)
npx playwright test e2e/player.spec.ts               # Single spec file
```

## Test File Organization

**Location:**
- Desktop: Co-located with source in `src/main/services/` and `src/renderer/`
- Mobile: `mobile/__tests__/` (required to avoid Expo Router bundling)
- E2E: `e2e/` directory

**Naming:**
- Unit tests: `*.test.ts` or `*.test.tsx`
- Integration tests: `*.integration.test.ts`
- Snapshots: `*.snapshot.test.ts`
- E2E: `*.spec.ts`

## Test Structure

**Desktop (Vitest):**
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PlayerService } from "./player.service";

// Mock dependencies
vi.mock("./cache.service");
vi.mock("./scraper.service");

describe("PlayerService", () => {
  let playerService: PlayerService;
  let mockCacheService: any;

  beforeEach(() => {
    // Setup mocks
    mockCacheService = {
      getCachedPath: vi.fn(),
      isCached: vi.fn().mockReturnValue(false),
    };
    
    playerService = new PlayerService(/* deps */);
    
    // Mock console to reduce noise
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("play", () => {
    it("should play track", async () => {
      const track = { /* test data */ };
      await playerService.play(track);
      expect(playerService.getState().isPlaying).toBe(true);
    });
  });
});
```

**Mocking Pattern (from `player.test.ts`):**
```typescript
// Mock EventEmitter-based services
mockCastService = Object.assign(new EventEmitter(), {
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getConnectedDevice: vi.fn().mockReturnValue(null),
});

// Mock database
mockDatabase = {
  getSettings: vi.fn().mockReturnValue({ defaultVolume: 0.5 }),
  setSettings: vi.fn(),
};
```

## Mocking

**Framework:** Vitest's `vi` (mock functions)

**What to Mock:**
- External dependencies (other services)
- Database operations
- File system access
- Network requests (axios)
- Electron APIs (use `vi.mock('electron', ...)`)

**What NOT to Mock:**
- Test subject itself
- Simple utility functions being tested

**Mocking Audio Element:**
```typescript
// Mock <audio> duration
Object.defineProperty(audio, 'duration', { value: 100 });
```

**Node Environment for Tests:**
```typescript
/** @vitest-environment node */
```
Use this directive for tests involving Node.js modules (`http`, `ws`, `dgram`, `fs`).

## Fixtures and Factories

**Test Data:**
- Inline in test files for simple cases
- Helper functions for complex objects:
```typescript
const createMockTrack = (overrides = {}): Track => ({
  id: "1",
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  duration: 100,
  artworkUrl: "",
  streamUrl: "http://test.com/stream",
  bandcampUrl: "",
  isCached: false,
  ...overrides,
});
```

## Coverage

**Requirements:** None explicitly enforced

**View Coverage:**
```bash
npm run test:coverage                # Desktop
```

**Notes:**
- V8 coverage provider
- E2E coverage requires merging hits from all runs: `npm run test:e2e:coverage`

## Test Types

**Unit Tests:**
- Scope: Individual services, utilities, components
- Approach: Mock dependencies, test public API
- Location: `src/main/services/*.test.ts`, `src/renderer/**/*.test.tsx`

**Integration Tests:**
- Scope: Service interactions, IPC handlers
- Approach: Real services with mocked external calls
- Location: Same as unit tests, naming `*.integration.test.ts`

**E2E Tests:**
- Scope: Full user flows
- Framework: Playwright with Electron
- Location: `e2e/*.spec.ts`

## Common Patterns

**Async Testing:**
```typescript
it("should play track", async () => {
  await playerService.play(mockTrack);
  expect(playerService.getState().isPlaying).toBe(true);
});
```

**Event Testing:**
```typescript
it("should emit state-changed", () => {
  const listener = vi.fn();
  playerService.on('state-changed', listener);
  
  playerService.play(mockTrack);
  
  expect(listener).toHaveBeenCalled();
});
```

**Error Testing:**
```typescript
it("should throw on invalid input", () => {
  expect(() => playerService.play(null)).toThrow();
});
```

---

*Testing analysis: 2026-03-10*
