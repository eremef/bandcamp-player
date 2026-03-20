---
phase: 05-offline-mode-standalone-mobile
plan: '03'
subsystem: mobile
tags: [background-download, wifi-only, corrupted-cache, offline-mode, cache-filtering]

# Dependency graph
requires:
  - phase: 05-offline-mode-standalone-mobile
    provides: Offline mode infrastructure from plan 05-02
provides:
  - WiFi-only downloads setting with persistence
  - Background download task processing pending downloads
  - Corrupted cache detection with automatic retry
  - Offline mode queue filtering to cached-only tracks
affects:
  - Phase 5 remaining tasks
  - Mobile offline caching workflow

# Tech tracking
tech-stack:
  added: [expo-background-fetch, expo-task-manager, AsyncStorage pending downloads queue]
  patterns: [Background task registration, corrupted file fallback pattern, queue filtering on mode switch]

key-files:
  created: []
  modified:
    - mobile/store/index.ts
    - mobile/services/BackgroundSyncService.ts
    - mobile/app/settings.tsx
    - mobile/services/MobilePlayerService.ts
    - mobile/app/_layout.tsx

key-decisions:
  - "WiFi-only downloads default to enabled (wifi_only_downloads setting)"
  - "Background download uses 15-minute minimum interval for battery efficiency"
  - "Corrupted cache detection wraps TrackPlayer.add with try/catch and falls back to stream URL"
  - "Offline mode queue restoration filters uncached tracks before restoring state"

patterns-established:
  - "Pending downloads queue stored in AsyncStorage for background task access"
  - "Original streamUrl preserved before cache check for corrupted file fallback"
  - "Queue filtering by cachedTrackIds during restoreOfflineState"

requirements-completed:
  - OFFL-01
  - OFFL-02
  - OFFL-03
  - OFFL-05

# Metrics
duration: 15 min
completed: 2026-03-20
---

# Phase 5 Plan 3: Background Downloads + WiFi-Only + Corrupted Cache Summary

**Background download task with WiFi-only check, corrupted cache detection with stream fallback, and offline mode queue filtering to cached-only tracks**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-20T18:45:45Z
- **Completed:** 2026-03-20T18:58:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- WiFi-only downloads toggle in Settings > Offline Cache section with database persistence
- Download All My Collection button to queue entire collection for background download
- Background download task (BACKGROUND_DOWNLOAD) registered with TaskManager
- Pending downloads queue managed via AsyncStorage with getPendingDownloads/savePendingDownloads/removePendingDownload helpers
- Corrupted cache detection in MobilePlayerService.loadTrack with automatic cache entry deletion and stream URL retry
- Offline mode queue restoration filters uncached tracks, keeping only playable cached content

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WiFi-only setting to store and Settings screen** - `d8d0c75` (feat)
2. **Task 2: Add background download task to BackgroundSyncService** - `d50a183` (feat)
3. **Task 3: Add corrupted cache detection and queue clearing on mode switch** - `8c59b62` (feat)

**Plan metadata:** `8c59b62` (docs: complete plan)

## Files Created/Modified

- `mobile/store/index.ts` - Added wifiOnlyDownloads state, setWifiOnlyDownloads action, and queue filtering in restoreOfflineState
- `mobile/services/BackgroundSyncService.ts` - Added BACKGROUND_DOWNLOAD task, pending downloads queue management, and registerBackgroundDownload
- `mobile/app/settings.tsx` - Added WiFi-only toggle switch and Download All My Collection button
- `mobile/services/MobilePlayerService.ts` - Added corrupted cache detection with try/catch and stream URL fallback
- `mobile/app/_layout.tsx` - Added registerBackgroundDownload() call on app initialization

## Decisions Made

- WiFi-only downloads default to enabled (`wifi_only_downloads !== false`) to respect user bandwidth
- Background download uses 15-minute minimum interval for battery efficiency while keeping downloads timely
- Corrupted cache detection wraps TrackPlayer.add to catch file format errors, deletes corrupted entry, and retries with original streamUrl
- Offline mode queue restoration loads cachedTrackIds from MobileCacheService and filters restored queue to only cached tracks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 plan 3 complete. Background downloads, WiFi-only settings, corrupted cache handling, and offline queue filtering all implemented. Ready for any remaining Phase 5 tasks or Phase 6 (fully offline mode).

---
*Phase: 05-offline-mode-standalone-mobile*
*Completed: 2026-03-20*
