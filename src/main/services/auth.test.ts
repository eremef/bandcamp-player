import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { Session, BrowserWindow, net } from 'electron';

// Mock Electron modules
const mockLoadURL = vi.fn();
const mockWebContentsOn = vi.fn();
const mockBrowserWindowInstance = {
    loadURL: mockLoadURL,
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { on: mockWebContentsOn },
    on: vi.fn(),
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

            // Setup mock for net.request to simulate successful profile fetch
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
                    if (event === 'end') {
                        callback();
                    }
                }),
            };

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'response') {
                    callback(mockResponse);
                }
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

        it('should fallback to minimal info if profile fetch fails', async () => {
            mockSession.cookies.get.mockResolvedValue([
                { name: 'identity', domain: '.bandcamp.com', value: encodeURIComponent('{"fan_id": 123}') }
            ]);

            mockNetRequest.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    callback(new Error('Network error'));
                }
            });

            const result = await authService.checkSession();
            
            expect(result.isAuthenticated).toBe(true);
            expect(result.user?.id).toBe('123');
            expect(result.user?.username).toBe('fan123');
        });
    });

    describe('login', () => {
        it('should open login window with Bandcamp URL', () => {
            authService.login();
            expect(BrowserWindow).toHaveBeenCalled();
            expect(mockLoadURL).toHaveBeenCalledWith('https://bandcamp.com/login');
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
