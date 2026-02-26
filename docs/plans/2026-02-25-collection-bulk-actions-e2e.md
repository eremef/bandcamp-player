# Collection Bulk Actions E2E Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write a Playwright E2E test file `e2e/collection-bulk-actions.spec.ts` that covers the bulk actions dropdown in `CollectionView` — the `MoreHorizontal` button that appears when searching with results.

**Architecture:** Use `window.evaluate()` to inject a mock `window.electron.collection.fetch` before login so the collection loads deterministic data (4 cached tracks). All 7 tests verify both UI state (button visibility, menu open/close) and downstream effects (queue panel contents, player bar state change).

**Tech Stack:** Playwright, Electron, TypeScript. Shared `fixtures.ts` (not raw `electron.launch`). No new app-side code needed.

---

### Task 1: Write the test file with mock helper and beforeEach

**Context:**
- All existing E2E tests live in `e2e/` and import `{ test, expect } from './fixtures'`
- The fixture exposes `window: Page` with `E2E_TEST=true` and V8 coverage started
- `window.evaluate(fn, arg)` runs `fn(arg)` in the renderer's JS context — can override `window.electron` methods
- `CollectionView` calls `window.electron.collection.fetch()` (via `fetchCollection` in store) triggered by the login flow
- The bulk menu button selector: `window.getByTitle('More actions for search results')`
- Search input: `window.getByPlaceholder('Search your collection...')`

**Files:**
- Create: `e2e/collection-bulk-actions.spec.ts`

**Step 1: Create the file with imports, mock data constant, and beforeEach**

```typescript
import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Mock collection injected before login to avoid needing real Bandcamp data
// ---------------------------------------------------------------------------
const MOCK_COLLECTION = {
    items: [
        { id: 'item-0', type: 'track', token: 'tok-0', purchaseDate: new Date().toISOString(),
          track: { id: 'mt-1', title: 'Mock Track Alpha', artist: 'Mock Artist',
                   artistId: 'artist-mock', album: 'Mock Album One', duration: 200,
                   artworkUrl: '', streamUrl: '', bandcampUrl: '', isCached: true } },
        { id: 'item-1', type: 'track', token: 'tok-1', purchaseDate: new Date().toISOString(),
          track: { id: 'mt-2', title: 'Mock Track Beta', artist: 'Mock Artist',
                   artistId: 'artist-mock', album: 'Mock Album One', duration: 180,
                   artworkUrl: '', streamUrl: '', bandcampUrl: '', isCached: true } },
        { id: 'item-2', type: 'track', token: 'tok-2', purchaseDate: new Date().toISOString(),
          track: { id: 'mt-3', title: 'Mock Track Gamma', artist: 'Mock Artist',
                   artistId: 'artist-mock', album: 'Mock Album Two', duration: 220,
                   artworkUrl: '', streamUrl: '', bandcampUrl: '', isCached: true } },
        { id: 'item-3', type: 'track', token: 'tok-3', purchaseDate: new Date().toISOString(),
          track: { id: 'mt-4', title: 'Mock Track Delta', artist: 'Mock Artist',
                   artistId: 'artist-mock', album: 'Mock Album Two', duration: 195,
                   artworkUrl: '', streamUrl: '', bandcampUrl: '', isCached: true } },
    ],
    totalCount: 4,
};

test.describe('Collection Bulk Actions', () => {
    test.beforeEach(async ({ window }) => {
        // Inject mock BEFORE login so fetchCollection() gets our data
        await window.evaluate((mockCollection) => {
            (window as any).electron.collection.fetch = async () => mockCollection;
            (window as any).electron.collection.refresh = async () => mockCollection;
        }, MOCK_COLLECTION);

        const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
        const collectionBtn = window.getByRole('button', { name: 'Collection' });
        if (await loginBtn.isVisible()) await loginBtn.click();
        await expect(collectionBtn).toBeVisible({ timeout: 15000 });

        // Ensure the Collection view is active and cards have loaded
        await window.getByRole('button', { name: 'Collection' }).click();
        await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 15000 });
    });
```

**Step 2: Verify the file compiles (TypeScript check)**

Run: `npm run typecheck`
Expected: No errors in `e2e/collection-bulk-actions.spec.ts` (or only the new file, which is not yet complete)

---

### Task 2: Add visibility tests (tests 1–3)

**Context:**
- `showBulkActions` in `CollectionView.tsx:126` is `true` only when `searchQuery.trim() && filteredItems.length > 0`
- With empty search: button absent
- With search returning 0 hits: button absent
- With search returning ≥1 hit: button present

**Step 1: Add the three visibility tests inside the describe block**

```typescript
    test('bulk actions button is hidden without a search query', async ({ window }) => {
        const bulkBtn = window.getByTitle('More actions for search results');
        await expect(bulkBtn).not.toBeVisible();
    });

    test('bulk actions button is hidden when search returns no results', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('xyznonexistent12345');
        await window.waitForTimeout(300);

        await expect(window.locator('[class*="card"]')).toHaveCount(0);
        await expect(window.getByTitle('More actions for search results')).not.toBeVisible();
    });

    test('bulk actions button appears when search has matching results', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await expect(window.locator('[class*="card"]').first()).toBeVisible();
        await expect(window.getByTitle('More actions for search results')).toBeVisible();
    });
```

**Step 2: Run just these tests to verify they pass**

Run: `npx playwright test e2e/collection-bulk-actions.spec.ts --workers=1 --grep "hidden|appears when"`
Expected: 3 passing tests

---

### Task 3: Add menu open/close toggle test (test 4)

**Context:**
- Clicking the `MoreHorizontal` button opens a dropdown with `Play All`, `Play Next`, `Add to Queue`
- Clicking it again closes the menu
- Menu is rendered only while `showBulkMenu` state is true — no `aria-expanded`, just conditional render

**Step 1: Add the toggle test**

```typescript
    test('bulk actions menu opens and closes on toggle', async ({ window }) => {
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        const bulkBtn = window.getByTitle('More actions for search results');
        await expect(bulkBtn).toBeVisible();

        // Open
        await bulkBtn.click();
        await expect(window.locator('button', { hasText: 'Play All' }).first()).toBeVisible({ timeout: 3000 });
        await expect(window.locator('button', { hasText: 'Add to Queue' }).first()).toBeVisible();
        await expect(window.locator('button', { hasText: 'Play Next' }).first()).toBeVisible();

        // Close
        await bulkBtn.click();
        await expect(window.locator('button', { hasText: 'Play All' }).first()).not.toBeVisible({ timeout: 3000 });
    });
```

**Step 2: Run**

Run: `npx playwright test e2e/collection-bulk-actions.spec.ts --workers=1 --grep "opens and closes"`
Expected: 1 passing

---

### Task 4: Add "Add to Queue" downstream test (test 5)

**Context:**
- Clicking "Add to Queue" calls `handleBulkAction('addToQueue')` → `getAllFilteredTracks(filteredItems)` → `addTracksToQueue(tracks)`
- `getAllFilteredTracks` collects tracks where `isCached: true` — our mock satisfies this
- `addTracksToQueue` calls `window.electron.queue.addTracks(tracks, false)` → IPC to `PlayerService`
- Queue panel: open via `window.getByRole('button', { name: 'Queue' })` in PlayerBar
- Queue items: `li[class*="item"]` inside queue panel

**Important:** Clear the queue first to avoid pollution from prior tests (tests may share the same queue state if queue is not cleared).

```typescript
    test('"Add to Queue" adds all filtered tracks to the queue', async ({ window }) => {
        // Clear queue first
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        const clearBtn = window.getByTitle('Clear queue');
        if (await clearBtn.isVisible()) await clearBtn.click();
        // Close queue panel
        const closeBtn = window.getByTitle('Close');
        if (await closeBtn.isVisible()) await closeBtn.click();

        // Search and use bulk "Add to Queue"
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click();
        await window.waitForTimeout(500);

        // Open queue and verify items are present
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        expect(await queueItems.count()).toBeGreaterThan(0);
    });
```

**Step: Run**

Run: `npx playwright test e2e/collection-bulk-actions.spec.ts --workers=1 --grep "Add to Queue"`
Expected: 1 passing

---

### Task 5: Add "Play All" player state test (test 6)

**Context:**
- `handleBulkAction('play')` calls `clearQueue(false)` → `addTracksToQueue(tracks)` → `playQueueIndex(0)`
- `playQueueIndex(0)` sets the current track in PlayerService
- PlayerBar shows "No track playing" when `currentTrack` is null; shows track title when a track is set
- Even without real audio, the current track state is set and the UI updates

```typescript
    test('"Play All" changes player state away from idle', async ({ window }) => {
        // Confirm we start in idle state
        await expect(window.locator('text=No track playing')).toBeVisible({ timeout: 5000 });

        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const playAllItem = window.locator('button', { hasText: 'Play All' }).first();
        await expect(playAllItem).toBeVisible({ timeout: 3000 });
        await playAllItem.click();
        await window.waitForTimeout(500);

        // Player should no longer be idle
        await expect(window.locator('text=No track playing')).not.toBeVisible({ timeout: 5000 });
    });
```

**Step: Run**

Run: `npx playwright test e2e/collection-bulk-actions.spec.ts --workers=1 --grep "Play All"`
Expected: 1 passing

---

### Task 6: Add "Play Next" queue count test (test 7)

**Context:**
- `handleBulkAction('playNext')` calls `addTracksToQueue(tracks, true)` — adds to front of queue
- First populate the queue via "Add to Queue", then use "Play Next" and verify count grows

```typescript
    test('"Play Next" increases the queue count', async ({ window }) => {
        // Step 1: Add some tracks to queue first
        const searchInput = window.getByPlaceholder('Search your collection...');
        await searchInput.fill('Mock');
        await window.waitForTimeout(300);

        await window.getByTitle('More actions for search results').click();
        const addToQueueItem = window.locator('button', { hasText: 'Add to Queue' }).first();
        await expect(addToQueueItem).toBeVisible({ timeout: 3000 });
        await addToQueueItem.click({ force: true });
        await window.waitForTimeout(500);

        // Check initial queue count
        const queueBtn = window.locator('div[class*="playerBar"]').getByTitle('Queue', { exact: true });
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const queueItems = window.locator('li[class*="item"]');
        await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
        const initialCount = await queueItems.count();

        // Close queue panel
        await window.getByTitle('Close').click();

        // Step 2: Use "Play Next" with the same search results
        await window.getByTitle('More actions for search results').click();
        const playNextItem = window.locator('button', { hasText: 'Play Next' }).first();
        await expect(playNextItem).toBeVisible({ timeout: 3000 });
        await playNextItem.click({ force: true });
        await window.waitForTimeout(500);

        // Open queue and verify count grew
        await queueBtn.click();
        await expect(window.getByRole('heading', { name: 'Queue', level: 2 })).toBeVisible({ timeout: 5000 });
        const newCount = await queueItems.count();
        expect(newCount).toBeGreaterThan(initialCount);
    });
```

Close the describe block at the end of the file:

```typescript
}); // end describe
```

**Step: Run all tests**

Run: `npx playwright test e2e/collection-bulk-actions.spec.ts --workers=1`
Expected: 7 passing

---

### Task 7: Run full E2E suite to check for regressions

**Step 1: Run lint on the new file**

Run: `npm run lint -- --quiet e2e/collection-bulk-actions.spec.ts`
Expected: No errors

**Step 2: Run all E2E tests**

Run: `npx playwright test --workers=1`
Expected: All existing tests still pass, 7 new tests pass

**Step 3: Update CLAUDE.md if any new patterns were discovered**

If the mock injection pattern (`window.evaluate` to override `window.electron` methods) is novel and not yet documented, add a bullet under `E2E Test Conventions`:

```
- **IPC mocking**: Use `window.evaluate((mockData) => { window.electron.collection.fetch = async () => mockData; }, mockData)` before login to inject hermetic collection data without real Bandcamp credentials.
```

---

## Execution Options

Plan complete and saved. Two execution options:

**1. Subagent-Driven (this session)** — dispatch fresh subagent per task, review between tasks

**2. Parallel Session (separate)** — open new session with executing-plans for batch execution with checkpoints

Which approach?
