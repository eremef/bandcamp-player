# Repository Guidelines

Beta Player is an unofficial Bandcamp player with an Electron desktop app and an Expo/React Native companion in `mobile/`. The root npm package is the desktop app; `mobile/` is a separate npm package.

## Project Structure

- `src/main/`: Electron IPC and services; `src/renderer/`: React UI, Zustand, and CSS Modules.
- `src/shared/`: shared types and IPC channels; `mobile/`: Expo Router client.
- Put mobile tests in `mobile/__tests__/`. Playwright specs live in `e2e/`, assets in `src/assets/`, and selectors in `remote-config.json`.

## Package Manager and Prerequisites

- Use npm; release CI uses Node.js 24. Install dependencies at the repo root and separately in `mobile/`; each package has its own `package-lock.json`.
- Commit the corresponding lockfile with dependency changes.
- Android requires Java 17, Android SDK, NDK, CMake 3.31.6, and `mobile/android/local.properties` with `sdk.dir` set.

## Commands

| Task | Command |
| --- | --- |
| Start desktop development | `npm run dev` |
| Build desktop | `npm run build` |
| Package desktop (tests + build + electron-builder) | `npm run package` |
| Lint / typecheck desktop | `npm run lint`; `npm run typecheck` |
| Run desktop tests | `npm test` |
| Validate mobile | `npm run lint:mobile`; `npm run test:mobile` |
| Typecheck mobile | `npm run typecheck --prefix mobile` |
| Run E2E suite (builds first) | `npm run test:e2e` |
| Run Android app on a device/emulator (from `mobile/`) | `npm run android:build` |
| Run E2E directly after building | `npx playwright test --workers=1` |

## File-Scoped Validation

| Task | Command |
| --- | --- |
| Desktop test | `npx vitest run src/main/services/player.test.ts` |
| Mobile test | `npm test --prefix mobile -- __tests__/MobilePlayerService.test.ts` |
| E2E spec (after building) | `npx playwright test e2e/player.spec.ts --workers=1` |
| Lint file | `npx eslint src/main/services/player.service.ts` |

## Key Conventions

- Use ESM imports only. Follow `eslint.config.mjs`: four spaces, single quotes, trailing commas, type-only imports, and narrowed `unknown`.
- Use PascalCase for components/types, camelCase for functions/variables, UPPER_SNAKE_CASE for constants, and `kebab-case` for services.
- Use functional React components, Zustand `useStore()`, and CSS Modules. Do not add code comments unless requested.
- Quote PowerShell paths containing `(tabs)`. Never stage, commit, or push unless explicitly requested.

## Testing Notes

- Use Vitest, Jest, and Playwright for desktop, mobile, and E2E respectively. Keep tests independent.
- Mobile tests use Jest with `jest-expo` and React Native Testing Library; place them in `mobile/__tests__/` (or beside a mobile component when that is the established pattern).
- Run the full mobile suite with `npm run test:mobile` or `npm test --prefix mobile -- --runInBand`; run one file with `npm test --prefix mobile -- __tests__/MobilePlayerService.test.ts`.
- Run mobile lint and type checks with `npm run lint:mobile` and `npm run typecheck --prefix mobile`.
- Reset mobile Zustand store state in `beforeEach`, and clear or reset mocks so tests stay independent.
- For component tests, query by accessible role or visible text where practical, and use React Native Testing Library interactions such as `fireEvent` or `userEvent` rather than calling component internals.
- Mock native modules and external services at their boundaries; assert observable state changes or calls and avoid relying on implementation-only details.
- Add `/** @vitest-environment node */` when using Node modules in Vitest tests.
- E2E IPC mocks must broadcast UI data with `e.sender.send(...)`; album navigation fixtures need `trackCount >= 2`.
- Offline playback must use cached track IDs and `getCachedTracksByAlbum()`, not stale `track.isCached` values.
- Root `npm run typecheck` covers `src/` only; mobile has its own typecheck. `npm test` builds the main process before running Vitest, and `npm run test:e2e` builds the app before Playwright launches `dist/main/main.js`.

## Pitfalls

- Root `npm run build` regenerates `remote-config.json.hash` and copies shared assets/config into `mobile/assets/`; edit the root `remote-config.json`, not its generated mobile copies. Mobile start/prebuild hooks run `sync-assets`.
- Android SDK location is machine-specific; create `mobile/android/local.properties` locally rather than committing it.
