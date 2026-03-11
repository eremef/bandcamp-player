# Bandcamp Experimental Transport Assistant

The Unofficial multi-platform Bandcamp desktop player with mobile remote controller & standalone app

![Presentation of both desktop and mobile apps](https://github.com/user-attachments/assets/b4d81bdb-f105-40d4-be8e-866e92477e50 "Beta Player (desktop and mobile apps)")

## Download

- <https://eremef.xyz/beta-player> - download page
- <https://github.com/eremef/bandcamp-player/releases/latest> - raw release files

## Desktop App

AI-generated\* feature-rich Electron desktop application for playing Bandcamp music with fan account integration, offline caching, playlist management, native media controls, and many more!

>⚠️ **Attention** ⚠️
>
>May violate Bandcamp terms and policies.
>
>Use at your own risk.
>
>Application is designed for personal use, allowing users, aka fans, to listen to and cache only the tracks they have collected, as well as listen to freely available BC radio shows.

\*not with one prompt, but hundreds of them (to be more precise, so far, over 101 conversations and 900 user prompts), a few weeks of designing, prompting, testing on different devices/virtual machines, re-designing, prompting, testing, etc., a full-time job. Still, not a traditional craft programming, and not as eco-friendly.

### Features

- 🎵 **Collection Browser** - Browse and play your purchased Bandcamp music
- 📺 **Chromecast Support** - Cast music to Google Cast-enabled devices
- 📝 **Playlist Management** - Create and manage custom playlists
- 📥 **Offline Caching** - Download entire albums for offline playback with cache management UI
- 📻 **Bandcamp Radio** - Listen to curated Bandcamp radio shows
- 🔍 **Smart Search** - Filter your collection instantly
- 🎛️ **Windows Media Controls** - Control playback with system media keys
- 🔊 **Natural Volume Control** - Exponential volume scaling for precise control at lower levels
- 📋 **Queue Management** - Manage your playback queue with drag-and-drop reordering
- 🔀 **Shuffle & Repeat** - Various playback modes
- 🎧 **Last.fm Scrobbling** - Track your listening history (bring your own API token)
- ⚡ **Persistent Caching** - Blazing fast startup with database-backed collection caching and daily background updates
- ⏳ **Smart Buffering** - Smooth loading for large collections with visual feedback
- 🌐 **Web Remote Control** - Control playback via any web browser on the local network
- 📡 **Connection Management** - Manage remote sessions with device identification
- 🖥️ **Mini Player** - Compact floating player window
- 💾 **System Tray** - Minimize to tray with quick controls
- 🔄 **Auto-Updates** - Stay updated with the latest versions
- 🚫 **Offline Mode** - Seamless offline playback with automatic cache detection - no network errors when playing cached content

> **Note**: The applications have been tested primarily on Windows 11 and Android 14. Linux, macOS, and iOS builds are available but experimental.

### Tech Stack

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

### Getting Started

#### Prerequisites

- Node.js 18+
- npm or yarn

#### Installation

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

#### Building

```bash
# Build for production
npm run build

# Create an installer package (runs tests + build + electron-builder)
npm run package
```

### Settings & Configuration

#### Application Settings

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

### Project Structure

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

### Usage

1. **Login** - Click "Login with Bandcamp" to authenticate with your fan account
2. **Browse Collection** - Your purchased albums and tracks appear in the Collection view. Large collections (>100 items) are automatically cached for instant loading on subsequent launches.
3. **Daily Refresh** - The app automatically keeps your collection up-to-date in the background every 24 hours. Use the "Refresh" button for a manual update.
4. **Play Music** - Click on an album to start playing
5. **Create Playlists** - Use the + button in the sidebar to create playlists
6. **Add to Queue** - Right-click on albums/tracks or use the "More options" button to add to queue
7. **Open Context Menus** - Access advanced options (Play Next, Add to Playlist) via right-click or menu buttons in both Collection and Radio views
8. **Offline Mode** - Download tracks via the context menu for offline playback

## Mobile App (Remote control & Standalone Player)

The project includes a companion mobile application (Android/iOS) in the `mobile/` directory.

### Features

- 📱 **Hybrid Mode** - Seamlessly switch between Remote Control and Standalone playback
- 🎵 **Standalone Player** - Use the mobile app as an independent Bandcamp player with background audio
- 📂 **Collection Browser** - Browse and play from Collection, Playlists, and Radio
- 🎤 **Artists Tab** - Browse your collection by Artist with cached SQLite performance
- 📋 **Queue Management** - View and manage the playback queue
- 🖱️ **Context Menus** - Long-press for Queue and Playlist management
- 🔄 **Swipe to Refresh** - Pull-to-refresh support for all main tabs
- 📜 **Infinite Scroll** - Efficiently browse large collections with paginated SQLite storage
- 🔍 **Auto Discovery** - Automatic local network discovery
- 🔊 **Volume Sync** - Uses device hardware volume in Remote mode and independent volume in Standalone
- 🎧 **Last.fm Scrobbling** - Track your listening history with native scrobbling in standalone mode (do mot use Last.Fm's *Scrobble from...* as it might behave unstably)
- 🎨 **Theme Support** - Persistent System/Light/Dark theme modes

### Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Build and development platform
- **Expo Router** - File-based routing
- **Zustand** - State management
- **React Native Track Player** - Native audio playback & media controls
- **React Native Volume Manager** - System volume synchronization

### Building

**Prerequisites**:

- **Java 17** (Required for Android builds. Java 24+ is currently incompatible).
- **Android SDK** with **CMake 3.22.1** installed.
- **Android NDK** (Side-by-side versions).

#### **Build Android**

   ```properties
   # Configure SDK Create a local.properties file in mobile/android/ pointing to your SDK:
   sdk.dir=C:\\Users\\<user>\\AppData\\Local\\Android\\Sdk
   ```

   ```bash
   cd mobile
   npm install
   
   # Build and run on connected Android device/emulator
   npm run android:build
   ```

#### **Build iOS** (macOS only)

   ```bash
   cd mobile
   npm install
   npx expo prebuild --platform ios
   
   # Open in Xcode and build
   open ios/BandcampRemote.xcworkspace
   ```

### Project Structure

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

| What                                           | Size | Status |
| :--------------------------------------------- | ---- | :----: |
| Enhance music caching, add offline mode      | XL   | 🟡     |
| Bug finding and fixing                         | XL   | 🟡     |
| Refine the design                              | L    | 🟡     |
| View/edit playlist/ drag-to-reorder - mobile   | L    | 🔴     |
| Chromecast for standalone mobile mode          | L    | 🔴     |

**Legend**:
🟢 finished (waiting for release)
🟡 in the middle
🟠 just started
🔴 not started

## Star History (just for fun)

<a href="https://www.star-history.com/#eremef/bandcamp-player&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=eremef/bandcamp-player&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=eremef/bandcamp-player&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=eremef/bandcamp-player&type=date&legend=bottom-right" />
 </picture>
</a>

## Also-Known-As

- Bandcamp Eccentric Transport App
- Browse Every Track Anywhere
- Bandcamp Equivalent Third-party App
- Bandcamp Enhanced Transmitting Anywhere
- Bugs Everywhere, Try Anyway
- Bandcamp Explorer, Totally Alpha
- Built Exclusively To Audition
- Better Every Time, Almost
- Beats Echoing Through Air
- Bandcamp Experience Through App
- Bandcamp Embedded Track Aggregator

## License

[MIT](LICENSE.txt)

### Disclaimer

This application is an unofficial project intended for personal use only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Bandcamp Ventures LLC. Users are responsible for complying with Bandcamp's Terms of Service and all applicable local and international laws regarding digital content and copyright.

***
