const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that patches react-native-volume-manager's Swift file
 * to add `import Foundation` (required by Swift 6 for @objc attributes).
 *
 * The broader Xcode 16 explicit modules issue is handled separately:
 * - CI: Ruby script patches Pods.xcodeproj after pod install
 * - Local: run the same script or pass SWIFT_ENABLE_EXPLICIT_MODULES=NO to xcodebuild
 */
function withVolumeManagerFix(config) {
    return withDangerousMod(config, [
        'ios',
        (config) => {
            try {
                const swiftFilePath = path.join(
                    config.modRequest.projectRoot,
                    'node_modules',
                    'react-native-volume-manager',
                    'ios',
                    'VolumeManagerSilentListener.swift',
                );
                if (fs.existsSync(swiftFilePath)) {
                    const content = fs.readFileSync(swiftFilePath, 'utf-8');
                    if (!content.includes('import Foundation')) {
                        fs.writeFileSync(swiftFilePath, 'import Foundation\n' + content);
                        console.log('[withVolumeManagerFix] Patched VolumeManagerSilentListener.swift');
                    }
                }
            } catch (e) {
                console.warn('[withVolumeManagerFix] Failed to patch Swift file:', e.message);
            }
            return config;
        },
    ]);
}

module.exports = withVolumeManagerFix;
