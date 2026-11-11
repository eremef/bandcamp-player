# Artists Playlists and Radio layout implementation plan

Add a Collection-style layout button to the desktop Artists, Playlists, and Radio overview screens. Each screen supports Grid or List and Small, Medium, or Large cards, saves its own choices, and uses a common sizing scale with Collection.

This plan includes the requested consistency of card sizes. Medium will therefore change the current density of Artists, Playlists, and Radio. Collection remains the sizing reference.

## Scope and behavior

The implementation targets the Electron renderer in `src/renderer/`. The reference is the desktop Collection button titled `Layout and cover size`. Mobile screens and artist, playlist, and radio detail layouts are outside this change. The artist detail screen currently embeds `ItemsGrid`; it should retain its existing defaults.

Use these implementation decisions unless the user changes the scope:

- Add one icon button beside the existing header controls on each overview, titled and accessibly named `Layout and cover size`.
- The popover contains Layout choices Grid and List, followed by Small, Medium, and Large. Label the size section Cover Size in Grid and Thumbnail Size in List, matching Collection.
- Indicate the selected options visually and programmatically. Selecting any option applies immediately and closes the popover, matching Collection.
- Save preferences independently for Artists, Playlists, and Radio. A change must not alter another view or Collection. A single size preference per view carries between Grid and List.
- Default each newly supported view to Grid and Medium, including existing installations without the new settings.
- Apply the Playlists preference to both local playlists and Bandcamp playlists. Both sections retain their headings, order, and current behavior.
- Preserve Artist alphabetical groups in both modes. Preserve Radio ordering, search, playback state, and incremental loading.
- Keep the control available on empty overviews so users can configure their next visit. Respect existing initial loading/error rendering where the entire toolbar is absent.
- Keep search text, item selection, queue state, and any playlist rename/create input when changing layout or size. Switching layout must not trigger data fetches, queue changes, or playback.

## Current implementation

| Area | Owning sources | Relevant behavior |
| --- | --- | --- |
| Collection control | `src/renderer/components/Collection/CollectionView.tsx`, its CSS module and tests | Inline layout popover, outside mousedown dismissal, Grid/List and three sizes, persisted setters |
| Collection rendering | `src/renderer/components/Collection/ItemsGrid.tsx`, `ItemsGrid.module.css`, `AlbumCard.tsx` and its CSS | Layout and size props; size-dependent incremental rendering; existing list presentation |
| Artists | `src/renderer/components/ArtistsView.tsx`, `ArtistsView.module.css` | Alphabetically grouped cards, circular artwork, placeholder initials, playback/context actions, cache/download badges; fixed 160px minimum grid width |
| Playlists | `src/renderer/components/Playlist/PlaylistsView.tsx`, its CSS module and tests | Separate local and Bandcamp grids; inline create/rename, import/export, refresh/loading, artwork and playback actions; fixed 200px minimum width |
| Radio | `src/renderer/components/Radio/RadioView.tsx`, its CSS module and tests | Widescreen artwork, date/duration/description, active station, mix and extracted-track actions; fixed 280px minimum width; initial 20 items and increments of 20 |
| Settings | `src/shared/types.ts`, `src/main/database/database.ts`, `src/renderer/store/store.ts` | `CollectionViewMode` and `CoverSize` types; JSON database defaults merged into old settings; renderer initialization, setters, fetch hydration and settings-change subscription |
| Existing integration coverage | `e2e/collection-view-mode.spec.ts`, `e2e/artist-view.spec.ts`, `e2e/artist-bulk-actions.spec.ts`, playlist and radio specs | Electron fixtures and IPC mocking conventions to reuse |

The settings path has two hydration sites: `fetchSettings` and `initializeStoreSubscriptions`' settings `onChanged` callback. Updating only one causes saved choices to revert or become stale.

## Shared sizing contract

Define the scale once in `src/renderer/styles/variables.css`, using shared custom properties consumed by Collection and all three new implementations. Keep per-view selectors in their CSS Modules. Do not copy numeric size tables into three view files.

| Size | Grid minimum card width | List artwork width | Grid gap |
| --- | --- | --- | --- |
| Small | 120px | 40px | `var(--spacing-lg)` |
| Medium | 180px | 48px | `var(--spacing-xl)` |
| Large | 260px | 64px | `var(--spacing-xl)` |

These are Collection's current grid and thumbnail scales. First inspect `AlbumCard.module.css` to reconcile its existing list rules with the shared properties.

Consistency means the same outer card column width and gap for an equal usable container width and size setting. It does not require identical total card heights: content and artwork ratios differ. Preserve circular artist images, square collection/playlist covers, and 16:9 Radio artwork. Use border-box sizing and account for Artist card padding so it cannot silently add to the shared outer width.

Use the same responsive column calculation in each grid, for example `repeat(auto-fill, minmax(min(100%, var(--card-min)), 1fr))`, mapped to the shared scale. Keep `auto-fill` across views so sparse groups do not stretch differently. Cards may grow to fill a column; the scale is not a fixed pixel width. List mode is a single full-width row per item. Artwork width follows the shared thumbnail scale, with each view preserving its aspect ratio. Define common row padding and minimum action height using existing spacing tokens; allow rows to grow for metadata and controls.

Preserve Radio's original Grid overlay: two circular play buttons centered over the artwork, a menu at the top right, and the Bandcamp link at the bottom right. Reveal the overlay on hover and keyboard focus. Scale controls down to fit narrow covers; Small uses 28px play buttons and 20px corner controls. Larger covers retain the original 56px play buttons when space permits. Grid controls must remain inside the image frame without overlapping. In List, keep 32px controls beside metadata. Use `object-fit: contain` for Radio artwork in both layouts so portrait, square, and widescreen covers remain completely visible, with space around the image when its aspect ratio differs from the frame. Give long names `min-width: 0` and deliberate wrapping/truncation with full titles available.

Use smaller typography only for Small Radio grid cards: 12px titles and 11px date/description text, derived from existing font-size tokens. Medium, Large, and List keep their existing typography.

Apply the same Small grid typography to Artists and both Playlists sections: 12px artist/playlist names and 11px item counts or playlist metadata. Keep their Medium, Large, and List typography unchanged.

Small playlist grids use 28px overlay play buttons with 16px icons, matching Radio's Small play controls. Artist context menus keep their full 200px width, float over neighbouring cards, and align left or right according to the card's position within the grid. Raise the active card above its neighbours while its menu is open. List menus align to the right.

## Shared control and settings contract

### Reusable layout control

Extract Collection's visual control into new files under the existing UI directory:

- `src/renderer/components/UI/ViewLayoutControl.tsx`
- `src/renderer/components/UI/ViewLayoutControl.module.css`
- `src/renderer/components/UI/ViewLayoutControl.test.tsx`

Use a controlled API, agreed before parallel view work begins:

```ts
interface ViewLayoutControlProps {
    viewMode: CollectionViewMode;
    coverSize: CoverSize;
    onViewModeChange: (mode: CollectionViewMode) => void;
    onCoverSizeChange: (size: CoverSize) => void;
    testIdPrefix?: string;
}
```

Reuse the existing types without renaming `CollectionViewMode` across the application. Keep persistence in the store, outside this component. The component owns only popover open/focus state and listener cleanup. Use existing icons and theme tokens; add no dependency.

Keep Collection's existing test IDs by default: `view-toggle-btn`, `view-grid-btn`, `view-list-btn`, and `cover-{size}-btn`. The other consumers use prefixes `artists`, `playlists`, and `radio`, producing IDs such as `artists-view-toggle-btn` and `artists-cover-small-btn`.

Use a normal button with `aria-expanded`, `aria-controls`, and an appropriate popover relationship. Inside, use two labelled option groups with buttons and `aria-pressed`; do not add menu/radio roles without implementing their required keyboard behavior. Enter/Space opens the popover and focus moves into it. Tab reaches all choices in order; Escape closes and returns focus to the trigger. Outside click and focus leaving the control dismiss it without stealing focus. Selection closes and restores focus. Clean up document listeners on close/unmount. Ensure visible focus rings and that the popover stays inside the window at narrow widths.

Replace only Collection's layout markup/state/listeners with the shared component. Retain filter, sort and bulk-menu behavior; do not remove listeners those controls still need. Delete only layout-specific CSS made unused by the extraction. Preserve Collection's option labels, default test IDs, persisted keys, and card behavior.

### Preferences

Add required fields to `AppSettings`, with matching defaults in `Database.initializeDefaultSettings`:

| Settings fields | Renderer state fields | Renderer actions |
| --- | --- | --- |
| `artistsViewMode`, `artistsCoverSize` | `artists_view_mode`, `artists_cover_size` | `setArtistsViewMode`, `setArtistsCoverSize` |
| `playlistsViewMode`, `playlistsCoverSize` | `playlists_view_mode`, `playlists_cover_size` | `setPlaylistsViewMode`, `setPlaylistsCoverSize` |
| `radioViewMode`, `radioCoverSize` | `radio_view_mode`, `radio_cover_size` | `setRadioViewMode`, `setRadioCoverSize` |

Modes use `CollectionViewMode`; sizes use `CoverSize`. Defaults are `grid` and `medium`. Existing JSON default merging handles missing fields; no SQL schema migration or new IPC channel is needed.

Follow the existing Collection setters: update renderer state immediately and call `updateSettings` with only the corresponding settings key. Hydrate all six fields in both settings paths. Normalize missing or unsupported saved values to the defaults so corrupt values cannot select an undefined CSS class. Keep normalization small and local to the settings contract, with tests.

Audit typed `AppSettings` literals and mocks after adding required fields. Update fixtures that need the fields; avoid making all preferences optional or adding broad type casts. Shared types may also reach mobile through existing shared-source wiring: repair resulting type fixture errors if required, without adding mobile UI or mobile preferences.

## Work sequence and ownership

All implementation subagents use **GPT-6 Luna Extra High**, configured as `gpt-6-luna` with reasoning effort `xhigh`. Each receives this plan, its exact owned files, the settled contract above, and the repository instructions. The coordinating agent owns shared integration and validation. With four available agent slots, keep one coordinator and at most three implementation workers active.

### Phase 0 Coordinator baseline

Confirm the active checkout and inspect `git status`. Record existing changes. Capture Collection and the three overview layouts at normal and narrow desktop widths using representative data. Run targeted existing tests to identify baseline failures before edits. Record actual commands and outcomes in the implementation handoff. No staging, commit, push or dependency upgrades are part of this task.

### Phase 1 Shared foundation

The coordinator implements the shared component, token scale, settings fields/defaults/hydration/setters, and Collection extraction. It owns `src/shared/types.ts`, `src/main/database/database.ts`, their relevant tests, `src/renderer/store/store.ts`, `store.test.ts`, `src/renderer/styles/variables.css`, new UI files, and Collection files. Adjust `AlbumCard` only where necessary to consume the shared size tokens without changing existing behavior.

Run foundation tests and publish the exact API, token names, action names, test IDs and any fixture changes before dispatching dependent work. This is a dependency barrier: view workers must not guess alternate APIs or independently edit store/types/tokens/Collection.

### Phase 2 Three parallel view workers

| Worker | Exclusive ownership | Deliverables and specific regressions |
| --- | --- | --- |
| A Artists | `ArtistsView.tsx`, `ArtistsView.module.css`, new `ArtistsView.test.tsx`, new `e2e/artists-view-layout.spec.ts` | Header control, shared sizes, grid/list presentation for every alphabetical group; preserve artist navigation, initial placeholders, offline/download dots, playback/context actions and artist detail defaults |
| B Playlists | `Playlist/PlaylistsView.tsx`, `PlaylistsView.module.css`, `PlaylistsView.test.tsx`, new `e2e/playlists-view-layout.spec.ts` | One header control affects local and Bandcamp grids; shared sizes and row presentation; preserve create/rename input state and focus, local play/rename/export/delete, import conflicts, Bandcamp image/loading and selection behavior |
| C Radio | `Radio/RadioView.tsx`, `RadioView.module.css`, `RadioView.test.tsx`, new `e2e/radio-view-layout.spec.ts` | Header control, shared sizes, original Grid overlay buttons scaled for narrow covers, List actions beside metadata, full uncropped artwork; preserve metadata, active station, Mix/Tracks actions, context and bulk menus, search, refresh, playlist modal and load-more sentinel |

Extend Playlists' `useShallow` selector with the new state/actions. Preserve existing selector conventions elsewhere. Prefer CSS layout variants around existing card content so grid and list do not duplicate business logic. Do not extract a universal data-card component: the three card types have different actions and data.

Radio must keep incremental rendering bounded. On a layout/size change, ensure enough items can fill the viewport and that a visible sentinel continues loading. If the existing 20-item batch already satisfies this under actual browser observation, retain it. If adjustments are needed, derive a bounded initial count/batch from layout and size, and test it. Do not reset loaded items on ordinary rerenders or create an observer/fetch loop. Search must still reveal all matching stations through scrolling, including after clearing a query.

Each worker runs its component suite and relevant existing regressions and provides changed files, checks, browser evidence, and unresolved issues. If a shared-file change is needed, send a request to the coordinator instead of modifying it. Workers must not edit each other's files, shared E2E helpers, settings fixtures, or global CSS.

### Phase 3 Integration and cross-view verification

After all workers finish, the coordinator owns any shared fixture adjustments and new `e2e/view-layout-preferences.spec.ts` for preference isolation, restart persistence, and size consistency across all four screens. Reconcile fixture omissions and existing icon mocks; existing Collection and Playlists tests explicitly mock `lucide-react` exports and may need changes after the extraction.

Review all view CSS for fixed minimum widths, minimum-content overflow, padding differences, action visibility, stacking/clipping and keyboard focus. Run the full validation gate only after the combined changes stabilize. Parallelize independent reads/unit suites where appropriate, but serialize builds and Electron E2E runs that share generated output or app resources.

## Test coverage

### Shared component tests with Vitest and React Testing Library

- Opens from its named button; exposes expanded state; contains both layouts and all three sizes with the correct selected state.
- Every choice calls exactly its matching callback with the selected value, closes, and returns focus. Changes in controlled props update selection and the trigger icon.
- Correct Cover Size/Thumbnail Size heading for the current mode.
- Outside mousedown, focus leaving, and Escape dismiss; clicks inside do not prematurely dismiss. Listeners do not remain active after unmount.
- Keyboard opening, option activation and focus traversal work. Instances do not share open state or duplicate generated popover IDs.
- Default and prefixed test IDs match the contract. Assert user-visible behavior primarily through roles and accessible names.

### Settings and database tests

- Fresh database defaults contain all six fields; an older saved settings object gains defaults without overwriting existing Collection or unrelated preferences. Repeat initialization remains idempotent.
- Each setter updates only its own renderer field and sends a partial settings update with the correct key/value.
- Saved values hydrate on initial fetch and on settings-change events. Missing and invalid values fall back independently.
- Set different values for all four views; confirm one change preserves the other settings and that rapid layout/size updates survive the existing asynchronous persistence path.
- Reset store state and mocks per test. Capture the registered settings listener to test the actual subscription path; do not only test a normalization helper.

### Per-view component tests

Parameterize two modes by three sizes for each overview. Verify selected options and the rendering variant, existing item identity/order, metadata, and action availability. Use stateful store mocks or explicit rerendering so tests demonstrate applied state as well as setter calls. JSDOM cannot prove pixel geometry; reserve that for browser tests.

| View | Required cases beyond the shared six combinations |
| --- | --- |
| Artists | Multiple letter groups and the `#` group; search and zero results; missing artwork; correct artist selection; action clicks do not navigate; queue/playlist/download actions and cache/download badges; selected artist detail retains its prior behavior |
| Playlists | Local only, Bandcamp only and both sections; empty state; placeholder art; create/rename input survives changes; Save/Cancel and action clicks do not select the card; import/export/delete behavior; Bandcamp refresh/loading and playback/navigation |
| Radio | Search matches name/description; zero results; absent artwork/date/description; active station; Play Mix versus Play Tracks; right-click and button menus; playlist/bulk actions; refresh; observer advances beyond 20 and exhausts results; layout changes do not restart playback or fetch stations |
| Collection regression | Existing dropdown IDs and labels, Grid/List, all sizes, AlbumCard props, outside dismissal, search/sort/filter/bulk actions and saved preference behavior survive extraction |

### Electron browser tests with Playwright

Use `e2e/fixtures.ts` and existing IPC conventions. Mock network-dependent collection, playlist and radio data with deterministic fixtures before navigation. IPC mocks that need live renderer updates must emit them through `e.sender.send(...)`. Use album fixtures with at least two tracks for artist/album navigation paths. Avoid production Bandcamp requests and external artwork dependence; use deterministic local/data fixtures where supported by the app.

1. On each overview, open the control and exercise all six layout/size combinations. Assert meaningful item content, checked/pressed choice state, and rendered grid/list geometry. Scope selectors to each overview or section.
2. In Grid, verify computed column widths and gaps use the same scale across Collection, Artists, local playlists, Bandcamp playlists and Radio. Match usable content widths when comparing; account explicitly for group/header/container padding. Verify representative card bounding boxes, not only CSS class names or custom-property values.
3. Verify Small < Medium < Large artwork dimensions in List. In Grid, verify the intended minimum-column behavior at a viewport where the sizes produce distinct column counts; do not assume actual fluid card width increases monotonically across every viewport.
4. At the normal 1280x720 window, a wide 1600x900 window, and the app's supported minimum desktop width, check toolbar wrapping, long names, card/row overflow, popover placement, and action access. Use actual Electron content-window sizing and inspect usable container width. Test sparse artist groups and both short and long playlist/radio collections.
5. In each layout, invoke representative primary and secondary actions and verify their IPC effect or resulting navigation. Radio's Small grid must expose Mix, Tracks and menu/external actions without overlapping targets. Keyboard users can reveal and activate card actions.
6. Select distinct preferences for each view, navigate away and back, and confirm independence. Confirm an unrelated settings event does not reset choices.
7. Close and relaunch Electron using the same isolated `userDataPath`; verify all saved values after settings/data hydration. Poll persisted settings before closing. A renderer reload or navigation alone is insufficient evidence of restart persistence.
8. Seed legacy settings without the six keys and verify default Grid/Medium and continued Collection preference preservation.
9. Scroll a Radio fixture larger than several batches in every density, wait for the sentinel to reveal more items, and reach the last result without duplicates. Repeat with search and after layout switches. Account for automatically loaded batches instead of asserting an exact initial count in the browser.

Use locator assertions, `expect.poll`, and explicit application-state conditions; avoid fixed sleeps. Reset preferences and fixtures independently per test. Reuse the established restart approach only after confirming it actually relaunches Electron and reuses the test user-data directory. Do not widen shared helpers unless the coordinator needs it for several specs.

## Validation commands and completion gate

From the repository root, run targeted suites first:

```powershell
npx vitest run src/renderer/components/UI/ViewLayoutControl.test.tsx src/renderer/components/Collection/CollectionView.test.tsx src/renderer/store/store.test.ts src/main/database/database.test.ts
npx vitest run src/renderer/components/ArtistsView.test.tsx src/renderer/components/Playlist/PlaylistsView.test.tsx src/renderer/components/Radio/RadioView.test.tsx
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test e2e/collection-view-mode.spec.ts e2e/artists-view-layout.spec.ts e2e/playlists-view-layout.spec.ts e2e/radio-view-layout.spec.ts e2e/view-layout-preferences.spec.ts --workers=1
npx playwright test e2e/artist-view.spec.ts e2e/artist-bulk-actions.spec.ts e2e/playlist.spec.ts e2e/playlist-management.spec.ts e2e/radio.spec.ts e2e/radio-interaction.spec.ts e2e/radio-player.spec.ts --workers=1
```

Run mobile typecheck only if changes to shared `AppSettings` types affect the companion compilation. No device testing is required for this desktop scope. Diagnose baseline failures separately and record any remaining limitation with the failing command and error.

`npm run build` can regenerate `remote-config.json.hash` and copied mobile assets. Inspect `git diff` afterward and retain only intended changes; preserve any pre-existing user edits. Do not hand-edit generated copies or silently discard unrelated changes.

Implementation is complete when all three overview buttons work, both layouts and all sizes render correctly, the four views share the sizing contract, all preferences survive a real restart independently, existing actions remain usable, targeted and full desktop checks pass or have clearly identified baseline blockers, and browser verification covers narrow layouts and Radio scrolling. Include screenshots and actual validation results in the implementation handoff. No implementation, test execution, commit, or push is implied by preparing this plan.
