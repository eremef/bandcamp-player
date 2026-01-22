import axios from 'axios';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { Database } from '../database/database';
import type { Track, LastfmState, LastfmUser } from '../../shared/types';

// ============================================================================
// Last.fm Scrobbler Service
// ============================================================================

// You need to register at https://www.last.fm/api/account/create
const LASTFM_API_KEY = 'YOUR_LASTFM_API_KEY';
const LASTFM_API_SECRET = 'YOUR_LASTFM_API_SECRET';
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
            const callbackUrl = 'http://localhost:41234/lastfm-callback';
            const authUrl = `${LASTFM_AUTH_URL}?api_key=${LASTFM_API_KEY}&cb=${encodeURIComponent(callbackUrl)}`;

            this.authWindow = new BrowserWindow({
                width: 500,
                height: 700,
                title: 'Connect to Last.fm',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
                autoHideMenuBar: true,
            });

            this.authWindow.loadURL(authUrl);

            // Watch for the callback URL
            this.authWindow.webContents.on('will-navigate', async (event, url) => {
                if (url.startsWith(callbackUrl)) {
                    event.preventDefault();
                    const urlParams = new URL(url).searchParams;
                    const token = urlParams.get('token');

                    if (token) {
                        try {
                            await this.getSession(token);
                            this.authWindow?.close();
                            resolve(this.getState());
                        } catch (error) {
                            console.error('Error getting session:', error);
                            resolve({ isConnected: false, user: null });
                        }
                    } else {
                        this.authWindow?.close();
                        resolve({ isConnected: false, user: null });
                    }
                }
            });

            this.authWindow.on('closed', () => {
                this.authWindow = null;
                resolve(this.getState());
            });
        });
    }

    /**
     * Exchange auth token for session key
     */
    private async getSession(token: string): Promise<void> {
        const sig = this.createSignature({
            api_key: LASTFM_API_KEY,
            method: 'auth.getSession',
            token,
        });

        const response = await axios.get(LASTFM_API_URL, {
            params: {
                method: 'auth.getSession',
                api_key: LASTFM_API_KEY,
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

        try {
            const sig = this.createSignature({
                api_key: LASTFM_API_KEY,
                method: 'user.getInfo',
                sk: this.sessionKey,
            });

            const response = await axios.get(LASTFM_API_URL, {
                params: {
                    method: 'user.getInfo',
                    api_key: LASTFM_API_KEY,
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
        } catch (error) {
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

        try {
            const params: Record<string, string> = {
                api_key: LASTFM_API_KEY,
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
        const params: Record<string, string> = {
            api_key: LASTFM_API_KEY,
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
        str += LASTFM_API_SECRET;

        // MD5 hash
        const crypto = require('crypto');
        return crypto.createHash('md5').update(str, 'utf8').digest('hex');
    }

    private emitStateChange(): void {
        this.emit('state-changed', this.getState());
    }
}
