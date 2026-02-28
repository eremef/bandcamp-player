
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AboutScreen from '../../app/about';
import { Linking } from 'react-native';

// Mock Expo Constants
jest.mock('expo-constants', () => ({
    expoConfig: {
        version: '1.0.0-test',
    },
}));

// Mock Expo Router
jest.mock('expo-router', () => ({
    router: {
        back: jest.fn(),
        push: jest.fn(),
    },
}));

// Mock Lucide Icons
jest.mock('lucide-react-native', () => ({
    Github: () => 'Github',
    ArrowLeft: () => 'ArrowLeft',
}));

describe('AboutScreen', () => {
    it('renders correctly', () => {
        const { getByText } = render(<AboutScreen />);
        expect(getByText('Beta Player')).toBeTruthy();
        expect(getByText(/Version 1\.0\.0-test/)).toBeTruthy();
        expect(getByText('View on GitHub')).toBeTruthy();
    });

    it('opens github link on press', () => {
        const spy = jest.spyOn(Linking, 'openURL');
        const { getByText } = render(<AboutScreen />);

        fireEvent.press(getByText('View on GitHub'));
        expect(spy).toHaveBeenCalledWith('https://github.com/eremef/Bandcamp-player');
    });

    it('opens website link on copyright press', () => {
        const spy = jest.spyOn(Linking, 'openURL');
        const { getByText } = render(<AboutScreen />);

        // Find copyright text which initiates website open
        // The copyright text is dynamic with year, so we check for presence mostly
        // But for press event we need the element
        const copyrightElement = getByText(/eremef.xyz/);
        fireEvent.press(copyrightElement);
        expect(spy).toHaveBeenCalledWith('https://eremef.xyz');
    });

    it('navigates to license screen', () => {
        const { getByText } = render(<AboutScreen />);

        fireEvent.press(getByText('Licensed under the MIT License.'));
        const { router } = jest.requireMock('expo-router');
        expect(router.push).toHaveBeenCalledWith('/license');
    });

    it('navigates back on arrow press', () => {
        const { getByTestId } = render(<AboutScreen />);

        fireEvent.press(getByTestId('back-button'));
        const { router } = jest.requireMock('expo-router');
        expect(router.back).toHaveBeenCalled();
    });
});
