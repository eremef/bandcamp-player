# Phase 6: Fully Offline Mode - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure offline mode works fully offline without any network requests. The app should show only cached albums/artists with cached tracks, and allow playback. This is Phase 6 - the final polish to ensure truly zero network activity in offline mode.

**Phase depends on:** Phase 5 (Standalone Offline Mode for Mobile)

</domain>

<decisions>
## Implementation Decisions

### Network Request Blocking
- **Scope:** Block ALL network requests in offline mode
- **Mechanism:** Network layer interception at service layer (MobileScraperService)
- **On blocked request:** Return cached/fallback data (local data)
- **When local data unavailable:** Return empty results

### Offline Collection Source
- **Collection source:** MobileDatabase (SQLite) - already stores collection metadata
- **Stale data:** Accept stale data, show whatever's in database
- **Artists:** Both stored - Artist info with albums, artists list derived from albums
- **Artwork:** Cache locally with audio for complete offline experience
- **Stream URLs:** NOT cached - only cached audio files, stream URLs are temporary

### Empty Offline State
- **On no cached content:** Show empty state + message
- **Message:** "Switch to Standalone mode to download music for offline listening"
- **Include button:** "Switch to Standalone" button for one-tap action
- **Consistency:** Same empty state for Collection, Artists, Album views
- **Additional info:** None - keep it minimal

### Sync Strategy
- **Sync timing:** On mode switch to Standalone
- **Sync content:** Collection metadata only (albums, artists, track info - not audio)
- **Offline tracking:** Via MobileDatabase (which tracks have cached audio)
- **Sync status visibility:** No sync status shown - seamless experience

### Mode Behavior Summary
- **Remote Mode:** Controls desktop app, unchanged
- **Standalone Mode:** Independent player, streams from Bandcamp, syncs collection metadata on mode switch
- **Offline Mode:** Zero network requests, reads from local database only, shows cached content only

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MobileDatabase.ts:** SQLite database - already stores collection metadata, extend for offline queries
- **MobileScraperService.ts:** All Bandcamp requests go through here - add offline interception
- **MobileCacheService.ts:** Caching logic - already tracks cached tracks
- **OfflineBanner component:** Already exists - may need offline mode awareness
- **useOfflineMode hook:** Network detection - exists, may need mode extension

### Established Patterns
- Three modes: Remote, Standalone, Offline (from Phase 5)
- Collection stored in SQLite with batch inserts
- Track metadata has `isCached` field
- Background downloads continue when app minimized (Phase 5)
- FAB in bottom-right for download actions (Phase 5)

### Integration Points
- MobileScraperService: Add offline mode guard
- MobileDatabase: Add offline query methods
- Collection screens: Add empty state component
- Settings/Mode UI: Add switch to Standalone button

</code_context>

<specifics>
## Specific Ideas

- "Zero network requests" - truly offline, no analytics, no pings
- "Sync on mode switch" - seamless when switching from Offline to Standalone
- "Empty state with button" - one-tap to start downloading

</specifics>

<deferred>
## Deferred Ideas

- None - discussion stayed within phase scope

</deferred>

---

*Phase: 06-fully-offline-mode*
*Context gathered: 2026-03-20*
