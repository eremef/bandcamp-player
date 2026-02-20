import * as SecureStore from 'expo-secure-store';
import { MobileAuthService } from '../services/MobileAuthService';
import { BandcampUser } from '@shared/types';

jest.mock('expo-secure-store', () => ({
    setItemAsync: jest.fn(),
    getItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

describe('MobileAuthService', () => {
    let authService: MobileAuthService;
    const COOKIE_KEY = 'bandcamp_cookies';
    const USER_KEY = 'bandcamp_user';

    const mockUser: BandcampUser = {
        id: '12345',
        username: 'test_user',
        displayName: 'Test User',
        profileUrl: 'https://bandcamp.com/test_user',
    };

    beforeEach(() => {
        jest.resetAllMocks();
        authService = new MobileAuthService();
    });

    describe('setCookies', () => {
        it('should set cookies internally and in SecureStore', async () => {
            await authService.setCookies('test_cookie=value');
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(COOKIE_KEY, 'test_cookie=value');
            expect(await authService.getCookies()).toBe('test_cookie=value');
        });
    });

    describe('setUser', () => {
        it('should serialize and save user to SecureStore', async () => {
            await authService.setUser(mockUser);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(USER_KEY, JSON.stringify(mockUser));
        });
    });

    describe('loadCookies', () => {
        it('should load cookies from SecureStore', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('stored_cookie=1');
            await authService.loadCookies();
            expect(await authService.getCookies()).toBe('stored_cookie=1');
        });

        it('should handle SecureStore error gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Storage Error'));
            await authService.loadCookies();
            expect(consoleSpy).toHaveBeenCalledWith('Failed to load cookies', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('getCookies', () => {
        it('should load and return cookies if not loaded yet', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
                if (key === COOKIE_KEY) return Promise.resolve('lazy_cookie=val');
                return Promise.resolve(null);
            });
            const cookies = await authService.getCookies();
            expect(cookies).toBe('lazy_cookie=val');
        });
    });

    describe('logout', () => {
        it('should clear cookies and remove from SecureStore', async () => {
            await authService.setCookies('cookie_to_be_deleted=1');
            await authService.logout();
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(COOKIE_KEY);
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(USER_KEY);
            expect(await authService.getCookies()).toBe('');
        });

        it('should ignore errors when deleting user from SecureStore', async () => {
            (SecureStore.deleteItemAsync as jest.Mock).mockImplementation((key) => {
                if (key === USER_KEY) return Promise.reject(new Error('Ignore me'));
                return Promise.resolve();
            });
            await expect(authService.logout()).resolves.toBeUndefined();
        });
    });

    describe('checkSession', () => {
        it('should return not authenticated if no cookies', async () => {
            (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
            const status = await authService.checkSession();
            expect(status).toEqual({ isAuthenticated: false, user: null });
        });

        it('should load user from storage first if available', async () => {
            await authService.setCookies('dummy=1');
            (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
                if (key === USER_KEY) return Promise.resolve(JSON.stringify(mockUser));
                return Promise.resolve(null); // Return null for other keys if called
            });

            const status = await authService.checkSession();
            expect(status).toEqual({ isAuthenticated: true, user: mockUser });
        });

        it('should parse identity cookie if no user in storage', async () => {
            const jsonStr = JSON.stringify({
                id: '67890',
                username: 'parsed_user',
                name: 'Parsed User',
                url: 'https://parsed.com'
            });
            const cookieStr = `dummy=1; identity=${encodeURIComponent('7\t' + jsonStr)}`;
            await authService.setCookies(cookieStr);

            (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
                return Promise.resolve(null);
            });

            const status = await authService.checkSession();
            expect(status.isAuthenticated).toBe(true);
            expect(status.user).toMatchObject({
                id: '67890',
                username: 'parsed_user',
                displayName: 'Parsed User',
                profileUrl: 'https://parsed.com'
            });
        });

        it('should resolve parsing if cookie matches just a JSON', async () => {
            const jsonStr = JSON.stringify({
                id: '111',
                username: 'plain_json',
                name: 'Plain',
                url: 'https://plain.com'
            });
            const cookieStr = `identity=${encodeURIComponent(jsonStr)}`;
            await authService.setCookies(cookieStr);

            (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
                return Promise.resolve(null);
            });

            const status = await authService.checkSession();
            expect(status.isAuthenticated).toBe(true);
            expect(status.user?.id).toBe('111');
        });

        it('should handle unparseable identity cookie gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const cookieStr = `identity=NotAJsonAtAll`;
            await authService.setCookies(cookieStr);

            (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
                return Promise.resolve(null);
            });

            const status = await authService.checkSession();
            expect(status.isAuthenticated).toBe(false);
            expect(status.user).toBeNull();
            consoleSpy.mockRestore();
        });
    });
});
