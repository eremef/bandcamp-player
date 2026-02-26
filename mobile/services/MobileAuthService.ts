import * as SecureStore from 'expo-secure-store';
import { BandcampUser } from '@shared/types';

const COOKIE_KEY = 'bandcamp_cookies';
const USER_KEY = 'bandcamp_user';
const CREDENTIALS_KEY = 'bandcamp_credentials';

export interface MobileAuthState {
    isAuthenticated: boolean;
    user: BandcampUser | null;
}

export class MobileAuthService {
    private cookies: string = '';

    /**
     * Parse cookies from a raw cookie string (e.g. from document.cookie)
     */
    async setCookies(cookieString: string): Promise<void> {
        this.cookies = cookieString;
        await SecureStore.setItemAsync(COOKIE_KEY, cookieString);
    }

    async setUser(user: BandcampUser): Promise<void> {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    async loadCookies(): Promise<void> {
        try {
            const stored = await SecureStore.getItemAsync(COOKIE_KEY);
            if (stored) {
                this.cookies = stored;
            }
        } catch (e) {
            console.error('Failed to load cookies', e);
        }
    }

    async getCookies(): Promise<string> {
        if (!this.cookies) {
            await this.loadCookies();
        }
        return this.cookies;
    }

    async logout(): Promise<void> {
        this.cookies = '';
        await SecureStore.deleteItemAsync(COOKIE_KEY);
        try {
            await SecureStore.deleteItemAsync(USER_KEY);
        } catch {
            // ignore
        }
    }

    async saveCredentials(credentials: { username?: string, password?: string }): Promise<void> {
        try {
            await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
        } catch (e) {
            console.error('Failed to save credentials', e);
        }
    }

    async getCredentials(): Promise<{ username?: string, password?: string } | null> {
        try {
            const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    }

    async clearCredentials(): Promise<void> {
        try {
            await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
        } catch {
            // ignore
        }
    }

    async checkSession(): Promise<MobileAuthState> {
        const cookies = await this.getCookies();
        if (!cookies) {
            // console.log('[MobileAuth] No cookies found');
            return { isAuthenticated: false, user: null };
        }

        // Try to load user from storage first (more reliable)
        let user: BandcampUser | null = null;
        try {
            const storedUser = await SecureStore.getItemAsync(USER_KEY);
            if (storedUser) {
                user = JSON.parse(storedUser);
            }
        } catch (e) {
            console.warn('[MobileAuth] Failed to load user from storage', e);
        }

        // Fallback to cookie parsing if storage missing
        if (!user) {
            user = this.parseIdentityCookie(cookies);
        }

        return {
            isAuthenticated: !!user,
            user
        };
    }

    private parseIdentityCookie(cookieString: string): BandcampUser | null {
        try {
            // Find "identity" cookie
            const match = cookieString.match(/identity=([^;]+)/);
            if (!match) return null;

            const encodedValueDecoded = decodeURIComponent(match[1]);
            // The value is often double-URI-encoded or simple base64?
            // On desktop it's URL-decoded JSON.
            // Let's try simpler decode first.

            // Actually, usually it's just JSON.
            // Bandcamp often prefixes with "7%09" or "7\t" followed by a signature/hash and then the JSON.
            // Example: "7\t<Signature>\t{"id":...}"
            // We just need to find the start of the JSON object.

            let jsonStr = encodedValueDecoded; // Initialize jsonStr
            const jsonStartIndex = encodedValueDecoded.indexOf('{');
            if (jsonStartIndex !== -1) {
                jsonStr = encodedValueDecoded.substring(jsonStartIndex);
            } else {
                // Fallback attempt if no '{' found (weird format?)
                if (encodedValueDecoded.startsWith('7\t')) {
                    jsonStr = encodedValueDecoded.substring(2);
                } else if (encodedValueDecoded.startsWith('7%09')) {
                    jsonStr = decodeURIComponent(encodedValueDecoded.substring(4));
                }
            }

            // Sometimes it has surrounding quotes
            if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
                jsonStr = jsonStr.slice(1, -1);
            }

            const data = JSON.parse(jsonStr);

            return {
                id: data.id,
                username: data.username,
                displayName: data.name,
                profileUrl: data.url,
                avatarUrl: data.image_url || data.img, // Bandcamp uses slightly different keys sometimes
            };
        } catch (e) {
            console.warn('Failed to parse identity cookie', e);
            return null;
        }
    }
}

export const mobileAuthService = new MobileAuthService();
