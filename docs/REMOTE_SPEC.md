# Beta Player Remote Protocol Specification

This document specifies the WebSocket protocol used to remote control the Beta Player desktop application.

**Official Implementation**: The `mobile/` directory contains a helper React Native application that implements this protocol for Android.

## Connection

- **Protocol**: WebSocket (WS)
- **Default Port**: `9999` (Configurable via `REMOTE_PORT` environment variable)
- **URL**: `ws://<host-ip>:<port>`

> [!NOTE]
> The desktop app also serves a fully functional **Web Remote Interface** at `http://<host-ip>:<port>`.
> This web client provides:
>
> - **Playback Controls**: Play, Pause, Previous, Next, Shuffle, Repeat.
> - **Visual Feedback**: Real-time progress bar with seek capability and time display.
> - **Idle State**: Clear indication when no track is playing ("No Track" placeholder, disabled play button).
> - **Volume Control**: Slider with percentage display.
> - **Browsing**: Access to Collection, Playlists, and Radio stations.
> - **Search**: Filter Collection items by title or artist.

---

## Protocol Overview

- All messages are exchanged as JSON.
- Clients should handle reconnection logic (Exponential Backoff recommended).
- There is currently no authentication beyond being on the same local network.

### Hybrid Connectivity (Mobile App)

The mobile companion application implements a **Hybrid Connectivity** model to ensure seamless transition between Remote and Standalone modes:

1. **Persistent Connection**: The mobile app attempts to maintain its WebSocket connection to the desktop server even when it is in **Standalone Mode**.
2. **Background Sync**: While in Standalone mode, the mobile app continues to receive `state-changed` and `time-update` messages from the desktop. This ensures the Remote state is always current when the user switches modes.
3. **Instant Transition**: Because the connection is kept alive, switching from Standalone back to Remote mode happens instantly without requiring a new WebSocket handshake or discovery scan.

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

### `export-playlist-data`

Result of a `get-playlist-for-export` request: one playlist **with** its tracks. Each track
carries a `playlistEntryId` — the id of the playlist entry, distinct from the track id, and
the handle used to remove or reorder that specific entry.

- **Payload**: [`Playlist`](#playlist)

> [!NOTE]
> `playlists-data` is broadcast to **every** connected client whenever the host's playlists
> change, trailing-debounced by ~150 ms. Its playlists have `tracks: []`; treat it as a
> change notification plus a cheap `(id, updatedAt, trackCount)` diff key, and fetch the
> playlists that actually changed with `get-playlist-for-export`.

---

## Inbound Messages (Client -> Desktop)

Clients send these messages to control the player.

### Playback Controls

- `play`: Resumes or starts playback. No payload. (Client should prevent sending if queue is finished/empty).
- `pause`: Pauses playback. No payload.
- `next`: Skips to next track. No payload.
- `previous`: Goes to previous track or restarts current. No payload.

### Player Settings

- `seek`: Jumps to a specific time.
  - **Payload**: `number` (seconds)
- `set-volume`: Adjusts playback volume.
  - **Payload**: `number` (0 to 1)
    > Note: The desktop application maps this linear 0-1 value to a cubic volume curve for natural audio control.
- `toggle-shuffle`: Toggles shuffle mode on/off. No payload.
- `set-repeat`: Sets repeat mode.
  - **Payload**: `'off' | 'one' | 'all'`

### Data Requests

- `get-collection`: Requests the user's collection. Result comes via `collection-data`.
- **Payload**: `{ forceRefresh?: boolean, offset?: number, limit?: number, query?: string, sortKey?: string, sortDirection?: string, filters?: object }` (Optional)
    > [!NOTE]
    > `forceRefresh` defaults to `false`. If `true`, it triggers a fresh scrape from Bandcamp. If `false`, it returns cached data (much faster), filtering by `query` if provided.
    > The host uses the provided `sortKey`, `sortDirection`, and `filters` to return paginated results correctly sorted on the server.
- `get-radio-stations`: Requests available radio stations. Result comes via `radio-data`.
- `get-playlists`: Requests user playlists (tracks stripped). Result comes via `playlists-data`.
- `get-playlist-for-export`: Requests one playlist with its tracks. Result comes via `export-playlist-data`.
  - **Payload**: `string` (playlist id)

> [!NOTE]
> There is no host-side collection sort/filter state, and no message to set one. Sorting and
> filtering are stateless query parameters on each `get-collection`; every client keeps its own
> preference locally.

### Playback Initiation

- `play-album`: Loads and plays an entire album.
  - **Payload**: `string` (Album URL, e.g., from `CollectionItem.album.bandcampUrl` or `item_url`)
- `play-track`: Plays a specific track.
  - **Payload**: [`Track`](#track)
    > Note: If the Track object lacks a `streamUrl` (e.g. from the Collection view), the Desktop app will automatically attempt to resolve it using the `bandcampUrl` or `item_url`.
- `play-station`: Starts a radio station.
  - **Payload**: [`RadioStation`](#radiostation)
    > Note: Playing a station clears the current queue and adds the station as the only item.
- `play-playlist`: Plays a playlist.
  - **Payload**: `string` (Playlist ID)

### Queue Management

- `play-queue-index`: Plays a specific track in the queue by index.
  - **Payload**: `number` (0-based queue index)
- `remove-from-queue`: Removes a track from the queue.
  - **Payload**: `string` (QueueItem ID)
- `add-track-to-queue`: Adds a single track to the queue.
  - **Payload**: `{ track: Track, playNext?: boolean }`
- `add-album-to-queue`: Adds all tracks from an album to the queue.
  - **Payload**: `{ albumUrl: string, tracks?: Track[], playNext?: boolean }`
- `add-station-to-queue`: Adds a radio station to the queue.
  - **Payload**: `{ station: RadioStation, playNext?: boolean }`

### Playlist Management

The desktop is authoritative for playlists, and **its ids are the shared identity**. Every id
field below is optional: omit it and the host mints one. The mobile app supplies them so that
an edit made while the desktop was unreachable can be replayed later and end up as the same
playlist on both devices (see the Playlist Sync section in `CLAUDE.md`).

Replaying is safe: inserts are idempotent, so re-sending an op that already landed is a no-op
rather than an error.

- `create-playlist`: Creates a playlist.
  - **Payload**: `{ name: string, description?: string, id?: string }`
- `update-playlist`: Renames a playlist (fields left `undefined` are not written).
  - **Payload**: `{ id: string, name?: string, description?: string }`
- `delete-playlist`: Deletes a playlist and its entries.
  - **Payload**: `string` (playlist id)
- `import-playlist`: Creates a playlist from an exported file. Ids in the payload are
  **ignored** — an import is always a copy.
  - **Payload**: `{ name: string, description?: string, tracks: Track[] }`
- `add-track-to-playlist`: Appends one track, or a batch.
  - **Payload**: `{ playlistId: string, track: Track, entryId?: string }`
  - **Bulk payload**: `{ playlistId: string, tracks: [{ track: Track, entryId?: string }] }`
    > [!NOTE]
    > Prefer the bulk form for anything album-sized: it is one frame and one broadcast instead
    > of N, it makes the add atomic, and — because its tracks are already resolved — the host
    > never has to scrape while applying it.
- `add-album-to-playlist`: Appends every track of an album (the host scrapes it).
  - **Payload**: `{ playlistId: string, albumUrl: string }`
- `remove-track-from-playlist`: Removes exactly one entry.
  - **Payload**: `{ playlistId: string, trackId: string }` — `trackId` is the
    `playlistEntryId`, so duplicated tracks can be removed individually.
- `reorder-playlist-tracks`: Reorders entries, by index pair or by absolute order.
  - **Payload**: `{ playlistId: string, from: number, to: number }`
  - **Absolute payload**: `{ playlistId: string, orderedEntryIds: string[] }`
    > [!NOTE]
    > Prefer `orderedEntryIds` whenever the order was decided against a possibly-stale view:
    > index pairs mean nothing if the playlist changed in between. Entries the host holds but
    > the list omits keep their relative order and are appended after the named ones, so a
    > stale list can never truncate a playlist.

> [!IMPORTANT]
> Playlist messages are processed strictly in the order they were sent, per connection.
> Other message types are not — they are handled concurrently so that a transport command
> such as `pause` never queues behind a slow scrape.

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
  };
  isCasting: boolean;
  castDevice?: { name: string; id: string }; // Simplified CastDevice
  error?: string | null;
  collectionSortKey: string;
  collectionSortDirection: 'asc' | 'desc';
  collectionFilters: { albums: boolean; tracks: boolean; wishlist: boolean };
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
  offset?: number;
  limit?: number;
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
  date?: string;
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
