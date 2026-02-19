# SPECIFICATION

## 1. Architecture Overview

The Bandcamp Desktop Player is a desktop application built with **Electron**, leveraging a **React** frontend (Renderer process) and a robust **Node.js** backend (Main process).

- **Main Process**: Handles system integration, file operations, database management (SQLite), web scraping (Cheerio), and audio playback control via system media keys.
- **Renderer Process**: Provides the user interface using React. Depending on the route, it renders either the main `Layout` or the dedicated compact `MiniPlayer`.
- **Remote Clients**: A React Native companion app (Android/iOS) and a built-in Web Interface, both connecting via WebSocket to the Main process for remote control and library browsing.
- **IPC Communication**: The two processes communicate securely via a preload script exposing specific APIs (`window.electron`) for actions like player control, database queries, and setting updates.

## 2. Technology Stack

### Core

- **Electron**: Desktop runtime environment.
- **TypeScript**: Static typing for both Main and Renderer processes.
- **Vite**: Build tool and dev server for the Renderer.
- **Jimp**: Image manipulation for asset generation.

### Database & Storage

- **better-sqlite3**: Synchronous, high-performance SQLite driver for local data persistence.
- **electron-store**: Simple data persistence.
- **electron-updater**: Automatic update management via GitHub Releases.

### State Management

- **Zustand**: Lightweight state management for the React frontend.

### Network & Data

- **Axios**: HTTP requests.
- **Cheerio**: HTML parsing for scraping Bandcamp fan data and track streams.
- **chromecast-api**: Discovery and control of Google Cast devices.

### UI

- **React 18**: Component-based UI library.
- **CSS Modules**: Scoped styling.

- **Mobile App**:
  - **Player**: Current playback control (synchronized via WebSocket).
  - **Native Integration**: `react-native-track-player` for background audio and system media controls (Lock Screen, Notification Center).
  - **Collection**: Browse user's collection (Grid view) with real-time search.
  - **Artists**: Browse collection by Artist with detailed views.
  - **Playlists**: Manage and play playlists.
  - **Radio**: Listen to Bandcamp Weekly shows (displaying broadcast dates).
  - **Queue**: View and manage the playback queue with remove and reorder support.
  - **Connection**: Manage connection to Host, view IP, and Disconnect. Persistent background connection tracking allows seamless mode switching.
  - **General**: Swipe-to-refresh on all lists, About screen, License viewer.
  - **UI/UX**: Unified headerless design with standardized floating Search Bars, Safe Area compliance for Android camera bars, persistent Theme Support (System/Light/Dark), and a **Mode Switch Badge** in the player for toggling control.
  - **Persistence**: Playback queue and current track are persisted to storage in Standalone mode and restored on startup.

## 3. Data Models

### Core Entities

#### Track

Represents a single audio track.

```typescript
interface Track {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    album: string;
    albumId?: string;
    duration: number; // in seconds
    trackNumber?: number;
    artworkUrl: string;
    streamUrl: string;
    bandcampUrl: string;
    isCached: boolean;
    cachedPath?: string;
}
```

#### Album

Represents a music album containing multiple tracks.

```typescript
interface Album {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    artworkUrl: string;
    bandcampUrl: string;
    releaseDate?: string;
    tracks: Track[];
    trackCount: number;
}
```

#### Playlist

User-created collection of tracks.

```typescript
interface Playlist {
    id: string;
    name: string;
    description?: string;
    tracks: Track[];
    trackCount: number;
    totalDuration: number; // in seconds
    artworkUrl?: string; // First track's artwork or custom
    createdAt: string;
    updatedAt: string;
}
```

#### QueueItem

Items in the playback queue.

```typescript
interface QueueItem {
    id: string; // Unique queue item ID
    track: Track;
    source: 'collection' | 'playlist' | 'radio' | 'search';
    sourceId?: string; // Playlist ID if from playlist
}
```

#### RadioStation

Curated radio station stream.

```typescript
interface RadioStation {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    streamUrl: string;
    date?: string;
}
```

> Playing a radio station clears the current queue and adds the station as its only item, matching track playback behavior.

#### CastDevice

Represents a Google Cast device.

```typescript
interface CastDevice {
    id: string;
    name: string;
    host: string;
    friendlyName: string;
    type: 'chromecast';
    status: 'connected' | 'disconnected';
}
```

### State Models

#### PlayerState

Current status of audio playback.

- `isPlaying`: boolean
- `currentTrack`: Track | null
- `currentTime`: number
- `duration`: number
- `volume`: number (0-1)
- `isMuted`: boolean
- `repeatMode`: 'off' | 'one' | 'all'
- `isShuffled`: boolean
- `queue`: Queue object
- `isCasting`: boolean
- `castDevice`: CastDevice | undefined
- `error`: string | null

#### AppSettings

Application configuration.

- `cacheEnabled`: boolean
- `cacheMaxSizeGB`: number
- `cacheLocation`: string
- `defaultVolume`: number (Persisted "last used" volume)
- `crossfadeDuration`: number
- `crossfadeDuration`: number
- `startMinimized`: boolean
- `minimizeToTray`: boolean
- `showNotifications`: boolean
- `scrobblingEnabled`: boolean
- `scrobbleThreshold`: number

## 4. Database Schema

The application uses a local SQLite database (`user_data/database.sqlite`) with the following tables:

### `settings`

Key-value store for application configuration.

- `key` (TEXT PK): Setting identifier (e.g., 'app_settings')
- `value` (TEXT): JSON stringified value

### `playlists`

Metadata for user playlists.

- `id` (TEXT PK): UUID
- `name` (TEXT)
- `description` (TEXT)
- `created_at` (TEXT ISO8601)
- `updated_at` (TEXT ISO8601)

### `playlist_tracks`

Join table linking tracks to playlists with ordering.

- `id` (TEXT PK): UUID
- `playlist_id` (TEXT FK): ref `playlists.id`
- `track_data` (TEXT): JSON stringified full Track object (denormalized for offline access)
- `position` (INTEGER): Sort order
- `added_at` (TEXT)

### `collection_cache`

Cached collection data for faster loading.

- `id` (TEXT PK)
- `type` (TEXT): 'album' | 'track'
- `data` (TEXT): JSON stringified data
- `cached_at` (TEXT)

### `audio_cache`

Tracks downloaded for offline playback.

- `track_id` (TEXT PK)
- `file_path` (TEXT): Local filesystem path
- `file_size` (INTEGER): Bytes
- `cached_at` (TEXT)
- `last_accessed_at` (TEXT): LRU eviction support

### `scrobble_queue`

Offline queue for Last.fm scrobbles.

- `id` (INTEGER PK AUTOINCREMENT)
- `artist` (TEXT)
- `track` (TEXT)
- `album` (TEXT)
- `duration` (INTEGER)
- `timestamp` (INTEGER)
- `created_at` (TEXT)

## 5. Key Workflows

### Authentication

The app does not use the official Bandcamp API (which is limited/closed). Instead, it relies on:

1. User provides Bandcamp credentials (via web login flow or cookie extraction).
2. App scraper service fetches user library data.
3. Authenticated session cookies are managed for subsequent requests.

### Offline Caching

1. User requests a download for a track.
2. Main process streams the audio URL to a local file in `AppData`.
3. Metadata is inserted into `audio_cache`.
4. When playing, the `player.service` checks `audio_cache`. If present, it serves the local `file://` URL instead of the remote stream.

### Last.fm Scrobbling

1. **Now Playing**: Sent when a track starts (generic scrobbler threshold applied).
2. **Scrobble**: Sent when track completes or passes 50% completion.
3. **Offline**: If network fails, scrobbles are saved to `scrobble_queue` and retried on next app start or network recovery.

### Queue Completion

1. **End of Queue**: When the last track in the queue finishes playing, or the user skips "Next" on the last track:
   - Playback stops immediately.
   - `currentTrack` becomes `null`.
   - `isPlaying` becomes `false`.
   - The queue index moves to the end (`queue.length`), visually indicating the queue is finished.
   - Remote clients reflect this "No Track" state (`Not Playing`).

### Remote Control (Mobile & Web)

1. **Discovery**: Mobile app scans local network or User inputs IP. Web client is accessed directly via browser at `http://<host-ip>:9999`.
2. **Connection**: Establishes WebSocket connection to Desktop on port `9999` (default). The port can be configured via the `REMOTE_PORT` environment variable.
3. **Sync**: Desktop pushes initial state (Collection, Playlists, Playback Status).
4. **Control**: Mobile sends commands (`play`, `pause`, `set-volume`) which Desktop executes via `player.service`.
5. **Updates**: Desktop broadcasts state changes (`time-update`, `track-changed`).
6. **Native UI**: Mobile app updates its local background service (`TrackPlayer`) to reflect the Desktop state, ensuring System Media Controls (Lock Screen) stay in sync and functional even when the app is backgrounded.
7. **Hybrid Persistence**: The mobile app maintains its WebSocket connection to the Desktop host even while the user is in Standalone mode. This ensures that the Remote state is always up-to-date, allowing users to switch back to Remote seamlessly without waiting for a re-connection.

### Chromecast Integration

1. **Discovery**: Casting is initiated by user action. The `CastService` scans for devices on the local network (MDNS) only while the Cast menu is open to save resources.
2. **Connection**: When a device is selected, the app connects and launches the default media receiver.
3. **Playback**:
    - The `PlayerService` refreshes the track's stream URL using `ScraperService.getTrackStreamUrl` to ensure it's valid (Bandcamp URLs expire).
    - The new URL is sent to the Chromecast device.
    - Local playback stops or mutes, but the player state (`currentTime`, `isPlaying`) remains synced with the cast device.
4. **Error Handling**: Connection drops or playback errors are caught by `CastService`, propagated to `PlayerService`, and displayed to the user via Toasts.

### Standalone Mode Persistence (Mobile)

1. **State Snapshot**: Every time the queue is modified or a track index changes in Standalone mode, the `MobileStore` triggers a `saveQueue()` action.
2. **Storage**: The state (including `items`, `currentIndex`, and `currentTrack` metadata) is serialized to JSON and saved in `AsyncStorage` under the `standalone_queue` key.
3. **Restoration**: On app launch (`autoConnect` workflow):
    - Background connection to the last Remote host is initiated.
    - If `mode` is `standalone`, `restoreStandaloneState` pulls the snapshot from `AsyncStorage`.
    - The `MobilePlayerService.loadTrack` method is called to initialize `TrackPlayer` with the restored track details and stream URL, but in a **paused** state.
    - UI is populated immediately, allowing the user to resume playback instantly without re-searching their collection.

### Collection Search & Loading

1. **Desktop & Web**: For performance and offline capability, the full collection is loaded into memory on the Desktop Renderer and Web Remote.
2. **Mobile App**:
    - **Lazy Loading**: Uses infinite scroll and pagination (offset/limit) to handle thousands of items with minimal memory overhead.
    - **Server-Side Search**: Search queries are sent to the Desktop Main process. The Main process filters its cached collection and returns paginated results to the mobile client.
    - **Optimization**: Search requests use `forceRefresh: false` by default, filtering the existing cache instantly. Only a manual "Pull-to-Refresh" triggers a full re-scrape from Bandcamp.
3. **Database Caching**:
    - **Persistence**: Collections with >100 items are saved to the `collection_cache` SQLite table.
    - **Stale-While-Revalidate**: On app start, the cached collection is returned immediately for near-instant UI availability.
    - **Daily Refresh**: If the cache is older than 24 hours (based on `cached_at`), a background fetch is automatically triggered in the Main process to update the database without interrupting playback or user interaction.
4. **Smart Buffering**:
    - **Initial Load**: Deduplicates concurrent fetch requests in `ScraperService` using a shared promise, preventing "empty" state flashes on startup.
    - **Visual Feedback**: Provides explicit loading states (spinners and overlays) for both initial data fetching and background updates.
5. **Real-Time Indexing**: Search queries for Title and Artist are executed against the local collection array (or filtered server-side for mobile).
6. **Optimized Rendering**: UI uses virtualization (FlatList on Mobile, Grid with optimized React render cycles on Desktop) to handle large lists.

### Desktop Auto-Updates

1. **Checking**: The `UpdaterService` (Main process) uses `electron-updater` to check the GitHub repository for new releases.
2. **Download**: If `autoDownload` is enabled, the update is downloaded in the background. Progress is broadcast via IPC to the Renderer.
3. **Notification**: The Renderer displays update status and progress in the Settings modal.
4. **Installation**: Once downloaded, the user can trigger `quitAndInstall`, which restarts the app and applies the update.
