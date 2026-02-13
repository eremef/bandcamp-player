# Bandcamp Desktop Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. Ensure `mobile/android/local.properties` points to SDK.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`
- **Web Remote**: Static files in `src/assets/remote/` (index.html, client.js, styles.css). Icons injected at runtime via `RemoteService`.
- **Simulation Mode**: Run with `npm run dev:start` to simulate a large collection (5000 items) with network errors for testing scalability and resilience.
- **Mobile Lazy Loading**: Mobile app uses infinite scroll and paginated fetching to handle large collections efficiently.

## User Rules

- Always chain sequential git commands - if possible - using `;` in a single `run_command` call (e.g., `git add . ; git commit -m "message" ; git push` etc.).
- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
- **No Preamble for Safe Commands**: Do not ask for permission or explain that you are about to run read-only/safe commands (e.g., `git status`, `ls`, `npm test`). Execute them immediately and only report the output.
- **Proactive Execution**: If a safe command is necessary to fulfill a request (like checking branch status before a commit), run it immediately in the first turn without waiting for confirmation.
- **Expanded Safe List**: Treat the following as safe for `SafeToAutoRun: true`: `git show`, `git branch`, `git remote`, `git log`, `ls`, `dir`, `cat`, `type`, `pwd`, `git diff`, `npx vitest run`.
- **ESM Imports Only**: Never use CommonJS `require()` in TypeScript files (`.ts`, `.tsx`). Always use ES6 `import` syntax to satisfy `@typescript-eslint/no-require-imports`. This includes dynamic imports and `jest.mock` factory functions.
