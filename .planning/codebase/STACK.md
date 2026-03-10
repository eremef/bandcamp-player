# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code (main, renderer, mobile)
- JavaScript - Build scripts and configuration

**Secondary:**
- Java 17 - Required for Android builds
- Python - Some build scripts (png-to-ico conversion)

## Runtime

**Environment:**
- Node.js 18+ - Development and build
- Electron 40.6.1 - Desktop application runtime

**Package Manager:**
- npm 10+ - Package management
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Electron 40.6.1 - Desktop app shell
- React 19.2.4 - UI framework for renderer
- React Native + Expo - Mobile app (separate `mobile/` directory)

**Database:**
- better-sqlite3 12.6.2 - Local SQLite database for desktop
- WatermelonDB or Expo SQLite - Mobile database

**Scraping:**
- Cheerio 1.2.0 - HTML parsing for Bandcamp scraping
- Axios 1.13.5 - HTTP client

**UI:**
- Lucide React 0.563.0 - Icons
- Zustand 5.0.11 - State management
- QRCode React 4.2.0 - QR code generation for remote

**Testing:**
- Vitest 4.0.18 - Desktop unit tests
- Jest 30.x - Mobile unit tests
- Playwright 1.58.2 - E2E tests
- Happy-dom 20.5.0 - DOM simulation for renderer tests

**Build/Dev:**
- Vite 7.3.1 - Renderer bundler
- TypeScript 5.9.3 - Type checking
- Electron-builder 26.8.1 - App packaging
- ESLint 9.39.2 - Linting
- Concurrently 9.2.1 - Parallel script execution

## Key Dependencies

**Critical:**
- `better-sqlite3` 12.6.2 - Database for playlists, collection cache, settings
- `cheerio` 1.2.0 - Bandcamp HTML scraping
- `axios` 1.13.5 - HTTP requests to Bandcamp API
- `zustand` 5.0.11 - React state management
- `electron-store` 11.0.2 - Electron settings persistence

**Audio & Playback:**
- HTML5 Audio API - Local playback (renderer process)
- `@foxxmd/chromecast-client` 1.0.4 - Chromecast support
- `ws` 8.19.0 - WebSocket for remote control

**Authentication & Sync:**
- Electron Session API - Cookie-based Bandcamp authentication
- Last.fm API - Scrobbling

**Mobile:**
- expo 52+ - React Native framework
- expo-av - Audio playback
- expo-router - File-based routing
- expo-updates - OTA updates

**Utilities:**
- `uuid` 13.0.0 - ID generation
- `js-sha256` 0.11.1 - Hashing
- `electron-updater` 6.7.3 - Auto-updates
- `bonjour-service` 1.3.0 - mDNS service discovery

## Configuration

**Environment:**
- `.env` file for local development (not committed)
- Environment variables passed to Electron main process
- Settings stored in `electron-store`

**Build:**
- `tsconfig.json` - Project references (main + renderer)
- `tsconfig.main.json` - Main process compilation
- `tsconfig.renderer.json` - Renderer process (ESNext, JSX)
- `vitest.config.ts` - Test configuration
- `eslint.config.js` - Linting rules

## Platform Requirements

**Development:**
- Node.js 18+
- Java 17 (for Android mobile builds)
- Android SDK with CMake 3.22.1 and NDK (mobile)

**Production:**
- Windows x64/arm64 (NSIS installer, MSI)
- Linux x64/arm64 (AppImage, deb, rpm)
- macOS x64/arm64 (DMG, ZIP)
- Android (APK via Expo/Gradle)

---

*Stack analysis: 2026-03-10*
