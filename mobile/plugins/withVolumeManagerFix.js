const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that patches the generated Podfile to disable
 * SWIFT_ENABLE_EXPLICIT_MODULES for react-native-volume-manager.
 *
 * react-native-volume-manager's VolumeManagerSilentListener.swift relies on
 * implicit transitive imports of Foundation and React types, which breaks under
 * Xcode 16's strict explicit module compilation. Disabling the flag for only
 * that pod target is the targeted fix.
 */
function withVolumeManagerFix(config) {
    return withDangerousMod(config, [
        'ios',
        (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
            let content = fs.readFileSync(podfilePath, 'utf-8');

            const marker = '# withVolumeManagerFix: disable explicit modules';
            if (content.includes(marker)) {
                return config;
            }

            const fix = [
                `  ${marker}`,
                `  installer.pods_project.targets.each do |target|`,
                `    if target.name == 'react-native-volume-manager'`,
                `      target.build_configurations.each do |config|`,
                `        config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'`,
                `      end`,
                `    end`,
                `  end`,
                ``,
            ].join('\n');

            content = content.replace(
                /^(post_install do \|installer\|)$/m,
                `$1\n${fix}`,
            );

            fs.writeFileSync(podfilePath, content);
            return config;
        },
    ]);
}

module.exports = withVolumeManagerFix;
