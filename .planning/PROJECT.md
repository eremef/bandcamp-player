# Bandcamp Desktop Player

## What This Is

Electron + React + TypeScript desktop application for Bandcamp music playback with offline caching, Last.fm scrobbling, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Core Value

Users can browse and play their Bandcamp collection offline with a native desktop experience.

## Requirements

### Validated

- ✓ Bandcamp collection browsing — existing
- ✓ Audio playback with queue management — existing
- ✓ Basic player controls (play, pause, next, previous, seek, volume) — existing
- ✓ Search functionality — existing
- ✓ Playlists support — existing
- ✓ Last.fm integration (scrobbling) — existing
- ✓ Auto-updates — existing
- ✓ Desktop window management — existing
- ✓ Mobile companion app (React Native + Expo) — existing

### Active

- [ ] Offline listening (cache tracks for offline playback)
- [ ] Remote control (web/mobile control of desktop player)
- [ ] Improved UI/UX

### Out of Scope

- [Linux support] — Low user demand, high complexity
- [iOS app] — Web companion sufficient
- [Bandcamp API official client] — Doesn't exist, scraping is required

## Context

- **Existing codebase**: Full Electron + React + TypeScript stack
- **Mobile component**: React Native + Expo with Track Player
- **Backend**: SQLite for local data, Cheerio for scraping
- **Tech stack**: Electron, React 18, Zustand, better-sqlite3, Cheerio

## Constraints

- **Tech Stack**: Electron + React + TypeScript — already chosen
- **No Official API**: Must use Cheerio scraping — adds fragility
- **Platform**: Windows primary, macOS secondary, Linux out of scope

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cheerio scraping | No official Bandcamp API | ⚠️ Fragile, may break |
| Electron | Cross-platform desktop | ✓ Working |
| SQLite | Local caching | ✓ Efficient |
| WebSocket remote | Real-time control | ✓ Implemented |

---
*Last updated: 2026-03-10 after assessment*
