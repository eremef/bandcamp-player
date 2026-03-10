# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Bandcamp (Primary Data Source):**
- Scrape collection pages and APIs
- No official API - uses Cheerio HTML scraping
- Endpoints: `bandcamp.com`, `bandcamp.com/api/design_system/1/menubar` (user info)
- Collection API: `bandcamp.com/api/bcsearch_public_api/1/collection_items`
- Stream URLs: Via mobile API (`bandcamp.com/api/mobile/24/tralbum_details`)
- Auth: Cookie-based session (Electron session API)

**Bandcamp Radio:**
- Radio stations: `bandcamp.com/api/radio/1/episodes`
- Stream URLs: Fetched on-demand from show pages

**Last.fm:**
- Scrobbling service
- API: `ws.audioscrobbler.com/2.0/`
- Auth: OAuth 1.0 via browser popup
- Features: Now Playing updates, scrobbling

## Data Storage

**SQLite (Desktop):**
- Database: `better-sqlite3`
- Location: User data directory (Electron app data)
- Tables: playlists, playlist_tracks, settings, cache_entries, collection_cache, artists, pending_scrobbles

**Cache (Desktop):**
- Location: User data directory `/cache/`
- Format: MP3 files
- Management: LRU eviction based on max size setting

**Mobile Storage:**
- SQLite via Expo (WatermelonDB or expo-sqlite)
- File caching via React Native file system

## Authentication & Identity

**Bandcamp:**
- Implementation: Electron Session API for cookie management
- Auth: Cookie-based (`identity`, `session` cookies)
- User info: Bandcamp menubar API
- Session persistence: Electron session

**Last.fm:**
- Implementation: OAuth 1.0 with API key/secret
- Session key stored in SQLite settings table

## Monitoring & Observability

**Error Tracking:**
- None (no external service)
- Console logging only

**Logs:**
- Console.log with service prefixes
- No external log aggregation

## CI/CD & Deployment

**Hosting:**
- GitHub Releases for auto-updates
- electron-builder creates Windows (NSIS, MSI), Linux (AppImage, deb, rpm), macOS (DMG, ZIP)

**CI Pipeline:**
- Not detected (no .github/workflows)

**Auto-Updates:**
- electron-updater with GitHub provider
- Configured in `package.json`: `publish.provider = "github"`

## Environment Configuration

**Required env vars:**
- None (Bandcamp credentials via browser login, Last.fm via user input)

**Secrets location:**
- No external secrets stored
- Last.fm API key/secret via remote-config.json or settings
- Electron store for encrypted settings

## Webhooks & Callbacks

**Incoming:**
- None (no webhooks)

**Outgoing:**
- Last.fm API calls (scrobbling)
- Bandcamp API/scraping calls
- Chromecast control messages

## Remote Protocol

**WebSocket Server:**
- Port: 9999
- Purpose: Mobile/web remote control

**Outbound Messages:**
- `state-changed` - Player state updates
- `track-changed` - Current track
- `time-update` - Playback position
- `collection-data` - Collection info
- `playlists-data` - Playlist info

**Inbound Commands:**
- `play`, `pause`, `next`, `previous`
- `seek`, `set-volume`
- `toggle-shuffle`, `set-repeat`
- `get-collection`, `play-album`, `play-track`
- `add-track-to-queue`, `remove-from-queue`

## Mobile App

**Framework:** Expo (React Native)
- Audio: expo-av (Track Player)
- Updates: expo-updates
- Navigation: expo-router

**Desktop-to-Mobile Communication:**
- None (separate apps)
- Could share WebSocket remote protocol

---

*Integration audit: 2026-03-10*
