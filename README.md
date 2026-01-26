# Unofficial Bandcamp Desktop Player - Beta version

<p align="center">
  <img width="800" alt="image" src="https://github.com/user-attachments/assets/b665c480-a90b-44e5-8523-0becd3d092a2" />
</p>

AI-generated, feature-rich Electron desktop application for playing Bandcamp music with fan account integration, offline caching, playlist management, and Windows media controls.

⚠️ May violate Bandcamp terms and policies. Use at your own risk. ⚠️

However, it should be quite safe, as you can listen and cache only your collected tracks and radio shows.

## Features

- 🎵 **Collection Browser** - Browse and play your purchased Bandcamp music
- 📝 **Playlist Management** - Create and manage custom playlists
- 📥 **Offline Caching** - Download tracks for offline playback
- 📻 **Bandcamp Radio** - Listen to curated Bandcamp radio streams
- 🎛️ **Windows Media Controls** - Control playback with system media keys
- 📋 **Queue Management** - Manage your playback queue
- 🔀 **Shuffle & Repeat** - Various playback modes
- 🎧 **Last.fm Scrobbling** - Track your listening history
- 📱 **Mobile Companion App** - Remote control via Android application
- 🌐 **Web Remote Control** - Control playback via any web browser on local network
- 🖥️ **Mini Player** - Compact floating player window
- 💾 **System Tray** - Minimize to tray with quick controls

## Tech Stack

- **Electron** - Desktop application framework
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Zustand** - State management
- **SQLite** (better-sqlite3) - Local database
- **Vite** - Build tool for renderer
- **Cheerio** - Web scraping
- **Axios** - HTTP client

### Mobile App

- **React Native** - Cross-platform mobile framework
- **Expo** - Build and development platform
- **Zustand** - State management

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
cd Bandcamp-player

# Install dependencies
npm install

# Run in development mode
npm run dev

# In another terminal, start Electron
npm start
```

### Building

```bash
# Build for production
npm run build

# Package as installer
npm run package
```

## Settings & Configuration

### Application Settings

Access the settings menu (gear icon) to configure:

- **Playback**
  - Set default start volume
  
- **Offline Cache**
  - Toggle caching on/off
  - Set maximum cache size (1-50 GB)
  - View cache usage statistics
  - Clear cache to free up space

- **Last.fm**
  - Connect/disconnect Last.fm account
  - Toggle automatic scrobbling

- **Window**
  - Minimize to Tray: Keep app running in background when closed
  - Show Notifications: Desktop notifications on track change

### Last.fm Integration

To enable scrobbling, you need to register a Last.fm API application:

1. Go to <https://www.last.fm/api/account/create>
2. Create a new application
3. Update `src/main/services/scrobbler.service.ts` with your API key and secret

## Project Structure

```text
src/
├── main/                    # Electron main process
│   ├── main.ts             # Entry point
│   ├── preload.ts          # Preload script
│   ├── ipc-handlers.ts     # IPC communication
│   ├── services/           # Backend services
│   │   ├── auth.service.ts
│   │   ├── cache.service.ts
│   │   ├── player.service.ts
│   │   ├── playlist.service.ts
│   │   ├── scraper.service.ts
│   │   ├── scrobbler.service.ts
│   │   └── tray.service.ts
│   └── database/           # SQLite database
├── renderer/               # React frontend
│   ├── components/         # UI components
│   │   ├── Auth/           # Auth Components
│   │   ├── Collection/     # Collection Views
│   │   ├── Layout/         # Layout Components
│   │   ├── Player/         # Player Controls
│   │   ├── Playlist/       # Playlist Management
│   │   ├── Radio/          # Radio Player
│   │   ├── Settings/       # Settings Modal
│   │   └── UI/             # Common UI elements
│   ├── store/             # Zustand store
│   └── styles/            # CSS styles
└── shared/                # Shared types
```

## Usage

1. **Login** - Click "Login with Bandcamp" to authenticate with your fan account
2. **Browse Collection** - Your purchased albums and tracks appear in the Collection view
3. **Play Music** - Click on an album to start playing
4. **Create Playlists** - Use the + button in the sidebar to create playlists
5. **Add to Queue** - Right-click on albums/tracks to add to queue
6. **Offline Mode** - Download tracks via the context menu for offline playback

## Mobile Companion App

<p align="center">
  <img width="300" alt="image" src="https://github.com/user-attachments/assets/e4d12114-c758-46c5-88c0-722595abb7c0" />
</p>

The project includes a companion Android application in the `mobile/` directory.

### Features of the Mobile App

- Remote control (Play/Pause, Next/Prev, Volume, Seek)
- Browse and play from Collection, Playlists, and Radio
- Offline-ready UI (relies on Desktop for audio)
- Automatic local network discovery

### Building Mobile App

```bash
cd mobile
# Install dependencies
npm install

# Build APK (requires Expo account)
npx eas-cli build --platform android
```

## License

MIT

However, I can't imagine any legal commercial usage of this app, except for usage by Bandcamp Ventures LLC.
