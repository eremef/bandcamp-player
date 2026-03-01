const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that fixes react-native-volume-manager for Xcode 16 / Swift 6.
 *
 * Two issues:
 *  1. Swift 6 requires explicit `import Foundation` for @objc attributes.
 *     The Swift file in the package omits it.
 *  2. RCTEventEmitter is not visible under Xcode 16's strict explicit module
 *     compilation. Disabling SWIFT_ENABLE_EXPLICIT_MODULES for just that pod
 *     restores the legacy module resolution that made it visible.
 *
 * The Podfile injection is placed at the very end of the post_install block
 * so it runs AFTER react_native_post_install and is not overridden.
 */
function withVolumeManagerFix(config) {
    return withDangerousMod(config, [
        'ios',
        (config) => {
            // Fix 1: add `import Foundation` to VolumeManagerSilentListener.swift
            try {
                const swiftFilePath = path.join(
                    config.modRequest.projectRoot,
                    'node_modules',
                    'react-native-volume-manager',
                    'ios',
                    'VolumeManagerSilentListener.swift',
                );
                if (fs.existsSync(swiftFilePath)) {
                    const swiftContent = fs.readFileSync(swiftFilePath, 'utf-8');
                    if (!swiftContent.includes('import Foundation')) {
                        fs.writeFileSync(swiftFilePath, 'import Foundation\n' + swiftContent);
                        console.log('[withVolumeManagerFix] Patched VolumeManagerSilentListener.swift with import Foundation');
                    }
                }
            } catch (e) {
                console.warn('[withVolumeManagerFix] Failed to patch Swift file:', e.message);
            }

            // Fix 2: disable SWIFT_ENABLE_EXPLICIT_MODULES for the pod
            try {
                const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
                if (fs.existsSync(podfilePath)) {
                    let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

                    const marker = '# withVolumeManagerFix';
                    if (!podfileContent.includes(marker)) {
                        const fix = [
                            `  ${marker}`,
                            `  installer.pods_project.targets.each do |target|`,
                            `    if target.name == 'react-native-volume-manager'`,
                            `      target.build_configurations.each do |config|`,
                            `        config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'`,
                            `      end`,
                            `    end`,
                            `  end`,
                        ].join('\n');

                        const lastEnd = podfileContent.lastIndexOf('\nend');
                        if (lastEnd !== -1) {
                            podfileContent =
                                podfileContent.slice(0, lastEnd) +
                                '\n' + fix +
                                '\nend' +
                                podfileContent.slice(lastEnd + '\nend'.length);
                            fs.writeFileSync(podfilePath, podfileContent);
                            console.log('[withVolumeManagerFix] Patched Podfile with SWIFT_ENABLE_EXPLICIT_MODULES=NO');
                        } else {
                            console.warn('[withVolumeManagerFix] Could not find closing end in Podfile');
                        }
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
