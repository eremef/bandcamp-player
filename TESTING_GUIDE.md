# Bandcamp Player Testing Guide

## 1. Testing Philosophy & Frameworks

### The Testing Pyramid
- **E2E Tests (Playwright):** Few, focused on critical user journeys (playback, settings, offline mode). Framework: Playwright 1.58.2
- **Integration Tests:** More, testing component interactions (e.g., Zustand store interacting with IPC services).
- **Unit Tests (Vitest/Jest):** Many, fast, isolated tests for pure functions and individual services.

### Core Principles
- **Test User Behavior, Not Implementation:** Click, type, see. Do not rely on internal React states or CSS classes.
- **Keep Tests Independent:** Each test should run in isolation and clean up after itself.
- **Make Tests Deterministic:** Avoid fixed timeouts (`waitForTimeout`). Rely on auto-waiting and explicit web assertions.

## 2. Test Environments & Run Commands

**Desktop (Vitest):**
- Config: `vitest.config.ts`
- Environment: `happy-dom` for renderer, `node` for main process
- Setup file: `src/test/setup.ts`

**Mobile (Jest):**
- Location: `mobile/__tests__/` (required to avoid Expo Router bundling)
- Config: Jest config in `mobile/package.json` or jest.config.js

**E2E (Playwright):**
- Location: `e2e/*.spec.ts`
- Fixtures: `e2e/fixtures.ts`

### Commands
```bash
# Desktop Tests (Vitest)
npm test                             # Run all desktop tests
npm run test:watch                   # Watch mode
npm run test:coverage                # With coverage
npx vitest run src/main/services/player.test.ts      # Single test file
npx vitest run -t "should play track"                # Single test by name

# Mobile Tests (Jest)
npm run test:mobile                  # Run all mobile tests
cd mobile && npx jest store/index.test.ts            # Single test file
cd mobile && npx jest -t "should connect"            # Single test by name

# E2E Tests (Playwright)
npm run test:e2e                     # Run all E2E tests
npx playwright test
npx playwright test e2e/player.spec.ts               # Single spec file
```

## 3. Test File Organization

**Naming Conventions:**
- Unit tests: `*.test.ts` or `*.test.tsx`
- Integration tests: `*.integration.test.ts`
- Snapshots: `*.snapshot.test.ts`
- E2E: `*.spec.ts`

## 4. E2E Testing with Playwright

### Stable Selectors & React Components
**Always use `data-testid`** (`getByTestId`) or accessible roles (`getByRole`, `getByLabel`) for element selection.
*Never* use brittle CSS selectors (`.btn.btn-primary.submit-button`) or complex XPath queries.

- **Avoid Raw DOM Clicks:** Do NOT use `evaluate(el => el.click())` combined with vanilla DOM traversal (e.g. `document.querySelectorAll('input')`) for testing React UI components. React 18 uses a root-level event delegation system that frequently ignores these synthetic native dispatch events.
- **Use Test IDs:** Add explicit `data-testid` attributes directly to the interactive HTML elements in the React components (e.g. `<button data-testid="filter-albums-btn">`).
- **Use Native Playwright Actions:** In your Playwright specs, always use `locator.click()` matching those strict Test IDs.

### Waiting Strategies
Do not use fixed timeouts. Playwright automatically waits for elements to be actionable before clicking. For custom waits, use `waitForLoadState`, `waitForURL`, or `expect().toBeVisible()`.

### Dealing with Hidden/Obstructed Inputs (React Checkboxes)
In this app, settings checkboxes are often visually hidden (opacity: 0, width: 0) and replaced with custom switch UI. Standard `click()` or `setChecked()` will fail with "Element is outside of the viewport".
If standard Playwright clicks fail because elements are structurally obstructed, use `evaluate` directly on the Playwright locator, but ensure it's still selecting the correct bound element:

```typescript
// For custom toggles with hidden inputs
await page.getByTestId('settings-wishlist-toggle').evaluate(el => el.click());
```

### Page Objects and Helpers
Encapsulate complex, repeated UI interactions (like opening settings, modifying collections, or cleaning up states via `resetCollectionState`) into helper functions or Page Object Models to keep tests clean. (See `e2e/test-helpers.ts`).

## 5. Desktop Testing (Vitest)

**Test Structure & Mocking Pattern:**
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should play track", async () => {
    const track = { /* test data */ };
    await playerService.play(track);
    expect(playerService.getState().isPlaying).toBe(true);
  });
});
```

**What to Mock:**
- External dependencies (other services)
- Database operations
- File system access
- Network requests (axios)
- Electron APIs (use `vi.mock('electron', ...)`)

**Specific Vitest Nuances:**
- **Node Environment:** Set `/** @vitest-environment node */` at the top of tests involving Node modules (`http`, `ws`, `dgram`, `fs`).
- **Audio Element:** Mock `<audio>` duration explicitly if needed: `Object.defineProperty(audio, 'duration', { value: 100 });`

## 6. Mobile Testing (Jest)

- Reset Zustand stores in `beforeEach` with `useStore.setState()`.
- Use `waitFor()` for async state assertions.
- Use `mockReturnValue()` instead of `mockReturnValueOnce()` unless explicitly testing sequences.

## 7. Common Patterns & Best Practices

**Modifying Components for Testability:**
When modifying React components, if a button, input, or container is critical for testing, add a `data-testid` attribute. If iterating over a list, append the item's unique identifier to the test ID (e.g., `data-testid={\`album-card-\${album.id}\`}`).

**Fixtures and Factories:**
Use helper functions for complex objects in unit tests:
```typescript
const createMockTrack = (overrides = {}): Track => ({
  id: "1",
  title: "Test Track",
  // ...default properties
  ...overrides,
});
```

**Coverage Notes:**
- We use the V8 coverage provider.
- E2E coverage requires merging hits from all runs: `npm run test:e2e:coverage`
