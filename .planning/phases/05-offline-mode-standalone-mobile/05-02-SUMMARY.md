---
phase: 05-offline-mode-standalone-mobile
plan: '02'
subsystem: mobile
tags: [react-native, offline, cache, expo-router]

requires:
  - phase: 05-offline-mode-standalone-mobile
    provides: CacheFab component (05-01)

provides:
  - Offline mode filtering on collection, artists, and artist_detail screens
  - CacheFab integrated on all three screens (standalone mode only)
  - Bulk download handlers for offline caching
  - Filtered items used in bulk actions (play/queue/playlist)

affects: [05-offline-mode-standalone-mobile]

tech-stack:
  added: []
  patterns:
    - Offline filtering via useMemo on collection/artist items
    - CacheFab as floating action button for bulk downloads

key-files:
  created: []
  modified:
    - mobile/app/(tabs)/collection.tsx
    - mobile/app/(tabs)/artists.tsx
    - mobile/app/artist/artist_detail.tsx

key-decisions:
  - Offline filter checks: album tracks every() cached, single tracks cached
  - CacheFab visible only when mode === 'standalone'
  - Bulk handlers (play/queue/playlist) operate on filteredItems in offline mode
  - isAllCached computed from filteredItems for CacheFab state

patterns-established:
  - Offline filter pattern: useMemo filtering collection items based on cachedTrackIds
  - CacheFab integration: visible, isAllCached, downloadProgress, handlers pattern

requirements-completed: [OFFL-04]

duration: 5min
completed: 2026-03-20
---

# Phase 5 Plan 2: Offline Mode Integration Across Screens

**Offline mode filtering integrated with CacheFab bulk downloads across collection, artists, and artist_detail screens**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T18:38:06Z
- **Completed:** 2026-03-20T18:43:15Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Collection screen filters to cached-only items in offline mode with CacheFab
- Artists screen gains CacheFab for bulk artist downloads with offline filtering
- Artist detail screen filters to cached-only items with CacheFab

## Task Commits

Each task was committed atomically:

1. **Task 1: Add offline mode filtering + CacheFab to collection screen** - `36acd81` (feat)
2. **Task 2: Add CacheFab to artists screen** - `fc46108` (feat)
3. **Task 3: Add offline filtering + CacheFab to artist detail screen** - `0491df6` (feat)

**Plan metadata:** `0491df6` (feat: complete plan)

## Files Created/Modified

- `mobile/app/(tabs)/collection.tsx` - Offline filter useMemo, CacheFab, bulk handlers on filteredItems
- `mobile/app/(tabs)/artists.tsx` - CacheFab, filteredArtistItems offline filter, bulk handler updates
- `mobile/app/artist/artist_detail.tsx` - Offline filter useMemo, CacheFab, filteredArtistItems in FlatList

## Decisions Made

- Used `filteredItems` (filtered by offline mode) for all bulk actions (play/queue/playlist) — offline mode bulk actions only affect cached content
- CacheFab `downloadProgress` uses `downloadingTrackIds.size > 0 ? 0 : null` — null progress (indeterminate) when downloading
- `handleCancelDownloads` uses Alert placeholder — actual cancellation not yet implemented in store
- CollectionGridItem already shows cached dots from Plan 05-01 — no additional changes needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05-03 ready to execute — covers remaining offline mode integration tasks
- All three screens now filter to cached-only content in offline mode
- CacheFab visible in standalone mode on all screens for bulk downloads
- CollectionGridItem shows cached dots on album thumbnails (from Plan 05-01)

---
*Phase: 05-offline-mode-standalone-mobile*
*Completed: 2026-03-20*
