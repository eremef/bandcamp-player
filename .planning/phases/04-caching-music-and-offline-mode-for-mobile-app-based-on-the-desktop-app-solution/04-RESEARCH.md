# Phase 4: Mobile Offline Caching - Research

**Researched:** 2026-03-12
**Domain:** React Native (Expo) + react-native-track-player + expo-file-system
**Confidence:** HIGH

## Summary

This phase implements offline audio caching for the mobile app, mirroring the desktop solution but adapted for React Native's file system and react-native-track-player. Key components: expo-file-system for downloads, SQLite (existing) for cache metadata, @react-native-community/netinfo for offline detection, and react-native-track-player for local file playback.

**Primary recommendation:** Create MobileCacheService that mirrors desktop CacheService architecture, extend MobileDatabase with audio_cache table, integrate NetInfo for offline detection, and modify player.ts to prefer cached file:// URLs over streamUrl.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store cached audio in **Documents directory** (user-accessible, persistent)
- Organize files **flat with track IDs** (e.g., `audio/abc123.mp3`)
- Keep **original file extension** (mp3, m4a, flac, etc.)
- Track cache metadata by **extending MobileDatabase** (existing tracks table)
- **Default max size: 2GB** - balanced for mobile storage
- **LRU eviction** when cache is full
- Use **NetInfo library** (@react-native-community/netinfo) for network state detection
- Pass local files to react-native-track-player using **file:// URLs with content:// fallback**
- **Independent caches**: Mobile and desktop maintain separate audio caches
- **Remote mode**: Sync full track details (not audio files) via WebSocket when connected

### Claude's Discretion
- Progress UI: Both toast notification + in-list progress bar
- User controls: Settings screen (size slider, clear button) AND context menus (per-track/album delete)
- Parallel downloads: Download multiple album tracks simultaneously
- Background verification for corrupted/missing files

### Deferred Ideas (OUT OF SCOPE)
- Remote mode audio streaming to mobile (mobile just controls desktop player)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFL-01 | User can cache individual tracks for offline playback | MobileCacheService.downloadTrack() using expo-file-system |
| OFFL-02 | User can cache entire albums for offline playback | MobileCacheService.downloadAlbum() with parallel downloads |
| OFFL-03 | Cached tracks play without internet connection | player.ts uses file:// URL when track.isCached is true |
| OFFL-04 | User can view which tracks are cached | UI indicators via cachedTrackIds in store |
| OFFL-05 | User can clear cache for individual tracks or albums | MobileCacheService.deleteTrack(), deleteAlbum(), clearCache() |

**Note:** OFFL-01 through OFFL-05 were completed for desktop in Phase 1. This phase re-implements them for mobile.
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-file-system | latest (SDK 53) | Download and store audio files | Official Expo library, provides documentDirectory access |
| @react-native-community/netinfo | ^12.x | Network connectivity detection | React Native Community standard |
| react-native-track-player | ^4.x | Audio playback with local file support | Already integrated in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-sqlite | latest | Local database for cache metadata | Already in use for MobileDatabase |
| lru-cache | ^7.x | LRU eviction logic | Mobile implements same algorithm as desktop |

### Already Available
- **MobileDatabase.ts**: Existing SQLite database — extend with audio_cache table
- **player.ts**: Existing track player — modify to check isCached and use local URL

**Installation:**
```bash
cd mobile && npx expo install expo-file-system @react-native-community/netinfo
```

---

## Architecture Patterns

### Recommended Project Structure
```
mobile/
├── services/
│   ├── MobileCacheService.ts    # NEW - Cache download/delete/eviction
│   └── player.ts                 # MODIFY - Use cached URLs
├── store/
│   └── index.ts                  # MODIFY - Add cache state (cachedTrackIds, downloadingTracks)
└── app/(tabs)/
    └── settings.tsx              # MODIFY - Cache size control, clear cache
```

### Pattern 1: MobileCacheService
**What:** Service for downloading, storing, and managing cached audio files
**When to use:** For all cache operations in standalone mode
**Example:**
```typescript
// Source: Based on desktop CacheService pattern + expo-file-system docs
import * as FileSystem from 'expo-file-system';
import { mobileDatabase } from './MobileDatabase';

const AUDIO_DIR = `${FileSystem.documentDirectory}audio/`;

interface CacheEntry {
    trackId: string;
    albumId?: string;
    filePath: string;
    fileSize: number;
    cachedAt: string;
    lastAccessedAt: string;
}

export class MobileCacheService {
    private maxSizeBytes: number;
    private activeDownloads: Map<string, AbortController> = new Map();

    async downloadTrack(track: Track): Promise<void> {
        // Ensure directory exists
        const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
        }

        // Get file extension from URL or default to mp3
        const ext = this.getExtension(track.streamUrl);
        const filePath = `${AUDIO_DIR}${track.id}.${ext}`;

        // Download with progress
        const downloadResumable = FileSystem.createDownloadResumable(
            track.streamUrl,
            filePath,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                this.emit('download-progress', { trackId: track.id, progress });
            }
        );

        const result = await downloadResumable.downloadAsync();
        if (!result?.uri) throw new Error('Download failed');

        // Save to database
        const stats = await FileSystem.getInfoAsync(result.uri);
        await this.saveCacheEntry({
            trackId: track.id,
            albumId: track.albumId,
            filePath: result.uri,
            fileSize: stats.size || 0,
            cachedAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString()
        });
    }

    async ensureCacheSpace(trackSize: number): Promise<void> {
        const currentSize = await this.getCacheTotalSize();
        while (currentSize + trackSize > this.maxSizeBytes) {
            const oldest = await this.getOldestCacheEntries(1);
            if (oldest.length === 0) break;
            await this.deleteTrack(oldest[0].trackId);
        }
    }
}
```

### Pattern 2: Offline Detection with NetInfo
**What:** Monitor network state and adapt playback behavior
**When to use:** On app launch, before playback, and for UI indicators
**Example:**
```typescript
// Source: @react-native-community/netinfo documentation
import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect } from 'react';

function useOfflineMode() {
    const netInfo = useNetInfo();
    const isOffline = netInfo.isConnected === false;

    useEffect(() => {
        if (isOffline) {
            // Handle transition to offline - could skip to cached track
            console.log('Device went offline');
        }
    }, [isOffline]);

    return { isOffline, connectionType: netInfo.type };
}

// In component:
const { isOffline } = useOfflineMode();
// Show offline banner when isOffline is true
// Disable play button on uncached tracks when isOffline && !isCached
```

### Pattern 3: Local File Playback
**What:** Play local cached files with react-native-track-player
**When to use:** When track.isCached is true
**Example:**
```typescript
// Source: react-native-track-player docs + iOS-specific findings
import TrackPlayer from 'react-native-track-player';

async function playTrack(track: Track) {
    let url = track.streamUrl;

    // Prefer cached file if available
    if (track.isCached && track.cachedPath) {
        // Try file:// first, fallback to content:// for Android
        if (await fileExists(track.cachedPath)) {
            url = Platform.OS === 'ios' 
                ? `file://${track.cachedPath}` 
                : `content://${track.cachedPath}`;
        }
    }

    await TrackPlayer.add({
        id: track.id,
        url: url,
        title: track.title,
        artist: track.artist,
        artwork: track.artworkUrl,
        duration: track.duration,
    });
}
```

### Anti-Patterns to Avoid
- **CachesDirectoryPath**: iOS requires DocumentDirectoryPath for playability. Don't use cacheDirectory — files may be evicted by OS.
- **Missing file:// prefix**: On both platforms, local files need `file://` prefix for react-native-track-player.
- **Blocking UI during download**: Use progress callbacks and update UI asynchronously.
- **No extension preservation**: Bandcamp serves MP3, FLAC, M4A — keep original extension for compatibility.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Network detection | Custom fetch with timeout | @react-native-community/netinfo | Handles all edge cases ( airplane mode, VPN, captive portals) |
| File downloads | Raw fetch + write | expo-file-system createDownloadResumable | Handles large files, progress, resume on interruption |
| LRU eviction logic | Custom Map with timestamps | Use database ORDER BY lastAccessedAt | Already in MobileDatabase, queryable |
| Background playback | Manage audio session manually | react-native-track-player | Already handles lock screen, Bluetooth controls |

---

## Common Pitfalls

### Pitfall 1: iOS Local File Not Playable
**What goes wrong:** Local MP3 in cacheDirectory doesn't play — `ios_track_unplayable` error.
**Why it happens:** iOS requires files in DocumentDirectoryPath, not CachesDirectory.
**How to avoid:** Always use `FileSystem.documentDirectory` for cached audio, not cacheDirectory.
**Warning signs:** Works on Android, fails on iOS with track_unplayable error.

### Pitfall 2: Missing file:// Prefix
**What goes wrong:** File exists but player shows "buffering" indefinitely.
**Why it happens:** react-native-track-player needs `file://` prefix for local files.
**How to avoid:** Add prefix: `url: \`file://${cachedPath}\`` on both platforms.
**Warning signs:** Remote URLs work, local files don't — check URL format.

### Pitfall 3: Cache Size Exceeds Mobile Storage
**What goes wrong:** Download fails at 90%, database says cached but file missing.
**Why it happens:** User device storage full, download partial, no cleanup.
**How to avoid:** Check available storage before download, implement robust cleanup. Use `FileSystem.getFreeDiskStorageAsync()`.
**Warning signs:** ENOENT errors on file read, "database locked" errors.

### Pitfall 4: Offline Mid-Playback Skip
**What goes wrong:** Streaming track plays, device goes offline, playback stops with error.
**Why it happens:** No automatic handling of network transition during playback.
**How to avoid:** Subscribe to NetInfo changes, auto-skip to next cached track when going offline.
**Warning signs:** Queue has mixed cached/uncached, user on mobile data.

### Pitfall 5: File Extension Mismatch
**What goes wrong:** Cached file won't play, Bandcamp returns different format than expected.
**Why it happens:** Bandcamp serves M4A/FLAC but code assumes .mp3 extension.
**How to avoid:** Extract actual extension from Content-Type header or URL, preserve in filename.
**Warning signs:** File exists, size > 0, but player can't decode.

---

## Code Examples

### Cache Download with Progress
```typescript
// Source: expo-file-system documentation
import * as FileSystem from 'expo-file-system';

async function downloadWithProgress(
    url: string, 
    destination: string, 
    onProgress: (p: number) => void
): Promise<string> {
    const downloadResumable = FileSystem.createDownloadResumable(
        url,
        destination,
        {},
        (progress) => {
            const percent = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            onProgress(percent);
        }
    );
    
    const result = await downloadResumable.downloadAsync();
    return result?.uri || destination;
}
```

### LRU Eviction Query
```typescript
// Source: MobileDatabase pattern + desktop CacheService
async function evictLRU(requiredBytes: number): Promise<void> {
    const entries = await this.db.getAllAsync<CacheEntry>(
        'SELECT * FROM audio_cache ORDER BY lastAccessedAt ASC'
    );
    
    let freedBytes = 0;
    for (const entry of entries) {
        if (freedBytes >= requiredBytes) break;
        
        await FileSystem.deleteAsync(entry.filePath, { idempotent: true });
        await this.db.runAsync('DELETE FROM audio_cache WHERE trackId = ?', [entry.trackId]);
        freedBytes += entry.fileSize;
    }
}
```

### Network State Subscription
```typescript
// Source: @react-native-community/netinfo docs
import NetInfo from '@react-native-community/netinfo';

useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
        const isOffline = !state.isConnected;
        if (isOffline) {
            // Show offline indicator
            dispatch(setOfflineMode(true));
        } else {
            dispatch(setOfflineMode(false));
        }
    });
    
    return () => unsubscribe();
}, []);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stream from Bandcamp URL | Download to local file + file:// playback | Phase 4 | Enables offline playback |
| No cache metadata | SQLite audio_cache table | Phase 4 | Enables isCached detection, LRU eviction |
| No offline detection | NetInfo subscription | Phase 4 | Enables offline UI indicators |
| CommonJS require | ESM imports | Project baseline | Required for Expo/React Native |

**Deprecated/outdated:**
- expo-file-system old API (pre-SDK 54): Use new `File` and `Directory` classes from `expo-file-system/next`

---

## Open Questions

1. **How to get actual file extension from Bandcamp stream?**
   - What we know: Bandcamp returns various formats (MP3, M4A, FLAC) based on purchase
   - What's unclear: How to determine format before download (Content-Type header only available after)
   - Recommendation: Use `requestAsync` to get headers first, then download with correct extension

2. **Should mobile share cache with desktop via filesystem?**
   - What we know: CONTEXT.md specifies independent caches
   - What's unclear: Performance impact of separate 2GB caches
   - Recommendation: Keep independent per CONTEXT.md — sync metadata only via WebSocket

3. **How to handle corrupted cached files?**
   - What we know: Desktop has background verification concept
   - What's unclear: Implementation approach for mobile
   - Recommendation: On track load failure, delete entry and re-download on next user action

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
| OFFL-01 | Download track to cache | unit | `jest MobileCacheService.test.ts` | ❌ New file needed |
| OFFL-02 | Download album tracks | unit | `jest MobileCacheService.test.ts` | ❌ New file needed |
| OFFL-03 | Play cached without network | integration | `jest player.test.ts` | ✅ player.test.ts exists |
| OFFL-04 | Show cached indicators | unit | `jest store.test.ts` | ✅ store/index.test.ts exists |
| OFFL-05 | Clear individual/album cache | unit | `jest MobileCacheService.test.ts` | ❌ New file needed |

### Sampling Rate
- **Per task commit:** `npm run test:mobile -- --testPathPattern="cache|player"`
- **Per wave merge:** `npm run test:mobile -- --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `mobile/__tests__/MobileCacheService.test.ts` — covers OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/services/MobileCacheService.ts` — main cache service
- [ ] Add audio_cache table migration to MobileDatabase.ts
- [ ] Update player.ts to check isCached and use local URL

---

## Sources

### Primary (HIGH confidence)
- [react-native-track-player Offline Playback Guide](https://rntp.dev/docs/4.0/guides/offline-playback) - Local file playback with file:// URLs
- [expo-file-system SDK 53 Documentation](https://docs.expo.dev/versions/v53.0.0/sdk/filesystem/) - documentDirectory, downloadAsync, createDownloadResumable
- [GitHub Issue #2434](https://github.com/doublesymmetry/react-native-track-player/issues/2434) - iOS DocumentDirectoryPath requirement confirmed
- [GitHub Issue #947](https://github.com/doublesymmetry/react-native-track-player/issues/947) - iOS file:// prefix requirement confirmed
- [@react-native-community/netinfo Documentation](https://github.com/react-native-netinfo/react-native-netinfo) - useNetInfo hook, isConnected property

### Secondary (MEDIUM confidence)
- [Stack Overflow: expo-file-system download](https://stackoverflow.com/questions/75162229/how-do-i-download-the-video-audio-files-in-my-expo-app) - Working download pattern
- [Magecomp: Detect Offline/Online States](https://magecomp.com/blog/detect-offline-online-states-react-native/) - NetInfo usage pattern

### Tertiary (LOW confidence)
- [Medium: Downloading Files in Expo](https://medium.com/@fabi.mofar/downloading-and-saving-files-in-react-native-expo-5b3499adda84) - General pattern, needs verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - expo-file-system, netinfo, track-player are well-documented and standard
- Architecture: HIGH - Follows desktop CacheService pattern with mobile-specific adaptations
- Pitfalls: HIGH - Issues documented in GitHub issues, verified with official docs
- Integration: MEDIUM - Some uncertainty on Android content:// fallback and file extension extraction

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (30 days for stable library versions)
