import md5 from 'js-md5';
import { remoteConfigService } from '@shared/remote-config.service';
import type { LastfmUser } from '@shared/types';

const FALLBACK_API_KEY = '065ab52bc0f9e72ef6b6a4a811fe75c2';
const FALLBACK_API_SECRET = 'a1d38f1e6394dadab9b4954181507a3c';
const FALLBACK_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const FALLBACK_AUTH_URL = 'https://www.last.fm/api/auth';
const REQUEST_TIMEOUT_MS = 15_000;

export interface LastfmApiConfig {
    apiKey: string;
    apiSecret: string;
    apiUrl: string;
    authUrl: string;
}

export type LastfmErrorKind = 'transport' | 'timeout' | 'session' | 'configuration' | 'rate-limit' | 'request';

export class LastfmApiError extends Error {
    constructor(
        message: string,
        public readonly kind: LastfmErrorKind,
        public readonly code?: number,
        public readonly retryable = false,
        public readonly retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'LastfmApiError';
    }
}

export interface LastfmScrobbleInput {
    playId: string;
    artist: string;
    track: string;
    album?: string;
    duration?: number;
    timestamp: number;
}

export interface LastfmScrobbleOutcome {
    playId: string;
    accepted: boolean;
    ignoredCode?: number;
    ignoredMessage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

export function getLastfmApiConfig(): LastfmApiConfig {
    const config = remoteConfigService.get().lastfm;
    return {
        apiKey: config?.apiKey || FALLBACK_API_KEY,
        apiSecret: config?.apiSecret || FALLBACK_API_SECRET,
        apiUrl: config?.apiUrl || FALLBACK_API_URL,
        authUrl: config?.authUrl || FALLBACK_AUTH_URL,
    };
}

export function createLastfmAccountId(apiKey: string, username: string): string {
    return `${apiKey}:${username.trim().toLocaleLowerCase()}`;
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return undefined;
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function classifyApiError(code: number | undefined, message: string, retryAfterSeconds?: number): LastfmApiError {
    if (code === 9) return new LastfmApiError(message, 'session', code);
    if (code === 10 || code === 13 || code === 26) return new LastfmApiError(message, 'configuration', code);
    if (code === 29) return new LastfmApiError(message, 'rate-limit', code, true, retryAfterSeconds);
    if (code === 11 || code === 16) return new LastfmApiError(message, 'transport', code, true);
    return new LastfmApiError(message, 'request', code);
}

export class LastfmApiClient {
    constructor(private readonly config: LastfmApiConfig) {}

    get apiKey(): string {
        return this.config.apiKey;
    }

    get authUrl(): string {
        return this.config.authUrl;
    }

    async exchangeToken(token: string): Promise<{ sessionKey: string; user: LastfmUser }> {
        const data = await this.request({
            api_key: this.config.apiKey,
            method: 'auth.getSession',
            token,
        }, 'GET');
        const session = isRecord(data.session) ? data.session : null;
        const sessionKey = session ? asString(session.key) : undefined;
        const username = session ? asString(session.name) : undefined;
        if (!sessionKey || !username) {
            throw new LastfmApiError('Last.fm returned an invalid session response.', 'request');
        }
        return {
            sessionKey,
            user: {
                name: username,
                url: `https://www.last.fm/user/${encodeURIComponent(username)}`,
            },
        };
    }

    async getAuthenticatedUser(sessionKey: string): Promise<LastfmUser> {
        const data = await this.request({
            api_key: this.config.apiKey,
            method: 'user.getInfo',
            sk: sessionKey,
        }, 'GET');
        if (!isRecord(data.user)) {
            throw new LastfmApiError('Last.fm returned an invalid user response.', 'request');
        }
        const user = data.user;
        const name = asString(user.name);
        if (!name) throw new LastfmApiError('Last.fm returned an invalid user response.', 'request');
        let imageUrl: string | undefined;
        if (Array.isArray(user.image) && isRecord(user.image[1])) {
            imageUrl = asString(user.image[1]['#text']);
        }
        return {
            name,
            url: asString(user.url) || `https://www.last.fm/user/${encodeURIComponent(name)}`,
            imageUrl,
        };
    }

    async updateNowPlaying(sessionKey: string, input: Omit<LastfmScrobbleInput, 'playId' | 'timestamp'>): Promise<void> {
        const params: Record<string, string> = {
            api_key: this.config.apiKey,
            method: 'track.updateNowPlaying',
            sk: sessionKey,
            artist: input.artist,
            track: input.track,
        };
        if (input.album) params.album = input.album;
        if (input.duration) params.duration = String(Math.floor(input.duration));
        await this.request(params, 'POST');
    }

    async scrobble(sessionKey: string, inputs: LastfmScrobbleInput[]): Promise<LastfmScrobbleOutcome[]> {
        const params: Record<string, string> = {
            api_key: this.config.apiKey,
            method: 'track.scrobble',
            sk: sessionKey,
        };
        inputs.forEach((input, index) => {
            params[`artist[${index}]`] = input.artist;
            params[`track[${index}]`] = input.track;
            params[`timestamp[${index}]`] = String(input.timestamp);
            if (input.album) params[`album[${index}]`] = input.album;
            if (input.duration) params[`duration[${index}]`] = String(Math.floor(input.duration));
        });
        const data = await this.request(params, 'POST');
        const scrobbles = isRecord(data.scrobbles) ? data.scrobbles : null;
        const rawItems = scrobbles?.scrobble;
        const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
        if (items.length !== inputs.length) {
            throw new LastfmApiError('Last.fm returned an incomplete scrobble response.', 'request');
        }
        return inputs.map((input, index) => {
            const item = isRecord(items[index]) ? items[index] : {};
            const ignored = isRecord(item.ignoredMessage) ? item.ignoredMessage : {};
            const ignoredCode = asNumber(ignored.code) ?? 0;
            return {
                playId: input.playId,
                accepted: ignoredCode === 0,
                ignoredCode: ignoredCode || undefined,
                ignoredMessage: asString(ignored['#text']),
            };
        });
    }

    private createSignature(params: Record<string, string>): string {
        const source = Object.keys(params)
            .filter(key => key !== 'format' && key !== 'callback')
            .sort()
            .map(key => key + params[key])
            .join('');
        return md5.md5(source + this.config.apiSecret);
    }

    private async request(params: Record<string, string>, method: 'GET' | 'POST'): Promise<Record<string, unknown>> {
        const signed = { ...params, api_sig: this.createSignature(params), format: 'json' };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const query = new URLSearchParams(signed);
            const response = await fetch(method === 'GET' ? `${this.config.apiUrl}?${query.toString()}` : this.config.apiUrl, {
                method,
                headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
                body: method === 'POST' ? query.toString() : undefined,
                signal: controller.signal,
            });
            let data: unknown;
            const retryAfterSeconds = parseRetryAfter(response.headers?.get?.('Retry-After') ?? null);
            try {
                data = await response.json();
            } catch {
                throw new LastfmApiError(`Last.fm returned an unreadable response (${response.status}).`, 'transport', response.status, response.status >= 500);
            }
            if (isRecord(data) && data.error !== undefined) {
                const code = asNumber(data.error);
                throw classifyApiError(code, asString(data.message) || 'Last.fm rejected the request.', retryAfterSeconds);
            }
            if (!response.ok) {
                throw new LastfmApiError(
                    `Last.fm request failed (${response.status}).`,
                    response.status === 429 ? 'rate-limit' : 'transport',
                    response.status,
                    response.status === 429 || response.status >= 500,
                    retryAfterSeconds,
                );
            }
            if (!isRecord(data)) {
                throw new LastfmApiError('Last.fm returned an invalid response.', 'request');
            }
            return data;
        } catch (error: unknown) {
            if (error instanceof LastfmApiError) throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new LastfmApiError('Last.fm request timed out.', 'timeout', undefined, true);
            }
            throw new LastfmApiError(error instanceof Error ? error.message : 'Last.fm network request failed.', 'transport', undefined, true);
        } finally {
            clearTimeout(timeout);
        }
    }
}
