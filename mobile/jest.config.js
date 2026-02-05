module.exports = {
    preset: 'react-native',
    setupFilesAfterEnv: ['./jest.setup.js'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(?!-)|@expo(?!-)|native-base|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native|expo-modules-core|expo-router|expo-linking|expo-constants|expo-status-bar|expo-file-system|expo-asset|expo-network)'
    ],
    collectCoverage: true,
    collectCoverageFrom: [
        '**/*.{ts,tsx}',
        '!**/coverage/**',
        '!**/node_modules/**',
        '!**/babel.config.js',
        '!**/jest.setup.js'
    ],
    moduleNameMapper: {
        '^@shared/types$': '<rootDir>/__mocks__/shared-types.ts',
        '\\.(png|jpg|jpeg|gif|webp|svg|txt)$': '<rootDir>/__mocks__/fileMock.js'
    }
};
