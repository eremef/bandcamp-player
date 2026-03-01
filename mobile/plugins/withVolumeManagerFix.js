const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that fixes react-native-volume-manager for Xcode 16 / Swift 6.
 *
 * Swift 6 requires explicit `import Foundation` for @objc attributes and NSNumber.
 * The VolumeManagerSilentListener.swift file in the package omits it.
 *
 * The companion fix for RCTEventEmitter visibility (SWIFT_ENABLE_EXPLICIT_MODULES=NO)
 * is applied via the xcodebuild command-line flag in the CI workflow, which has the
 * highest priority in Xcode's build setting hierarchy.
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
                    let patched = false;
                    let updated = content;
                    if (!updated.includes('import Foundation')) {
                        updated = 'import Foundation\n' + updated;
                        patched = true;
                    }
                    if (!updated.includes('import React')) {
                        updated = 'import React\n' + updated;
                        patched = true;
                    }
                    if (patched) {
                        fs.writeFileSync(swiftFilePath, updated);
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
