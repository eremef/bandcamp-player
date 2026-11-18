# Mobile RNTP to Nitro Player Migration Plan

## Objective and scope

Replace the mobile app's commercial `@rntp/player` dependency with the MIT-licensed `react-native-nitro-player` package while preserving every RNTP behavior currently used by Beta Player. The desktop Electron player and shared playback protocol remain unchanged. The existing mobile Zustand queue remains the application source of truth; Nitro Player is the native playback engine and media-session surface.

Implementation is on `feature/switch_to_nitro`. The repository already targets Expo SDK 58 / React Native 0.88.1, enables the New Architecture, and has an Expo development client. Nitro Player requires native code, so native builds must be regenerated or rebuilt after dependency changes. The Expo app config already declares iOS background audio and Android media foreground-service permissions; verify that generated native projects retain them. A small `patch-package` patch preserves iOS audio mixing, Stop and skip-command handling, and Android stop-on-task-removal because Nitro 1.9.0 does not expose those RNTP behaviors directly.

## Current RNTP contract to preserve

This inventory covers every RNTP API currently called by mobile runtime code, not the unused portions of RNTP's public API.

| Current RNTP call or behavior | Required Nitro implementation |
| --- | --- |
| `setupPlayer` with noisy-device handling, audio mixing, 1-second progress sync, Android network wake mode, and task-removed stop behavior | Configure Nitro once; its Android ExoPlayer builder already sets network wake mode and noisy-device handling. Map Android focus settings. Preserve iOS audio mixing with `.mixWithOthers` and task-removed stop behavior with a service patch; verify both on device. |
| `setCommands` for play/pause, next/previous, seek, stop, and skip forward/backward with JavaScript handling | Expose equivalent notification/lock-screen/headset commands. Route commands into Beta Player's store actions so remote mode still sends WebSocket commands to the desktop. Use an Android custom Stop notification button and patch Nitro's iOS media session to forward `stopCommand` through the existing notification-button callback. Keep iOS skip commands enabled alongside track commands; the system may choose which side-button pair it displays. |
| `registerBackgroundEventHandler` plus foreground listeners | Register Nitro callbacks once at application startup and route them through one playback event adapter. Cover app backgrounding and task removal without duplicate listeners. |
| `setMediaItems(queue, activeIndex)`, queue reads, active index, and item replacement/metadata updates | Translate queue items to Nitro `TrackItem`s and maintain a stable native playlist. Preserve unique queue-item IDs, the selected index, metadata, and active-item identity during async mutations. Use Nitro's URL update API for resolved lazy URLs. |
| `play`, `pause`, `stop`, `clear`, `destroy`, `seekTo`, `setVolume`, and `setRepeatMode` | Provide equivalent adapter methods. Map repeat `off` / `one` / `all` to Nitro `off` / `track` / `Playlist`; convert the app's 0–1 volume to Nitro 1.9.0's 0–100 runtime scale. The hosted API type documentation conflicts with the installed runtime source, so keep boundary tests around this conversion. Define and test stop/clear and recovery behavior because Nitro does not document RNTP's `stop`, `clear`, or `destroy` methods. |
| Synchronous reads: `getProgress`, `getPlaybackState`, `isPlaying`, `getQueue`, `getActiveMediaItemIndex` | Maintain an adapter snapshot from Nitro's state, progress, and track callbacks. Where a fresh native read is required, await it and guard against stale generations instead of assuming sync behavior. |
| State, progress, transition, and error listeners | Map Nitro track-change, playback-state, seek, and progress callbacks to the existing store, resume waiters, queue reconciliation, and scrobbling behavior. Recreate useful error context in the adapter because Nitro exposes a track-change reason rather than RNTP's detailed error event payload. |
| Remote play/pause/next/previous/seek/skip/stop events | Preserve the existing command semantics, including forwarding to the desktop in remote mode. Nitro documents media controls and post-action state/track callbacks, but not RNTP's cancellable JavaScript command handler. Build a suppression-aware bridge and prove that it distinguishes native media-button actions from app-originated player mutations. Add native-only previous/next sentinel items at queue boundaries so media buttons stay enabled; never add those sentinels to Zustand's queue. |
| Existing stream URL resolution, cache/offline selection, lookahead prefetch, failed-stream refresh/retry, repeat/end handling, resume snapshots, controller recovery, progress sync, and crossfade volume changes | Keep these business rules in the app service. Connect Nitro's lookahead callback to the Bandcamp resolver, and keep failures/recovery from corrupting the Zustand queue or persisted resume state. |

Runtime callsites are `mobile/index.js`, `mobile/services/player.ts`, `mobile/services/TrackPlayerService.ts`, `mobile/services/MobilePlayerService.ts`, and `mobile/store/index.ts`. Existing focused regression suites are under `mobile/__tests__/services/` and `mobile/__tests__/store/`.

## Target design

1. **One Nitro adapter boundary.** Add a mobile playback adapter that owns Nitro configuration, the active playlist ID, volume/repeat conversions, queue serialization, cached state/progress, callback registration, and stop/reset/recovery semantics. Store and service code should depend on this boundary rather than importing Nitro methods throughout the app.
2. **Preserve queue identity.** Translate each app `QueueItem` into a Nitro `TrackItem` using the queue-item ID as the native ID and retain the Bandcamp track ID and queue-item identity in `extraPayload`. This supports duplicate Bandcamp tracks and delayed callbacks without attributing progress to the wrong item.
3. **Serialize native queue mutations.** Build a staging Nitro playlist from the latest Zustand queue and load it at the intended item before discarding the old playlist. Apply play/pause/seek only after the matching playlist mutation completes. If staging fails, keep the old app/native queue and restore prior playback intent. Use generation checks to discard stale async resolves, as the current loader does.
4. **Keep stream resolution in app code.** Share URL resolution between initial load and Nitro `onTracksNeedUpdate`; apply offline/cache rules before returning an updated URL. Test expired URLs and the current-track retry separately because Nitro's documented current-item URL replacement behavior differs by platform.
5. **Normalize events once.** Convert Nitro's callbacks into normalized playing/state/progress/transition/error/remote-action events, then call existing store/scrobbler/recovery behaviors. Event registration must be idempotent across module reloads and must not double-dispatch foreground and background events.
6. **Route native media controls safely.** In standalone mode, reconcile Nitro's post-action track/state callbacks into the app queue and route shuffle/unstreamable transitions back through app queue logic. In remote mode, send native play/pause/skip/seek actions to the desktop, keep the handset muted, and restore metadata/index from the authoritative remote state. Use boundary sentinels only in the native mirror so Next/Previous stay enabled and can be forwarded even for a one-item queue. Suppress callbacks caused by the app's own adapter commands. Add an explicit stop action if Nitro lacks a standard stop callback.
7. **Replace lifecycle teardown deliberately.** Define tested adapter operations for stop, clear, and native-controller recovery using only supported Nitro APIs. Stop must remove audible playback and controls as current behavior requires; recovery must restore queue, current track, volume, repeat, position, and intended play state without starting stale playback.

## Documentation deliverables

- Keep this plan as the migration record and update it with the final design, implemented coverage, and any platform-specific limitations discovered during verification.
- Add a mobile playback architecture note describing Nitro installation, native build requirements, queue identity, URL lookahead, callback routing, remote-mode behavior, and developer test commands.
- Update package/lockfile state and any active contributor or README references that still describe RNTP as the mobile playback engine. Preserve old implementation-plan documents as historical records unless they present themselves as current guidance.

## Tests and verification

1. Update the shared player mock to model Nitro APIs and event callbacks, including async state reads and queue mutation ordering.
2. Keep or rename the player setup suite to test configuration, repeat/volume mapping, queue metadata/index, and muted remote queue behavior.
3. Replace RNTP event-service tests with adapter/event tests covering play/pause, next/previous, seek, skip intervals, stop, task/audio-output changes, progress, state transitions, track-end/repeat, scrobbling, error retry/skip, and listener idempotency.
4. Expand `MobilePlayerService` coverage for playlist replacement, duplicate queue-item IDs, stale async loads, URL lookahead, cache/offline selection, resume snapshots, stop/clear, and controller recovery.
5. Update store tests for async progress/state snapshots, remote command forwarding, and queue handoff rollback.
6. Run focused mobile Jest suites, the full mobile Jest suite, mobile typecheck, and mobile lint. Build the Android development target to exercise native autolinking and Kotlin integration where the local SDK/NDK environment permits. Cover lazy URL updates, cache/offline resolution, stale results, unresolved streams, queue-load failures, and notification Stop dispatch in tests.
7. On real Android and iOS devices (or report platform coverage unavailable), verify background playback, lock-screen/notification controls, headphones unplugging, remote mode controls while muted, queue transitions, URL failure/recovery, task removal, and restart/resume. Confirm how iOS presents simultaneous track and interval-skip controls; hosted types and the installed 1.9.0 source document different configurations.
8. Review the complete branch diff against `main`, including package and lockfile changes, generated/native files, user changes, and all RNTP references. Fix findings, run final checks, and commit only migration files; do not stage or commit the pre-existing `AGENTS.md` edit.

## Completion criteria

- No mobile runtime imports or calls from `@rntp/player` remain, and the Nitro dependency is represented in `mobile/package.json` and its lockfile.
- Every RNTP call and user-visible behavior in the contract table has a documented Nitro mapping and regression coverage, including stop/clear/recovery and remote-mode media controls.
- Queue, playback, background control, persistence, remote WebSocket synchronization, cache/offline behavior, and scrobbling preserve current observable behavior.
- Focused and broad checks pass; native build/device limitations are reported precisely.
- The complete migration is reviewed against `main`, corrections are included, and the requested branch contains the implementation commit without the pre-existing `AGENTS.md` change.

## Implementation status (2026-11-18)

- Implemented on `feature/switch_to_nitro` with `react-native-nitro-player` 1.9.0 and `react-native-nitro-modules` 0.37.2. The adapter now owns Nitro setup, queue snapshots, staging-playlist replacement, volume/repeat conversion, normalized callbacks, lazy URL updates, native-only boundary sentinels, and logical stop/clear/recovery behavior.
- Runtime call sites use the adapter; RNTP was removed from the mobile package, lockfile, mocks, active architecture docs, and license list. The version-specific package patch restores iOS audio mixing and Stop/skip handling and Android stop-on-task-removal.
- Verification passed: mobile Jest (36 suites / 488 tests), TypeScript, ESLint, Android debug build, patch parse/reverse check, and Pixel 10 Pro emulator startup with the Metro JavaScript bundle.
- Remaining device validation: iOS was unavailable on this Windows host. Real playback, lock-screen/headset command presentation, audio mixing, Android notification Stop/task removal, remote command forwarding during actual playback, and current-track expired-URL recovery still need device-level checks. Do not treat the passing emulator startup as proof of those flows.
