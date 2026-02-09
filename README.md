# Unofficial Bandcamp Desktop Player - Beta version

<p align="center">
  <img width="800" alt="image" src="https://github.com/user-attachments/assets/4d3dbdaf-b7b1-4faf-b1d3-2d01ec1885df" />
</p>

AI-generated (not with 1 prompt, but in over 2-weeks-go, designing, prompting, testing, re-designing, prompting, testing, etc.) feature-rich Electron desktop application for playing Bandcamp music with fan account integration, offline caching, playlist management, and Windows media controls.

>⚠️ May violate Bandcamp terms and policies. Use at your own risk.
>
>However, it is designed for personal use, allowing you to listen to and cache only the tracks you have collected, as well as radio shows.

## Features

- 🎵 **Collection Browser** - Browse and play your purchased Bandcamp music
- 📝 **Playlist Management** - Create and manage custom playlists
- 📥 **Offline Caching** - Download tracks for offline playback
- 📻 **Bandcamp Radio** - Listen to curated Bandcamp radio shows with broadcast dates
- 🔍 **Smart Search** - Filter your collection instantly on all platforms (Desktop, Mobile, Web)
- 🎛️ **Windows Media Controls** - Control playback with system media keys
- 🔊 **Natural Volume Control** - Exponential volume scaling for precise control at lower levels
- 📋 **Queue Management** - Manage your playback queue
- 🔀 **Shuffle & Repeat** - Various playback modes
- 🎧 **Last.fm Scrobbling** - Track your listening history
- 📱 **Mobile Companion App** - Remote control via Android/iOS application
- 🌐 **Web Remote Control** - Control playback via any web browser on the local network
- 🖥️ **Mini Player** - Compact floating player window
- 💾 **System Tray** - Minimize to tray with quick controls

## Tech Stack

- **Electron** - Desktop application framework
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Zustand** - State management
- **SQLite** (better-sqlite3) - Local database
- **Vite** - Build tool for renderer
- **Cheerio** - Web scraping
- **Axios** - HTTP client

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
```

> **Note**: The applications have been tested primarily on Windows 11 and Android 14. Linux (AppImage, deb), MacOS (dmg), and iOS (IPA) builds are available but experimental.

## Settings & Configuration

### Application Settings

Access the settings menu (gear icon) to configure:

- **Offline Cache**
  - Toggle caching on/off
  - Set maximum cache size (1-50 GB)
  - View cache usage statistics
  - Clear cache to free up space

- **Last.fm**
  - Connect/disconnect Last.fm account
  - Toggle automatic scrobbling

- **Window**
  - Minimize to Tray: Keep the app running in the background when closed
  - Show Notifications: Desktop notifications on track change

### Last.fm Integration

To enable scrobbling, you need to register with Last.fm API application:

1. Go to <https://www.last.fm/api/account/create>
2. Create a new application
3. Update `src/main/services/scrobbler.service.ts` with your API key and secret (before building, if building yourself) or provide it in the Settings of the desktop app (when downloading from releases)

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
│   │   ├── remote.service.ts
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
├── shared/                # Shared types
└── assets/                # Static assets
    ├── icons/             # Application icons
    └── remote/            # Web Remote Interface (index.html, client.js, styles.css)
```

## Usage

1. **Login** - Click "Login with Bandcamp" to authenticate with your fan account
2. **Browse Collection** - Your purchased albums and tracks appear in the Collection view
3. **Play Music** - Click on an album to start playing
4. **Create Playlists** - Use the + button in the sidebar to create playlists
5. **Add to Queue** - Right-click on albums/tracks or use the "More options" button to add to queue
6. **Open Context Menus** - Access advanced options (Play Next, Add to Playlist) via right-click or menu buttons in both Collection and Radio views
7. **Offline Mode** - Download tracks via the context menu for offline playback

## Mobile Companion App

<p align="center">
  <img width="300" alt="Mobile app screenshot" src="https://github.com/user-attachments/assets/81280716-5e57-4af0-a2bb-afc0535c06ae" />
</p>

The project includes a companion mobile application (Android/iOS) in the `mobile/` directory.

### Mobile Features

- 📱 **Remote Control** - Play, Pause, Next, Previous, Volume, and Seek from your phone
- 🎵 **Collection Browser** - Browse and play from Collection, Playlists, and Radio
- 📋 **Queue Management** - View and manage the playback queue with drag-to-reorder support
- 🖱️ **Context Menus** - Long-press for Queue and Playlist management
- 🔄 **Swipe to Refresh** - Pull-to-refresh support for all main tabs
- 📡 **Connection Management** - View host IP, disconnect, and manage sessions
- ℹ️ **About & License** - View app version and open source licenses
- 🔌 **Offline-ready UI** - Navigates smoothly even when disconnected (relies on Desktop for audio)
- 🔍 **Auto Discovery** - Automatic local network discovery
- 🔊 **Volume Sync** - Uses the device's native volume steps for hardware synchronization

### Mobile Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Build and development platform
- **Expo Router** - File-based routing
- **Zustand** - State management
- **React Native Track Player** - Native audio playback & media controls
- **React Native Volume Manager** - System volume synchronization

### Building Mobile App

> **Prerequisites**:
>
> - **Java 17** (Required for Android builds. Java 24+ is currently incompatible).
> - **Android SDK** with **CMake 3.22.1** installed.
> - **Android NDK** (Side-by-side versions).

1. **Build Android**:

**Configure SDK**
   Create a `local.properties` file in `mobile/android/` pointing to your SDK:

   ```properties
   sdk.dir=C:\\Users\\<user>\\AppData\\Local\\Android\\Sdk
   ```

   ```bash
   cd mobile
   npm install
   
   # Build and run on connected Android device/emulator
   npm run android:build
   ```

2. **Build iOS** (macOS only):

   ```bash
   cd mobile
   npm install
   npx expo prebuild --platform ios
   
   # Open in Xcode and build
   open ios/BandcampRemote.xcworkspace
   ```

### MobileProject Structure

```text
mobile/
├── app/                       # Expo Router app directory
│   ├── (tabs)/                # Main tab navigation
│   ├── modal/                 # Modal screens
│   └── _layout.tsx            # Root layout
├── components/                # React Native components
├── services/                  # Mobile services (Player, API, WebSocket)
├── store/                     # Zustand store for mobile
├── assets/                    # Mobile assets (images, fonts)
├── android/                   # Android native project
└── ios/                       # iOS native project
```

## License

MIT

### Disclaimer

This application is an unofficial project intended for personal use only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Bandcamp Ventures LLC. Users are responsible for complying with Bandcamp's Terms of Service and all applicable local and international laws regarding digital content and copyright.
