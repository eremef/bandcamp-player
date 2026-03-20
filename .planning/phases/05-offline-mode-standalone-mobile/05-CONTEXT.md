# Phase 5: Standalone Offline Mode for Mobile - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor, clean, verify, and fix offline mode in the mobile app for standalone (no remote connection) usage. The app has three distinct modes:
- **Remote Mode:** Controls desktop app, unchanged
- **Standalone Mode:** Independent player, fetches/streams from Bandcamp directly
- **Offline Mode:** Plays only cached content

</domain>

<decisions>
## Implementation Decisions

### App Modes
- Three modes: Remote, Standalone, Offline (user manually selects)
- Mode UI already exists in app
- Remote mode unchanged — pure controller for desktop app
- Standalone and Offline share the same cache directory

### Cache Download UI
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

### Cached Indicators
- **Position:** Accent color dot in bottom-left corner of album art thumbnail (same as Desktop app)
- **Artist cached criteria:** Artist has indicator if any album is cached
- **Artist view:** Dot per album row
- **Album detail:** Dot per track row
- **Track indicator:** Small colored dot (consistent with album/artist)
- **Dot size:** Consistent across all views
- **Dot color:** App accent color

### Playback Priority
- **Online preference:** Always prefer cached files over streaming
- **Cache check timing:** At play time
- **Corrupted cache:** Fall back to streaming, mark cache as invalid, automatic background re-cache
- **UI indicator:** No indicator (seamless experience)

### Standalone Mode
- Independent player with own internet connection
- Streams directly from Bandcamp when online
- Uncached tracks stream automatically (no prompt)
- Cached dot appears for cached items (no stream indicator)
- Can download/cache content for offline use

### Offline Mode
- Same UI as Standalone, filtered to cached-only content
- No cached indicators (redundant — all visible is cached)
- Switching from Standalone to Offline with uncached in queue: Clear uncached tracks, keep cached

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MobileCacheService.ts:** Existing caching logic — extend with download queue management
- **MobilePlayerService.ts:** Playback service — already handles cache-first logic
- **CachedIndicator component:** Already exists — reuse for track rows
- **OfflineBanner component:** Already exists in Phase 4 — reuse for mode status
- **useOfflineMode hook:** Already exists — extend for mode detection

### Established Patterns
- Cache stored in Documents directory with 2GB LRU limit
- Track metadata has `isCached` field
- Manual offline toggle available
- Toast notifications for user feedback
- FAB in bottom-right corner for actions

### Integration Points
- Mode selector: Connect to existing mode UI
- Player: Update to check cache at play time, not queue time
- Collection views: Add context menus and cached indicators
- Settings: Add cache management options

</code_context>

<specifics>
## Specific Ideas

- "Dot in bottom-left corner" — Same position as Desktop app
- "Smart skip" — Already implemented in Phase 4, applies to Offline mode queue clearing
- "FAB in bottom-right" — Standard position, accessible with thumb

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-offline-mode-standalone-mobile*
*Context gathered: 2026-03-20*
