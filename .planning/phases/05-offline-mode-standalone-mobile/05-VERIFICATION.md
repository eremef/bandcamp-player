---
phase: 05-offline-mode-standalone-mobile
verified: 2026-03-20T19:15:00Z
status: gaps_found
score: 7/10 must-haves verified
gaps:
  - truth: "Album thumbnails in collection grid show accent-colored dot when any track is cached"
    status: failed
    reason: "CollectionGridItem's cached dot logic requires albumTrackIds prop to be passed, but none of the screens (collection.tsx, artists.tsx, artist_detail.tsx) pass this prop. The dot will never show."
    artifacts:
      - path: mobile/app/(tabs)/collection.tsx
        issue: "CollectionGridItem rendered without albumTrackIds prop"
      - path: mobile/app/(tabs)/artists.tsx
        issue: "CollectionGridItem not used in artists screen (only artist avatars)"
      - path: mobile/app/artist/artist_detail.tsx
        issue: "CollectionGridItem rendered without albumTrackIds prop"
    missing:
      - "Pass albumTrackIds prop to CollectionGridItem: item.album?.tracks?.map(t => String(t.id))"
  - truth: "BackgroundSyncService processes pending downloads when app is minimized"
    status: failed
    reason: "Background download task is registered and functional, but addPendingDownload() is NEVER CALLED anywhere. The pending downloads queue stays empty. CacheFab.handleDownloadAll and settings handleDownloadAllCollection call downloadTrack/downloadAlbum directly from the store, bypassing the pending queue entirely."
    artifacts:
      - path: mobile/services/BackgroundSyncService.ts
        issue: "addPendingDownload function defined but never imported/called anywhere"
    missing:
      - "Wire CacheFab callbacks to use addPendingDownload for background processing"
      - "Wire settings handleDownloadAllCollection to use addPendingDownload"
      - "Or integrate addPendingDownload into store's downloadTrack function"
---

# Phase 5: Offline Mode Standalone Mobile Verification Report

**Phase Goal:** Refactor, clean, verify, and fix offline mode in the mobile app. Standalone mode should allow downloading/caching music in the collection, album, artist view. It should indicate with the accent color dot that the album, track, and artists are cached. When playing music in the standalone mode - it should first check if it's cached and play cached music if so.

**Verified:** 2026-03-20T19:15:00Z
**Status:** gaps_found
**Score:** 7/10 truths verified

---

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | CachedIndicator uses theme accent color instead of hardcoded green | ✓ VERIFIED | Line 24 in CachedIndicator.tsx: `backgroundColor: colors.accent` |
| 2   | Album thumbnails in collection grid show accent-colored dot when any track is cached | ✗ FAILED | albumTrackIds prop never passed to CollectionGridItem |
| 3   | CacheFab is visible in standalone mode only, positioned bottom-right above player bar | ✓ VERIFIED | Line 514 collection.tsx: `visible={mode === 'standalone'}`, lines 113-116 CacheFab: `position: absolute, bottom: PLAYER_BAR_HEIGHT + 16, right: 16` |
| 4   | CacheFab shows download icon when not all items cached, checkmark when all cached, spinner during downloads | ✓ VERIFIED | Lines 31-35 CacheFab.tsx: icon selection based on state |
| 5   | CacheFab action sheet shows Download All Cached, Download All Visible, Cancel Downloads options | ✓ VERIFIED | Lines 37-65 CacheFab.tsx: action array construction |
| 6   | Collection screen filters to cached-only items when mode === 'offline' | ✓ VERIFIED | Lines 210-221 collection.tsx: filteredItems useMemo with offline mode check |
| 7   | Artist detail screen filters to cached-only items in offline mode | ✓ VERIFIED | Lines 62-73 artist_detail.tsx: filteredArtistItems useMemo |
| 8   | BackgroundSyncService processes pending downloads when app is minimized | ✗ FAILED | addPendingDownload never called; pending queue always empty |
| 9   | Background downloads respect WiFi-only setting | ✓ VERIFIED | Lines 94-101 BackgroundSyncService.ts: WiFi check before processing |
| 10  | WiFi-only toggle in Settings screen persists across app restarts | ✓ VERIFIED | Line 195 settings.tsx: Switch with onValueChange=setWifiOnlyDownloads; lines 359-362 store: setWifiOnlyDownloads persists to mobileDatabase |
| 11  | MobilePlayerService detects corrupted cached files and falls back to streaming | ✓ VERIFIED | Lines 268-309 MobilePlayerService.ts: try/catch around TrackPlayer.add with fallback |
| 12  | Switching from standalone to offline mode clears uncached tracks from queue | ✓ VERIFIED | Lines 244-264 store/index.ts: restoreOfflineState filters to cachedTrackIds |

**Score:** 10/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `mobile/components/CachedIndicator.tsx` | Visual dot using theme accent color | ✓ VERIFIED | Line 24 uses colors.accent |
| `mobile/components/CollectionGridItem.tsx` | Album thumbnail with cached dot | ✓ VERIFIED | Has dot logic, but prop not passed |
| `mobile/components/CacheFab.tsx` | FAB for bulk download operations | ✓ VERIFIED | 147 lines, fully implemented |
| `mobile/app/(tabs)/collection.tsx` | Offline-filtered FlatList, CacheFab | ✓ VERIFIED | filteredItems, CacheFab integration |
| `mobile/app/(tabs)/artists.tsx` | CacheFab integration | ✓ VERIFIED | CacheFab visible in standalone |
| `mobile/app/artist/artist_detail.tsx` | CacheFab, cached dot per album | ✓ VERIFIED | filteredArtistItems, CacheFab |
| `mobile/store/index.ts` | wifiOnlyDownloads, offline queue filtering | ✓ VERIFIED | Lines 212, 358-362, 244-264 |
| `mobile/services/BackgroundSyncService.ts` | BACKGROUND_DOWNLOAD task | ✓ VERIFIED | Task defined, pending queue never populated |
| `mobile/app/settings.tsx` | WiFi-only toggle, Download All | ✓ VERIFIED | Lines 183-198, 233-254 |
| `mobile/services/MobilePlayerService.ts` | Corrupted cache detection | ✓ VERIFIED | Lines 268-309 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| CollectionGridItem | mobile/store/index.ts | cachedTrackIds from useStore() | ⚠️ PARTIAL | UseStore selector exists, but albumTrackIds prop not passed |
| CacheFab | mobile/store/index.ts | downloadProgress, download handlers | ⚠️ PARTIAL | Handlers call store directly, not through addPendingDownload |
| BackgroundSyncService | mobile/store/index.ts | wifiOnlyDownloads check | ✓ WIRED | Line 95: `state.wifiOnlyDownloads` |
| MobilePlayerService | MobileCacheService | deleteCacheEntry on error | ✓ WIRED | Line 283: `mobileCacheService.deleteTrack` |
| settings.tsx | mobile/store/index.ts | wifiOnlyDownloads state/action | ✓ WIRED | Lines 194-195: value/onValueChange |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| OFFL-01 | 05-01, 05-03 | User can cache individual tracks for offline playback | ✓ SATISFIED | downloadTrack in store (line 365), MobilePlayerService.loadTrack checks cache first (line 204) |
| OFFL-02 | 05-03 | User can cache entire albums for offline playback | ✓ SATISFIED | downloadAlbum in store (line 426) |
| OFFL-03 | 05-03 | Cached tracks play without internet connection | ✓ SATISFIED | MobilePlayerService.loadTrack: cache check at line 204, offline check at lines 213-218 |
| OFFL-04 | 05-01, 05-02 | User can view which tracks are cached | ⚠️ PARTIAL | Per-track: CachedIndicator works ✓. Per-album: CollectionGridItem bug - albumTrackIds not passed ✗ |
| OFFL-05 | 05-03 | User can clear cache for individual tracks or albums | ✓ SATISFIED | deleteTrackFromCache (line 453), deleteAlbumFromCache (line 463), clearAllCache (line 468) |

**All 5 requirement IDs from phase frontmatter (OFFL-01 through OFFL-05) are accounted for in REQUIREMENTS.md and implemented in the codebase.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| - | - | No TODO/FIXME/placeholder comments found | ℹ️ Info | Clean implementation |
| - | - | No console.log-only stubs found | ℹ️ Info | Implementation is substantive |

### Human Verification Required

None required - all gaps are code-level issues that can be verified by code inspection.

---

## Gaps Summary

### Gap 1: Album Cached Dots Not Showing

**Root cause:** CollectionGridItem's cached dot logic requires the `albumTrackIds` prop to be passed, but none of the screens pass this prop.

**Impact:** Users cannot see which albums have cached tracks in the collection grid view (OFFL-04 partially blocked).

**Fix needed:** In each screen that renders CollectionGridItem:
```typescript
<CollectionGridItem
    item={item}
    albumTrackIds={item.album?.tracks?.map(t => String(t.id))}  // ADD THIS LINE
    onPress={handlePlayItem}
    onLongPress={handleLongPress}
    width={ITEM_WIDTH}
/>
```

**Files to fix:**
- `mobile/app/(tabs)/collection.tsx` (renderItem function)
- `mobile/app/artist/artist_detail.tsx` (renderItem function)

### Gap 2: Background Download Queue Never Populated

**Root cause:** `addPendingDownload()` in BackgroundSyncService is defined but never called. CacheFab callbacks and settings button directly call `downloadTrack`/`downloadAlbum` from the store, which download immediately and bypass the pending queue.

**Impact:** The BACKGROUND_DOWNLOAD background task will never find any pending downloads, defeating its purpose of processing downloads when the app is minimized.

**Fix option A (simplest):** Modify store's `downloadTrack` to call `addPendingDownload` for background processing:
```typescript
// At the start of downloadTrack
const { addPendingDownload } = require('../services/BackgroundSyncService');
await addPendingDownload(track);
```

**Fix option B:** Modify CacheFab handlers and settings to use the pending queue instead of immediate download.

---

## Verification Notes

- **Initial verification:** No previous VERIFICATION.md found
- **Phase 05 broken into 3 sub-plans:** 05-01 (UI components), 05-02 (screen integration), 05-03 (background services)
- **All TypeScript compiles** - No type errors found
- **Commit hashes documented in summaries:** 18136fa, 443d9e7, da5871b, 36acd81, fc46108, 0491df6, d8d0c75, d50a183, 8c59b62

---

_Verified: 2026-03-20T19:15:00Z_
_Verifier: Claude (gsd-verifier)_
