# Mobile Playback with Nitro Player

This guide describes the intended native playback boundary for Beta Player’s Expo client. Zustand remains the source of truth for the app queue, playback intent, cache state, and remote connection. Nitro Player supplies native audio playback, playlists, notifications, and media-session controls.

## Native installation and builds

The app uses Expo SDK 58 and React Native 0.88.1, above Nitro Player’s documented React Native 0.76 minimum. Install the package and its Nitro runtime in `mobile/`:

```sh
npx expo install react-native-nitro-player react-native-nitro-modules
```

Nitro Player includes native code, so use Beta Player’s Expo development client or a production native build; Expo Go alone cannot load it. Rebuild after installing or changing native dependencies. The [Nitro installation guide](https://nitroplayer.riteshshukla.in/docs/installation) documents iOS CocoaPods installation and Android autolinking. Background playback also needs Android `INTERNET`, `FOREGROUND_SERVICE`, and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions. Keep the iOS `audio` background mode enabled in app configuration and verify it survives prebuild. Beta Player’s version-specific patch also stops Android playback when the task is removed, matching RNTP’s `taskRemovedBehavior: 'stop'`.

`mobile/patches/react-native-nitro-player+1.9.0.patch` uses the existing `patch-package` workflow to add iOS audio mixing with other apps, forward iOS Stop commands, keep interval-skip commands enabled alongside track commands, intercept Android Play/Pause/Next/Previous and Stop actions for the app-level adapter, and stop Android playback when the task is removed. The patch is version-specific; recheck it when Nitro Player changes and rebuild native targets after it is applied.

## Map the app queue to a native playlist

Keep the persisted Zustand queue authoritative. Mirror its current contents into one adapter-owned Nitro playlist; do not use Nitro’s playlist store as the app’s user-library database.

Map each app queue item to a Nitro `TrackItem`:

| Beta Player value | Nitro value |
| --- | --- |
| Queue-item ID | `id` (preserves duplicate tracks as separate queue entries) |
| Bandcamp track ID and queue-item ID | `extraPayload` |
| Track title, artist, album, duration, artwork | Corresponding `TrackItem` metadata |
| Resolved stream or cached file URI | `url` |

Keep native-only previous/next sentinel items at the beginning and end of the mirror. They keep Nitro’s media buttons enabled at queue boundaries and let Beta Player forward the command to its own queue logic. Never persist sentinels in Zustand or show them in the app queue. Real queue items carry their app queue index in `extraPayload` so Nitro’s native index can be translated back.

Use `PlayerQueue` to create a staging native playlist, then load it at the intended native index before deleting the old player playlist or applying play, pause, or seek. Serialize playlist mutations and use a generation/current-item check after each awaited call; a stale URL resolve must not replace a newer selection. If staging fails, the adapter retains the old queue and resumes prior playback intent. Nitro’s player reads and playlist operations are asynchronous, unlike RNTP’s single `setMediaItems(queue, index)` call. The app should reconcile from Nitro snapshots and callbacks without treating the native queue as more authoritative than Zustand.

Map repeat modes as `off` → `off`, `one` → `track`, and `all` → `Playlist`. The installed Nitro Player 1.9.0 Android and iOS implementations clamp volume to 0–100 and divide by 100 internally, so convert Beta Player's 0–1 volume to Nitro's 0–100 range. The hosted [TrackPlayer API](https://nitroplayer.riteshshukla.in/docs/api/track-player) currently documents 0.0–1.0 and conflicts with both the 1.9.0 native implementation and GitHub README; treat that hosted volume signature as stale for this package version.

## Resolve Bandcamp URLs lazily

Nitro’s [`TrackItem`](https://nitroplayer.riteshshukla.in/docs/types) allows an empty URL. Set `lookaheadCount` and register `TrackPlayer.onTracksNeedUpdate` once at startup. Resolve the returned Bandcamp tracks with the existing scraper, cache, and offline-mode rules, then apply their URLs through `TrackPlayer.updateTracks`.

Keep URL resolution and policy in the mobile service, not the native adapter. Associate each resolution with the queue-item ID and load generation so duplicate tracks or late network results cannot update the wrong queue entry. Preserve the existing retry limit and skip/error behavior. Nitro documents a restriction on replacing an already-loaded current-track URL; iOS may accept a replacement after item failure, but Android behavior needs explicit validation. Do not assume the current expired-URL retry is preserved until it has been tested on both platforms.

## Route playback callbacks

Register Nitro callbacks once in the app entry layer and normalize them through one adapter. The documented callbacks include track changes (with reasons such as `skip`, `end`, and `error`), playback-state changes, seek, and periodic progress. Use those to update the app queue index, Zustand playback state, resume/scrobble progress, and end-of-track handling.

On Android, Nitro 1.9.0 reports Next/Previous track changes with the reason `user_action`, and a track skip can also produce an `onSeek` callback. The package patch intercepts Android Play/Pause/Next/Previous before ExoPlayer changes the proxy queue and sends them through Nitro's notification-button callback; the adapter converts those callbacks into explicit app commands. Other state and seek changes are normalized by the adapter, with app-issued callbacks suppressed to avoid loops and duplicate Zustand/WebSocket actions. The notification callback and iOS patch also route Stop.

## Remote mode: behavior to prove

When Beta Player is connected to desktop playback, the handset is muted and its media controls must send play, pause, next, previous, seek, skip, and stop actions through the existing WebSocket/store path. Nitro advertises lock-screen, notification, and headset controls, but its public API does not document RNTP’s `handling: 'js'` equivalent for intercepting standard controls before the native queue changes.

Treat remote-mode control forwarding as unverified until tested on real Android and iOS devices. In particular, prove that standard media buttons can be distinguished from app-issued playback changes, forwarded exactly once, and reconciled to the desktop’s authoritative track metadata and index without audible local playback. Also verify standard stop behavior, task removal, headphone disconnection, and controller recovery; Nitro does not document RNTP’s `stop`, `clear`, or `destroy` methods as direct equivalents, so the adapter implements stop/clear through pause, seek, and native playlist mutation. The installed iOS 1.9.0 source enables both track-skip and interval-skip commands; the final lock-screen and headset presentation still needs device verification.

## Official references

- [Nitro installation and native requirements](https://nitroplayer.riteshshukla.in/docs/installation)
- [TrackPlayer controls, playlist events, lazy URLs, and callbacks](https://nitroplayer.riteshshukla.in/docs/api/track-player)
- [PlayerQueue playlist operations](https://nitroplayer.riteshshukla.in/docs/api/player-queue)
- [TypeScript types and configuration](https://nitroplayer.riteshshukla.in/docs/types)
