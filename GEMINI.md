# Bandcamp Player

Electron + React + TypeScript desktop app for Bandcamp music with offline caching, Last.fm scrobbling, and mobile/web remote control. Uses Cheerio scraping (no official Bandcamp API).

## Critical Notes

- **Shell**: Use `;` for sequential commands (PowerShell on Windows)
- **Android**: Requires OpenJDK 17 (not 24+), CMake 3.22.1. Ensure `mobile/android/local.properties` points to SDK.
- **IPC**: Channels in `src/shared/ipc-channels.ts`, handlers in `src/main/ipc-handlers.ts`

## User Rules

- do not use MCP
