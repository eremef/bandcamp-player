# Phase 6: Fully Offline Mode - Research

**Researched:** 2026-03-20
**Domain:** React Native (Expo) mobile offline mode - ensuring zero network requests
**Confidence:** HIGH

## Summary

Phase 6 is the "final polish" phase to ensure offline mode truly blocks ALL network activity and provides consistent UX. The core infrastructure is already built in Phases 4/5 (SQLite storage, MobileScraperService guards, offline collection filtering). The remaining gaps are:

1. **Missing Empty State component** — No consistent UI when offline + no cached content
2. **Album Detail offline behavior** — No loading/empty state handling when offline
3. **"View on Bandcamp" button** — Should be hidden in offline mode
4. **Potential hidden network calls** — Need to audit any remaining paths

**Primary recommendation:** Create a reusable `OfflineEmptyState` component with a "Switch to Standalone" button. Integrate it into collection, artists, and album detail screens. Hide Bandcamp-dependent UI elements in offline mode.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Block ALL network requests in offline mode — Network layer interception at MobileScraperService
- On blocked request: Return cached/fallback data (local data), empty results if unavailable
- Collection source: MobileDatabase (SQLite) — already stores collection metadata
- Stale data: Accept stale data, show whatever's in database
- Artwork: Cache locally with audio for complete offline experience
- Stream URLs: NOT cached — only cached audio files
- Empty state message: "Switch to Standalone mode to download music for offline listening" + "Switch to Standalone" button
- Same empty state everywhere: Collection, Artists, Album views
- Sync on mode switch to Standalone — Collection metadata only

### Claude's Discretion
- Component architecture — create a single shared component or per-screen inline states
- Exact placement of empty state in UI flow
- Loading states vs. immediate empty state

### Deferred Ideas
- None

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFL-01 | User can cache individual tracks for offline playback | Already implemented via MobileCacheService.downloadTrack() |
| OFFL-02 | User can cache entire albums for offline playback | Already implemented via MobileCacheService.downloadAlbum() |
| OFFL-03 | Cached tracks play without internet connection | Already implemented via MobilePlayerService.loadTrack() with cache-first logic |
| OFFL-04 | User can view which tracks are cached | Implemented via CachedIndicator component |
| OFFL-05 | User can clear cache for individual tracks or albums | Already implemented via deleteTrackFromCache/deleteAlbumFromCache |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-sqlite | (bundled) | Local SQLite database | Already used for all offline data storage |
| react-native-track-player | (bundled) | Audio playback | Already used for offline audio playback |
| zustand | (bundled) | State management | Already used for app state |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| MobileDatabase | SQLite operations | All offline data queries |
| MobileCacheService | Audio file caching | Track download/delete operations |
| MobileScraperService | Network request handling | Has built-in offline guards |

### Existing Offline Infrastructure
| Service | Purpose | Status |
|---------|---------|--------|
| `MobileDatabase.getOfflineCollection()` | Returns collection items with cached audio | ✅ Implemented |
| `MobileDatabase.getOfflineArtists()` | Returns artists with any cached albums/tracks | ✅ Implemented |
| `MobileScraperService` offline guards | Blocks network in offline mode | ✅ Implemented |
| `MobilePlayerService.loadTrack()` | Cache-first playback with offline handling | ✅ Implemented |
| `refreshCollection()` offline path | Loads from `getOfflineCollection()` | ✅ Implemented |
| `refreshArtists()` offline path | Loads from `getOfflineArtists()` | ✅ Implemented |
| `refreshArtistCollection()` offline path | Loads from `getOfflineCollection()` filtered | ✅ Implemented |

## Architecture Patterns

### Offline Data Flow (Already Implemented)

```
┌─────────────────────────────────────────────────────────────┐
│ User selects "Offline" mode                                 │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ store.restoreOfflineState()                                   │
│ - Sets mode='offline', isOfflineMode=true                    │
│ - Restores queue filtered to cached-only tracks               │
│ - Sets auth.isAuthenticated=false, connectionStatus=disconnected│
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Screen mounts → refreshCollection() / refreshArtists()         │
│ Store checks: if (mode === 'offline')                        │
│   → call mobileDatabase.getOfflineCollection(query)           │
│   → call mobileDatabase.getOfflineArtists()                   │
│ (NO network calls)                                          │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Collection/Artists screen shows filtered results               │
│ filteredItems = collectionItems.filter(item => isCached)      │
└──────────────────────────────────────────────────────────────┘
```

### Mode Detection Pattern (Already Established)
```typescript
// Every service/screen checks both flags
const isOffline = isOfflineMode || manualOfflineOverride;
// OR
if (get().mode === 'offline') { ... }
```

### Screen Offline Pattern (Already in collection.tsx)
```typescript
// Collection screen filtering (ALREADY EXISTS)
const filteredItems = useMemo(() => {
    if (mode !== 'offline') return collectionItems;
    return collectionItems.filter(item => {
        if (item.type === 'album' && item.album?.tracks) {
            return item.album.tracks.every(t => cachedTrackIds.has(String(t.id)));
        } else if (item.type === 'track' && item.track) {
            return cachedTrackIds.has(String(item.track.id));
        }
        return false;
    });
}, [collectionItems, mode, cachedTrackIds]);
```

### MobileScraperService Offline Guard (ALREADY IMPLEMENTED)
```typescript
// fetchCollection() — lines 165-181
if (isOffline) {
    console.log(`[MobileScraper] Offline Mode: loading collection from database.`);
    const cached = await mobileDatabase.getCollectionCache(cacheId);
    if (cached) return cached.data;
    throw new Error('Collection not found in cache. Cannot fetch it while offline.');
}

// getAlbumDetails() — lines 586-598
if (isOffline) {
    console.log(`[MobileScraper] Offline Mode: Resolving ${albumUrl} from DB`);
    const album = await mobileDatabase.getAlbumByUrl(albumUrl);
    if (album) {
        const tracks = await mobileDatabase.getTracksByAlbumId(album.id);
        return { ...album, tracks };
    }
    return null;
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Offline detection | Custom network check | `mode === 'offline'` or `isOfflineMode \|\| manualOfflineOverride` | Already managed by store |
| Collection filtering | Custom filter logic | `getOfflineCollection()` / `getOfflineArtists()` | Already returns cached-only items |
| Empty state UI | Per-screen custom empty states | Shared `OfflineEmptyState` component | Consistency across screens |

**Key insight:** The offline infrastructure is largely built. Phase 6 is primarily a UX/states polish phase.

## Common Pitfalls

### Pitfall 1: Mixed Offline/Online State
**What goes wrong:** App shows stale collection that was synced hours ago, but user thinks they're viewing live data.
**Why it happens:** `getOfflineCollection()` returns DB data which may be hours/days old.
**How to avoid:** Accept stale data per design decision. No sync status shown (per CONTEXT.md). Data freshness is implicit.
**Warning signs:** User confusion about "missing" recent purchases.

### Pitfall 2: Album Detail Empty State Missing
**What goes wrong:** User navigates to album detail while offline → loading spinner forever, or error.
**Why it happens:** `album_detail.tsx` calls `mobileScraperService.getAlbumDetails()` which returns `null` if album not in DB, but the screen doesn't handle the null state gracefully.
**How to avoid:** Check if album exists in DB, show empty state if not cached.
**Warning signs:** Loading spinner visible in offline mode for uncached albums.

### Pitfall 3: Network Leakage in Background Services
**What goes wrong:** Background sync, remote config, or analytics fires network requests despite offline mode.
**Why it happens:** These services don't check `mode === 'offline'` before executing.
**How to avoid:** Audit all services that make network calls. Add mode checks or use the existing offline guard pattern.
**Warning signs:** Any network request in offline mode (check console logs).

### Pitfall 4: Inconsistent Empty States
**What goes wrong:** Collection shows "no items", Artists shows "no artists", Album shows "not found" — inconsistent messaging.
**Why it happens:** Each screen has its own empty state logic.
**How to avoid:** Use a single shared component with the agreed-upon message.
**Warning signs:** Different empty state text across screens.

## Code Examples

### 1. OfflineEmptyState Component (TO CREATE)
```typescript
// mobile/components/OfflineEmptyState.tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { WifiOff } from 'lucide-react-native';

interface OfflineEmptyStateProps {
    visible: boolean;
    message?: string;
}

export function OfflineEmptyState({ 
    visible, 
    message = 'Switch to Standalone mode to download music for offline listening' 
}: OfflineEmptyStateProps) {
    const colors = useTheme();
    const { setMode } = useStore();
    
    if (!visible) return null;
    
    return (
        <View style={styles.container}>
            <WifiOff size={48} color={colors.textSecondary} />
            <Text style={[styles.message, { color: colors.textSecondary }]}>
                {message}
            </Text>
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }]}
                onPress={() => setMode('standalone')}
            >
                <Text style={styles.buttonText}>Switch to Standalone</Text>
            </TouchableOpacity>
        </View>
    );
}
```

### 2. Integration Pattern — Collection Screen (TO ADD)
```typescript
// In collection.tsx, add near the FlatList:
const isEmpty = filteredItems.length === 0 && !isCollectionLoading;

return (
    // ... existing search/filter UI ...
    <FlatList
        data={filteredItems}
        renderItem={renderItem}
        // ... existing props ...
        ListEmptyComponent={
            isEmpty ? (
                <OfflineEmptyState visible={true} />
            ) : isCollectionLoading ? (
                // existing loading spinner
            ) : null
        }
    />
);
```

### 3. Album Detail Offline Handling (TO ADD)
```typescript
// In album_detail.tsx useEffect:
mobileScraperService.getAlbumDetails(url)
    .then((details: Album | null) => {
        if (details) {
            // existing logic
        } else if (mode === 'offline') {
            // Album not cached — could show empty state
            // or the screen will show "Album not found" which is acceptable
        }
    });
```

### 4. Hide Bandcamp Button in Offline Mode (TO ADD)
```typescript
// In artist_detail.tsx render section header:
{mode !== 'offline' && (
    <TouchableOpacity
        style={styles.bandcampButton}
        onPress={handleViewOnBandcamp}
    >
        <Text style={styles.bandcampButtonText}>View on Bandcamp</Text>
    </TouchableOpacity>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|--------------|--------|
| No offline mode | Three modes: Remote, Standalone, Offline | Phase 4/5 | Users can now use app with zero connectivity |
| Online-only collection | SQLite-backed collection with offline query methods | Phase 4 | Collection available without network |
| Network-first playback | Cache-first playback with offline fallback | Phase 4 | Seamless offline playback |
| Per-screen empty states | Shared OfflineEmptyState (Phase 6) | Phase 6 | Consistent UX across screens |

**Deprecated/outdated:**
- None specific to this phase.

## Open Questions

1. **Radio in offline mode**
   - What we know: `refreshRadio` calls scraper which returns cached radio + fallback weekly station
   - What's unclear: Should radio be completely hidden in offline mode since streams can't work offline?
   - Recommendation: Keep current behavior (cached stations + fallback) — this is already non-network.

2. **"View on Bandcamp" button visibility**
   - What we know: Currently shown in artist_detail even in offline mode
   - What's unclear: Should it be hidden or disabled in offline mode?
   - Recommendation: Hide in offline mode (button opens external URL — network-dependent).

3. **Album detail with uncached tracks**
   - What we know: `getTracksByAlbumId` returns tracks that have `audio_cache` entries
   - What's unclear: What to show if album is in DB but no tracks are cached?
   - Recommendation: Show album header with empty track list + OfflineEmptyState or "No cached tracks" message.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (mobile tests) |
| Config file | `mobile/package.json` jest config |
| Quick run command | `npm run test:mobile` |
| Full suite command | `npm run test:mobile` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFL-03 | Cached tracks play without internet | unit | `npx jest mobile/__tests__/services/TrackPlayerService.test.ts` | ✅ |
| OFFL-01 | Cache individual tracks | unit | `npx jest mobile/__tests__/MobileCacheService.test.ts` (if exists) | ❌ Wave 0 |
| OFFL-02 | Cache entire albums | unit | same as above | ❌ Wave 0 |
| OFFL-04 | View which tracks cached | unit | `npx jest mobile/__tests__/components/CachedIndicator.test.tsx` (if exists) | ❌ Wave 0 |
| OFFL-05 | Clear cache | unit | same as OFFL-01 | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `mobile/__tests__/services/MobileCacheService.test.ts` — covers OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/__tests__/components/CachedIndicator.test.tsx` — covers OFFL-04
- [ ] `mobile/__tests__/app/album_detail.test.tsx` — update for offline mode behavior

*(No new test infrastructure needed — existing Jest config covers all mobile tests)*

## Sources

### Primary (HIGH confidence)
- `mobile/store/index.ts` — refreshCollection offline path (lines 1503-1516), refreshArtists (lines 1644-1665), refreshArtistCollection (lines 1667-1689)
- `mobile/services/MobileDatabase.ts` — getOfflineCollection() (lines 876-940), getOfflineArtists() (lines 692-710), getTracksByAlbumId (lines 662-683)
- `mobile/services/MobileScraperService.ts` — offline guards in fetchCollection (lines 165-181), getAlbumDetails (lines 586-598)
- `mobile/services/MobilePlayerService.ts` — cache-first loadTrack() with offline handling (lines 203-246)

### Secondary (MEDIUM confidence)
- `mobile/app/(tabs)/collection.tsx` — existing offline filtering pattern (lines 210-221)
- `mobile/app/artist/artist_detail.tsx` — existing offline filtering pattern (lines 62-73)

### Tertiary (LOW confidence)
- None required — codebase analysis provides HIGH confidence for all findings.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all libraries are already in use
- Architecture: HIGH — patterns already established in Phase 4/5
- Pitfalls: HIGH — gaps identified through codebase analysis

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — stable mobile offline patterns)

---

## Research Complete

**Phase:** 06 - Fully Offline Mode
**Confidence:** HIGH

### Key Findings
1. **Core infrastructure is done** — MobileScraperService has offline guards, MobileDatabase has offline query methods, store has offline refresh paths
2. **Main gap is UX** — Missing consistent `OfflineEmptyState` component with "Switch to Standalone" button
3. **Album detail needs attention** — Loading/error states when offline + "View on Bandcamp" should be hidden
4. **Patterns already established** — Filtering logic exists in collection.tsx and artist_detail.tsx, just need to reuse
5. **No new libraries needed** — Everything uses existing expo-sqlite, zustand, existing components

### File Created
`.planning/phases/06-fully-offline-mode/06-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All libraries already in codebase |
| Architecture | HIGH | Offline patterns already established |
| Pitfalls | HIGH | Gaps identified through code analysis |

### Open Questions
- Radio behavior in offline mode (already works, acceptable)
- Album detail: how to handle uncached albums (show "Album not found" or empty track list)

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
