const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force resolve specific packages to local node_modules to avoid hoisting issues
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'react-native-safe-area-context': path.resolve(projectRoot, 'node_modules/react-native-safe-area-context'),
    'cheerio': path.resolve(projectRoot, 'node_modules/cheerio'),
};

// 4. Handle txt and hash files
if (!config.resolver.assetExts.includes('txt')) {
    config.resolver.assetExts.push('txt');
}
if (!config.resolver.assetExts.includes('hash')) {
    config.resolver.assetExts.push('hash');
}

// 5. BlockList to prevent resolving root cheerio
const rootCheerioPath = path.resolve(workspaceRoot, 'node_modules', 'cheerio');
// Escape backslashes for Regex
const escapedRootCheerioPath = rootCheerioPath.replace(/\\/g, '\\\\');

// Helper to get flags from existing blockList
const getFlags = (blockList) => {
    if (blockList instanceof RegExp) {
        return blockList.flags;
    }
    if (Array.isArray(blockList) && blockList.length > 0 && blockList[0] instanceof RegExp) {
        return blockList[0].flags;
    }
    return ''; // Default to no flags (or 'i' if on Windows usually?)
};

const existingBlockList = config.resolver.blockList;
const flags = getFlags(existingBlockList);

// Create new regex with matching flags
const newBlockRegex = new RegExp(`^${escapedRootCheerioPath}.*`, flags);

if (existingBlockList) {
    if (Array.isArray(existingBlockList)) {
        config.resolver.blockList = [...existingBlockList, newBlockRegex];
    } else {
        config.resolver.blockList = [existingBlockList, newBlockRegex];
    }
} else {
    config.resolver.blockList = [newBlockRegex];
}

module.exports = config;
