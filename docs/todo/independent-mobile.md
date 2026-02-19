# Feasibility Assessment: Mobile App as Independent Bandcamp Player

Short answer: It's a medium-to-large effort, but very doable. The architecture has a clean separation that works in your favor.

## What the Mobile App Does Today

Currently, the mobile app is a pure remote controller — every action (play,pause,next,refreshCollection, etc.) is just a webSocketService.send(...) call that forwards the command to the desktop. The desktop does all the heavy lifting:

- Scraping Bandcamp pages for collection/albums/tracks (ScraperService — 900+ lines of Cheerio-based scraping)
- Authentication via Electron session cookies (AuthService)
- Audio playback via Electron's audio engine
- Caching (downloading MP3s to disk)
- Playlist/queue management (PlayerService)
- Last.fm scrobbling

The mobile's TrackPlayer currently runs at volume 0 — it just mirrors the desktop's metadata for lock screen controls. No real audio playback happens on the phone.

## Key Challenges

Area Difficulty Notes
🔴 Authentication - Hard - Desktop uses Electron's Session to manage Bandcamp cookies. On mobile you'd need a WebView-based login flow to capture cookies, plus secure cookie storage.
🔴 Bandcamp Scraping - Hard - The 900-line ScraperService uses axios + cheerio (Node.js libs). These work in React Native with polyfills, but you'd need to extract/adapt this as a standalone service. Bandcamp has no official API — everything depends on scraping.
🟡 Audio Playback - Medium - react-native-track-player is already set up. You'd just need to set volume to 1 and actually stream audio. Stream URLs from Bandcamp expire though, so you'd need the scraper to refresh them.
🟡 Local Storage/DB - Medium - Desktop uses SQLite for caching collection data, playlists, etc. You'd need a mobile DB (e.g., expo-sqlite or react-native-mmkv) for offline collections and playlists.
🟢 Queue/Player Logic - Easier - The PlayerService logic (queue, shuffle, repeat, etc.) is mostly pure JavaScript. Could be extracted and shared.
🟢 UI Minimal - The mobile UI already has all the views (collection, artists, player, queue, playlists, radio). The screens wouldn't change much.

## Recommended Architecture

The cleanest approach would be a dual-mode store:

┌─────────────────────────────────────────┐
│            Mobile App Store             │
├──────────────┬──────────────────────────┤
│  Remote Mode │   Standalone Mode        │
│  (existing)  │   (new)                  │
│              │                          │
│  WebSocket → │  LocalScraperService →   │
│  Desktop     │  LocalPlayerService →    │
│              │  LocalDB                 │
└──────────────┴──────────────────────────┘
Each store action (e.g.,play(),refreshCollection()) would check the current mode and either send a WebSocket message (remote) or execute locally (standalone).

## Rough Estimate

Phase 1: Mobile auth (WebView login + cookie storage) — ~2-3 days
Phase 2: Port scraper to React Native — ~2-3 days
Phase 3: Local player service + queue logic — ~2 days
Phase 4: Dual-mode store wiring — ~1-2 days
Phase 5: Local persistence (playlists, collection cache) — ~1-2 days
Total: ~8-12 days of focused work.

What You'd Lose in Standalone Mode
Offline caching (no MP3 downloads to phone, at least initially)
Last.fm scrobbling (could be added later with a mobile Last.fm SDK)
Chromecast (desktop-only feature currently)

## My Recommendation

If you'd like to proceed, I'd suggest starting with a detailed implementation plan. The biggest unknown is whether Bandcamp's scraping works reliably from a mobile device (different User-Agent, potential CORS issues if using fetch instead of axios, cookie handling differences). I'd recommend a quick spike to test the scraper in React Native first before committing to the full build.

Would you like me to create an implementation plan, or would you prefer to start with a proof-of-concept spike on the scraper/auth first?
