# Phase 5: Standalone Offline Mode for Mobile - Research

**Researched:** 2026-03-20
**Domain:** React Native (Expo) + react-native-track-player + expo-file-system + expo-background-fetch
**Confidence:** HIGH

## Summary

This phase refactors, cleans, verifies, and fixes the offline/caching mode in the mobile app for standalone (independent player, no remote connection) usage. The app already has three modes (Remote, Standalone, Offline) implemented in the store with mode switching UI. Phase 4 implemented the core caching infrastructure (MobileCacheService, CachedIndicator, OfflineBanner, useOfflineMode hook, store cache actions, album detail per-track indicators, collection/artist context menus). Phase 5 extends this by adding: album art thumbnail cached-dot indicators in collection/artist views, a FAB for bulk download operations, background downloads with WiFi-only control, "prefer cached over streaming" playback verification, and offline-mode collection filtering.

**Primary recommendation:** Add cached-dot indicators to CollectionGridItem (album art thumbnails), create a CacheFab component for bulk downloads, extend BackgroundSyncService for background downloads, update OfflineBanner for standalone mode, add a WiFi-only download toggle in Settings, verify MobilePlayerService always prefers cached files, and implement offline-mode collection filtering.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three modes: Remote, Standalone, Offline (user manually selects)
- Standalone and Offline share the same cache directory
- **Controls:** Context menu (long-press) + FAB (bottom-right corner)
- **FAB behavior:** Show options menu ("Download All Cached", "Download All Visible", "Download by Artist")
- **Progress:** Toast notifications + progress bar in FAB
- **Album context menu:** Download album only
- **Partial cache:** Dot indicator
- **Full cache:** Checkmark replaces download icon
- **Cancel downloads:** Swipe to cancel
- **Background downloads:** Continue when app minimized
- **WiFi-only downloads:** Default enabled
- **Partially cached albums:** Just the dot, no count text
- **Settings:** "Download All My Collection" master button in Cache Settings
- **Position:** Accent color dot in bottom-left corner of album art thumbnail (same as Desktop app)
- **Artist cached criteria:** Artist has indicator if any album is cached
- **Artist view:** Dot per album row
- **Album detail:** Dot per track row (ALREADY DONE - see Findings)
- **Track indicator:** Small colored dot (consistent with album/artist)
- **Dot size:** Consistent across all views
- **Dot color:** App accent color
- **Online preference:** Always prefer cached files over streaming
- **Cache check timing:** At play time
- **Corrupted cache:** Fall back to streaming, mark cache as invalid, automatic background re-cache
- **UI indicator:** No indicator (seamless experience)
- **Uncached tracks stream automatically** in standalone mode (no prompt)
- **Offline mode:** Same UI as Standalone, filtered to cached-only content
- **No cached indicators** in offline mode (redundant — all visible is cached)
- **Switching Standalone → Offline with uncached in queue:** Clear uncached tracks, keep cached

### Claude's Discretion
- Toast notification design
- Specific swipe gesture implementation for cancel
- Progress bar visual design within FAB

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFL-01 | User can cache individual tracks for offline playback | MobileCacheService.downloadTrack() — already implemented, verify standalone mode integration |
| OFFL-02 | User can cache entire albums for offline playback | MobileCacheService.downloadAlbum() + FAB bulk options — already implemented, add FAB |
| OFFL-03 | Cached tracks play without internet connection | MobilePlayerService.loadTrack() — already checks cache, verify it always prefers cached |
| OFFL-04 | User can view which tracks are cached | CachedIndicator per track in album detail — ALREADY DONE; add per-album in CollectionGridItem + artist view |
| OFFL-05 | User can clear cache for individual tracks or albums | MobileCacheService.deleteTrack/deleteAlbum() + context menus — already implemented |

**Note:** OFFL-01 through OFFL-05 are already implemented in Phase 4 for mobile. Phase 5 focuses on:
1. Verifying (OFFL-03 cache-first playback, OFFL-04 album/artist indicators)
2. Refactoring/cleaning (consolidate download patterns)
3. Adding missing UI (FAB, CollectionGridItem dot, offline mode filtering)
4. Adding background download capability
5. WiFi-only setting for downloads

</phase_requirements>

---

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-file-system | ~55.0.10 | Download and store audio files | Official Expo library |
| expo-network | ~55.0.8 | Network connectivity detection | Already installed — used in useOfflineMode |
| react-native-track-player | ^5.0.0-nightly | Audio playback with local file support | Already integrated |
| expo-sqlite | ~55.0.10 | Local database for cache metadata | Already in use for MobileDatabase |
| expo-background-fetch | ~55.0.9 | Background download continuation | Already installed for collection sync |
| expo-task-manager | ~55.0.9 | Background task management | Already installed |
| @react-native-async-storage/async-storage | 2.2.0 | Queue persistence, settings | Already in use |
| expo-task-manager | already present | Background download scheduling | Already installed |

**No new installations needed** — all required libraries are already in package.json.

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-file-system/next | (part of expo-file-system) | File.downloadFileAsync, Directory, File classes | Already used in MobileCacheService |

### Already Available
- **MobileCacheService.ts**: Full caching service — download, delete, LRU eviction, size tracking
- **CachedIndicator.tsx**: Per-track dot — already works for album detail track rows
- **OfflineBanner.tsx**: Offline status banner — exists, needs standalone mode awareness
- **useOfflineMode hook**: Network detection — exists, used in OfflineBanner
- **Store cache actions**: downloadTrack, downloadAlbum, deleteTrackFromCache, deleteAlbumFromCache, clearAllCache, loadCachedTrackIds, cachedTrackIds Set, downloadingTrackIds Map

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
mobile/
├── components/
│   ├── CachedIndicator.tsx       # MODIFY — add bottom-left dot for album art
│   ├── CollectionGridItem.tsx    # MODIFY — integrate CachedIndicator for album thumbnail
│   ├── CacheFab.tsx              # NEW — FAB for bulk download operations
│   └── OfflineBanner.tsx         # MODIFY — awareness of standalone vs offline mode
├── app/
│   ├── (tabs)/
│   │   ├── collection.tsx        # MODIFY — integrate CacheFab, offline filter
│   │   └── artists.tsx           # MODIFY — add cached dot per album row
│   ├── album_detail.tsx          # MODIFY — integrate CacheFab (already has CachedIndicator per track)
│   ├── artist/
│   │   └── artist_detail.tsx     # MODIFY — add cached dot per album row, CacheFab
│   └── settings.tsx             # MODIFY — add WiFi-only toggle, Download All Collection
│   └── index.tsx                # No changes needed — mode selector already works
├── services/
│   ├── BackgroundSyncService.ts  # MODIFY — add background download task
│   ├── MobileCacheService.ts     # VERIFY — confirm cache-first playback
│   ├── MobilePlayerService.ts    # VERIFY — confirm cache-first in loadTrack
│   └── useOfflineMode.ts        # MODIFY — awareness of offline mode filtering
├── store/
│   └── index.ts                 # MODIFY — add wifiOnlyDownloads, offlineCollectionFilter, downloadAllCollection
└── theme/
    └── index.ts                  # No changes needed
```

### Pattern 1: Album Artwork Cached Dot (NEW)
**What:** Add accent-colored dot in bottom-left of album art thumbnail in collection grid
**When to use:** Collection grid items, artist detail album rows
**Example:**
```tsx
// In CollectionGridItem.tsx
// Position: bottom-left of artwork thumbnail, consistent with album_detail per-track dots
// Size: 8px diameter (matches album_detail CachedIndicator small size)
// Color: App accent color from theme
// Logic: Show if any track in the album is cached (check cachedTrackIds against album tracks)

import { CachedIndicator } from './CachedIndicator';

// Inside artwork container (bottom-left corner):
<View style={[styles.artworkContainer, { backgroundColor: colors.input }]}>
    {artworkUrl ? (
        <Image source={{ uri: artworkUrl }} style={styles.artwork} />
    ) : (
        <View style={[styles.artwork, styles.placeholderArtwork, { backgroundColor: colors.card }]}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>♪</Text>
        </View>
    )}
    {/* Cached dot — bottom-left corner */}
    <View style={styles.cachedDotContainer}>
        {isAlbumCached && <View style={[styles.cachedDot, { backgroundColor: colors.accent }]} />}
    </View>
</View>

const styles = StyleSheet.create({
    artworkContainer: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 4,
        overflow: 'hidden',
    },
    cachedDotContainer: {
        position: 'absolute',
        bottom: 4,
        left: 4,
    },
    cachedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});
```

### Pattern 2: Cache FAB Component (NEW)
**What:** Floating action button in bottom-right corner for bulk download operations
**When to use:** Collection, album detail, artist detail screens
**Example:**
```tsx
// mobile/components/CacheFab.tsx
// Position: Bottom-right corner (standard FAB position, accessible with thumb)
// Size: 56px diameter (standard FAB)
// Icon: Download icon, changes to checkmark when all visible items cached
// Options menu (shown on press):
//   - "Download All Cached" (shows when not all visible items are cached)
//   - "Download All Visible" (all visible items)
//   - "Download by Artist" (in collection/artist view)
//   - "Cancel Downloads" (when downloads in progress)
// Progress: Shows download progress bar inside or below FAB
// Visibility: Only shown in standalone mode (not remote, not offline)
// Offline mode: Not shown (filtered to cached-only, no downloads possible)

import { TouchableOpacity, View, StyleSheet, Text, Animated } from 'react-native';
import { Download, Check, Activity } from 'lucide-react-native';

interface CacheFabProps {
    visible: boolean;
    isAllCached: boolean;
    downloadProgress: number | null; // 0-1 for indeterminate/progress
    onPress: () => void;
}

export function CacheFab({ visible, isAllCached, downloadProgress, onPress }: CacheFabProps) {
    if (!visible) return null;
    
    return (
        <TouchableOpacity style={styles.fab} onPress={onPress}>
            {downloadProgress !== null ? (
                <View style={styles.progressContainer}>
                    <Activity size={24} color="#fff" />
                    <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
                </View>
            ) : isAllCached ? (
                <Check size={24} color="#fff" />
            ) : (
                <Download size={24} color="#fff" />
            )}
        </TouchableOpacity>
    );
}
```

### Pattern 3: Offline Mode Collection Filtering (NEW)
**What:** Filter collection to show only cached albums/tracks when in offline mode
**When to use:** Collection screen, artist detail screen in offline mode
**Logic:**
```tsx
// In collection.tsx and artist_detail.tsx:
// When mode === 'offline', filter collection items:
// - Albums: show only if ALL tracks are cached
// - Tracks: show only if the track itself is cached
// Filter happens at render level — no network requests

const filteredItems = useMemo(() => {
    if (mode !== 'offline') return items;
    
    return items.filter(item => {
        if (item.type === 'album' && item.album?.tracks) {
            return item.album.tracks.every(t => cachedTrackIds.has(String(t.id)));
        } else if (item.type === 'track' && item.track) {
            return cachedTrackIds.has(String(item.track.id));
        }
        return false;
    });
}, [items, mode, cachedTrackIds]);

// In offline mode: hide CachedIndicator (redundant — all visible is cached)
```

### Pattern 4: Background Downloads (NEW)
**What:** Continue downloads when app is minimized using expo-background-fetch
**When to use:** FAB download operations, album downloads initiated by user
**Example:**
```tsx
// Extend BackgroundSyncService.ts with download task
// Or create new BackgroundDownloadService.ts

const BACKGROUND_DOWNLOAD = 'BACKGROUND_DOWNLOAD';

TaskManager.defineTask(BACKGROUND_DOWNLOAD, async () => {
    try {
        const state = useStore.getState();
        if (state.mode !== 'standalone') return BackgroundFetch.BackgroundFetchResult.NoData;
        
        // Check WiFi-only setting
        if (state.wifiOnlyDownloads) {
            const networkState = await Network.getNetworkStateAsync();
            if (networkState.type !== Network.NetworkStateType.WIFI) {
                return BackgroundFetch.BackgroundFetchResult.NoData;
            }
        }
        
        // Process pending downloads from a queue
        // (store pending downloads in AsyncStorage)
        const pending = await getPendingDownloads();
        for (const track of pending) {
            await mobileCacheService.downloadTrack(track);
        }
        
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});
```

### Pattern 5: Standalone → Offline Queue Clearing (VERIFY/IMPLEMENT)
**What:** When switching from standalone to offline mode, clear uncached tracks from queue
**When to use:** setMode() transition from 'standalone' to 'offline'
**Example:**
```tsx
// In store/index.ts setMode():
// Already implemented in restoreOfflineState() — queue items are restored from AsyncStorage
// Need to verify that uncached items are filtered out

const restoredQueue = { items: [] as QueueItem[], currentIndex: -1 };
const savedQueueJson = await AsyncStorage.getItem('offline_queue');
if (savedQueueJson) {
    const parsed = JSON.parse(savedQueueJson);
    // Filter to only cached tracks
    const cachedItems = (parsed.items || []).filter((item: QueueItem) => {
        return cachedTrackIds.has(String(item.track.id));
    });
    restoredQueue = {
        items: cachedItems,
        currentIndex: Math.min(parsed.currentIndex, cachedItems.length - 1)
    };
}
```

### Pattern 6: Cache-First Playback (VERIFY)
**What:** MobilePlayerService.loadTrack() always checks cache before streaming
**Status:** ALREADY IMPLEMENTED — verified in MobilePlayerService.ts lines 202-207:
```typescript
// 1. Check if track is cached locally
const cacheEntry = await mobileCacheService.getCacheEntry(track.id);
if (cacheEntry) {
    console.log(`[MobilePlayer] Using cached file for ${track.title}: ${cacheEntry.filePath}`);
    streamUrl = cacheEntry.filePath;
    await mobileCacheService.updateLastAccessed(track.id);
}
```
**Verification needed:** Ensure corrupted file fallback triggers re-download and re-cache.

### Pattern 7: WiFi-Only Downloads (NEW)
**What:** Setting to restrict downloads to WiFi only
**Where:** Settings screen, cache settings section
**Example:**
```tsx
// In settings.tsx, add toggle in cache settings section:
const { wifiOnlyDownloads, setWifiOnlyDownloads } = useStore();

<View style={[styles.settingItem, { borderBottomColor: colors.border || '#333' }]}>
    <View style={styles.settingLabelContainer}>
        <Wifi color={colors.text} size={20} style={styles.settingIcon} />
        <View>
            <Text style={[styles.settingTitle, { color: colors.text }]}>WiFi-Only Downloads</Text>
            <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Only download music when connected to WiFi
            </Text>
        </View>
    </View>
    <Switch
        value={wifiOnlyDownloads}
        onValueChange={setWifiOnlyDownloads}
        trackColor={{ false: '#333', true: colors.accent }}
    />
</View>

// In MobileCacheService: Check network type before downloading
// Use expo-network to check NetworkState.type === NetworkStateType.WIFI
```

### Pattern 8: Download All My Collection (NEW)
**What:** Master button in Settings to queue entire collection for download
**Where:** Settings screen, cache section
**Example:**
```tsx
// In settings.tsx:
const handleDownloadAllCollection = async () => {
    const collection = useStore.getState().collection;
    if (!collection) return;
    
    for (const item of collection.items) {
        if (item.type === 'album' && item.album?.tracks) {
            await downloadAlbum(item.album.tracks, item.album);
        } else if (item.type === 'track' && item.track) {
            await downloadTrack(item.track);
        }
    }
};
```

### Anti-Patterns to Avoid
- **Per-track dots in collection grid**: CollectionGridItem is an album/track thumbnail — the dot goes on the artwork, not as a separate row. Album detail already has per-track dots.
- **CachedIndicator in offline mode**: All visible content is cached — dot is redundant and should be hidden.
- **Background download without WiFi check**: Respect user's wifiOnlyDownloads setting before starting background downloads.
- **Corrupted file without re-cache**: When a cached file fails to play, delete the cache entry and allow re-download.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background downloads | Custom native module for background tasks | expo-background-fetch + expo-task-manager | Already installed, handles app termination |
| Network type detection | Raw fetch with timeout | expo-network | Already installed, provides full NetworkState |
| Progress tracking | Custom state management | Use existing downloadingTrackIds Map in store | Already integrated with CachedIndicator |
| FAB positioning | Custom layout | Standard bottom-right with SafeAreaView insets | Already handled in existing player bar |
| Album cached detection | Per-track checks | Check if ALL album tracks are in cachedTrackIds Set | O(1) lookup per album |

---

## Common Pitfalls

### Pitfall 1: Missing Album Track Resolution Before Cache Check
**What goes wrong:** Album detail shows cached dot on artwork, but individual tracks fail to download because they lack streamUrl.
**Why it happens:** Phase 4 download logic in store already handles streamUrl resolution for individual tracks, but album-level downloads may need the same resolution.
**How to avoid:** Ensure downloadAlbum() passes tracks through the same streamUrl resolution logic as downloadTrack() — the store's downloadTrack already does this (lines 331-343).
**Warning signs:** Albums show cached dot but download fails silently.

### Pitfall 2: Offline Mode Filter Performance
**What goes wrong:** Offline mode filtering causes lag on large collections (5000+ items).
**Why it happens:** Filtering runs on every render without memoization.
**How to avoid:** Use `useMemo` with mode and cachedTrackIds as dependencies — cachedTrackIds is a Set but reference changes on updates, so compare size or use shallow compare.
**Warning signs:** Collection screen stutters when scrolling in offline mode.

### Pitfall 3: CachedIndicator Invisible on Dark Artwork
**What goes wrong:** Green dot is invisible on dark album artwork thumbnails.
**Why it happens:** CachedIndicator uses fixed #34C759 (green) color, which doesn't contrast well with dark album art.
**How to avoid:** Use app accent color from theme (passed to useTheme()) instead of hardcoded green. The CONTEXT.md says "accent color dot" — this should come from the theme.
**Warning signs:** Users report not seeing cached indicators on some albums.

### Pitfall 4: Background Download Fails After App Termination
**What goes wrong:** expo-background-fetch tasks may not run reliably on all Android devices (manufacturer battery optimization).
**Why it happens:** Android doze mode and manufacturer-specific battery optimization can prevent background tasks.
**How to avoid:** Use expo-task-manager with proper task options, inform users about battery optimization settings. Consider expo-application for checking battery optimization status.
**Warning signs:** Downloads don't complete when app is in background for extended periods.

### Pitfall 5: FAB Obstructs Player Bar
**What goes wrong:** FAB overlaps the player bar at the bottom of the screen.
**Why it happens:** FAB is positioned absolute bottom-right, player bar is at bottom.
**How to avoid:** Position FAB above the player bar using `bottom: playerBarHeight + padding`. The player tab bar height is typically ~60px + safe area inset.
**Warning signs:** FAB overlaps play/pause button.

### Pitfall 6: Queue Clearing on Mode Switch
**What goes wrong:** Switching from standalone to offline mode clears queue even when tracks ARE cached.
**Why it happens:** The filter checks cachedTrackIds but loadCachedTrackIds() may not have completed yet when restoreOfflineState() runs.
**How to avoid:** Ensure loadCachedTrackIds() is called BEFORE restoring the offline queue. The store already loads cachedTrackIds on app start via useOfflineMode, but verify the timing in restoreOfflineState.
**Warning signs:** Queue appears empty after switching to offline mode.

### Pitfall 7: Cached Dot on Tracks vs Albums
**What goes wrong:** Album shows cached dot but individual tracks don't (or vice versa).
**Why it happens:** Different check logic for albums (all tracks cached?) vs tracks (single track cached).
**How to avoid:** Standardize: Album cached = all tracks cached. Track cached = single track in cachedTrackIds. Artist cached = any album cached.
**Warning signs:** Inconsistent dot display between collection, album detail, and artist views.

---

## Code Examples

### Theme-Based Cached Dot Color (from CachedIndicator.tsx — needs fix)
```tsx
// CURRENT (hardcoded green — should use accent color):
cachedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',  // ← HARDCODED, should use colors.accent
}

// FIXED:
import { useTheme } from '../theme';

export function CachedIndicator({ trackId, size = 'small' }: CachedIndicatorProps) {
    const colors = useTheme();
    // ...
    cachedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.accent,  // ← Use theme accent
    }
}
```

### Album Cached Check for CollectionGridItem
```tsx
// In CollectionGridItem, add prop to receive album track IDs
interface CollectionGridItemProps {
    // ... existing props
    albumTrackIds?: string[]; // For cached dot check
}

// Usage in component:
const isAlbumCached = useMemo(() => {
    if (!albumTrackIds || albumTrackIds.length === 0) return false;
    return albumTrackIds.some(id => cachedTrackIds.has(id));
}, [albumTrackIds, cachedTrackIds]);

// Show dot in bottom-left of artwork
{isAlbumCached && (
    <View style={[styles.cachedDot, { backgroundColor: colors.accent }]} />
)}
```

### Offline Mode Filter in Collection Screen
```tsx
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

// In FlatList: use filteredItems instead of collectionItems
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No cached indicators | Per-track dot in album detail | Phase 4 | OFFL-04 implemented |
| No album thumbnail dot | No indicator on collection thumbnails | Phase 4 gap | Phase 5 adds this |
| No FAB | Context menu only for downloads | Phase 4 gap | Phase 5 adds FAB |
| No background downloads | Downloads pause when app minimized | Phase 4 gap | Phase 5 adds background fetch |
| Fixed green dot | Hardcoded #34C759 indicator color | Phase 4 | Phase 5 fixes to use accent color |
| No offline mode filtering | All collection visible even offline | Phase 4 gap | Phase 5 adds filtering |
| No WiFi-only setting | All downloads allowed on mobile data | Phase 4 gap | Phase 5 adds setting |

**Deprecated/outdated:**
- None — Phase 4 implementation is current.

---

## Open Questions

1. **How should the FAB handle "Download All Visible"?**
   - What we know: CONTEXT.md specifies "Download All Visible" as one of the FAB options
   - What's unclear: Does "visible" mean current screen's items or all collection items matching current filter?
   - Recommendation: "Visible" = currently rendered items (all items in collection, since collection is paginated). Filter by what's currently visible on screen.

2. **Should background downloads persist across app restarts?**
   - What we know: Background fetch tasks continue after app termination
   - What's unclear: Should we persist a "pending downloads" queue in AsyncStorage?
   - Recommendation: Persist pending downloads in AsyncStorage so interrupted downloads can resume.

3. **How to handle partial album cache (some tracks cached, some not)?**
   - What we know: CONTEXT.md says "Just the dot, no count text" for partial cache
   - What's unclear: Should partial albums still show the dot? Should they be playable?
   - Recommendation: Yes, show dot for partial cache. Playback should use cached tracks + stream uncached. This is already the behavior from Phase 4.

4. **Should the FAB be visible in album detail screen?**
   - What we know: FAB is mentioned for collection, album, artist views
   - What's unclear: What options should the FAB show in album detail specifically?
   - Recommendation: Album detail FAB options: "Download Album" (if not fully cached), "Remove from Cache" (if cached), progress bar if downloading.

5. **Corrupted cache detection and re-caching flow?**
   - What we know: CONTEXT.md says "fall back to streaming, mark cache as invalid, automatic background re-cache"
   - What's unclear: When does re-caching happen — on next play, or immediately?
   - Recommendation: On next play attempt of the corrupted track, attempt stream first, then in background delete the bad cache entry and re-download.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing mobile tests) |
| Config file | mobile/jest.config.js |
| Quick run command | `npm run test:mobile` |
| Full suite command | `npm run test:mobile -- --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFL-01 | Download track to cache | unit | `jest MobileCacheService` | ❌ No test file |
| OFFL-02 | Download album tracks + FAB | unit | `jest MobileCacheService` + component test | ❌ No test file |
| OFFL-03 | Play cached without network | integration | `jest MobilePlayerService` | ✅ MobilePlayerService.test.ts exists |
| OFFL-04 | Show cached indicators | unit/component | `jest CachedIndicator` + visual check | ❌ No test file |
| OFFL-05 | Clear individual/album cache | unit | `jest MobileCacheService` | ❌ No test file |

**Additional tests needed:**
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Offline mode collection filtering | unit | `jest store` | ❌ store/index.test.ts exists, needs update |
| WiFi-only download setting | unit | `jest store` | ❌ store/index.test.ts exists, needs update |
| FAB component | component | `jest CollectionGridItem` | ❌ No test file |
| Album cached dot in grid | component | `jest CollectionGridItem` | ❌ No test file |
| Background download service | unit | `jest BackgroundSyncService` | ✅ BackgroundSyncService.test.ts exists |

### Sampling Rate
- **Per task commit:** `npm run test:mobile -- --testPathPattern="cache|player|Cache|Fab"`
- **Per wave merge:** `npm run test:mobile -- --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `mobile/__tests__/MobileCacheService.test.ts` — covers OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/components/CacheFab.tsx` — NEW component for bulk downloads
- [ ] Update `mobile/components/CachedIndicator.tsx` — use theme accent color instead of hardcoded green
- [ ] Update `mobile/components/CollectionGridItem.tsx` — add album cached dot in bottom-left of artwork
- [ ] Update `mobile/app/(tabs)/collection.tsx` — integrate CacheFab, offline mode filter, cached dot per album
- [ ] Update `mobile/app/(tabs)/artists.tsx` — add cached dot per album row, CacheFab
- [ ] Update `mobile/app/artist/artist_detail.tsx` — add cached dot per album row, CacheFab
- [ ] Update `mobile/app/settings.tsx` — WiFi-only toggle, Download All Collection button
- [ ] Extend `mobile/services/BackgroundSyncService.ts` — add background download task
- [ ] Update `mobile/store/index.ts` — add wifiOnlyDownloads, offlineCollectionFilter state/actions
- [ ] Update `mobile/components/OfflineBanner.tsx` — awareness of standalone vs offline mode
- [ ] Update `mobile/__tests__/store/index.test.ts` — add tests for offline filtering, WiFi-only setting

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

---

## Sources

### Primary (HIGH confidence)
- [expo-file-system SDK 55 Documentation](https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/) - documentDirectory, downloadAsync, File.downloadFileAsync
- [expo-background-fetch Documentation](https://docs.expo.dev/versions/v55.0.0/sdk/background-fetch/) - Background fetch for downloads
- [expo-task-manager Documentation](https://docs.expo.dev/versions/v55.0.0/sdk/task-manager/) - Background task definition
- [expo-network Documentation](https://docs.expo.dev/versions/v55.0.0/sdk/network/) - NetworkStateType for WiFi detection
- [react-native-track-player Offline Playback](https://rntp.dev/docs/4.0/guides/offline-playback) - file:// URL for local playback
- [MobileCacheService.ts](/mobile/services/MobileCacheService.ts) - Current implementation (200 lines)
- [MobilePlayerService.ts](/mobile/services/MobilePlayerService.ts) - Current implementation (339 lines)
- [CachedIndicator.tsx](/mobile/components/CachedIndicator.tsx) - Current implementation (58 lines)
- [CollectionGridItem.tsx](/mobile/components/CollectionGridItem.tsx) - Current implementation (102 lines)

### Secondary (MEDIUM confidence)
- [Phase 4 RESEARCH.md](/.planning/phases/04-caching-music-and-offline-mode-for-mobile-app-based-on-the-desktop-app-solution/04-RESEARCH.md) - Prior phase research
- [Store implementation](/mobile/store/index.ts) - Cache actions and state (lines 292-446)

### Tertiary (LOW confidence)
- [GitHub Issue #2434](https://github.com/doublesymmetry/react-native-track-player/issues/2434) - iOS DocumentDirectoryPath requirement (referenced in Phase 4)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, no new dependencies needed
- Architecture: HIGH - Phase 4 established the patterns; Phase 5 extends them
- Pitfalls: HIGH - Issues identified from codebase analysis and CONTEXT.md specifications
- Integration: MEDIUM - Some uncertainty on FAB interaction with existing UI overlays

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days for stable library versions — Expo SDK 55 is current)
