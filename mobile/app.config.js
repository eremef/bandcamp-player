module.exports = {
  expo: {
    name: 'Beta Player',
    slug: 'beta-app',
    version: '1.8.9-alpha.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'beta-app',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'xyz.eremef.beta',
    },
    android: {
      package: 'xyz.eremef.beta',
      permissions: [
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'POST_NOTIFICATIONS',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'WAKE_LOCK',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      predictiveBackGestureEnabled: false,
    },
    assetBundlePatterns: [
      '**/*',
    ],
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-asset',
      'expo-router',
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
            permissions: [
              'INTERNET',
              'ACCESS_NETWORK_STATE',
              'POST_NOTIFICATIONS',
              'FOREGROUND_SERVICE',
              'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
              'WAKE_LOCK',
            ],
          },
        },
      ],
      'expo-sqlite',
      'expo-web-browser',
      'expo-secure-store',
    ],
    extra: {
      eas: {
        projectId: 'aee46402-b7b7-4afc-819b-2d1c7b77d2e2',
      },
    },
  },
};
