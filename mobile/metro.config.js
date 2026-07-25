const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Removed watchFolders to prevent Metro from crashing due to scanning the entire parent directory.
// Cross-project resolution is handled transparently via a Windows Junction (mobile/src -> src)
// as created by scripts/create-shared-symlink.js

module.exports = config;
