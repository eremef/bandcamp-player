import axios from 'axios';
import * as crypto from 'crypto';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { Database } from '../database/database';
import type { Track, LastfmState, LastfmUser } from '../../shared/types';

// ============================================================================
// Last.fm Scrobbler Service
// ============================================================================

// You need to register at https://www.last.fm/api/account/create
const FALLBACK_API_KEY = 'YOUR_LASTFM_API_KEY';
const FALLBACK_API_SECRET = 'YOUR_LASTFM_API_SECRET';
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_AUTH_URL = 'https://www.last.fm/api/auth';

export class ScrobblerService extends EventEmitter {
    private database: Database;
    private sessionKey: string | null = null;
    private user: LastfmUser | null = null;
    private authWindow: BrowserWindow | null = null;

    constructor(database: Database) {
        super();
        this.database = database;
        this.loadSession();
    }

    private getApiKey(): string {
        const settings = this.database.getSettings();
        return settings?.lastfmApiKey || FALLBACK_API_KEY;
    }

    private getApiSecret(): string {
        const settings = this.database.getSettings();
        return settings?.lastfmApiSecret || FALLBACK_API_SECRET;
    }

    /**
     * Load session from database
     */
    private loadSession(): void {
        const settings = this.database.getSettings();
        if (settings?.lastfmSessionKey) {
            this.sessionKey = settings.lastfmSessionKey;
            // Verify session is still valid
            this.verifySession().catch(() => {
                this.sessionKey = null;
                this.user = null;
            });
        }
    }

    /**
     * Start Last.fm authentication flow
     */
    async connect(): Promise<LastfmState> {
        return new Promise((resolve) => {
            if (this.authWindow && !this.authWindow.isDestroyed()) {
                this.authWindow.close();
            }

            // Get auth token
            const apiKey = this.getApiKey();
            const callbackUrl = 'http://localhost:41234/lastfm-callback';
            const authUrl = `${LASTFM_AUTH_URL}?api_key=${apiKey}&cb=${encodeURIComponent(callbackUrl)}`;

            const authWindow = new BrowserWindow({
                width: 500,
                height: 700,
                title: 'Connect to Last.fm',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: `persist:lastfm-auth-${Date.now()}`,
                },
                autoHideMenuBar: true,
            });
            this.authWindow = authWindow;

            let isProcessing = false;

            const handleCallback = async (url: string) => {
                if (isProcessing) return true;
                if (url.startsWith(callbackUrl)) {
                    isProcessing = true;
                    console.log(`[ScrobblerService] Found callback URL: ${url}`);
                    const urlParams = new URL(url).searchParams;
                    const token = urlParams.get('token');

                    if (token) {
                        console.log(`[ScrobblerService] Token extracted: ${token}`);
                        try {
                            await this.getSession(token);
                            console.log('[ScrobblerService] Session obtained successfully');
                        } catch (error) {
                            console.error('[ScrobblerService] Error getting session:', error);
                        }
                    } else {
                        console.warn('[ScrobblerService] No token found in callback URL');
                    }

                    // Safe cleanup - remove interceptors before closing
                    try {
                        if (!authWindow.isDestroyed()) {
                            authWindow.webContents.session.webRequest.onBeforeRequest({ urls: [] }, () => { });
                            authWindow.close();
                        }
                    } catch (e) {
                        console.error('[ScrobblerService] Error during callback cleanup:', e);
                    }

                    resolve(this.getState());
                    return true;
                }
                return false;
            };

            // Intercept the callback URL before it even hits the network stack
            const filter = { urls: [callbackUrl + '*'] };

            authWindow.webContents.session.webRequest.onBeforeRequest(
                filter,
                (details, callback) => {
                    if (details.url.startsWith(callbackUrl)) {
                        console.log(`[ScrobblerService] Callback intercepted in webRequest: ${details.url}`);
                        handleCallback(details.url);
                        callback({ cancel: true });
                    } else {
                        callback({ cancel: false });
                    }
                }
            );

            // Fallback: Catch navigation events directly
            authWindow.webContents.on('will-navigate', (event, url) => {
                if (url.startsWith(callbackUrl)) {
                    console.log(`[ScrobblerService] will-navigate intercepted callback: ${url}`);
                    event.preventDefault();
                    handleCallback(url);
                }
            });

            authWindow.webContents.on('will-redirect', (event, url) => {
                if (url.startsWith(callbackUrl)) {
                    console.log(`[ScrobblerService] will-redirect intercepted callback: ${url}`);
                    event.preventDefault();
                    handleCallback(url);
                }
            });

            authWindow.webContents.on('did-start-navigation', (event, url) => {
                if (url.startsWith(callbackUrl)) {
                    console.log(`[ScrobblerService] did-start-navigation intercepted callback: ${url}`);
                    handleCallback(url);
                }
            });

            console.log(`[ScrobblerService] Opening auth URL: ${authUrl}`);
            authWindow.loadURL(authUrl).catch(err => {
                if (!authWindow.isDestroyed()) {
                    console.error(`[ScrobblerService] Failed to load URL: ${err.message}`);
                }
            });

            authWindow.on('closed', () => {
                // Final cleanup - remove interceptors from the session just in case
                try {
                    if (!authWindow.isDestroyed()) {
                        authWindow.webContents.session.webRequest.onBeforeRequest({ urls: [] }, () => { });
                    }
                } catch (e) {
                    // Ignore errors during cleanup
                }
                this.authWindow = null;
                isProcessing = true; // Stop any further processing
                resolve(this.getState());
            });
        });
    }

    /**
     * Exchange auth token for session key
     */
    private async getSession(token: string): Promise<void> {
        const apiKey = this.getApiKey();
        const sig = this.createSignature({
            api_key: apiKey,
            method: 'auth.getSession',
            token,
        });

        const response = await axios.get(LASTFM_API_URL, {
            params: {
                method: 'auth.getSession',
                api_key: apiKey,
                token,
                api_sig: sig,
                format: 'json',
            },
        });

        if (response.data.session) {
            this.sessionKey = response.data.session.key;
            this.user = {
                name: response.data.session.name,
                url: `https://www.last.fm/user/${response.data.session.name}`,
            };

            // Save to database
            this.database.setSettings({ lastfmSessionKey: this.sessionKey ?? undefined });
            this.emitStateChange();
        } else {
            throw new Error('Failed to get session');
        }
    }

    /**
     * Verify current session is valid
     */
    private async verifySession(): Promise<void> {
        if (!this.sessionKey) return;

        const apiKey = this.getApiKey();
        try {
            const sig = this.createSignature({
                api_key: apiKey,
                method: 'user.getInfo',
                sk: this.sessionKey,
            });

            const response = await axios.get(LASTFM_API_URL, {
                params: {
                    method: 'user.getInfo',
                    api_key: apiKey,
                    sk: this.sessionKey,
                    api_sig: sig,
                    format: 'json',
                },
            });

            if (response.data.user) {
                this.user = {
                    name: response.data.user.name,
                    url: response.data.user.url,
                    imageUrl: response.data.user.image?.[1]?.['#text'],
                };
            }
        } catch {
            this.sessionKey = null;
            this.user = null;
            this.database.setSettings({ lastfmSessionKey: undefined });
        }
    }

    /**
     * Disconnect from Last.fm
     */
    disconnect(): void {
        this.sessionKey = null;
        this.user = null;
        this.database.setSettings({ lastfmSessionKey: undefined });
        this.emitStateChange();
    }

    /**
     * Get current state
     */
    getState(): LastfmState {
        return {
            isConnected: this.sessionKey !== null && this.user !== null,
            user: this.user,
        };
    }

    /**
     * Update "Now Playing" on Last.fm
     */
    async updateNowPlaying(track: Track): Promise<void> {
        const settings = this.database.getSettings();
        if (!this.sessionKey || !settings?.scrobblingEnabled) return;

        const apiKey = this.getApiKey();
        try {
            const params: Record<string, string> = {
                api_key: apiKey,
                method: 'track.updateNowPlaying',
                sk: this.sessionKey,
                artist: track.artist,
                track: track.title,
            };

            if (track.album) {
                params.album = track.album;
            }

            if (track.duration) {
                params.duration = String(Math.floor(track.duration));
            }

            const sig = this.createSignature(params);

            await axios.post(LASTFM_API_URL, null, {
                params: {
                    ...params,
                    api_sig: sig,
                    format: 'json',
                },
            });
        } catch (error) {
            console.error('Error updating now playing:', error);
        }
    }

    /**
     * Scrobble a track
     */
    async scrobble(track: Track): Promise<void> {
        const settings = this.database.getSettings();
        if (!settings?.scrobblingEnabled) return;

        const timestamp = Math.floor(Date.now() / 1000);

        // If not connected, queue for later
        if (!this.sessionKey) {
            this.database.addScrobble(track.artist, track.title, track.album, track.duration, timestamp);
            return;
        }

        try {
            await this.submitScrobble(track.artist, track.title, track.album, track.duration, timestamp);

            // Also submit any pending scrobbles
            await this.submitPendingScrobbles();
        } catch (error) {
            console.error('Error scrobbling:', error);
            // Queue for later
            this.database.addScrobble(track.artist, track.title, track.album, track.duration, timestamp);
        }
    }

    /**
     * Submit a scrobble to Last.fm
     */
    private async submitScrobble(
        artist: string,
        track: string,
        album: string | undefined,
        duration: number | undefined,
        timestamp: number
    ): Promise<void> {
        const apiKey = this.getApiKey();
        const params: Record<string, string> = {
            api_key: apiKey,
            method: 'track.scrobble',
            sk: this.sessionKey!,
            'artist[0]': artist,
            'track[0]': track,
            'timestamp[0]': String(timestamp),
        };

        if (album) {
            params['album[0]'] = album;
        }

        if (duration) {
            params['duration[0]'] = String(Math.floor(duration));
        }

        const sig = this.createSignature(params);

        await axios.post(LASTFM_API_URL, null, {
            params: {
                ...params,
                api_sig: sig,
                format: 'json',
            },
        });
    }

    /**
     * Submit pending scrobbles from queue
     */
    private async submitPendingScrobbles(): Promise<void> {
        if (!this.sessionKey) return;

        const pending = this.database.getPendingScrobbles();
        for (const scrobble of pending) {
            try {
                await this.submitScrobble(
                    scrobble.artist,
                    scrobble.track,
                    scrobble.album ?? undefined,
                    scrobble.duration ?? undefined,
                    scrobble.timestamp
                );
                this.database.deleteScrobble(scrobble.id);
            } catch (error) {
                console.error('Error submitting queued scrobble:', error);
                break; // Stop on first error to avoid rate limiting
            }
        }
    }

    /**
     * Create API signature for Last.fm
     */
    private createSignature(params: Record<string, string>): string {
        const keys = Object.keys(params).sort();
        let str = '';
        for (const key of keys) {
            str += key + params[key];
        }
        str += this.getApiSecret();

        // MD5 hash
        return crypto.createHash('md5').update(str, 'utf8').digest('hex');
    }

    private emitStateChange(): void {
        this.emit('state-changed', this.getState());
    }
}
