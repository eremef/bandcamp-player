# Roadmap: Bandcamp Desktop Player

**Version:** 1.0
**Total Phases:** 6

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Offline Listening | Enable offline playback of cached tracks | OFFL-01 - OFFL-05 | 5 |
| 2 | Remote Control | Control playback from mobile device | REMT-01 - REMT-04 | 4 |
| 3 | UI/UX Improvements | Improve user interface and experience | UI-01 - UI-03 | 3 |
| 4 | Mobile Offline Caching | Enable offline playback on mobile app | OFFL-01 - OFFL-05 | 5 |
| 5 | Standalone Offline Mode for Mobile | Refactor and fix offline mode in mobile app | OFFL-01 - OFFL-05 | 5 |
| 6 | Fully Offline Mode | Work fully offline showing only cached content | TBD | TBD |

## Phase Details

### Phase 1: Offline Listening

**Goal:** Enable users to listen to their Bandcamp collection offline by caching tracks locally.

**Requirements:**
- OFFL-01: User can cache individual tracks for offline playback
- OFFL-02: User can cache entire albums for offline playback
- OFFL-03: Cached tracks play without internet connection
- OFFL-04: User can view which tracks are cached
- OFFL-05: User can clear cache for individual tracks or albums

**Success Criteria:**
1. User can select track/album and choose "Cache for offline"
2. Cached content plays when network is disconnected
3. Cache status visible in UI
4. User can manage cache (view/clear)
5. Cache persists across app restarts

---

### Phase 2: Remote Control

**Goal:** Allow users to control their desktop player from a mobile device via web interface.

**Requirements:**
- REMT-01: User can control playback from mobile device
- REMT-02: User can view current queue from remote
- REMT-03: User can add tracks to queue from remote
- REMT-04: Connection status displayed in desktop app

**Success Criteria:**
1. Mobile browser can connect to desktop player
2. Play/pause/seek/skip work from mobile
3. Queue visible and manageable from mobile
4. Connection status shown in desktop app

---

### Phase 3: UI/UX Improvements

**Goal:** Improve the overall user experience with better UI and keyboard shortcuts.

**Requirements:**
- UI-01: Improved playlist management UI
- UI-02: Better visual feedback for buffering/loading states
- UI-03: Keyboard shortcuts for common actions

**Success Criteria:**
1. Playlist management is intuitive
2. Loading states are clear
3. Power users can navigate with keyboard

### Phase 4: Mobile Offline Caching

**Goal:** Enable offline playback on mobile app by caching audio files locally. Based on the desktop solution but adapted for React Native's file system and react-native-track-player.

**Requirements:** OFFL-01 - OFFL-05 (same as Phase 1, applied to mobile)
- OFFL-01: User can cache individual tracks for offline playback
- OFFL-02: User can cache entire albums for offline playback
- OFFL-03: Cached tracks play without internet connection
- OFFL-04: User can view which tracks are cached
- OFFL-05: User can clear cache for individual tracks or albums

**Depends on:** Phase 1 (desktop offline)
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — MobileCacheService + Database schema
- [x] 04-02-PLAN.md — Player integration + Store updates
- [x] 04-03-PLAN.md — UI indicators and cache management

---

---

### Phase 5: Standalone Offline Mode for Mobile

**Goal:** Refactor, clean, verify, and fix offline mode in the mobile app. Standalone mode should allow downloading/caching music in the collection, album, artist view. It should indicate with the accent color dot that the album, track, and artists are cached. When playing music in the standalone mode - it should first check if it's cached and play cached music if so.

**Requirements:** OFFL-01 - OFFL-05 (same as Phase 1, applied to standalone mode for mobile)
- OFFL-01: User can cache individual tracks for offline playback
- OFFL-02: User can cache entire albums for offline playback
- OFFL-03: Cached tracks play without internet connection
- OFFL-04: User can view which tracks are cached
- OFFL-05: User can clear cache for individual tracks or albums

**Success Criteria:**
1. CacheFab visible in standalone mode for bulk downloads
2. Album thumbnails show cached dot when any track is cached
3. Offline mode filters collection to cached-only content
4. Background downloads continue when app is minimized
5. WiFi-only setting restricts downloads to WiFi connections

**Depends on:** Phase 4 (Mobile Offline Caching)
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — CachedIndicator fix, CollectionGridItem dots, CacheFab component
- [x] 05-02-PLAN.md — Screen integration: offline filter + FAB on collection, artists, artist_detail
- [x] 05-03-PLAN.md — Background downloads, WiFi-only setting, corrupted cache, queue clearing

---

### Phase 6: Fully Offline Mode

**Goal:** Offline mode should work fully offline, without any network or internet requests. It should show only cached albums and artists, with cached tracks, and allow to play it.

**Depends on:** Phase 5 (Standalone Offline Mode for Mobile)
**Plans:** 0 plans

---

## Notes

- All v1 requirements mapped to phases
- Phase 1 is foundational for offline use case
- Phase 2 extends existing WebSocket remote protocol
- Phase 3 addresses user feedback on usability
