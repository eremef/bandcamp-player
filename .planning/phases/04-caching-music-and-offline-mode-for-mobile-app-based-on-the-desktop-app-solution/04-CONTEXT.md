# Phase 4: Mobile Offline Caching - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable offline playback on the mobile app by caching audio files locally. Based on the desktop's caching solution but implemented independently for mobile's file system and react-native-track-player.

**Out of scope:** Remote mode audio streaming to mobile (mobile just controls desktop player).

</domain>

<decisions>
## Implementation Decisions

### Storage Location
- Store cached audio in **Documents directory** (user-accessible, persistent)
- Organize files **flat with track IDs** (e.g., `audio/abc123.mp3`) - same as desktop
- Keep **original file extension** (mp3, m4a, flac, etc.)
- Track cache metadata by **extending MobileDatabase** (existing tracks table)

### Cache Management
- **Default max size: 2GB** - balanced for mobile storage
- **LRU eviction** when cache is full (oldest/least recently played removed first)
- **User controls**: Both Settings screen (size slider, clear button) AND context menus (per-track/album delete)
- **Auto-cleanup enabled** - background cleanup when approaching limit

### Offline Detection
- Use **NetInfo library** (@react-native-community/netinfo) for network state detection
- When offline: **Show all collection with indicators** (cached vs uncached)
- **Disable play button** on uncached tracks when offline
- **Allow manual offline mode toggle** - user can force offline even when connected
- **Smart skip** - when going offline mid-playback, auto-skip to next cached track
- **UI indicators**: Both banner + status icon when offline

### Track Player Integration
- Pass local files to react-native-track-player using **file:// URLs with content:// fallback**
- **Album vs track specific**: Album caches all tracks, single track caches just that track
- **Progress UI**: Both toast notification + in-list progress bar
- **Queue**: Autoprefer cached version when available
- **Corrupted/missing files**: Background verification, re-download if needed
- **Mobile data**: User preference setting (WiFi only or allow mobile data)
- **Parallel downloads**: Download multiple album tracks simultaneously

### Desktop Sync Strategy
- **Independent caches**: Mobile and desktop maintain separate audio caches
- **Remote mode**: Sync full track details (not audio files) via WebSocket when connected
- **Standalone mode**: Independent cache, no sync with desktop
- **Hybrid approach**: In remote mode, sync "what's cached on desktop" metadata to mobile

</decisions>

<specifics>
## Specific Ideas

- "Flat with track IDs" - similar to desktop implementation
- "LRU eviction" - same policy as desktop
- "Try both file:// and content:// URLs" - handle Android variations
- "Remote mode just controls desktop app, doesn't stream to mobile"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MobileDatabase.ts**: Existing SQLite database - extend with cache tracking columns
- **react-native-track-player**: Already integrated for audio playback - supports local file URLs
- **MobileScraperService.ts**: Has collection caching logic - can inform download logic
- **WebSocketService.ts**: Existing remote connection - extend for cache metadata sync

### Established Patterns
- Collection stored in SQLite with batch inserts
- Track metadata has `isCached` field (currently always false)
- WebSocket for remote mode communication
- Settings stored in MobileDatabase settings table

### Integration Points
- Cache downloads: Add download functions to new MobileCacheService
- Playback: Modify player.ts to check isCached and use local file URL
- UI: Add cache indicators to collection list items
- Settings: Add cache settings to existing settings flow

</code_context>

<deferred>
## Deferred Ideas

- None - discussion stayed within phase scope

</deferred>

---

*Phase: 04-caching-music-and-offline-mode-for-mobile-app-based-on-the-desktop-app-solution*
*Context gathered: 2026-03-12*
