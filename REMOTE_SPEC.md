# Bandcamp Player Remote Protocol Specification

This document specifies the WebSocket protocol used to remote control the Bandcamp Player desktop application. Developers can use this to build native mobile apps or alternative remote interfaces.

## Connection

- **Protocol**: WebSocket (WS)
- **Default Port**: `9999`
- **URL**: `ws://<host-ip>:9999`

> [!NOTE]
> The desktop app also serves a static discovery/remote-control page at `http://<host-ip>:9999`.

---

## Protocol Overview

- All messages are exchanged as JSON.
- Clients should handle reconnection logic (Exponential Backoff recommended).
- There is currently no authentication beyond being on the same local network.

## Message Format

All messages are exchanged as JSON strings.

```json
{
  "type": "string",
  "payload": "any"
}
```

---

## Outbound Messages (Desktop -> Client)

These messages are broadcast to all connected clients when the state changes.

### `state-changed`

Sent whenever the player state changes (play/pause, volume, shuffle, etc.).

- **Payload**: [`PlayerState`](#playerstate)

### `track-changed`

Sent when a new track starts playing.

- **Payload**: [`Track`](#track) | `null`

### `time-update`

Sent periodically (approx. every 1000ms) while a track is playing.

- **Payload**:

  ```json
  { "currentTime": number, "duration": number }
  ```

### `collection-data`

Result of a `get-collection` request.

- **Payload**: [`Collection`](#collection)

### `radio-data`

Result of a `get-radio-stations` request.

- **Payload**: [`RadioStation[]`](#radiostation)

### `playlists-data`

Result of a `get-playlists` request.

- **Payload**: [`Playlist[]`](#playlist)

---

## Inbound Messages (Client -> Desktop)

Clients send these messages to control the player.

### Playback Controls

- `play`: Resumes or starts playback. No payload.
- `pause`: Pauses playback. No payload.
- `next`: Skips to next track. No payload.
- `previous`: Goes to previous track or restarts current. No payload.

### Player Settings

- `seek`: Jumps to a specific time.
  - **Payload**: `number` (seconds)
- `set-volume`: Adjusts playback volume.
  - **Payload**: `number` (0 to 1)
- `toggle-shuffle`: Toggles shuffle mode on/off. No payload.
- `set-repeat`: Sets repeat mode.
  - **Payload**: `'off' | 'one' | 'all'`

### Data Requests

- `get-collection`: Requests the user's collection. Result comes via `collection-data`.
- `get-radio-stations`: Requests available radio stations. Result comes via `radio-data`.
- `get-playlists`: Requests user playlists. Result comes via `playlists-data`.

### Playback Initiation

- `play-album`: Loads and plays an entire album.
  - **Payload**: `string` (Album URL, e.g., from `CollectionItem.album.bandcampUrl` or `item_url`)
- `play-track`: Plays a specific track.
  - **Payload**: [`Track`](#track)
- `play-station`: Starts a radio station.
  - **Payload**: [`RadioStation`](#radiostation)
- `play-playlist`: Plays a playlist.
  - **Payload**: `string` (Playlist ID)

---

## Data Models

### PlayerState

```typescript
{
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'one' | 'all';
  isShuffled: boolean;
  queue: {
    items: QueueItem[];
    currentIndex: number;
    shuffleOrder?: number[]; // Indices for shuffle mode
  }
}
```

### QueueItem

```typescript
{
  id: string;        // Unique ID for this queue entry
  track: Track;
  source: 'collection' | 'playlist' | 'radio' | 'search';
  sourceId?: string; // Optional context ID (e.g. Playlist ID)
}
```

### Collection

```typescript
{
  items: CollectionItem[];
  totalCount: number;
  lastUpdated: string; // ISO Date String
}
```

### CollectionItem

```typescript
{
  id: string;
  type: 'album' | 'track';
  token?: string;      // Bandcamp purchase token
  album?: Album;       // Present if type is 'album'
  track?: Track;       // Present if type is 'track'
  purchaseDate: string;
}
```

### Album

```typescript
{
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  bandcampUrl: string;
  tracks: Track[];
  trackCount: number;
}
```

### Track

```typescript
{
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;    // in seconds
  artworkUrl: string;
  streamUrl: string;
  bandcampUrl: string;
}
```

### RadioStation

```typescript
{
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  streamUrl: string;
}
```

### Playlist

```typescript
{
  id: string;
  name: string;
  tracks: Track[];
  trackCount: number;
  totalDuration: number;
  artworkUrl?: string; // Optional cover art
}
```
