import md5 from 'js-md5';
import { remoteConfigService } from '@shared/remote-config.service';
import { mobileDatabase } from './MobileDatabase';
import { useStore } from '../store';
import type { Track, LastfmState, LastfmUser } from '@shared/types';

// ============================================================================
// Mobile Last.fm Scrobbler Service (Standalone Mode)
// ============================================================================

const FALLBACK_API_KEY = '065ab52bc0f9e72ef6b6a4a811fe75c2';
const FALLBACK_API_SECRET = 'a1d38f1e6394dadab9b4954181507a3c';
const FALLBACK_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const FALLBACK_AUTH_URL = 'https://www.last.fm/api/auth';

class MobileScrobblerService {
    private sessionKey: string | null = null;
    private user: LastfmUser | null = null;

    // Scrobble tracking state
    private scrobbleStartTime: number | null = null;
    private hasScrobbled = false;
    private currentTrackId: string | null = null;

    // --- Config Access ---

    getApiKey(): string {
        return remoteConfigService.get().lastfm?.apiKey || FALLBACK_API_KEY;
    }

    private getApiSecret(): string {
        return remoteConfigService.get().lastfm?.apiSecret || FALLBACK_API_SECRET;
    }

    private getApiUrl(): string {
        return remoteConfigService.get().lastfm?.apiUrl || FALLBACK_API_URL;
    }

    getAuthUrl(): string {
        return remoteConfigService.get().lastfm?.authUrl || FALLBACK_AUTH_URL;
    }

    // --- Auth ---

    async loadSession(): Promise<void> {
        try {
            const settings = await mobileDatabase.getSettings();
            const key = settings.lastfmSessionKey as string | undefined;
            if (key) {
                this.sessionKey = key;
                await this.verifySession();
            }
        } catch (e) {
            console.error('[MobileScrobbler] Failed to load session:', e);
        }
    }

    async getSession(token: string): Promise<LastfmState> {
        const apiKey = this.getApiKey();
        const params: Record<string, string> = {
            api_key: apiKey,
            method: 'auth.getSession',
            token,
        };
        const sig = this.createSignature(params);

        const url = `${this.getApiUrl()}?method=auth.getSession&api_key=${apiKey}&token=${token}&api_sig=${sig}&format=json`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.session) {
            this.sessionKey = data.session.key;
            this.user = {
                name: data.session.name,
                url: `https://www.last.fm/user/${data.session.name}`,
            };

            await mobileDatabase.setSetting('lastfmSessionKey', this.sessionKey);
            return this.getState();
        }

        throw new Error(data.message || 'Failed to get session');
    }

    private async verifySession(): Promise<void> {
        if (!this.sessionKey) return;

        const apiKey = this.getApiKey();
        try {
            const params: Record<string, string> = {
                api_key: apiKey,
                method: 'user.getInfo',
                sk: this.sessionKey,
            };
            const sig = this.createSignature(params);

            const url = `${this.getApiUrl()}?method=user.getInfo&api_key=${apiKey}&sk=${this.sessionKey}&api_sig=${sig}&format=json`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.user) {
                this.user = {
                    name: data.user.name,
                    url: data.user.url,
                    imageUrl: data.user.image?.[1]?.['#text'],
                };
            } else {
                throw new Error('Invalid session');
            }
        } catch {
            this.sessionKey = null;
            this.user = null;
            await mobileDatabase.setSetting('lastfmSessionKey', null);
        }
    }

    async disconnect(): Promise<void> {
        this.sessionKey = null;
        this.user = null;
        await mobileDatabase.setSetting('lastfmSessionKey', null);
    }

    getState(): LastfmState {
        return {
            isConnected: this.sessionKey !== null && this.user !== null,
            user: this.user,
        };
    }

    // --- Scrobble Tracking ---

    handleProgressUpdate(position: number, duration: number): void {
        const store = useStore.getState();
        if (store.mode !== 'standalone' || !store.scrobblingEnabled) return;

        const track = store.currentTrack;
        if (!track) return;

        // Detect new track
        if (track.id !== this.currentTrackId) {
            this.currentTrackId = track.id;
            this.scrobbleStartTime = Date.now();
            this.hasScrobbled = false;
            this.updateNowPlaying(track);
            return;
        }

        // Check threshold: 50% or 4 minutes (whichever is less)
        if (!this.hasScrobbled && this.scrobbleStartTime && duration > 0) {
            const elapsed = (Date.now() - this.scrobbleStartTime) / 1000;
            const threshold = Math.min(duration * 0.5, 240);
            if (elapsed >= threshold) {
                this.scrobble(track);
                this.hasScrobbled = true;
            }
        }
    }

    // --- Scrobbling ---

    private async updateNowPlaying(track: Track): Promise<void> {
        if (!this.sessionKey) return;

        try {
            const params: Record<string, string> = {
                api_key: this.getApiKey(),
                method: 'track.updateNowPlaying',
                sk: this.sessionKey,
                artist: track.artist,
                track: track.title,
            };

            if (track.album) params.album = track.album;
            if (track.duration) params.duration = String(Math.floor(track.duration));

            const sig = this.createSignature(params);
            await this.postToLastfm({ ...params, api_sig: sig, format: 'json' });
        } catch (error) {
            console.error('[MobileScrobbler] Error updating now playing:', error);
        }
    }

    private async scrobble(track: Track): Promise<void> {
        const timestamp = Math.floor(Date.now() / 1000);

        if (!this.sessionKey) {
            await mobileDatabase.addScrobble(track.artist, track.title, track.album, track.duration, timestamp);
            return;
        }

        try {
            await this.submitScrobble(track.artist, track.title, track.album, track.duration, timestamp);
            await this.submitPendingScrobbles();
        } catch (error) {
            console.error('[MobileScrobbler] Error scrobbling:', error);
            await mobileDatabase.addScrobble(track.artist, track.title, track.album, track.duration, timestamp);
        }
    }

    private async submitScrobble(
        artist: string,
        track: string,
        album: string | undefined,
        duration: number | undefined,
        timestamp: number
    ): Promise<void> {
        const params: Record<string, string> = {
            api_key: this.getApiKey(),
            method: 'track.scrobble',
            sk: this.sessionKey!,
            'artist[0]': artist,
            'track[0]': track,
            'timestamp[0]': String(timestamp),
        };

        if (album) params['album[0]'] = album;
        if (duration) params['duration[0]'] = String(Math.floor(duration));

        const sig = this.createSignature(params);
        await this.postToLastfm({ ...params, api_sig: sig, format: 'json' });
    }

    private async submitPendingScrobbles(): Promise<void> {
        if (!this.sessionKey) return;

        const pending = await mobileDatabase.getPendingScrobbles();
        for (const scrobble of pending) {
            try {
                await this.submitScrobble(
                    scrobble.artist,
                    scrobble.track,
                    scrobble.album ?? undefined,
                    scrobble.duration ?? undefined,
                    scrobble.timestamp
                );
                await mobileDatabase.deleteScrobble(scrobble.id);
            } catch (error) {
                console.error('[MobileScrobbler] Error submitting queued scrobble:', error);
                break; // Stop on first error to avoid rate limiting
            }
        }
    }

    // --- Helpers ---

    private async postToLastfm(params: Record<string, string>): Promise<any> {
        const searchParams = new URLSearchParams(params);
        const response = await fetch(this.getApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: searchParams.toString(),
        });
        return response.json();
    }

    private createSignature(params: Record<string, string>): string {
        const keys = Object.keys(params).sort();
        let str = '';
        for (const key of keys) {
            str += key + params[key];
        }
        str += this.getApiSecret();
        return md5.md5(str);
    }
}

export const mobileScrobblerService = new MobileScrobblerService();
