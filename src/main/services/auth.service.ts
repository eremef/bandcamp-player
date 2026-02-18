import { Session, BrowserWindow, net } from 'electron';
import type { AuthState, BandcampUser } from '../../shared/types';

// ============================================================================
// Authentication Service
// ============================================================================

const BANDCAMP_LOGIN_URL = 'https://bandcamp.com/login';
const BANDCAMP_DOMAIN = 'bandcamp.com';
const ALLOWED_BANDCAMP_COOKIE_DOMAINS = ['bandcamp.com', '.bandcamp.com'];

export class AuthService {
    private session: Session;
    private currentUser: BandcampUser | null = null;
    private loginWindow: BrowserWindow | null = null;

    constructor(session: Session) {
        this.session = session;
    }

    /**
     * Check if user is currently authenticated with Bandcamp
     */
    async checkSession(): Promise<AuthState> {
        try {
            const cookies = await this.session.cookies.get({});
            const hasSession = cookies.some(c =>
                (c.name === 'identity' || c.name === 'session') &&
                ALLOWED_BANDCAMP_COOKIE_DOMAINS.includes(c.domain ?? '')
            );

            if (hasSession && !this.currentUser) {
                // Fetch user info from cookies or by making a request
                this.currentUser = await this.fetchUserFromSession();
            }

            return {
                isAuthenticated: hasSession && this.currentUser !== null,
                user: this.currentUser,
            };
        } catch (error) {
            console.error('Error checking session:', error);
            return { isAuthenticated: false, user: null };
        }
    }

    /**
     * Open login window for Bandcamp authentication
     */
    async login(): Promise<AuthState> {
        console.log('AuthService.login called. E2E_TEST:', process.env.E2E_TEST);
        if (process.env.E2E_TEST === 'true') {
            console.log('Performing mock login for E2E test');
            this.currentUser = {
                id: 'test-user',
                username: 'testuser',
                displayName: 'Test User',
                avatarUrl: 'https://placehold.co/100x100',
                profileUrl: 'https://bandcamp.com/testuser'
            };
            return { isAuthenticated: true, user: this.currentUser };
        }

        return new Promise((resolve) => {
            // Close existing login window if any
            if (this.loginWindow && !this.loginWindow.isDestroyed()) {
                this.loginWindow.close();
            }

            this.loginWindow = new BrowserWindow({
                width: 500,
                height: 700,
                title: 'Login to Bandcamp',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    session: this.session,
                },
                autoHideMenuBar: true,
            });

            this.loginWindow.loadURL(BANDCAMP_LOGIN_URL);

            // Watch for navigation to detect successful login
            this.loginWindow.webContents.on('did-navigate', async (_, url) => {
                console.log(`Login window navigated to: ${url}`);

                let isBandcamp = false;
                let isLogin = false;
                try {
                    const parsedUrl = new URL(url);
                    // Check if hostname is bandcamp.com or a subdomain
                    const hostname = parsedUrl.hostname;
                    isBandcamp = hostname === 'bandcamp.com' || hostname.endsWith('.bandcamp.com');
                    isLogin = parsedUrl.pathname === '/login';
                } catch (e) {
                    console.error('Error parsing navigation URL:', e);
                }

                // Check if we're redirected to the main page or fan page (successful login)
                if (isBandcamp && !isLogin) {
                    // Give cookies a moment to settle
                    for (let i = 0; i < 3; i++) {
                        console.log(`Checking session (attempt ${i + 1})...`);
                        const authState = await this.checkSession();
                        if (authState.isAuthenticated) {
                            console.log('Login successful, closing window');
                            this.loginWindow?.close();
                            resolve(authState);
                            return;
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            });

            // Handle window close without successful login
            this.loginWindow.on('closed', async () => {
                this.loginWindow = null;
                const authState = await this.checkSession();
                resolve(authState);
            });
        });
    }

    /**
     * Logout - clear Bandcamp cookies
     */
    async logout(): Promise<void> {
        try {
            const cookies = await this.session.cookies.get({ domain: BANDCAMP_DOMAIN });
            for (const cookie of cookies) {
                const url = `https://${cookie.domain?.replace(/^\./, '') || BANDCAMP_DOMAIN}${cookie.path || '/'}`;
                await this.session.cookies.remove(url, cookie.name);
            }
            this.currentUser = null;
        } catch (error) {
            console.error('Error during logout:', error);
            throw error;
        }
    }

    /**
     * Get current user
     */
    getUser(): AuthState {
        return {
            isAuthenticated: this.currentUser !== null,
            user: this.currentUser,
        };
    }

    /**
     * Fetch user information from session/cookies
     */
    private async fetchUserFromSession(): Promise<BandcampUser | null> {
        try {
            const cookies = await this.session.cookies.get({});
            const identityCookie = cookies.find(c => c.name === 'identity' && ALLOWED_BANDCAMP_COOKIE_DOMAINS.includes(c.domain ?? ''));

            if (!identityCookie) {
                console.log('No identity cookie found in fetchUserFromSession');
                return null;
            }

            // Parse identity cookie to extract user info
            const identityValue = decodeURIComponent(identityCookie.value);

            // Try to extract fan_id from identity cookie JSON
            try {
                // Bandcamp identity cookie value sometimes has extra characters or is just a partial JSON
                let jsonValue = identityValue;
                if (!jsonValue.trim().startsWith('{')) {
                    const jsonMatch = jsonValue.match(/(\{.*\})/);
                    if (jsonMatch) jsonValue = jsonMatch[1];
                }

                console.log(`Attempting to parse JSON: ${jsonValue}`);
                const identity = JSON.parse(jsonValue);
                if (identity.fan_id || identity.id) {
                    const fanId = String(identity.fan_id || identity.id);

                    // We prioritize Menubar API over cookie data for correctness

                    // Otherwise, we need to fetch info from the profile page
                    return await this.fetchProfileFromId(fanId);
                }
            } catch {
                // Cookie might not be JSON, extract differently
                const fanIdMatch = identityValue.match(/fan_id[":]+(\d+)/);
                const usernameMatch = identityValue.match(/username[":]+([^",}]+)/);

                if (fanIdMatch) {
                    const fanId = fanIdMatch[1];
                    const username = usernameMatch ? usernameMatch[1] : `fan${fanId}`;
                    return {
                        id: fanId,
                        username,
                        profileUrl: `https://bandcamp.com/${username}`,
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('Error fetching user from session:', error);
            return null;
        }
    }

    /**
     * Fetch profile info by hitting the main bandcamp page
     * This is needed because the identity cookie often only has the fan_id
     */
    private async fetchProfileFromId(fanId: string): Promise<BandcampUser | null> {
        try {
            console.log('Fetching profile info from Bandcamp menubar API...');
            const cookies = await this.getSessionCookies();

            // const { net } = require('electron');
            return new Promise((resolve) => {
                const request = net.request({
                    method: 'POST',
                    url: 'https://bandcamp.com/api/design_system/1/menubar',
                    session: this.session
                });

                request.setHeader('Content-Type', 'application/json; charset=UTF-8');
                request.setHeader('Accept', '*/*');
                request.setHeader('Cookie', cookies);
                request.setHeader('Referer', 'https://bandcamp.com/');
                request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                request.on('response', (response: any) => {
                    let body = '';
                    response.on('data', (chunk: any) => body += chunk);
                    response.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            console.log('Menubar API response received');

                            // The menubar API returns 'user' for artists and 'fan' for fan accounts
                            const user = data.user || data.fan;

                            if (user && user.username) {
                                console.log(`Found user in menubar API: ${user.username}`);

                                // Construct avatar URL. If it's a fan object, it might only have imageId
                                let avatarUrl = user.photo_url || user.image_url || user.image;
                                if (!avatarUrl && user.imageId) {
                                    avatarUrl = `https://f4.bcbits.com/img/00${user.imageId}_10.jpg`;
                                }

                                resolve({
                                    id: String(user.id || user.fan_id || fanId),
                                    username: user.username,
                                    displayName: user.name,
                                    avatarUrl: avatarUrl,
                                    profileUrl: `https://bandcamp.com/${user.username}`
                                });
                                return;
                            }

                            console.log('User info not found in menubar API response keys:', Object.keys(data));
                            console.log('Full menubar API response for debugging:', body);
                        } catch (e) {
                            console.error('Error parsing menubar API response:', e);
                            console.log('Response body snippet:', body.substring(0, 500));
                        }

                        // Fallback to minimal info if we can't find anything
                        resolve({
                            id: fanId,
                            username: `fan${fanId}`,
                            profileUrl: `https://bandcamp.com/fan${fanId}`
                        });
                    });
                });

                request.on('error', (err: any) => {
                    console.error('Error calling menubar API:', err);
                    resolve({
                        id: fanId,
                        username: `fan${fanId}`,
                        profileUrl: `https://bandcamp.com/fan${fanId}`
                    });
                });

                request.write('{}');
                request.end();
            });
        } catch (error) {
            console.error('Error in fetchProfileFromId:', error);
            return {
                id: fanId,
                username: `fan${fanId}`,
                profileUrl: `https://bandcamp.com/fan${fanId}`
            };
        }
    }

    /**
     * Get session cookies for requests
     */
    async getSessionCookies(): Promise<string> {
        const cookies = await this.session.cookies.get({});
        return cookies
            .filter(c => ALLOWED_BANDCAMP_COOKIE_DOMAINS.includes(c.domain ?? ''))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');
    }
}
