import * as Network from 'expo-network';
import type { EventSubscription } from 'expo-modules-core';
import type { LastfmState, LastfmUser, Track } from '@shared/types';
import { mobileDatabase } from './MobileDatabase';
import {
    createLastfmAccountId,
    getLastfmApiConfig,
    LastfmApiClient,
    LastfmApiError,
    type LastfmApiConfig,
} from './lastfm-api-client';
import { lastfmSessionStorage } from './lastfm-session-storage';
import { useStore } from '../store';

interface AuthenticationAttempt {
    id: number;
    client: LastfmApiClient;
    config: LastfmApiConfig;
}

interface PendingSession {
    attemptId?: number;
    client: LastfmApiClient;
    config: LastfmApiConfig;
    sessionKey: string;
    user: LastfmUser;
}

interface ActivePlay {
    playId: string;
    mediaId: string;
    track: Track;
    duration: number;
    startedAt: number;
    listenedSeconds: number;
    lastPosition: number;
    lastSampleAt: number;
    enqueued: boolean;
    enqueueing: boolean;
}

function createPlayId(trackId: string): string {
    return `${Date.now()}-${trackId}-${Math.random().toString(36).slice(2)}`;
}

export class MobileScrobblerService {
    private sessionKey: string | null = null;
    private user: LastfmUser | null = null;
    private config: LastfmApiConfig = getLastfmApiConfig();
    private client = new LastfmApiClient(this.config);
    private sessionStatus: NonNullable<LastfmState['sessionStatus']> = 'disconnected';
    private deliveryStatus: NonNullable<LastfmState['deliveryStatus']> = 'idle';
    private pendingCount = 0;
    private legacyPendingCount = 0;
    private lastAcceptedAt: number | undefined;
    private lastError: string | undefined;
    private generation = 0;
    private authenticationAttempt: AuthenticationAttempt | null = null;
    private pendingSession: PendingSession | null = null;
    private authenticationCounter = 0;
    private initializationPromise: Promise<void> | null = null;
    private lifecycleTail: Promise<void> = Promise.resolve();
    private flushPromise: Promise<void> | null = null;
    private networkSubscription: EventSubscription | null = null;
    private activePlay: ActivePlay | null = null;
    private lastTransition: { signature: string; at: number } | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;

    getApiKey(): string {
        return this.config.apiKey;
    }

    getAuthUrl(): string {
        return this.config.authUrl;
    }

    createAuthenticationUrl(callbackUrl: string): { attemptId: number; url: string } {
        const config = getLastfmApiConfig();
        const attemptId = ++this.authenticationCounter;
        this.pendingSession = null;
        this.authenticationAttempt = { id: attemptId, client: new LastfmApiClient(config), config };
        const url = `${config.authUrl}?api_key=${encodeURIComponent(config.apiKey)}&cb=${encodeURIComponent(callbackUrl)}`;
        return { attemptId, url };
    }

    cancelAuthentication(attemptId: number): void {
        if (this.authenticationAttempt?.id === attemptId) this.authenticationAttempt = null;
        if (this.pendingSession?.attemptId === attemptId) this.pendingSession = null;
    }

    hasPendingSession(attemptId: number): boolean {
        return this.pendingSession?.attemptId === attemptId;
    }

    async loadSession(): Promise<void> {
        if (this.initializationPromise) return this.initializationPromise;
        this.initializationPromise = this.initialize();
        return this.initializationPromise;
    }

    private async initialize(): Promise<void> {
        this.config = getLastfmApiConfig();
        this.client = new LastfmApiClient(this.config);
        this.sessionStatus = 'loading';
        this.publishState();
        this.registerNetworkListener();
        try {
            const record = await lastfmSessionStorage.load(this.config.apiKey);
            if (!record) {
                this.sessionStatus = 'disconnected';
                await this.refreshPendingCount();
                return;
            }
            this.sessionKey = record.sessionKey;
            this.user = record.user ?? null;
            if (record.apiKey !== this.config.apiKey) {
                this.sessionStatus = 'reconnect-required';
                this.deliveryStatus = 'configuration-error';
                this.lastError = 'The Last.fm application credentials changed. Reconnect your account.';
                this.publishState();
                return;
            }
            const generation = ++this.generation;
            this.sessionStatus = 'connected';
            this.publishState();
            await this.refreshPendingCount();
            void this.verifySession(generation);
            void this.flushPendingScrobbles();
        } catch (error: unknown) {
            this.sessionStatus = 'storage-error';
            this.lastError = error instanceof Error ? error.message : 'Could not load the saved Last.fm session.';
            this.publishState();
        }
    }

    async getSession(token: string, attemptId?: number): Promise<LastfmState> {
        const directConfig = getLastfmApiConfig();
        const attempt = attemptId === undefined
            ? { id: ++this.authenticationCounter, client: new LastfmApiClient(directConfig), config: directConfig }
            : this.authenticationAttempt;
        if (!attempt || (attemptId !== undefined && attempt.id !== attemptId)) {
            throw new Error('This Last.fm login attempt is no longer active.');
        }
        const result = await attempt.client.exchangeToken(token);
        const pending: PendingSession = {
            attemptId,
            client: attempt.client,
            config: attempt.config,
            sessionKey: result.sessionKey,
            user: result.user,
        };
        this.pendingSession = pending;
        await this.persistPendingSession(pending);
        await this.activateConnectedSession();
        return this.getState();
    }

    async retryPendingSession(attemptId: number): Promise<LastfmState> {
        const pending = this.pendingSession;
        if (!pending || pending.attemptId !== attemptId) {
            throw new Error('There is no Last.fm session waiting to be saved.');
        }
        await this.persistPendingSession(pending);
        await this.activateConnectedSession();
        return this.getState();
    }

    private async persistPendingSession(pending: PendingSession): Promise<void> {
        await this.serializeLifecycle(async () => {
            if (pending.attemptId !== undefined && this.authenticationAttempt?.id !== pending.attemptId) {
                throw new Error('This Last.fm login attempt was cancelled.');
            }
            const config = getLastfmApiConfig();
            if (config.apiKey !== pending.config.apiKey
                || config.apiSecret !== pending.config.apiSecret
                || config.apiUrl !== pending.config.apiUrl
                || config.authUrl !== pending.config.authUrl) {
                throw new Error('Last.fm configuration changed during login. Please try again.');
            }
            await lastfmSessionStorage.save({
                version: 1,
                sessionKey: pending.sessionKey,
                apiKey: config.apiKey,
                savedAt: Date.now(),
                user: pending.user,
            });
            this.config = config;
            this.client = pending.client;
            this.sessionKey = pending.sessionKey;
            this.user = pending.user;
            this.sessionStatus = 'connected';
            this.deliveryStatus = 'idle';
            this.lastError = undefined;
            this.generation++;
            this.authenticationAttempt = null;
            if (this.pendingSession === pending) this.pendingSession = null;
            this.publishState();
        });
    }

    private async activateConnectedSession(): Promise<void> {
        try {
            await this.refreshPendingCount();
        } catch (error: unknown) {
            this.applyLocalDeliveryError(error);
        }
        await this.activateCurrentPlayback();
        void this.flushPendingScrobbles();
    }

    private async verifySession(generation: number): Promise<void> {
        const sessionKey = this.sessionKey;
        const client = this.client;
        if (!sessionKey) return;
        try {
            const user = await client.getAuthenticatedUser(sessionKey);
            await this.serializeLifecycle(async () => {
                if (generation !== this.generation || sessionKey !== this.sessionKey) return;
                await lastfmSessionStorage.save({
                    version: 1,
                    sessionKey,
                    apiKey: client.apiKey,
                    savedAt: Date.now(),
                    user,
                });
                if (generation !== this.generation || sessionKey !== this.sessionKey) return;
                this.user = user;
                this.sessionStatus = 'connected';
                this.deliveryStatus = 'idle';
                this.lastError = undefined;
                this.publishState();
            });
            if (generation !== this.generation || sessionKey !== this.sessionKey) return;
            await this.refreshPendingCount();
            void this.flushPendingScrobbles();
        } catch (error: unknown) {
            if (generation !== this.generation || sessionKey !== this.sessionKey) return;
            this.applyApiError(error);
        }
    }

    async disconnect(): Promise<void> {
        await this.serializeLifecycle(async () => {
            const accountId = this.getAccountId();
            this.generation++;
            this.authenticationAttempt = null;
            this.pendingSession = null;
            let cleanupError: unknown;
            try {
                await lastfmSessionStorage.clear();
                if (accountId) await mobileDatabase.clearScrobblesForAccount(accountId);
            } catch (error: unknown) {
                cleanupError = error;
            }
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
            this.sessionKey = null;
            this.user = null;
            this.sessionStatus = cleanupError ? 'storage-error' : 'disconnected';
            this.deliveryStatus = 'idle';
            this.pendingCount = 0;
            this.lastError = cleanupError instanceof Error ? cleanupError.message : undefined;
            this.activePlay = null;
            this.publishState();
        });
    }

    getState(): LastfmState {
        return {
            isConnected: this.sessionStatus === 'connected' && this.sessionKey !== null,
            user: this.user,
            sessionStatus: this.sessionStatus,
            deliveryStatus: this.deliveryStatus,
            pendingCount: this.pendingCount,
            legacyPendingCount: this.legacyPendingCount,
            lastAcceptedAt: this.lastAcceptedAt,
            lastError: this.lastError,
        };
    }

    async handleProgressUpdate(position: number, duration: number, mediaId?: string): Promise<void> {
        const store = useStore.getState();
        if (store.mode !== 'standalone' || !store.scrobblingEnabled || !store.isPlaying || !this.canSubmit()) {
            if (this.activePlay) {
                this.activePlay.lastPosition = position;
                this.activePlay.lastSampleAt = Date.now();
            }
            return;
        }
        const track = this.resolveTrack(mediaId);
        if (!track) return;
        const resolvedMediaId = mediaId || track.id;
        const resolvedDuration = duration > 0 ? duration : track.duration;
        if (!this.activePlay || this.activePlay.mediaId !== resolvedMediaId || this.activePlay.track.id !== track.id) {
            await this.startPlay(track, resolvedMediaId, position, resolvedDuration);
            return;
        }

        const now = Date.now();
        const positionDelta = position - this.activePlay.lastPosition;
        const elapsed = Math.max(0, (now - this.activePlay.lastSampleAt) / 1000);
        const plausibleDelta = Math.max(3, elapsed + 2);
        if (positionDelta > 0 && positionDelta <= plausibleDelta) {
            this.activePlay.listenedSeconds += Math.min(positionDelta, plausibleDelta);
        }
        this.activePlay.lastPosition = position;
        this.activePlay.lastSampleAt = now;
        if (resolvedDuration > 0) this.activePlay.duration = resolvedDuration;

        const threshold = Math.min(this.activePlay.duration * 0.5, 240);
        if (this.activePlay.duration > 30
            && this.activePlay.listenedSeconds >= threshold
            && !this.activePlay.enqueued
            && !this.activePlay.enqueueing) {
            await this.enqueueActivePlay(this.activePlay);
        }
    }

    async handleTrackTransition(mediaId?: string, index?: number): Promise<void> {
        const store = useStore.getState();
        if (store.mode !== 'standalone' || !store.scrobblingEnabled || !this.canSubmit()) {
            this.activePlay = null;
            return;
        }
        const item = typeof index === 'number' ? store.queue.items[index] : undefined;
        const track = item?.track || this.resolveTrack(mediaId);
        if (!track) return;
        const now = Date.now();
        const signature = `${mediaId || item?.id || track.id}:${index ?? ''}`;
        if (this.lastTransition?.signature === signature && now - this.lastTransition.at < 500) return;
        this.lastTransition = { signature, at: now };
        await this.startPlay(track, mediaId || item?.id || track.id, 0, track.duration);
    }

    async handleScrobblingPreferenceChanged(enabled: boolean): Promise<void> {
        if (!enabled) {
            this.activePlay = null;
            return;
        }
        await this.activateCurrentPlayback();
        void this.flushPendingScrobbles();
    }

    async handleModeChanged(mode: 'remote' | 'standalone'): Promise<void> {
        if (mode !== 'standalone') {
            this.activePlay = null;
            return;
        }
        await this.activateCurrentPlayback();
        void this.flushPendingScrobbles();
    }

    async handleAppForeground(): Promise<void> {
        if (this.sessionKey && this.sessionStatus === 'connected') {
            void this.verifySession(this.generation);
            void this.flushPendingScrobbles();
        }
    }

    async flushPendingScrobbles(): Promise<void> {
        if (this.flushPromise) return this.flushPromise;
        if (!this.canSubmit() || !useStore.getState().scrobblingEnabled) return;
        this.flushPromise = this.drainQueue()
            .catch((error: unknown) => this.applyLocalDeliveryError(error))
            .finally(() => {
                this.flushPromise = null;
            });
        return this.flushPromise;
    }

    async assignLegacyScrobblesToCurrentAccount(): Promise<void> {
        const accountId = this.getAccountId();
        if (!accountId) {
            this.applyLocalDeliveryError(new Error('Connect a Last.fm account before assigning legacy scrobbles.'));
            return;
        }
        try {
            await mobileDatabase.assignLegacyScrobbles(accountId);
            await this.refreshPendingCount();
            void this.flushPendingScrobbles();
        } catch (error: unknown) {
            this.applyLocalDeliveryError(error);
        }
    }

    async discardLegacyScrobbles(): Promise<void> {
        try {
            await mobileDatabase.discardLegacyScrobbles();
            await this.refreshPendingCount();
        } catch (error: unknown) {
            this.applyLocalDeliveryError(error);
        }
    }

    private async drainQueue(): Promise<void> {
        const accountId = this.getAccountId();
        const sessionKey = this.sessionKey;
        const generation = this.generation;
        if (!accountId || !sessionKey) return;
        const rows = await mobileDatabase.claimPendingScrobbles(accountId, Math.floor(Date.now() / 1000));
        if (rows.length === 0) {
            await this.refreshPendingCount();
            await this.scheduleNextRetry(accountId);
            return;
        }
        this.deliveryStatus = 'sending';
        this.publishState();
        try {
            const outcomes = await this.client.scrobble(sessionKey, rows.map(row => ({
                playId: row.play_id,
                artist: row.artist,
                track: row.track,
                album: row.album ?? undefined,
                duration: row.duration ?? undefined,
                timestamp: row.timestamp,
            })));
            if (generation !== this.generation || sessionKey !== this.sessionKey) {
                await mobileDatabase.releaseScrobbles(rows.map(row => row.id), Math.floor(Date.now() / 1000) + 60, 'stale-session');
                return;
            }
            const rowsByPlayId = new Map(rows.map(row => [row.play_id, row]));
            for (const outcome of outcomes) {
                const row = rowsByPlayId.get(outcome.playId);
                if (!row) continue;
                if (outcome.accepted) {
                    await mobileDatabase.acknowledgeScrobble(row.id);
                    this.lastAcceptedAt = Date.now();
                } else if (outcome.ignoredCode === 5) {
                    await mobileDatabase.releaseScrobbles([row.id], Math.floor(Date.now() / 1000) + 24 * 60 * 60, 'ignored:5');
                } else if (outcome.ignoredCode === 4) {
                    await mobileDatabase.releaseScrobbles([row.id], Math.floor(Date.now() / 1000) + 10 * 60, 'ignored:4');
                } else {
                    await mobileDatabase.markScrobbleIgnored(row.id, outcome.ignoredCode ?? -1, outcome.ignoredMessage);
                }
            }
            this.deliveryStatus = 'idle';
            this.lastError = undefined;
        } catch (error: unknown) {
            const maxAttempts = Math.max(...rows.map(row => row.attempt_count + 1));
            const retryDelay = error instanceof LastfmApiError && error.retryAfterSeconds !== undefined
                ? Math.max(1, error.retryAfterSeconds)
                : Math.min(60 * 60, 30 * 2 ** Math.min(maxAttempts, 6)) + Math.floor(Math.random() * 15);
            await mobileDatabase.releaseScrobbles(
                rows.map(row => row.id),
                Math.floor(Date.now() / 1000) + retryDelay,
                error instanceof LastfmApiError && error.code !== undefined ? String(error.code) : 'network'
            );
            this.applyApiError(error);
        } finally {
            await this.refreshPendingCount();
            await this.scheduleNextRetry(accountId);
            this.publishState();
        }
    }

    private async activateCurrentPlayback(): Promise<void> {
        const store = useStore.getState();
        if (store.mode !== 'standalone' || !store.scrobblingEnabled || !store.isPlaying || !store.currentTrack || !this.canSubmit()) return;
        const item = store.queue.items[store.queue.currentIndex];
        await this.startPlay(
            store.currentTrack,
            item?.id || store.currentTrack.id,
            store.currentTime,
            store.duration || store.currentTrack.duration,
        );
    }

    private async startPlay(track: Track, mediaId: string, position: number, duration: number): Promise<void> {
        this.activePlay = {
            playId: createPlayId(track.id),
            mediaId,
            track,
            duration: duration > 0 ? duration : track.duration,
            startedAt: Math.floor(Date.now() / 1000),
            listenedSeconds: 0,
            lastPosition: Math.max(0, position),
            lastSampleAt: Date.now(),
            enqueued: false,
            enqueueing: false,
        };
        void this.updateNowPlaying(track);
    }

    private async updateNowPlaying(track: Track): Promise<void> {
        const sessionKey = this.sessionKey;
        const generation = this.generation;
        if (!sessionKey || !this.canSubmit()) return;
        try {
            await this.client.updateNowPlaying(sessionKey, {
                artist: track.artist,
                track: track.title,
                album: track.album,
                duration: track.duration,
            });
        } catch (error: unknown) {
            if (generation === this.generation && sessionKey === this.sessionKey) this.applyApiError(error);
        }
    }

    private async enqueueActivePlay(play: ActivePlay): Promise<void> {
        const accountId = this.getAccountId();
        if (!accountId || play !== this.activePlay) return;
        play.enqueueing = true;
        try {
            await mobileDatabase.enqueueScrobble({
                playId: play.playId,
                accountId,
                artist: play.track.artist,
                track: play.track.title,
                album: play.track.album,
                duration: play.duration,
                timestamp: play.startedAt,
            });
            play.enqueued = true;
            await this.refreshPendingCount();
            void this.flushPendingScrobbles();
        } finally {
            play.enqueueing = false;
        }
    }

    private resolveTrack(mediaId?: string): Track | null {
        const store = useStore.getState();
        if (mediaId) {
            const item = store.queue.items.find(queueItem => queueItem.id === mediaId || queueItem.track.id === mediaId);
            if (item) return item.track;
        }
        return store.currentTrack;
    }

    private canSubmit(): boolean {
        return this.sessionStatus === 'connected' && this.sessionKey !== null && this.user !== null;
    }

    private getAccountId(): string | null {
        return this.user ? createLastfmAccountId(this.config.apiKey, this.user.name) : null;
    }

    private async refreshPendingCount(): Promise<void> {
        const accountId = this.getAccountId();
        const [pendingCount, legacyPendingCount] = await Promise.all([
            accountId ? mobileDatabase.countPendingScrobbles(accountId) : Promise.resolve(0),
            mobileDatabase.countLegacyScrobbles(),
        ]);
        this.pendingCount = pendingCount;
        this.legacyPendingCount = legacyPendingCount;
        this.publishState();
    }

    private applyApiError(error: unknown): void {
        this.lastError = error instanceof Error ? error.message : 'Last.fm request failed.';
        if (error instanceof LastfmApiError) {
            if (error.kind === 'session') {
                this.sessionStatus = 'reconnect-required';
                this.deliveryStatus = 'idle';
            } else if (error.kind === 'configuration') {
                this.deliveryStatus = 'configuration-error';
            } else if (error.retryable) {
                this.deliveryStatus = error.kind === 'transport' || error.kind === 'timeout' ? 'offline' : 'retrying';
            } else {
                this.deliveryStatus = 'retrying';
            }
        } else {
            this.deliveryStatus = 'offline';
        }
        this.publishState();
    }

    private applyLocalDeliveryError(error: unknown): void {
        this.deliveryStatus = 'retrying';
        this.lastError = error instanceof Error ? error.message : 'Could not update the Last.fm queue.';
        this.publishState();
    }

    private registerNetworkListener(): void {
        if (this.networkSubscription) return;
        this.networkSubscription = Network.addNetworkStateListener(state => {
            if (state.isConnected && state.isInternetReachable !== false) void this.flushPendingScrobbles();
        });
    }

    private async scheduleNextRetry(accountId: string): Promise<void> {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        const retryAt = await mobileDatabase.getNextScrobbleRetryAt(accountId);
        if (retryAt === null) return;
        const delay = Math.max(1_000, Math.min(2_147_000_000, retryAt * 1000 - Date.now()));
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.flushPendingScrobbles();
        }, delay);
    }

    private publishState(): void {
        useStore.setState({ lastfmState: this.getState() });
    }

    private async serializeLifecycle<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.lifecycleTail;
        let release: () => void = () => undefined;
        this.lifecycleTail = new Promise<void>(resolve => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

export const mobileScrobblerService = new MobileScrobblerService();
