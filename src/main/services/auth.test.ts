import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { Session, BrowserWindow, net } from 'electron';

// Mock Electron modules
const mockLoadURL = vi.fn();
const mockWebContentsOn = vi.fn();
const mockClose = vi.fn();
const mockOn = vi.fn();

const mockBrowserWindowInstance = {
    loadURL: mockLoadURL,
    close: mockClose,
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { on: mockWebContentsOn },
    on: mockOn,
};

const mockNetRequest = {
    setHeader: vi.fn(),
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
};

vi.mock('electron', () => {
    const MockBrowserWindow = vi.fn(function () {
        return mockBrowserWindowInstance;
    });
    return {
        BrowserWindow: MockBrowserWindow,
        net: {
            request: vi.fn(() => mockNetRequest),
        },
    };
});

describe('AuthService', () => {
    let authService: AuthService;
    let mockSession: any;

    beforeEach(() => {
        mockSession = {
            cookies: {
                get: vi.fn().mockResolvedValue([]),
                remove: vi.fn().mockResolvedValue(undefined),
            },
        };
        authService = new AuthService(mockSession as unknown as Session);
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        // Reset E2E_TEST status
        delete process.env.E2E_TEST;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('checkSession', () => {
        it('should return unauthenticated if no bandcamp cookies', async () => {
            mockSession.cookies.get.mockResolvedValue([]);
            const result = await authService.checkSession();
            expect(result.isAuthenticated).toBe(false);
            expect(result.user).toBeNull();
        });

        it('should return authenticated and fetch profile if identity cookie exists', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 123, "username": "testuser"}') }
            ]);

            const mockResponse = {
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        callback(Buffer.from(JSON.stringify({
                            fan: {
                                fan_id: 123,
                                username: 'testuser',
                                name: 'Test User',
                                imageId: '12345'
                            }
                        })));
                    }
                    if (event === 'end') callback();
                }),
            };

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'response') callback(mockResponse);
            });

            const result = await authService.checkSession();

            expect(result.isAuthenticated).toBe(true);
            expect(result.user).toEqual({
                id: '123',
                username: 'testuser',
                displayName: 'Test User',
                avatarUrl: 'https://f4.bcbits.com/img/0012345_10.jpg',
                profileUrl: 'https://bandcamp.com/testuser'
            });
        });

        it('should handle missing photo_url but existing imageId', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 123, "username": "testuser"}') }
            ]);

            const mockResponse = {
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        callback(Buffer.from(JSON.stringify({
                            user: {
                                id: 123,
                                username: 'testuser',
                                name: 'Test User',
                                imageId: '54321'
                            }
                        })));
                    }
                    if (event === 'end') callback();
                }),
            };

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'response') callback(mockResponse);
            });

            const result = await authService.checkSession();
            expect(result.user?.avatarUrl).toBe('https://f4.bcbits.com/img/0054321_10.jpg');
        });

        it('should fallback to minimal info if profile fetch has JSON parse error', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 123}') }
            ]);

            const mockResponse = {
                on: vi.fn((event, callback) => {
                    if (event === 'data') callback(Buffer.from('Invalid JSON'));
                    if (event === 'end') callback();
                }),
            };

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'response') callback(mockResponse);
            });

            const result = await authService.checkSession();
            expect(result.isAuthenticated).toBe(true);
            expect(result.user?.username).toBe('fan123');
        });

        it('should fallback to minimal info if network request throws error', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 123}') }
            ]);

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'error') callback(new Error('Network error'));
            });

            const result = await authService.checkSession();
            expect(result.user?.username).toBe('fan123');
        });

        it('should fallback to regex parsing if cookie is not JSON', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('fakecookie "fan_id":999, "username":"regexuser"') }
            ]);

            const result = await authService.checkSession();
            expect(result.isAuthenticated).toBe(true);
            expect(result.user?.id).toBe('999');
            expect(result.user?.username).toBe('regexuser');
        });

        it('should return null user if session fetch throws unexpected errors', async () => {
            mockSession.cookies.get.mockRejectedValueOnce(new Error('Cookie Error'));
            const result = await authService.checkSession();
            expect(result.isAuthenticated).toBe(false);
            expect(result.user).toBeNull();
        });
    });

    describe('login', () => {
        it('should return mock user if E2E_TEST is true', async () => {
            process.env.E2E_TEST = 'true';
            const result = await authService.login();
            expect(result.isAuthenticated).toBe(true);
            expect(result.user!.id).toBe('test-user');
            expect(BrowserWindow).not.toHaveBeenCalled();
        });

        it('should open login window with Bandcamp URL and handle close', async () => {
            const loginPromise = authService.login();

            // Wait a tick for handlers to attach
            await new Promise(r => setTimeout(r, 0));

            const closeHandler = mockOn.mock.calls.find(c => c[0] === 'closed')![1];

            // Setup session check to return false
            mockSession.cookies.get.mockResolvedValue([]);

            closeHandler(); // Simulate window close

            const result = await loginPromise;
            expect(result.isAuthenticated).toBe(false);
            expect(mockLoadURL).toHaveBeenCalledWith('https://bandcamp.com/login');
        });

        it('should handle did-navigate and resolve on success', async () => {
            const loginPromise = authService.login();

            await new Promise(r => setTimeout(r, 0));

            const navigateHandler = mockWebContentsOn.mock.calls.find(c => c[0] === 'did-navigate')![1];

            // Setup session check to return true after navigation
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 1}') }
            ]);

            // Simulate nav to bandcamp homepage (success login)
            navigateHandler(null, 'https://bandcamp.com/');

            const result = await loginPromise;
            expect(result.isAuthenticated).toBe(true);
            expect(mockClose).toHaveBeenCalled();
        });
    });

    describe('logout', () => {
        it('should clear all bandcamp cookies', async () => {
            const mockCookies = [
                { name: 'identity', domain: '.bandcamp.com', path: '/' },
                { name: 'session', domain: '.bandcamp.com', path: '/' },
            ];
            mockSession.cookies.get.mockResolvedValue(mockCookies);

            await authService.logout();
            expect(mockSession.cookies.remove).toHaveBeenCalledTimes(2);
        });

        it('should throw error if session.cookies fails', async () => {
            mockSession.cookies.get.mockRejectedValue(new Error('Logout fail'));
            await expect(authService.logout()).rejects.toThrow('Logout fail');
        });
    });

    describe('getUser', () => {
        it('should return current auth state', () => {
            const result = authService.getUser();
            expect(result).toEqual({ isAuthenticated: false, user: null });
        });
    });

    describe('getSessionCookies', () => {
        it('should format cookies for HTTP header', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: 'abc' },
                { name: 'session', domain: '.bandcamp.com', value: 'xyz' },
            ]);

            const result = await authService.getSessionCookies();
            expect(result).toBe('identity=abc; session=xyz');
        });
    });
});
