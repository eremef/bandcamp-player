# Offline Mode for Desktop App

Add an **Offline Mode** toggle to the desktop app. When enabled, the player only plays tracks that are cached locally — skipping or blocking non-cached tracks and hiding network-only content (Radio stations) from actions. This is a lightweight feature since the caching system is already in place; no new architecture is needed.

## Proposed Changes

### Shared Types & IPC

#### [MODIFY] [types.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/shared/types.ts)

Add `offlineMode: boolean` to `AppSettings`.

#### [MODIFY] [types.d.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/shared/types.d.ts)

Mirror the same property in the ambient declaration file.

#### [MODIFY] [ipc-channels.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/shared/ipc-channels.ts)

No new channels needed — offline mode is persisted via the existing `SETTINGS_CHANNELS.SET` and broadcast via `SETTINGS_CHANNELS.ON_CHANGED`.

---

### Main Process

#### [MODIFY] [database.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/main/database/database.ts)

Add `offlineMode: false` to `defaultSettings`.

#### [MODIFY] [player.service.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/main/services/player.service.ts)

- In `play(track?)`: if `offlineMode` is on **and** the track has a `streamUrl` but is _not_ cached, throw an error (or set `this.error`) instead of playing. This produces a `player:error` state visible in the UI.
- In `next()` / `previous()`: skip non-cached tracks in offline mode (auto-advance until hitting a cached track or exhausting the queue).
- Add a private helper `isOfflineMode()` that reads from `this.database.getSettings()`.

---

### Renderer

#### [MODIFY] [store.ts](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/renderer/store/store.ts)

- Add `isOfflineMode` derived from `settings.offlineMode` (computed from the existing `settings` state — no extra slice needed).
- Update `play()` action: when offline mode is on and the track is not cached, show a toast "Offline mode is on — track not available" instead of calling `window.electron.player.play()`.

#### [MODIFY] [SettingsModal.tsx](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/renderer/components/Settings/SettingsModal.tsx)

Add an **Offline Mode** toggle inside the existing "Offline Cache" section (below the Enable Caching toggle). Hint text: _"Only play cached tracks"_. Disabled (greyed out) when caching is off.

#### [MODIFY] [Layout component](file:///d:/eremef/Documents/AI/antigravity/Bandcamp-player/src/renderer/components/Layout)

Add a small amber/orange **"Offline Mode"** badge/chip in the header bar when `settings?.offlineMode` is true, so the user always knows they're in offline mode.

---

## Verification Plan

### Automated Tests

The existing `player.test.ts` tests cover `play()`, `next()`, `previous()`. I'll add new tests to that file:

```
npx vitest run src/main/services/player.test.ts
```

New test cases to add:

1. **`play()` in offline mode with non-cached track** → expect `state.error` to be set and `isPlaying` to remain `false`.
2. **`play()` in offline mode with cached track** → expect playback to start normally.
3. **`next()` in offline mode** → skips non-cached tracks and lands on the next cached one.

Run full test suite after changes:

```
npx vitest run
```

### Lint & Type Check

```
npm run lint
npx tsc --noEmit
```

### Manual Verification

1. Open **Settings → Offline Cache**.
2. Toggle **Offline Mode** on.
3. Verify the amber **"Offline Mode"** badge appears in the header.
4. Click an album/track that is **not** cached → verify a toast/error appears (not playback).
5. Click a track that **is** cached (has a download icon already) → verify it plays.
6. Turn offline mode off → previous track plays normally from network.
