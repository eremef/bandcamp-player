# Collection Bulk Actions E2E Test Design

**Date:** 2026-02-25
**Target file:** `e2e/collection-bulk-actions.spec.ts`
**Screen:** CollectionView — bulk actions menu on search results

---

## Background

`CollectionView` exposes a bulk actions dropdown (`title="More actions for search results"`) that appears only when `searchQuery.trim() !== ''` AND `filteredItems.length > 0`. When visible, the dropdown contains:

- **Play All** — replaces queue with all filtered tracks and starts playback
- **Play Next** — inserts filtered tracks at the front of the queue
- **Add to Queue** — appends filtered tracks to the queue
- **Add to Playlist** — (only if playlists exist) adds filtered tracks to a chosen playlist
- **Download for Offline** — downloads all filtered tracks

This feature has **zero E2E coverage** despite being a core bulk workflow.

---

## Constraint: No Real Bandcamp Data in Test Environment

`E2E_TEST=true` provides mock login but does **not** inject collection data. The real scraper needs valid Bandcamp session cookies. To make tests hermetic, we must inject mock data before `fetchCollection()` is called.

**Strategy:** In `beforeEach`, use `window.evaluate()` to replace `window.electron.collection.fetch` and `window.electron.collection.refresh` with functions returning a known mock collection of 4 tracks with `isCached: true`. Tracks with `isCached: true` are picked up directly by `getAllFilteredTracks()` without any network calls.

---

## Mock Data Shape

```typescript
// 4 tracks, all isCached: true, searchable by "Mock Artist" / "Mock Track"
const MOCK_TRACKS = [
  { id: 'mt-1', title: 'Mock Track Alpha', artist: 'Mock Artist', album: 'Mock Album',
    duration: 200, streamUrl: '', bandcampUrl: '', artworkUrl: '',
    artistId: 'artist-mock', isCached: true },
  { id: 'mt-2', title: 'Mock Track Beta',  artist: 'Mock Artist', album: 'Mock Album',
    duration: 180, streamUrl: '', bandcampUrl: '', artworkUrl: '',
    artistId: 'artist-mock', isCached: true },
  { id: 'mt-3', title: 'Mock Track Gamma', artist: 'Mock Artist', album: 'Mock Album 2',
    duration: 220, streamUrl: '', bandcampUrl: '', artworkUrl: '',
    artistId: 'artist-mock', isCached: true },
  { id: 'mt-4', title: 'Mock Track Delta', artist: 'Mock Artist', album: 'Mock Album 2',
    duration: 195, streamUrl: '', bandcampUrl: '', artworkUrl: '',
    artistId: 'artist-mock', isCached: true },
];
const MOCK_COLLECTION = {
  items: MOCK_TRACKS.map((track, i) => ({
    id: `item-${i}`, type: 'track', token: `tok-${i}`,
    purchaseDate: new Date().toISOString(), track,
  })),
  totalCount: 4,
};
```

---

## Test Cases

| # | Name | Setup | Assertions |
|---|------|-------|------------|
| 1 | Button hidden without search | Empty search box | `title="More actions for search results"` not visible |
| 2 | Button hidden for zero-results search | Type "xyznonexistent12345" | Button not visible (no matching cards) |
| 3 | Button visible with matching results | Type "Mock" | Button IS visible |
| 4 | Menu opens and closes on toggle | Type "Mock", click button | Menu items appear; click again → gone |
| 5 | "Add to Queue" populates queue | Type "Mock" → open menu → "Add to Queue" | Open queue panel → `li[class*="item"]` count ≥ 1 |
| 6 | "Play All" changes player state | Type "Mock" → open menu → "Play All" | `text=No track playing` not visible |
| 7 | "Play Next" increases queue count | Add some items first, note count → "Play Next" | Queue count > initial count |

---

## beforeEach Pattern

```typescript
test.beforeEach(async ({ window }) => {
  // 1. Inject mock collection BEFORE login triggers fetchCollection
  await window.evaluate((mockCollection) => {
    window.electron.collection.fetch = async () => mockCollection;
    window.electron.collection.refresh = async () => mockCollection;
  }, MOCK_COLLECTION);

  // 2. Standard login
  const loginBtn = window.getByRole('button', { name: 'Login with Bandcamp' });
  const collectionBtn = window.getByRole('button', { name: 'Collection' });
  if (await loginBtn.isVisible()) await loginBtn.click();
  await expect(collectionBtn).toBeVisible({ timeout: 15000 });

  // 3. Wait for cards to appear
  await expect(window.locator('[class*="card"]').first()).toBeVisible({ timeout: 15000 });
});
```

---

## Out of Scope

- **Download for Offline** — requires cache filesystem setup; too brittle for CI
- **Add to Playlist** — skipped to avoid playlist creation dependency; covered separately
- Exact track count assertions — use `toBeGreaterThan(0)` per project conventions

---

## File Location

`e2e/collection-bulk-actions.spec.ts` — uses the shared `fixtures.ts` pattern (not the old raw `electron.launch` inline pattern).
