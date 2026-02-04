# Bandcamp Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. Ensure `mobile/android/local.properties` points to SDK.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`
- **Web Remote**: Static files in `src/assets/remote/` (index.html, client.js, styles.css). Icons injected at runtime via `RemoteService`.

## User Rules

- Always chain sequential git commands - if possible - using `;` in a single `run_command` call (e.g., `git add . ; git commit -m "message" ; git push` etc.)
- Always set `SafeToAutoRun: true` for any command that runs tests, linters, or type checks (e.g., `npm test`, `npx vitest`, `npm run lint`, `npx tsc`, `eslint src`, `esling mobile` etc.)
- Always set `SafeToAutoRun: true` for read-only git commands (e.g., `git status`, `git diff`, `git log`, `git branch`, `git show`, `git remote -v` etc.)
- **Java Version**: Ensure `JAVA_HOME` points to Java 17 for Android builds. Java 24+ is NOT supported.
