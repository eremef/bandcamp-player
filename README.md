<div align="center">
  
![open source badge](https://img.shields.io/badge/open_source-%E2%9D%A4%EF%B8%8F-blue) [![Build & Release](https://github.com/eremef/bandcamp-player/actions/workflows/release.yml/badge.svg)](https://github.com/eremef/bandcamp-player/actions/workflows/release.yml)

</div>

<div align="center">
<div>Like the app?</div>
<a href="https://www.buymeacoffee.com/eremef.xyz"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=eremef.xyz&button_colour=1da0c3&font_colour=ffffff&font_family=Cookie&outline_colour=ffffff&coffee_colour=FFDD00&v=1" alt="Buy me a coffee" title="Buy me a coffee" /></a> <a href="https://buycoffee.to/eremef.xyz" target="_blank"><img src="https://buycoffee.to/static/img/share/share-button-primary.png" style="width: 195px; height: 51px" alt="Postaw kawę dla eremef.xyz na buycoffee.to" title="Postaw kawę dla eremef.xyz na buycoffee.to"></a>
</div>

# [Bandcamp Experimental Transport Assistant](https://github.com/eremef/bandcamp-player#also-known-as)

The Unofficial multi-platform Bandcamp desktop player with mobile remote controller & standalone app

![Presentation of both desktop and mobile apps](https://github.com/user-attachments/assets/b4d81bdb-f105-40d4-be8e-866e92477e50 "Beta Player (desktop and mobile apps)")

## Download

- <https://eremef.xyz/beta-player> - download page
- <https://github.com/eremef/bandcamp-player/releases/latest> - raw release files
- <https://f-droid.org/en/packages/dev.imranr.obtainium.fdroid> - Obtainium - for Android app updates notification

## Desktop App

Feature-rich Electron desktop application for playing Bandcamp music with fan account integration, offline caching, playlist management, native media controls, and many more. Coded with AI agents.

### Features

- 🎵 **Collection Browser** - Browse and play your purchased Bandcamp music
- 📺 **Chromecast Support** - Cast music to Google Cast-enabled devices
- 📝 **Playlist Management** - Browse your saved Bandcamp playlists, create local playlists, and export/import them
- 🚫 **Offline Mode** - Seamless offline playback with automatic cache detection
- 📥 **Offline Caching** - Download entire albums or tracks for offline playback with cache management UI
- 📻 **Bandcamp Radio** - Listen to curated Bandcamp radio shows with dedicated episode tracklists
- 🔍 **Smart Search & Filters** - Filter by title/artist and toggle between Albums, Tracks, Wishlist, and Downloaded only
- ↕️ **Sorting** - Persistent sorting (Date, Title, Artist)
- 📦 **Bulk Operations** - Play, Queue, Download, or Add to Playlist entire filtered results at once
- 🎛️ **OS & Media Session Integration** - Full integration with Windows System Media Transport Controls (SMTC) & macOS Now Playing, supporting media keys, position scrubbing, artwork display, Taskbar thumbnail buttons (Thumbar), and third-party scrobblers (Pano Scrobbler, etc.)
- 🔊 **Natural Volume Control** - Exponential volume scaling for precise control at lower levels
- 📋 **Queue Management** - Manage your playback queue with drag-and-drop reordering
- 🔀 **Shuffle & Repeat** - Various playback modes
- 🎧 **Last.fm Scrobbling** - Track your listening history
- 🎮 **Discord Rich Presence** - Show what you're listening to on your Discord profile
- 🔗 **Gapless Playback** - Uninterrupted transitions between tracks
- 🎼 **Crossfade Support** - Smoothly blend tracks with adjustable duration
- ⚡ **Persistent Caching** - Blazing fast startup with database-backed collection caching
- 🔄 **Auto-Refresh** - Collection automatically updates in the background every 4 hours when idle
- ⏳ **Smart Buffering** - Smooth loading for large collections with visual feedback
- 🌐 **Web Remote Control** - Control playback via any web browser on the local network
- 📡 **Connection Management** - Manage remote sessions with device identification
- 🖥️ **Mini Player** - Compact floating player window
- 💾 **System Tray** - Minimize to tray with quick controls
- 🔄 **Auto-Updates** - Stay updated with the latest versions
- 🎨 **Theme Support** - Persistent System/Light/Dark and also High-Contrast (WCAG 2.2 AAA) theme modes

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

- **Last.fm, Discord & External Scrobblers**
  - Connect/disconnect Last.fm account for built-in automatic scrobbling
  - Enable Discord Rich Presence to show current track in your profile
  - **Pano Scrobbler & External Scrobblers**: The app fully supports OS Media Sessions (Windows SMTC / macOS Now Playing) with playback state and scrubber synchronization. If using Pano Scrobbler (or similar OS-level scrobblers), it will detect the app as `xyz.eremef.beta.app`. Make sure playback is active before adding the app to the scrobbler's allowlist.

- **Playback**
  - Toggle gapless playback and crossfade
  - Adjust crossfade duration (1-10 seconds)

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
5. **Playlists** - Access your saved Bandcamp playlists and use the New button in the sidebar to create local playlists
6. **Add to Queue** - Right-click on albums/tracks or use the "More options" button to add to queue
7. **Bulk Actions** - When a filter is active, use the "Bulk Actions" bar to operate on all matching items (Play, Queue, Download, Add to Playlist)
8. **Open Context Menus** - Access advanced options (Play Next, Add to Playlist) via right-click or menu buttons in both Collection and Radio views
9. **Offline Mode** - Download tracks via the context menu for offline playback

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
- 🔍 **Auto Discovery & Sync** - Automatic local network discovery with real-time sorting/filtering synchronization with Host
- ↕️ **Flexible Sorting** - View and change Host sorting (Date, Title, Artist)
- 🔍 **Smart Search & Filters** - Filter by title/artist and toggle between Albums, Tracks, Wishlist, and Downloaded only
- 🔊 **Volume Sync** - Uses device hardware volume in Remote mode and independent volume in Standalone
- 🎧 **Last.FM Scrobbling** - Track your listening history with native scrobbling in standalone mode (do not use Last.FM's *Scrobble from...* as it might behave unstably)
- 🔗 **Gapless Playback** - Uninterrupted audio transitions in standalone mode
- 🎼 **Simulated Crossfade** - Smooth volume fading between tracks for a continuous mix
- 🚫 **Offline Mode** - Seamless offline playback with automatic cache detection and connectivity-aware switching
- 📥 **Music Caching & Downloads** - Download entire albums or individual tracks for offline listening with background download progress tracking
- 🗂️ **Cache Management** - View cache usage, clear cache, and toggle Wi-Fi-only downloading from Settings

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

## List of Supporters (in all meanings) / Acknowledgments

- [@richardmalone](https://github.com/richardmalone)
- [@danielmee](https://github.com/danielmee)
- [@Lisiadito](https://github.com/Lisiadito)
- [@bshurikan](https://github.com/bshurikan)
- [@serkuh](https://github.com/serkuh)

## Roadmap

| What                                          | Size | Description                                                                             | Status |
| :-------------------------------------------- | ---- | --------------------------------------------------------------------------------------- | :----: |
| Stability and other bugs | XXL | | 🟡 |

**Legend**:
🟢 finished (waiting for release)
🟡 in the middle
🟠 just started
🔴 not started

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

## Legal concerns

Since the application only allows users to stream and cache music they have already collected, I don't see any risk in using it. Below is Bandcamp's stance on much more questionable behaviors for comparison:

<https://get.bandcamp.help/hc/en-us/articles/23020694039575-I-heard-you-can-steal-music-on-Bandcamp-What-are-you-doing-about-this>

## License

[MIT](LICENSE.txt)

### Disclaimer

This application is an unofficial project intended for personal use only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Bandcamp Ventures LLC. Users are responsible for complying with Bandcamp's Terms of Service and all applicable local and international laws regarding digital content and copyright.

This project is licensed under the MIT License. However, please note that it utilizes [@rntp/player](https://github.com/doublesymmetry/react-native-track-player#readme) (v5+), which is under a proprietary source-available license. While this application is strictly non-commercial and free for personal use, any commercial forks or derivative works must comply with Double Symmetry's commercial licensing terms.

## [Third-party licenses](THIRD-PARTY-LICENSES.md)

***
