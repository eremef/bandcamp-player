import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BandcampLoginScreen from '../../app/bandcamp_login';
import { useStore } from '../../store';
import { mobileAuthService } from '../../services/MobileAuthService';
import CookieManager from '@react-native-cookies/cookies';

// Mock expo-router
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({
        replace: mockReplace,
        back: mockBack,
    })
}));

// Mock react-native-webview
jest.mock('react-native-webview', () => {
    const { View } = require('react-native');
    return {
        WebView: (props: any) => {
            // Render a View but attach the onMessage and props so they can be triggered in tests
            return <View testID="mock-webview" {...props} />;
        }
    };
});

jest.mock('../../services/MobileAuthService', () => ({
    mobileAuthService: {
        setCookies: jest.fn().mockResolvedValue(undefined),
        setUser: jest.fn().mockResolvedValue(undefined),
    }
}));

jest.mock('@react-native-cookies/cookies', () => ({
    get: jest.fn().mockResolvedValue({
        'session': { value: '123' },
        'identity': { value: 'abc' }
    })
}));

// Mock fetch for the native session check
global.fetch = jest.fn() as jest.Mock;

describe('BandcampLoginScreen', () => {
    let mockSetMode: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSetMode = jest.fn().mockResolvedValue(true);
        useStore.setState({
            setMode: mockSetMode,
            auth: { isAuthenticated: false, user: null }
        } as any);

        // Default fetch mock (failure)
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 401
        });
    });

    it('renders correctly and shows loading indicator initally', () => {
        const { getByText, UNSAFE_getByType } = render(<BandcampLoginScreen />);
        expect(getByText('Login to Bandcamp')).toBeTruthy();

        // It starts with isLoading = true
        expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });

    it('handles WebView onLoadEnd and checks native session', async () => {
        const { getByTestId, UNSAFE_queryByType } = render(<BandcampLoginScreen />);
        const webview = getByTestId('mock-webview');

        // Trigger onLoadEnd
        fireEvent(webview, 'onLoadEnd');

        // Wait for Native Session check to run (fetch)
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                'https://bandcamp.com/api/design_system/1/menubar',
                expect.any(Object)
            );
        });

        // Loading indicator should be removed
        expect(UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeNull();
    });

    it('navigates back when close button is pressed', () => {
        const { UNSAFE_getByType } = render(<BandcampLoginScreen />);

        const touchables = UNSAFE_getByType(require('react-native').TouchableOpacity);
        // First touchable is the close button
        fireEvent.press(touchables);

        expect(mockBack).toHaveBeenCalled();
    });

    it('handles successful native session authentication', async () => {
        const mockUser = {
            id: 42,
            username: 'test_user',
            name: 'Test Fan',
            url: 'https://bandcamp.com/test_user'
        };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce({ user: mockUser })
        });

        const { getByTestId } = render(<BandcampLoginScreen />);
        const webview = getByTestId('mock-webview');

        fireEvent(webview, 'onLoadEnd');

        await waitFor(() => {
            // Check if cookies were extracted
            expect(CookieManager.get).toHaveBeenCalledWith('https://bandcamp.com');
            expect(mobileAuthService.setCookies).toHaveBeenCalledWith('session=123; identity=abc');
            expect(mobileAuthService.setUser).toHaveBeenCalledWith(expect.objectContaining({
                id: 42,
                username: 'test_user'
            }));

            // Should be logged in and redirected
            const state = useStore.getState();
            expect(state.auth.isAuthenticated).toBe(true);
            expect(state.auth.user?.id).toBe(42);
            expect(mockSetMode).toHaveBeenCalledWith('standalone');
            expect(mockReplace).toHaveBeenCalledWith('/(tabs)/player');
        });
    });

    it('handles page_scrape fallback from WebView injected JS', async () => {
        const { getByTestId } = render(<BandcampLoginScreen />);
        const webview = getByTestId('mock-webview');

        // Simulate message from WebView
        const mockMessage = {
            nativeEvent: {
                data: JSON.stringify({
                    type: 'page_scrape',
                    data: {
                        foundId: '999',
                        foundUsername: 'scraped_user',
                        foundName: 'Scraped Fan'
                    },
                    cookies: 'scraped_cookie=123'
                })
            }
        };

        fireEvent(webview, 'onMessage', mockMessage);

        await waitFor(() => {
            expect(mobileAuthService.setCookies).toHaveBeenCalledWith('scraped_cookie=123');

            const state = useStore.getState();
            expect(state.auth.isAuthenticated).toBe(true);
            expect(state.auth.user?.id).toBe('999');
            expect(mockSetMode).toHaveBeenCalledWith('standalone');
            expect(mockReplace).toHaveBeenCalledWith('/(tabs)/player');
        });
    });
});
