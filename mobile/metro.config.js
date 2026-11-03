const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedSource = path.resolve(projectRoot, '../src');

const config = getDefaultConfig(projectRoot);

// Shared files live outside the mobile package and must be watched by Metro.
config.watchFolders = [sharedSource];

// Resolve shared-code dependencies from the mobile app's installed packages.
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(projectRoot, '../node_modules'),
];

module.exports = config;
