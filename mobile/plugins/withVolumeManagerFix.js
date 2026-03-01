const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that excludes react-native-volume-manager from the iOS build.
 *
 * The library's Swift code (VolumeManagerSilentListener.swift) uses the legacy
 * RCTEventEmitter bridge API which is incompatible with Xcode 26's strict module
 * compilation. The library is abandoned (last release Dec 2024).
 *
 * Volume button support remains active on Android via a conditional require() in
 * useVolumeButtons.ts.
 */
function withVolumeManagerFix(config) {
    return withDangerousMod(config, [
        'ios',
        (config) => {
            try {
                const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
                if (fs.existsSync(podfilePath)) {
                    let content = fs.readFileSync(podfilePath, 'utf-8');
                    const marker = '# withVolumeManagerFix: exclude broken pod';
                    if (!content.includes(marker)) {
                        // Add pod exclusion right after the first `use_expo_modules!` or
                        // `config = use_native_modules!` line
                        content = content.replace(
                            /(use_native_modules!.*)/,
                            `$1\n\n  ${marker}\n  pod 'react-native-volume-manager', :configurations => []`,
                        );
                        fs.writeFileSync(podfilePath, content);
                        console.log('[withVolumeManagerFix] Excluded react-native-volume-manager from iOS build');
                    }
                }
            } catch (e) {
                console.warn('[withVolumeManagerFix] Failed to patch Podfile:', e.message);
            }
            return config;
        },
    ]);
}

module.exports = withVolumeManagerFix;
