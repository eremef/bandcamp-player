
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import LicenseScreen from '../../app/license';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// Mock Expo dependencies
jest.mock('expo-asset', () => ({
    Asset: {
        fromModule: jest.fn(),
    },
}));

jest.mock('expo-file-system', () => ({
    readAsStringAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
    router: {
        back: jest.fn(),
    },
}));

jest.mock('lucide-react-native', () => ({
    ArrowLeft: () => 'ArrowLeft',
}));

describe('LicenseScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('loads and displays license text', async () => {
        const mockLicenseText = 'MIT License Content';
        const mockAsset = {
            downloadAsync: jest.fn().mockResolvedValue(undefined),
            localUri: 'file://license.txt',
        };

        (Asset.fromModule as jest.Mock).mockReturnValue(mockAsset);
        (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockLicenseText);

        const { getByText } = render(<LicenseScreen />);

        await waitFor(() => {
            expect(getByText(mockLicenseText)).toBeTruthy();
        });

        expect(Asset.fromModule).toHaveBeenCalled();
        expect(mockAsset.downloadAsync).toHaveBeenCalled();
        expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://license.txt');
    });

    it('handles loading error gracefully', async () => {
        (Asset.fromModule as jest.Mock).mockImplementation(() => {
            throw new Error('Load failed');
        });

        const { getByText } = render(<LicenseScreen />);

        await waitFor(() => {
            expect(getByText('Failed to load license text.')).toBeTruthy();
        });
    });

    it('navigates back on arrow press', () => {
        const { router } = require('expo-router');
        const { getByTestId } = render(<LicenseScreen />);

        fireEvent.press(getByTestId('back-button'));
        expect(router.back).toHaveBeenCalled();
    });
});
