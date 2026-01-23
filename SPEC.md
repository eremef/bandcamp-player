## 1. Architecture Overview

The Bandcamp Player is a desktop application built with **Electron**, leveraging a **React** frontend (Renderer process) and a robust **Node.js** backend (Main process). 

- **Main Process**: Handles system integration, file operations, database management (SQLite), web scraping (Cheerio), and audio playback control via system media keys.
- **Renderer Process**: Provides the user interface using React and manages application state with Zustand.
- **IPC Communication**: The two processes communicate securely via a preload script exposing specific APIs (`window.electron`) for actions like player control, database queries, and setting updates.

## 2. Technology Stack

### Core
- **Electron**: Desktop runtime environment.
- **TypeScript**: Static typing for both Main and Renderer processes.
- **Vite**: Build tool and dev server for the Renderer.

### Database & Storage
- **better-sqlite3**: Synchronous, high-performance SQLite driver for local data persistence.
- **electron-store**: Simple data persistence.

### State Management
- **Zustand**: Lightweight state management for the React frontend.

### Network & Data
- **Axios**: HTTP requests.
- **Cheerio**: HTML parsing for scraping Bandcamp fan data and track streams.

### UI
- **React 18**: Component-based UI library.
- **CSS Modules**: Scoped styling.

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

#### AppSettings
Application configuration.
- `cacheEnabled`: boolean
- `cacheMaxSizeGB`: number
- `cacheLocation`: string
- `defaultVolume`: number
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
