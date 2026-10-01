# Beta Player Remote Protocol Specification

This document specifies the WebSocket protocol used to remote control the Beta Player desktop application.

**Official Implementation**: The `mobile/` directory contains the React Native companion app. Safe LAN connections are the default for both the mobile app and web remote.

## Connection

- **Default protocol**: Secure WebSocket (WSS) over HTTPS
- **Default Port**: `9999` (Configurable via `REMOTE_PORT` environment variable)
- **Safe URL**: `https://<private-lan-ip>:<port>` for the web client and `wss://<private-lan-ip>:<port>` for native clients
- **Unsafe legacy URL**: `http://<private-lan-ip>:<port>` and `ws://<private-lan-ip>:<port>`

> [!NOTE]
> The desktop app also serves a fully functional **Web Remote Interface** at `https://<host-ip>:<port>` in Safe mode.
> This web client provides:
>
> - **Playback Controls**: Play, Pause, Previous, Next, Shuffle, Repeat.
> - **Visual Feedback**: Real-time progress bar with seek capability and time display.
> - **Idle State**: Clear indication when no track is playing ("No Track" placeholder, disabled play button).
> - **Volume Control**: Slider with percentage display.
> - **Browsing**: Access to Collection, Playlists, and Radio stations.
> - **Search**: Filter Collection items by title or artist.

---

## Safe LAN pairing

Safe mode is enabled by default on desktop and mobile. It works on the local network and does not use a relay or account service. Desktop Settings offers three IPv4 listener choices:

- **Recommended interface** uses the local address selected by the operating system's default route.
- **Specific interface** binds only to the selected adapter and resolves that adapter's current private IPv4 address whenever the service starts. If the adapter is missing, the service reports an error instead of switching to another adapter.
- **All IPv4 interfaces** binds to `0.0.0.0`. Settings lists the available private IPv4 addresses and lets the user choose which address appears in the connection URL and pairing QR code. The QR ticket still contains one host address.

All modes accept only supported private IPv4 client sources and local host addresses. These choices control the listener and advertised address; they do not guarantee reachability through the operating-system firewall, VPN, router, or Wi-Fi client isolation. IPv6 addresses are not currently supported by the remote pairing flow.

The desktop creates a local certificate authority and stores its private key encrypted with Electron's OS-backed secure storage. It signs the HTTPS/WSS server certificate for the current LAN addresses. If the OS does not provide encrypted key storage, Safe mode fails closed and reports the reason; the user can explicitly select Unsafe mode instead.

Pair from the mobile app by scanning the `beta-app://pair` QR code with the phone camera. The link opens the app and carries the LAN address, a short-lived single-use pairing code, and the authority fingerprint. The mobile app pins that fingerprint in its native WebSocket transport, so Android and iOS do not need a user-installed certificate. The desktop displays the requesting device and requires approval before issuing credentials.

Manual pairing is available from the mobile connection screen. Enter the desktop address, the one-time code, and the full SHA-256 certificate fingerprint shown in desktop Settings. The code expires after two minutes and is consumed by the first valid request. A permanent per-device grant is created only after desktop approval. The mobile app stores the bearer token in OS secure storage; the desktop stores only its SHA-256 hash. Browser grants use a Secure, HttpOnly, SameSite=Strict cookie.

The web remote uses normal browser TLS verification. Export the local CA certificate from desktop Settings and install it in the operating system trust store before opening the HTTPS remote. Never bypass a browser certificate warning. Pairing then uses the one-time code and the same desktop approval step.

Paired grants remain valid until revoked in desktop Settings. Revocation deletes the server-side grant and closes every active socket for that device, so its saved token can no longer reconnect. “Permanent” means persistent until revoked; no connection can be guaranteed impossible to compromise on a device whose operating system, app, or credentials are already compromised.

Unsafe mode is an explicit compatibility option on both desktop and mobile. It preserves the previous plain HTTP/WS connection without pairing. Both sides must be set to Unsafe; there is no automatic downgrade. Treat it as unauthenticated and unencrypted LAN traffic.

## Protocol Overview

- All messages are exchanged as JSON.
- Clients should handle reconnection logic (Exponential Backoff recommended).
- In Safe mode, a WebSocket receives no player state or command access until it authenticates with a paired device grant or completes a one-time pairing request that is approved on the desktop.
- In Unsafe mode, the legacy unauthenticated message flow is used.

### Hybrid Connectivity (Mobile App)

The mobile companion application implements a **Hybrid Connectivity** model to ensure seamless transition between Remote and Standalone modes:

1. **Persistent Connection**: The mobile app attempts to maintain its authenticated WebSocket connection to the desktop server even when it is in **Standalone Mode**.
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

### Safe-mode authentication messages

Safe-mode connections exchange these messages before normal player messages are allowed:

- `authentication-required` (desktop → client): no valid browser session cookie was presented.
- `authenticate` (client → desktop): `{ deviceId: string, token: string }` for an existing pairing.
- `pair` (client → desktop): `{ code: string, deviceInfo: { platform, appVersion, device } }` for a first-time pairing.
- `pairing-pending` (desktop → client): the request is waiting for desktop approval.
- `paired` (desktop → client): `{ deviceId, token, caFingerprint }`; mobile saves the grant in OS secure storage, while the browser exchanges it for an HttpOnly cookie.
- `authenticated` (desktop → client): the persistent grant has been accepted. Initial state is sent only after this point.
- `pairing-failed`, `pairing-rejected`, and `authentication-failed` (desktop → client): pairing or authentication did not complete.

The pairing invitation is single-use, expires after two minutes, and is cleared when consumed or when the remote server stops. The desktop approval is required even if a valid invitation was copied by someone else on the LAN. Safe mode rejects cross-origin browser WebSocket requests and limits inbound WebSocket messages to 1 MiB. Pairing tokens are random bearer credentials; keep the paired phone/browser account protected and revoke a lost device from desktop Settings.

Unsafe mode continues to use the legacy protocol below and does not exchange any authentication messages.

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

### `playlist-sync-mode`

Result of a `get-playlist-sync-mode` request: the desktop's playlist sync mode.

- **Payload**: `'two-way' | 'desktop-to-mobile' | 'mobile-to-desktop' | 'disabled'`

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
- `get-playlist-sync-mode`: Requests the desktop's playlist sync mode. Result comes via `playlist-sync-mode`.

> [!IMPORTANT]
> The sync mode is set on the desktop and is authoritative. In `desktop-to-mobile` and
> `disabled` the host **silently drops** every playlist-mutating message from a client that
> has sent `identify` (i.e. the mobile app); reads are never blocked. Clients that never
> `identify` — the built-in web remote — are unaffected. There is no push notification when
> the mode changes: re-request it whenever it matters.

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
