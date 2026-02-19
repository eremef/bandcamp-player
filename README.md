
# Unofficial Bandcamp Desktop Player

<p align="center">
 <img width="800" alt="image" src="https://github.com/user-attachments/assets/c7fb33a1-1801-4a96-a819-9f4a40150dec" />
</p>

AI-generated\* feature-rich Electron desktop application for playing Bandcamp music with fan account integration, offline caching, playlist management, and Windows media controls.

>⚠️ May violate Bandcamp terms and policies. Use at your own risk.
>
>However, it is designed for personal use, allowing you to listen to and cache only the tracks you have collected, as well as radio shows.

\*not with one prompt, but hundreds of them, a few weeks of designing, prompting, testing on different devices/virtual machines, re-designing, prompting, testing, etc., a full-time job. Still, not a traditional craft programming, and not that eco-friendly.

## Features

- 🎵 **Collection Browser** - Browse and play your purchased Bandcamp music
- 📺 **Chromecast Support** - Cast music to Google Cast-enabled devices
- 📝 **Playlist Management** - Create and manage custom playlists
- 📥 **Offline Caching** - Download tracks for offline playback
- 📻 **Bandcamp Radio** - Listen to curated Bandcamp radio shows with broadcast dates
- 🔍 **Smart Search** - Filter your collection instantly on all platforms (Desktop, Mobile, Web)
- 🎛️ **Windows Media Controls** - Control playback with system media keys
- 🔊 **Natural Volume Control** - Exponential volume scaling for precise control at lower levels
- 📋 **Queue Management** - Manage your playback queue
- 🔀 **Shuffle & Repeat** - Various playback modes
- 🎧 **Last.fm Scrobbling** - Track your listening history
- ⚡ **Persistent Caching** - Blazing fast startup with database-backed collection caching and daily background updates
- ⏳ **Smart Buffering** - Smooth loading for large collections with visual feedback
- 📱 **Mobile Companion App** - Remote control via Android/iOS application
- 🌐 **Web Remote Control** - Control playback via any web browser on the local network
- 📡 **Connection Management** - View host IP, disconnect, and manage sessions
- 🖥️ **Mini Player** - Compact floating player window
- 💾 **System Tray** - Minimize to tray with quick controls
- 🔄 **Auto-Updates** - Stay updated with the latest versions via GitHub

## Tech Stack

- **Electron** - Desktop application framework
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Zustand** - State management
- **SQLite** (better-sqlite3) - Local database
- **Vite** - Build tool for renderer
- **Cheerio** - Web scraping
- **Axios** - HTTP client
- **chromecast-api** - Casting support
- **Electron Updater** - Auto-update support

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
cd Bandcamp-player

# Install dependencies (automatically runs native rebuilds)
npm install

# Run in development mode (starts watchers + Electron)
npm run dev

# Run in simulation mode (mocks 5000 items + errors)
npm run dev:large
```

### Building

```bash
# Build for production
npm run build

# Create an installer package (runs tests + build + electron-builder)
npm run package

# Create a new release (bumps version, runs tests, commits, and tags)
npm run release <newVersion>
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
│   │   ├── updater.service.ts
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
2. **Browse Collection** - Your purchased albums and tracks appear in the Collection view. Large collections (>100 items) are automatically cached for instant loading on subsequent launches.
3. **Daily Refresh** - The app automatically keeps your collection up-to-date in the background every 24 hours. Use the "Refresh" button for a manual update.
4. **Play Music** - Click on an album to start playing
5. **Create Playlists** - Use the + button in the sidebar to create playlists
6. **Add to Queue** - Right-click on albums/tracks or use the "More options" button to add to queue
7. **Open Context Menus** - Access advanced options (Play Next, Add to Playlist) via right-click or menu buttons in both Collection and Radio views
8. **Offline Mode** - Download tracks via the context menu for offline playback

## Mobile Companion App

<p align="center">
  <img width="300" alt="image" src="https://github.com/user-attachments/assets/4be464d7-0608-49ea-8a6d-c875221623fe" />
</p>

The project includes a companion mobile application (Android/iOS) in the `mobile/` directory.

### Mobile Features

- 📱 **Remote Control** - Play, Pause, Next, Previous, Volume, and Seek from your phone
- 🎵 **Collection Browser** - Browse and play from Collection, Playlists, and Radio
- 🎤 **Artists Tab** - Browse your collection by Artist with detailed views
- 📋 **Queue Management** - View and manage the playback queue with drag-to-reorder support
- 🖱️ **Context Menus** - Long-press for Queue and Playlist management
- 🔄 **Swipe to Refresh** - Pull-to-refresh support for all main tabs
- 📜 **Infinite Scroll** - efficiently browses large collections with lazy loading
- 🔍 **Auto Discovery** - Automatic local network discovery
- 🔊 **Volume Sync** - Uses the device's native volume steps for hardware synchronization
- 🎨 **Theme Support** - Persistent System/Light/Dark theme modes

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

1. **Build iOS** (macOS only):

   ```bash
   cd mobile
   npm install
   npx expo prebuild --platform ios
   
   # Open in Xcode and build
   open ios/BandcampRemote.xcworkspace
   ```

### Mobile Project Structure

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

## Roadmap

| Feature                        | Size | Status      |
| :----------------------------- | ---- | ----------- |
| Independent mobile app player  | XL   | ✅ Done      |
| Deeper Bandcamp integration    | L    | In Progress |

## License

[MIT](LICENSE.txt)

### Disclaimer

This application is an unofficial project intended for personal use only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Bandcamp Ventures LLC. Users are responsible for complying with Bandcamp's Terms of Service and all applicable local and international laws regarding digital content and copyright.

***
