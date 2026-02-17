
8. **Offline Mode** - Download tracks via the context menu for offline playback

## Mobile Companion App

<p align="center">
  <img width="300" alt="image" src="https://github.com/user-attachments/assets/4be464d7-0608-49ea-8a6d-c875221623fe" />
</p>

The project includes a companion mobile application (Android/iOS) in the `mobile/` directory.

### Mobile Features

- 📱 **Remote Control** - Play, Pause, Next, Previous, Volume, and Seek from your phone
- 📺 **Chromecast Control** - Manage casting from your phone
- 🎵 **Collection Browser** - Browse and play from Collection, Playlists, and Radio
- 🎤 **Artists Tab** - Browse your collection by Artist with detailed views
- 📋 **Queue Management** - View and manage the playback queue with drag-to-reorder support
- 🖱️ **Context Menus** - Long-press for Queue and Playlist management
- 🔄 **Swipe to Refresh** - Pull-to-refresh support for all main tabs
- ℹ️ **About & License** - View app version and open source licenses
- 🔌 **Offline-ready UI** - Navigates smoothly even when disconnected (relies on Desktop for audio)
- 📜 **Infinite Scroll** - efficiently browses large collections with lazy loading
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

1. **Build iOS** (macOS only):

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

## Roadmap
| Feature                        | Size | 
| :----------------------------- | ---- | 
| Independent mobile app player  | XL   | 
| Radio shows description        | XS   | 
| Deeper Bandcamp integration | L |
| Automatic end-to-end tests | XXL |

## License

[MIT](LICENSE.txt)

### Disclaimer

This application is an unofficial project intended for personal use only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Bandcamp Ventures LLC. Users are responsible for complying with Bandcamp's Terms of Service and all applicable local and international laws regarding digital content and copyright.

***
