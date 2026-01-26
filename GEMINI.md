# Bandcamp Player Context

## Project Overview

This project is a desktop application for playing Bandcamp music, built with **Electron**, **React**, and **TypeScript**. It offers features beyond the standard web player, including offline caching, playlist management, global media controls, and Last.fm integration. The application relies on web scraping (Cheerio) to interact with Bandcamp as there is no official public API for these features.

## Tech Stack

- **Runtime:** Electron (Main Process), Node.js
- **Frontend:** React 18, TypeScript, Vite, CSS Modules
- **State Management:** Zustand
- **Database:** SQLite (`better-sqlite3`) for local data, `electron-store` for simple persistence
- **Networking:** Axios, Cheerio (for scraping)
- **Networking:** Axios, Cheerio (for scraping)
- **Tools:** ESLint, Prettier, Electron Builder
- **Mobile:** React Native, Expo, Expo Router

## Architecture

The application follows a standard Electron multi-process architecture:

- **Main Process (`src/main`)**: Handles backend logic, file system access, database operations, scraping, and native integrations (tray, media keys).
- **Renderer Process (`src/renderer`)**: Handles the UI/UX using React. Communicates with the Main process via secure IPC.
- **IPC Layer**: Defined in `src/shared/ipc-channels.ts` and `src/main/preload.ts`.

## Development Workflows

### Setup & Run

```bash
# Install dependencies
npm install

# Run in development mode (concurrently starts main and renderer)
npm run dev

# Build for production
npm run build
```

### Key Scripts

- `npm run dev:main`: Watch mode for Main process
- `npm run dev:renderer`: Vite dev server for Renderer
- `npm run package`: Package application for distribution via `electron-builder`

### Environment Note

- **Shell**: Use proper command separators depending on the environment where the CLI is executed. Since `run_shell_command` typically executes via PowerShell on Windows, prefer `;` for sequential commands. In environments supporting `&&` (like CMD or PowerShell 7+), use it for conditional execution. Avoid assuming `&&` is always available.

## Project Structure

```text
src/
├── main/                    # Electron Main Process
│   ├── services/           # Business logic (Auth, Player, Cache, etc.)
│   ├── database/           # SQLite setup and queries
│   ├── ipc-handlers.ts     # IPC message handling
│   └── main.ts             # Entry point
├── renderer/               # React Frontend
│   ├── components/         # React components organized by feature
│   ├── store/              # Zustand state store
│   └── App.tsx             # Root component
├── shared/                 # Shared Types & Constants
│   ├── types.ts            # Domain models (Track, Album, Playlist)
│   └── ipc-channels.ts     # IPC channel names
├── shared/                 # Shared Types & Constants
│   ├── types.ts            # Domain models (Track, Album, Playlist)
│   └── ipc-channels.ts     # IPC channel names
├── mobile/                 # React Native Mobile App
│   ├── app/                # Expo Router screens
│   └── android/            # Native Android project
└── assets/                 # Static assets (Icons, images)
```

## Core Data Models

(Defined in `src/shared/types.ts` and `SPEC.md`)

- **Track**: Basic audio unit with metadata and stream/local URL.
- **Album**: Collection of tracks.
- **Playlist**: User-created ordered list of tracks.
- **QueueItem**: Item in the playback queue.

## Database Schema

The app uses a local SQLite database (`user_data/database.sqlite`) managed by `better-sqlite3`.

- **`settings`**: Key-value application config.
- **`playlists`**: Playlist metadata.
- **`playlist_tracks`**: Tracks within playlists (denormalized track data).
- **`collection_cache`**: Cached Bandcamp scrape results.
- **`audio_cache`**: Tracking for offline downloaded files.
- **`scrobble_queue`**: Offline scrobbles to be retried.

## Key Features & Implementation Details

- **Authentication**: Custom implementation scraping login cookies.
- **Offline Mode**: Downloads audio files to `AppData` and serves them via `file://` protocol when cached.
- **Offline Mode**: Downloads audio files to `AppData` and serves them via `file://` protocol when cached.
- **Scrobbling**: Custom Last.fm integration respecting offline scenarios.
- **Mobile Remote**: Android app for remote control via WebSocket.
