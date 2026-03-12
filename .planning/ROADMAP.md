# Roadmap: Bandcamp Desktop Player

**Version:** 1.0
**Total Phases:** 3

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Offline Listening | Enable offline playback of cached tracks | OFFL-01 - OFFL-05 | 5 |
| 2 | Remote Control | Control playback from mobile device | REMT-01 - REMT-04 | 4 |
| 3 | UI/UX Improvements | Improve user interface and experience | UI-01 - UI-03 | 3 |

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
- [ ] 04-03-PLAN.md — UI indicators and cache management

---

## Notes

- All v1 requirements mapped to phases
- Phase 1 is foundational for offline use case
- Phase 2 extends existing WebSocket remote protocol
- Phase 3 addresses user feedback on usability
