import { EventEmitter } from 'events';
import { powerSaveBlocker } from 'electron';

import type { Track, QueueItem, RepeatMode, PlayerState, RadioStation, RadioState } from '../../shared/types';
import { CacheService } from './cache.service';
import { ScrobblerService } from './scrobbler.service';
import { ScraperService } from './scraper.service';
import { CastService } from './cast.service';
import { Database } from '../database/database';
import * as path from 'path';

// ============================================================================
// Player Service
// ============================================================================

export class PlayerService extends EventEmitter {
    private cacheService: CacheService;
    private scrobblerService: ScrobblerService;
    private scraperService: ScraperService;
    private castService: CastService;
    private database: Database;

    // Player state
    private isPlaying = false;
    private currentTrack: Track | null = null;
    private currentTime = 0;
    private duration = 0;
    private volume = 0.8;
    private isMuted = false;
    private repeatMode: RepeatMode = 'off';
    private isShuffled = false;
    private isCasting = false;
    private error: string | null = null;

    // Queue state
    private queue: QueueItem[] = [];

    private currentIndex = -1;
    private shuffleOrder: number[] = [];
    private queueVersion = 0;
    private actionVersion = 0;
    private playbackConfirmationSequence = 0;
    private playbackConfirmationId = '0';
    private localPlaybackStatuses = new Map<string, { trackId: string; isPlaying: boolean; position: number; failed: boolean }>();
    private localPlaybackWaiters = new Set<{
        trackId: string;
        confirmationId: string;
        expectedPlaying: boolean;
        resolve: (success: boolean) => void;
        timeout: ReturnType<typeof setTimeout>;
    }>();

    // Scrobble tracking
    private scrobbleStartTime: number | null = null;
    private hasScrobbled = false;

    // Radio state
    private isRadioActive = false;
    private currentStation: RadioStation | null = null;

    // Persistence
    private saveVolumeTimeout: ReturnType<typeof setTimeout> | null = null;
    private persistQueueTimeout: ReturnType<typeof setTimeout> | null = null;

    // Power save
    private powerSaveBlockerId: number | null = null;

    constructor(cacheService: CacheService, scrobblerService: ScrobblerService, scraperService: ScraperService, castService: CastService, database: Database) {
        super();
        this.cacheService = cacheService;
        this.scrobblerService = scrobblerService;
        this.scraperService = scraperService;
        this.castService = castService;
        this.database = database;

        // Initialize volume and queue from settings
        const settings = this.database.getSettings();
        if (settings) {
            this.volume = settings.defaultVolume;
            if (settings.savedQueue) {
                this.queue = settings.savedQueue.items || [];
                this.currentIndex = settings.savedQueue.currentIndex ?? -1;
                this.shuffleOrder = settings.savedQueue.shuffleOrder || [];
                if (this.shuffleOrder.length > 0) {
                    this.isShuffled = true;
                }
                
                // Restore current track if valid
                if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
                    this.currentTrack = this.queue[this.currentIndex].track;
                }
            }
        }

        this.setupCastListeners();
    }

    private setupCastListeners() {
        this.castService.on('status-changed', (data) => {
            const wasCasting = this.isCasting;
            this.isCasting = data.status === 'connected';

            if (this.isCasting !== wasCasting) {
                this.markAction();
                console.log(`[PlayerService] Casting status changed: ${this.isCasting}`);
                if (this.isCasting && this.isPlaying && this.currentTrack) {
                    // Switch to casting
                    // Refresh URL to ensure it hasn't expired
                    this.scraperService.getTrackStreamUrl(this.currentTrack).then(url => {
                        if (this.currentTrack) {
                            this.currentTrack.streamUrl = url;
                            this.castService.play(this.currentTrack!, this.currentTime);
                        }
                    }).catch(err => {
                        console.error('[PlayerService] Failed to refresh URL for casting:', err);
                        // Try playing anyway
                        if (this.currentTrack) {
                            this.castService.play(this.currentTrack, this.currentTime);
                        }
                    });

                    // We might want to pause local playback to save resources/bandwidth
                    this.emit('seek-command', this.currentTime); // Just to sync local if needed
                }
                this.emitStateChange();
            }
        });

        this.castService.on('finished', () => {
            if (this.isCasting) {
                this.handleTrackEnd();
            }
        });

        this.castService.on('device-status', (status) => {
            if (this.isCasting && status?.currentTime !== undefined) {
                // Synchronize time from cast device
                const duration = status.duration !== undefined ? status.duration : this.duration;
                this.internalUpdateTime(status.currentTime, duration);
            }
        });

        this.castService.on('error', (error) => {
            console.error('[PlayerService] Cast error:', error);
            // If we are casting, stop or fallback
            if (this.isCasting) {
                // UI update: stop playback locally if Chromecast failed
                this.isPlaying = false;
                // DO NOT call this.pause() here as it would trigger another castService.pause() 
                // which might fail with INVALID_MEDIA_SESSION_ID if the error was session-related.
                this.isCasting = false;
                this.error = `Chromecast error: ${error.message || 'Unknown error'}`;
                this.emitStateChange();
            }
            this.persistQueue();
        });
    }

    // ---- Playback Control ----

    // ---- Offline Mode ----

    private isOfflineMode(): boolean {
        return this.database.getSettings()?.offlineMode ?? false;
    }

    async play(track?: Track, clearQueueBefore = !!track, exactQueueIndex?: number, startTime = 0, skipStreamRefresh = false): Promise<void> {
        this.markAction();
        this.createPlaybackConfirmationId();
        this.error = null;
        console.log(`[PlayerService] play() called. Track: ${track?.title || 'current'}, ClearQueue: ${clearQueueBefore}`);
        if (track) {
            if (clearQueueBefore) {
                // Clear queue and add this track as the only item
                this.queue = [{
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    track,
                    source: 'collection',
                }];
                this.currentIndex = 0;
                this.emitQueueUpdate();
            } else {
                // Ensure track is in the queue without clearing
                const index = exactQueueIndex ?? this.queue.findIndex(item => item.track.id === track.id);
                if (index >= 0 && index < this.queue.length) {
                    this.currentIndex = index;
                } else {
                    const targetIndex = this.currentIndex >= 0 ? this.currentIndex + 1 : this.queue.length;
                    this.addToQueue(track, 'collection', true, false);
                    this.currentIndex = targetIndex;
                }
            }
            this.emitQueueUpdate();

            // For cached tracks, prefer cached file to avoid network requests
            const isTrackCached = this.cacheService.isCached(track.id);
            if (isTrackCached && (!this.isCasting || !skipStreamRefresh)) {
                const cachedPath = this.cacheService.getCachedPath(track.id);
                if (cachedPath) {
                    const port = (global as any).cacheServerPort || 0;
                    const filename = path.basename(cachedPath);
                    track.streamUrl = `http://127.0.0.1:${port}/${encodeURIComponent(filename)}`;
                    console.log(`[PlayerService] Using cached file for ${track.title}`);
                }
            }

            // Refresh stream URL only for non-cached tracks (missing stream, radio, casting, or expired stream)
            if (!isTrackCached && (!track.streamUrl || (!skipStreamRefresh && (track.id.startsWith('radio-') || track.radioStationId || this.isCasting)))) {
                console.log(`[PlayerService] Refreshing stream URL for: ${track.title}`);
                try {
                    let streamUrl = track.streamUrl;
                    // For tracks with radioStationId, always try to get fresh stream URL (they expire quickly)
                    if (track.radioStationId) {
                        const streamInfo = await this.scraperService.getStationStreamUrl(track.radioStationId);
                        if (streamInfo.streamUrl) {
                            streamUrl = streamInfo.streamUrl;
                            track.streamUrl = streamUrl;
                            track.duration = streamInfo.duration;
                        }
                    } else if (!streamUrl || track.id.startsWith('radio-')) {
                        // For legacy radio tracks (id starts with radio-) or non-radio tracks without streamUrl
                        streamUrl = await this.scraperService.getTrackStreamUrl(track);
                        if (streamUrl && streamUrl !== track.streamUrl) {
                            console.log('[PlayerService] Refreshed stream URL');
                            track.streamUrl = streamUrl;
                        }
                    }
                } catch (error) {
                    console.error('[PlayerService] Error refreshing stream URL:', error);
                }
            }

            // Offline mode check: block playback of non-cached tracks
            if (this.isOfflineMode() && !this.cacheService.isCached(track.id)) {
                console.warn(`[PlayerService] Offline mode: track ${track.title} is not cached, blocking playback.`);
                this.error = `Offline mode: "${track.title}" is not available offline`;
                this.currentTrack = null;
                this.isPlaying = false;
                this.persistQueue(); // Update queue persistence when finished
                this.emitStateChange();
                return;
            }

            // Pre-order / Unstreamable track check
            if (!track.streamUrl && !isTrackCached) {
                // Only claim "pre-order" when the track really has no stream —
                // a blank streamUrl also means we failed to resolve a fresh one.
                const isPreorder = track.hasStream === false;
                console.warn(`[PlayerService] Track "${track.title}" has no stream URL (preorder=${isPreorder}).`);
                this.error = isPreorder
                    ? `"${track.title}" is unreleased (pre-order track)`
                    : `Could not load stream for "${track.title}"`;
                this.currentTrack = track;
                this.isPlaying = false;
                this.persistQueue();
                this.emitStateChange();
                return;
            }

            if (this.currentTrack?.id !== track.id) this.localPlaybackStatuses.delete(this.playbackConfirmationId);
            this.currentTrack = track;
            this.currentTime = Math.max(0, Number.isFinite(startTime) ? startTime : 0);
            this.isPlaying = true;

            if (this.isCasting) {
                this.castService.play(track, this.currentTime);
            }

            this.scrobbleStartTime = Date.now();
            this.hasScrobbled = false;

            console.log(`[PlayerService] Starting playback for: ${track.title} (${track.streamUrl})`);

            // Notify Now Playing
            try {
                this.scrobblerService.updateNowPlaying(track);
            } catch (scrobbleError) {
                console.error('[PlayerService] Scrobble updateNowPlaying failed:', scrobbleError);
            }

            this.emitStateChange();
            this.emitTrackChange();
        } else if (this.currentTrack) {
            // Resume current track
            console.log('[PlayerService] Resuming current track');
            this.isPlaying = true;
            if (this.isCasting) {
                this.castService.resume();
            }
            this.emitStateChange();
        } else if (this.queue.length > 0) {
            // Play first item in queue
            console.log('[PlayerService] Playing first item in queue');
            this.playIndex(0);
        } else {
            console.warn('[PlayerService] play called but nothing to play');
        }
    }

    pause(): void {
        this.markAction();
        this.createPlaybackConfirmationId();
        this.isPlaying = false;
        if (this.isCasting) {
            this.castService.pause();
        }
        this.emitStateChange();
    }

    togglePlay(): void {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    stop(): void {
        this.markAction();
        this.createPlaybackConfirmationId();
        this.isPlaying = false;
        this.currentTrack = null;
        this.currentTime = 0;
        this.duration = 0;
        this.currentIndex = -1;
        this.isRadioActive = false;
        this.currentStation = null;
        if (this.isCasting) {
            this.castService.stopPlayback().catch(() => {});
        }
        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();
        this.emitQueueUpdate();
    }

    async playStation(station: RadioStation): Promise<void> {
        this.markAction();
        this.isRadioActive = true;
        this.currentStation = station;

        const radioTrack = await this.stationToTrack(station);
        await this.play(radioTrack, true);

        this.emitRadioStateChange();
    }

    async extractRadioTracksToQueue(station: RadioStation, append: boolean = false): Promise<void> {
        this.markAction();
        if (!append) {
            this.isRadioActive = true;
            this.currentStation = station;
        }

        const tracks = await this.scraperService.getStationTracks(station.id);
        if (tracks.length > 0) {
            if (append) {
                this.addTracksToQueue(tracks, 'radio');
            } else {
                // First track immediately starts playing
                await this.play(tracks[0], true);
                // Queue the rest
                if (tracks.length > 1) {
                    this.addTracksToQueue(tracks.slice(1), 'radio');
                }
            }
        }

        if (!append) {
            this.emitRadioStateChange();
        }
    }

    /**
     * Convert a RadioStation to a Track object for queue/playlist use
     */
    async stationToTrack(station: RadioStation): Promise<Track> {

        // Resolve stream URL if missing
        let streamUrl = station.streamUrl;
        let duration = station.duration || 0;



        if (!streamUrl || !duration) {
            console.log(`Resolving stream URL/duration for station: ${station.name}`);
            const result = await this.scraperService.getStationStreamUrl(station.id);

            if (result.streamUrl) {
                streamUrl = result.streamUrl;
                duration = result.duration;
                // Cache on the station object
                station.streamUrl = streamUrl;
                station.duration = duration;
            }
        }

        return {
            id: `radio-${station.id}`,
            title: station.name,
            artist: station.description || 'Bandcamp Radio',
            album: 'Bandcamp Radio',
            duration: duration,
            artworkUrl: station.imageUrl || '',
            streamUrl: streamUrl,
            bandcampUrl: 'https://bandcamp.com',
            isCached: false
        };
    }

    /**
     * Add a radio station to the queue - stores station for lazy stream URL fetching
     */
    addStationToQueue(station: RadioStation, playNext = false): void {
        // Create a placeholder track - stream URL will be resolved when playing
        const placeholderTrack: Track = {
            id: `radio-${station.id}`,
            title: station.name,
            artist: station.description || 'Bandcamp Radio',
            album: 'Bandcamp Radio',
            duration: 0,
            artworkUrl: station.imageUrl || '',
            streamUrl: '',
            bandcampUrl: '',
            isCached: false
        };

        this.addToQueue(placeholderTrack, 'radio', playNext, station);
    }

    stopRadio(): void {
        this.stop();
    }

    private finishQueue(): void {
        this.isPlaying = false;
        this.currentTrack = null;
        this.currentTime = 0;
        this.duration = 0;
        // Set index to the end (length) effectively saying "we are past the last track"
        this.currentIndex = this.queue.length;

        this.isRadioActive = false;
        this.currentStation = null;

        this.isShuffled = false;
        this.shuffleOrder = [];
        this.emitStateChange();
        this.persistQueue();
    }

    async next(): Promise<void> {
        this.markAction();
        if (this.queue.length === 0) return;

        let nextIndex: number;
        let shufflePos = -1;

        if (this.isShuffled && this.shuffleOrder.length > 0) {
            shufflePos = this.shuffleOrder.indexOf(this.currentIndex);
            shufflePos++;
            if (shufflePos >= this.shuffleOrder.length) {
                if (this.repeatMode === 'all') {
                    shufflePos = 0;
                } else {
                    this.finishQueue();
                    return;
                }
            }
            nextIndex = this.shuffleOrder[shufflePos];
        } else {
            nextIndex = this.currentIndex + 1;
            if (nextIndex >= this.queue.length) {
                if (this.repeatMode === 'all') {
                    nextIndex = 0;
                } else {
                    this.finishQueue();
                    return;
                }
            }
        }

        // Skip unstreamable (unreleased pre-order) or uncached (in offline mode) tracks
        const startIndex = nextIndex;
        while (
            (this.isOfflineMode() && !this.cacheService.isCached(this.queue[nextIndex].track.id)) ||
            (this.queue[nextIndex].track.hasStream === false && !this.cacheService.isCached(this.queue[nextIndex].track.id))
        ) {
            if (this.isShuffled && this.shuffleOrder.length > 0) {
                shufflePos++;
                if (shufflePos >= this.shuffleOrder.length) {
                    if (this.repeatMode === 'all') {
                        shufflePos = 0;
                    } else {
                        this.finishQueue();
                        return;
                    }
                }
                nextIndex = this.shuffleOrder[shufflePos];
            } else {
                nextIndex++;
                if (nextIndex >= this.queue.length) {
                    if (this.repeatMode === 'all') {
                        nextIndex = 0;
                    } else {
                        this.finishQueue();
                        return;
                    }
                }
            }
            
            if (nextIndex === startIndex) {
                // Looped through all — none playable
                this.finishQueue();
                return;
            }
        }

        await this.playIndex(nextIndex);
    }

    async previous(): Promise<void> {
        this.markAction();
        if (this.queue.length === 0) return;

        // If we're more than 3 seconds into the track, restart it
        if (this.currentTime > 3) {
            this.seek(0);
            return;
        }

        let prevIndex: number;
        let shufflePos = -1;

        if (this.isShuffled && this.shuffleOrder.length > 0) {
            shufflePos = this.shuffleOrder.indexOf(this.currentIndex);
            shufflePos--;
            if (shufflePos < 0) {
                if (this.repeatMode === 'all') {
                    shufflePos = this.shuffleOrder.length - 1;
                } else {
                    this.seek(0);
                    return;
                }
            }
            prevIndex = this.shuffleOrder[shufflePos];
        } else {
            prevIndex = this.currentIndex - 1;
            if (prevIndex < 0) {
                if (this.repeatMode === 'all') {
                    prevIndex = this.queue.length - 1;
                } else {
                    this.seek(0);
                    return;
                }
            }
        }

        // Skip unstreamable (unreleased pre-order) or uncached (in offline mode) tracks going backwards
        const startIndex = prevIndex;
        while (
            (this.isOfflineMode() && !this.cacheService.isCached(this.queue[prevIndex].track.id)) ||
            (this.queue[prevIndex].track.hasStream === false && !this.cacheService.isCached(this.queue[prevIndex].track.id))
        ) {
            if (this.isShuffled && this.shuffleOrder.length > 0) {
                shufflePos--;
                if (shufflePos < 0) {
                    if (this.repeatMode === 'all') {
                        shufflePos = this.shuffleOrder.length - 1;
                    } else {
                        this.seek(0);
                        return;
                    }
                }
                prevIndex = this.shuffleOrder[shufflePos];
            } else {
                prevIndex--;
                if (prevIndex < 0) {
                    if (this.repeatMode === 'all') {
                        prevIndex = this.queue.length - 1;
                    } else {
                        this.seek(0);
                        return;
                    }
                }
            }

            if (prevIndex === startIndex) {
                this.seek(0);
                return;
            }
        }

        await this.playIndex(prevIndex);
    }

    seek(time: number): void {
        this.markAction();
        const seekTime = Number(time);
        this.currentTime = Math.max(0, Math.min(seekTime, this.duration));
        if (this.isCasting) {
            this.castService.seek(this.currentTime);
        }
        this.emitTimeUpdate();
        // Emit command to renderer to actually seek the audio element
        this.emit('seek-command', this.currentTime);
    }

    async setVolume(volume: number): Promise<void> {
        this.markAction();
        this.volume = Math.max(0, Math.min(1, volume));
        this.isMuted = false;
        if (this.isCasting) {
            this.castService.setVolume(this.volume);
        }
        this.emitStateChange();

        // Debounce saving volume to database
        if (this.saveVolumeTimeout) {
            clearTimeout(this.saveVolumeTimeout);
        }

        this.saveVolumeTimeout = setTimeout(() => {
            this.database.setSettings({ defaultVolume: this.volume });
            this.saveVolumeTimeout = null;
        }, 2000);
    }

    toggleMute(): void {
        this.markAction();
        this.isMuted = !this.isMuted;
        if (this.isCasting) {
            this.castService.setMuted(this.isMuted);
        }
        this.emitStateChange();
    }

    setRepeat(mode: RepeatMode): void {
        this.markAction();
        this.repeatMode = mode;
        this.emitStateChange();
    }

    toggleShuffle(): void {
        this.markAction();
        this.isShuffled = !this.isShuffled;
        if (this.isShuffled) {
            this.generateShuffleOrder();
        } else {
            this.shuffleOrder = [];
        }

        this.emitStateChange();
        this.persistQueue();
    }

    // ---- Queue Management ----

    addToQueue(track: Track, source: QueueItem['source'] = 'collection', playNext = false, radioStationOrEmitUpdate?: RadioStation | boolean, emitUpdate = true): void {
        this.markAction();
        // Handle both old signature (emitUpdate: boolean) and new signature (radioStation: RadioStation, emitUpdate?: boolean)
        let radioStation: RadioStation | undefined;

        if (radioStationOrEmitUpdate !== undefined) {
            if (typeof radioStationOrEmitUpdate === 'boolean') {
                // Old signature: addToQueue(track, source, playNext, emitUpdate)
                emitUpdate = radioStationOrEmitUpdate;
            } else {
                // New signature: addToQueue(track, source, playNext, radioStation, emitUpdate?)
                radioStation = radioStationOrEmitUpdate;
            }
        }

        const queueItem: QueueItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            track,
            source,
            radioStation,
        };

        if (playNext && this.currentIndex >= 0) {
            this.queue.splice(this.currentIndex + 1, 0, queueItem);
        } else {
            this.queue.push(queueItem);
        }

        if (this.isShuffled) {
            this.generateShuffleOrder();
        }

        if (emitUpdate) {
            this.emitQueueUpdate();
        }
        this.persistQueue();
    }

    addTracksToQueue(tracks: Track[], source: QueueItem['source'] = 'collection', playNext = false): void {
        this.markAction();
        const tracksToAdd = playNext ? [...tracks].reverse() : tracks;

        for (let i = 0; i < tracksToAdd.length; i++) {
            // For playNext, we want to maintain the order of the added batch, 
            // so we add them in reverse order, each one "playing next" after the current track.
            // But Wait! If we use addToQueue with playNext=true repeatedly:
            // Q: [C]
            // Add 3 (next): [C, 3]
            // Add 2 (next): [C, 2, 3]
            // Add 1 (next): [C, 1, 2, 3] -> Result is 1, 2, 3. Correct.

            // We pass emitUpdate=false to all calls to prevent flooding
            this.addToQueue(tracksToAdd[i], source, playNext, false);
        }
        this.emitQueueUpdate();
        this.persistQueue();
    }

    removeFromQueue(queueItemId: string): void {
        this.markAction();
        const index = this.queue.findIndex(item => item.id === queueItemId);
        if (index === -1) return;

        this.queue.splice(index, 1);

        // Adjust current index if needed
        if (index < this.currentIndex) {
            this.currentIndex--;
        } else if (index === this.currentIndex) {
            // Currently playing track was removed
            if (this.queue.length === 0) {
                this.stop();
            } else {
                this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
                // Don't await - fire and forget for queue removal edge case
                this.playIndex(this.currentIndex).catch(() => { });
            }
        }

        if (this.isShuffled) {
            this.generateShuffleOrder();
        }

        this.emitQueueUpdate();
        this.persistQueue();
    }

    clearQueue(keepCurrent = true): void {
        this.markAction();
        const currentItem = this.currentIndex >= 0 ? this.queue[this.currentIndex] : null;

        if (keepCurrent && currentItem) {
            this.queue = [currentItem];
            this.currentIndex = 0;
        } else {
            if (!keepCurrent) {
                this.stop();
            }
            this.queue = [];
            this.currentIndex = -1;
        }

        this.shuffleOrder = [];
        this.emitQueueUpdate();
        this.persistQueue();
    }

    reorderQueue(fromIndex: number, toIndex: number): void {
        this.markAction();
        if (fromIndex < 0 || fromIndex >= this.queue.length) return;
        if (toIndex < 0 || toIndex >= this.queue.length) return;

        const [movedItem] = this.queue.splice(fromIndex, 1);
        this.queue.splice(toIndex, 0, movedItem);

        // Adjust current index
        if (fromIndex === this.currentIndex) {
            this.currentIndex = toIndex;
        } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
            this.currentIndex--;
        } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
            this.currentIndex++;
        }

        if (this.isShuffled) {
            this.generateShuffleOrder();
        }

        this.emitQueueUpdate();
        this.persistQueue();
    }

    async playIndex(index: number): Promise<void> {
        this.markAction();
        if (index < 0 || index >= this.queue.length) return;

        this.currentIndex = index;
        const queueItem = this.queue[index];

        // If this is a radio station with a lazy-loaded stream URL, resolve it first
        if (queueItem.radioStation && (!queueItem.track.streamUrl || !queueItem.track.duration)) {
            await this.resolveRadioStationTrack(queueItem);
        }

        await this.play(queueItem.track, false, index);
        this.persistQueue();
        this.emitQueueUpdate();
    }

    getHandoffVersions(): { queueVersion: number; actionVersion: number } {
        return { queueVersion: this.queueVersion, actionVersion: this.actionVersion };
    }

    getActualLocalPlaybackStatus(trackId: string | undefined): boolean | null {
        if (!trackId) return null;
        const status = this.localPlaybackStatuses.get(this.playbackConfirmationId);
        return status?.trackId === trackId ? status.isPlaying : null;
    }

    async getActualCastPlaybackState(): Promise<string | null> {
        return this.castService.getActualPlaybackState();
    }

    reportLocalPlaybackStatus(trackId: string, confirmationId: string, isPlaying: boolean, position: number, failed = false): void {
        if (!trackId || !confirmationId || confirmationId !== this.playbackConfirmationId || this.isCasting || this.currentTrack?.id !== trackId) return;
        const status = {
            trackId,
            isPlaying,
            position: Number.isFinite(position) ? Math.max(0, position) : this.currentTime,
            failed,
        };
        this.localPlaybackStatuses.set(confirmationId, status);
        if (!isPlaying && !failed) {
            this.internalUpdateTime(status.position, this.duration);
        }

        for (const waiter of this.localPlaybackWaiters) {
            if (waiter.trackId !== trackId || waiter.confirmationId !== confirmationId) continue;
            if (failed) {
                clearTimeout(waiter.timeout);
                this.localPlaybackWaiters.delete(waiter);
                waiter.resolve(false);
            } else if (waiter.expectedPlaying === isPlaying) {
                clearTimeout(waiter.timeout);
                this.localPlaybackWaiters.delete(waiter);
                waiter.resolve(true);
            }
        }
    }

    async pauseForQueueHandoff(expectedTrackId: string, expectedQueueVersion: number, expectedActionVersion: number): Promise<{
        success: boolean;
        trackId: string;
        position: number;
        queueVersion: number;
        actionVersion: number;
        wasPlaying: boolean;
        reason?: string;
    }> {
        const trackId = this.currentTrack?.id || '';
        if (!trackId || trackId !== expectedTrackId || this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                trackId,
                position: this.currentTime,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                wasPlaying: false,
                reason: 'Desktop playback changed before it could be paused.',
            };
        }

        const actualCastState = this.isCasting ? await this.castService.getActualPlaybackState() : null;
        const actualPlaying = this.isCasting
            ? actualCastState === null ? null : !['PAUSED', 'IDLE'].includes(actualCastState)
            : this.getActualLocalPlaybackStatus(trackId);
        if (this.currentTrack?.id !== expectedTrackId || this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                trackId: this.currentTrack?.id || '',
                position: this.currentTime,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                wasPlaying: false,
                reason: 'Desktop playback changed before it could be paused.',
            };
        }
        const wasPlaying = this.isPlaying || actualPlaying === true;
        if (!wasPlaying) {
            return {
                success: true,
                trackId,
                position: this.currentTime,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                wasPlaying: false,
            };
        }

        const previousPosition = this.currentTime;
        const confirmationId = this.createPlaybackConfirmationId();
        this.markAction();
        this.isPlaying = false;
        this.emitStateChange();
        const pauseActionVersion = this.actionVersion;
        const paused = this.isCasting
            ? await this.castService.pauseAndWait()
            : await this.waitForLocalPlaybackStatus(trackId, confirmationId, false, 5000, false);
        if (!paused || this.actionVersion !== pauseActionVersion || this.currentTrack?.id !== trackId) {
            if (this.actionVersion === pauseActionVersion && this.currentTrack?.id === trackId) {
                this.markAction();
                this.createPlaybackConfirmationId();
                this.isPlaying = true;
                this.currentTime = previousPosition;
                this.emit('seek-command', previousPosition);
                this.emitStateChange();
                if (this.isCasting) {
                    await this.castService.resumeAndWait();
                } else {
                    await this.waitForLocalPlaybackStatus(trackId, this.playbackConfirmationId, true, 5000, false);
                }
            }
            return {
                success: false,
                trackId,
                position: this.currentTime,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                wasPlaying: true,
                reason: 'Desktop playback could not be paused reliably.',
            };
        }

        return {
            success: true,
            trackId,
            position: this.currentTime,
            queueVersion: this.queueVersion,
            actionVersion: this.actionVersion,
            wasPlaying: true,
        };
    }

    async resumeForQueueHandoff(expectedTrackId: string, expectedActionVersion: number, position: number, wasPlaying: boolean): Promise<boolean> {
        if (this.actionVersion !== expectedActionVersion || this.currentTrack?.id !== expectedTrackId) return false;
        if (!wasPlaying) return true;

        const resumePosition = Number.isFinite(position) ? Math.max(0, position) : this.currentTime;
        const confirmationId = this.createPlaybackConfirmationId();
        this.markAction();
        this.currentTime = resumePosition;
        this.emitTimeUpdate();
        this.emit('seek-command', resumePosition);
        this.isPlaying = true;
        this.emitStateChange();
        const resumeActionVersion = this.actionVersion;
        const resumed = this.isCasting
            ? await this.castService.resumeAndWait()
            : await this.waitForLocalPlaybackStatus(expectedTrackId, confirmationId, true, 5000, false);
        if (!resumed && this.actionVersion === resumeActionVersion) {
            this.createPlaybackConfirmationId();
            this.isPlaying = false;
            this.emitStateChange();
        }
        return resumed;
    }

    async prepareQueueForHandoff(
        incomingItems: QueueItem[],
        currentIndex: number,
        expectedQueueVersion: number,
        expectedActionVersion: number,
    ): Promise<{ success: boolean; items?: QueueItem[]; queueVersion: number; actionVersion: number; reason?: string }> {
        if (this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: 'Desktop playback changed while the queue was transferring.',
            };
        }
        if (!Array.isArray(incomingItems) || incomingItems.length === 0 || currentIndex < 0 || currentIndex >= incomingItems.length) {
            return { success: false, queueVersion: this.queueVersion, actionVersion: this.actionVersion, reason: 'The transferred queue is invalid.' };
        }

        const items = JSON.parse(JSON.stringify(incomingItems)) as QueueItem[];
        const selectedItem = items[currentIndex];
        try {
            if (selectedItem.track.radioStationId && (!selectedItem.radioStation || this.isCasting)) {
                const stream = await this.scraperService.getStationStreamUrl(selectedItem.track.radioStationId);
                if (!stream?.streamUrl) throw new Error('Could not resolve the selected radio station.');
                selectedItem.track.streamUrl = stream.streamUrl;
                selectedItem.track.duration = stream.duration || selectedItem.track.duration;
            } else if (selectedItem.radioStation && (!this.cacheService.isCached(selectedItem.track.id) || this.isCasting)) {
                const stream = await this.scraperService.getStationStreamUrl(selectedItem.radioStation.id);
                if (!stream?.streamUrl) throw new Error('Could not resolve the selected radio station.');
                selectedItem.track.streamUrl = stream.streamUrl;
                selectedItem.track.duration = stream.duration || selectedItem.track.duration;
                selectedItem.radioStation.streamUrl = stream.streamUrl;
                selectedItem.radioStation.duration = stream.duration || selectedItem.radioStation.duration;
            } else if (!this.cacheService.isCached(selectedItem.track.id) || this.isCasting) {
                if (this.isCasting || !selectedItem.track.streamUrl) {
                    selectedItem.track.streamUrl = await this.scraperService.getTrackStreamUrl(selectedItem.track);
                }
                if (!this.isAllowedHandoffStreamUrl(selectedItem.track.streamUrl)) throw new Error('Could not resolve the selected track from Bandcamp.');
            }

            if ((selectedItem.track.streamUrl && !this.isAllowedHandoffStreamUrl(selectedItem.track.streamUrl)) ||
                (selectedItem.radioStation?.streamUrl && !this.isAllowedHandoffStreamUrl(selectedItem.radioStation.streamUrl))) {
                throw new Error('The selected track resolved to an unsupported media origin.');
            }

            if (this.isOfflineMode() && !this.cacheService.isCached(selectedItem.track.id)) {
                throw new Error(`Offline mode: "${selectedItem.track.title}" is not available offline`);
            }
        } catch (error) {
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: error instanceof Error ? error.message : 'Could not prepare the selected track.',
            };
        }

        if (this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: 'Desktop playback changed while the selected track was preparing.',
            };
        }
        return { success: true, items, queueVersion: this.queueVersion, actionVersion: this.actionVersion };
    }

    async replaceQueueForHandoff(
        incomingItems: QueueItem[],
        currentIndex: number,
        position: number,
        expectedQueueVersion: number,
        expectedActionVersion: number,
        prepared = false,
    ): Promise<{ success: boolean; queueVersion: number; actionVersion: number; reason?: string }> {
        if (this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: 'Desktop playback changed while the queue was transferring.',
            };
        }

        if (!Array.isArray(incomingItems) || currentIndex < 0 || currentIndex >= incomingItems.length) {
            return { success: false, queueVersion: this.queueVersion, actionVersion: this.actionVersion, reason: 'The transferred queue is invalid.' };
        }
        if (!Number.isFinite(position) || position < 0) {
            return { success: false, queueVersion: this.queueVersion, actionVersion: this.actionVersion, reason: 'The transferred playback position is invalid.' };
        }

        const items = JSON.parse(JSON.stringify(incomingItems)) as QueueItem[];
        let selectedItem = items[currentIndex];
        const startPosition = selectedItem.track.duration > 0 ? Math.min(position, selectedItem.track.duration) : position;
        if (prepared && ((!this.cacheService.isCached(selectedItem.track.id) && !selectedItem.track.streamUrl) ||
            (selectedItem.track.streamUrl && !this.isAllowedHandoffStreamUrl(selectedItem.track.streamUrl)))) {
            return { success: false, queueVersion: this.queueVersion, actionVersion: this.actionVersion, reason: 'The prepared track is no longer available.' };
        }
        if (!prepared) {
            const preparation = await this.prepareQueueForHandoff(items, currentIndex, expectedQueueVersion, expectedActionVersion);
            if (!preparation.success || !preparation.items) {
                return {
                    success: false,
                    queueVersion: preparation.queueVersion,
                    actionVersion: preparation.actionVersion,
                    reason: preparation.reason,
                };
            }
            items.splice(0, items.length, ...preparation.items);
            selectedItem = items[currentIndex];
        }

        if (this.queueVersion !== expectedQueueVersion || this.actionVersion !== expectedActionVersion) {
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: 'Desktop playback changed while the selected track was preparing.',
            };
        }

        const previous = {
            queue: JSON.parse(JSON.stringify(this.queue)) as QueueItem[],
            currentIndex: this.currentIndex,
            currentTrack: this.currentTrack ? JSON.parse(JSON.stringify(this.currentTrack)) as Track : null,
            currentTime: this.currentTime,
            duration: this.duration,
            isPlaying: this.isPlaying,
            isRadioActive: this.isRadioActive,
            currentStation: this.currentStation ? JSON.parse(JSON.stringify(this.currentStation)) as RadioStation : null,
            error: this.error,
            shuffleOrder: [...this.shuffleOrder],
        };

        this.queue = items;
        this.currentIndex = currentIndex;
        this.isRadioActive = !!selectedItem.radioStation;
        this.currentStation = selectedItem.radioStation || null;
        this.error = null;
        this.markAction();
        if (this.isShuffled) this.generateShuffleOrder();
        else this.shuffleOrder = [];
        this.emitQueueUpdate();

        try {
            const startRequestedAt = Date.now();
            await this.play(selectedItem.track, false, currentIndex, startPosition, true);
            const operationActionVersion = expectedActionVersion + 2;
            const castStatus = this.isCasting ? await this.castService.waitForPlaybackState('PLAYING') : null;
            const started = this.isCasting
                ? !!castStatus
                : await this.waitForLocalPlaybackStatus(selectedItem.track.id, this.playbackConfirmationId, true, 8000, false);
            const localStatus = this.localPlaybackStatuses.get(this.playbackConfirmationId);
            const actualPosition = this.isCasting ? castStatus?.currentTime : localStatus?.position;
            const positionTolerance = Math.max(3, (Date.now() - startRequestedAt) / 1000 + 2);
            const positionReady = this.isCasting
                ? Number.isFinite(actualPosition) && actualPosition >= startPosition - 1 && actualPosition <= startPosition + positionTolerance
                : !!localStatus && Number.isFinite(actualPosition) && actualPosition >= startPosition - 1 && actualPosition <= startPosition + positionTolerance;
            if (started && positionReady && this.currentTrack?.id === selectedItem.track.id && this.isPlaying) {
                return { success: true, queueVersion: this.queueVersion, actionVersion: this.actionVersion };
            }

            if (this.actionVersion !== operationActionVersion) {
                return {
                    success: false,
                    queueVersion: this.queueVersion,
                    actionVersion: this.actionVersion,
                    reason: 'Desktop playback changed while the transferred track was starting.',
                };
            }
            await this.restoreQueueHandoffSnapshot(previous);
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: 'The transferred track could not start on desktop.',
            };
        } catch (error) {
            if (this.actionVersion === expectedActionVersion + 2) await this.restoreQueueHandoffSnapshot(previous);
            return {
                success: false,
                queueVersion: this.queueVersion,
                actionVersion: this.actionVersion,
                reason: error instanceof Error ? error.message : 'The transferred queue could not start on desktop.',
            };
        }
    }

    /**
     * Resolve stream URL for a radio station in the queue
     */
    private async resolveRadioStationTrack(queueItem: QueueItem): Promise<void> {
        if (!queueItem.radioStation) return;

        try {
            const streamInfo = await this.scraperService.getStationStreamUrl(queueItem.radioStation.id);
            if (streamInfo.streamUrl) {
                // Update the track with resolved stream info
                queueItem.track.streamUrl = streamInfo.streamUrl;
                queueItem.track.duration = streamInfo.duration;
                // Also update the stored radio station
                queueItem.radioStation.streamUrl = streamInfo.streamUrl;
                queueItem.radioStation.duration = streamInfo.duration;
            }
        } catch (error) {
            console.error(`Failed to resolve stream for radio station ${queueItem.radioStation.name}:`, error);
        }
    }

    getQueue(): { items: QueueItem[]; currentIndex: number } {
        return {
            items: [...this.queue],
            currentIndex: this.currentIndex,
        };
    }

    // ---- Time Updates (called from renderer via IPC) ----

    updateTime(currentTime: number, duration: number): void {
        // If casting, ignore time updates from the renderer (local audio)
        // because the cast device is the source of truth for progress.
        if (this.isCasting) return;

        this.internalUpdateTime(currentTime, duration);
    }

    private internalUpdateTime(currentTime: number, duration: number): void {
        this.currentTime = currentTime;
        this.duration = duration;
        if (this.currentTrack && duration > 0 && (!this.currentTrack.duration || this.currentTrack.duration === 0)) {
            this.currentTrack.duration = duration;
        }
        this.emitTimeUpdate();

        // Check for scrobble
        this.checkScrobble();
    }

    async reportPlaybackError(trackId?: string): Promise<void> {
        const track = this.currentTrack;
        if (!track || (trackId && track.id !== trackId)) {
            console.log('[PlayerService] Playback error reported for non-current track, ignoring.');
            return;
        }

        console.warn(`[PlayerService] Playback error reported for track: ${track.title} (${track.id})`);

        const isTrackCached = this.cacheService.isCached(track.id);
        if (isTrackCached) {
            console.error(`[PlayerService] Cached playback failed for: ${track.title}`);
            this.error = `Playback error for cached track: "${track.title}"`;
            this.isPlaying = false;
            this.emitStateChange();
            setTimeout(() => {
                this.next().catch(() => {});
            }, 1500);
            return;
        }

        console.log(`[PlayerService] Attempting on-demand stream URL refresh for: ${track.title}`);
        try {
            let freshStreamUrl = '';
            if (track.radioStationId) {
                const streamInfo = await this.scraperService.getStationStreamUrl(track.radioStationId);
                freshStreamUrl = streamInfo.streamUrl;
                if (streamInfo.duration) track.duration = streamInfo.duration;
            } else {
                freshStreamUrl = await this.scraperService.getTrackStreamUrl(track);
            }

            if (freshStreamUrl && freshStreamUrl !== track.streamUrl) {
                console.log(`[PlayerService] Successfully refreshed stream URL for: ${track.title}`);
                track.streamUrl = freshStreamUrl;
                this.error = null;
                this.emitStateChange();
                this.emitTrackChange();
                return;
            }
        } catch (err) {
            console.error('[PlayerService] Failed to refresh stream URL on playback error:', err);
        }

        console.error(`[PlayerService] Unrecoverable stream error for "${track.title}". Auto-skipping...`);
        this.error = `Stream URL expired or unavailable: "${track.title}"`;
        this.isPlaying = false;
        this.emitStateChange();
        setTimeout(() => {
            this.next().catch(() => {});
        }, 1500);
    }

    private checkScrobble(): void {
        if (!this.currentTrack || this.hasScrobbled || !this.scrobbleStartTime) return;

        const playedTime = (Date.now() - this.scrobbleStartTime) / 1000;
        const threshold = Math.min(this.duration * 0.5, 240); // 50% or 4 minutes

        if (playedTime >= threshold) {
            this.scrobblerService.scrobble(this.currentTrack);
            this.hasScrobbled = true;
        }
    }

    public handleTrackEnd(): void {
        if (this.repeatMode === 'one') {
            this.seek(0);
            this.play();
        } else {
            this.next();
        }
    }

    // ---- State ----

    getState(): PlayerState {
        return {
            isPlaying: this.isPlaying,
            currentTrack: this.currentTrack,
            currentTime: this.currentTime,
            duration: this.duration,
            volume: this.volume,
            isMuted: this.isMuted,
            repeatMode: this.repeatMode,
            isShuffled: this.isShuffled,
            queue: {
                items: [...this.queue],
                currentIndex: this.currentIndex,
                shuffleOrder: this.isShuffled ? this.shuffleOrder : undefined,
            },
            isCasting: this.isCasting,
            playbackConfirmationId: this.playbackConfirmationId,
            castDevice: this.castService.getConnectedDevice() || undefined,
            error: this.error,
        };
    }

    getStreamUrl(track: Track): string {
        const cachedPath = this.cacheService.getCachedPath(track.id);
        if (cachedPath) {
            const port = (global as any).cacheServerPort || 0;
            const cleanPath = cachedPath.replace(/^\/+/, "");
            const encoded = cleanPath.split("/").map(encodeURIComponent).join("/");
            return `http://127.0.0.1:${port}/${encoded}`;
        }
        return track.streamUrl;
    }

    private persistQueue() {
        if (this.persistQueueTimeout) {
            clearTimeout(this.persistQueueTimeout);
        }
        this.persistQueueTimeout = setTimeout(() => {
            this.database.setSettings({
                savedQueue: {
                    items: this.queue,
                    currentIndex: this.currentIndex,
                    shuffleOrder: this.shuffleOrder
                }
            });
        }, 1000);
    }

    // ---- Private Helpers ----

    private generateShuffleOrder(): void {
        this.shuffleOrder = Array.from({ length: this.queue.length }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
        }
        // Move current index to front of shuffle
        if (this.currentIndex >= 0) {
            const currentPos = this.shuffleOrder.indexOf(this.currentIndex);
            if (currentPos > 0) {
                [this.shuffleOrder[0], this.shuffleOrder[currentPos]] = [this.shuffleOrder[currentPos], this.shuffleOrder[0]];
            }
        }
    }

    private emitStateChange(): void {
        this.emit('state-changed', this.getState());
        this.updatePowerSaveBlocker();
    }

    private markAction(): void {
        this.actionVersion++;
    }

    markHandoffAction(): void {
        this.markAction();
    }

    private isAllowedHandoffStreamUrl(value: string): boolean {
        try {
            const url = new URL(value);
            const allowedHost = ['bandcamp.com', 'bcbits.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
            return url.protocol === 'https:' && allowedHost && (url.port === '' || url.port === '443') && !url.username && !url.password;
        } catch {
            return false;
        }
    }

    private createPlaybackConfirmationId(): string {
        this.playbackConfirmationSequence++;
        this.playbackConfirmationId = String(this.playbackConfirmationSequence);
        this.localPlaybackStatuses.clear();
        for (const waiter of this.localPlaybackWaiters) {
            clearTimeout(waiter.timeout);
            this.localPlaybackWaiters.delete(waiter);
            waiter.resolve(false);
        }
        return this.playbackConfirmationId;
    }

    private waitForLocalPlaybackStatus(trackId: string, confirmationId: string, expectedPlaying: boolean, timeoutMs: number, allowKnownStatus: boolean): Promise<boolean> {
        const known = this.localPlaybackStatuses.get(confirmationId);
        if (allowKnownStatus && known) {
            if (known.trackId === trackId && known.failed) return Promise.resolve(false);
            if (known.trackId === trackId && known.isPlaying === expectedPlaying) return Promise.resolve(true);
        }

        return new Promise(resolve => {
            const waiter = {
                trackId,
                confirmationId,
                expectedPlaying,
                resolve,
                timeout: setTimeout(() => {
                    this.localPlaybackWaiters.delete(waiter);
                    resolve(false);
                }, timeoutMs),
            };
            this.localPlaybackWaiters.add(waiter);
        });
    }

    private async restoreQueueHandoffSnapshot(snapshot: {
        queue: QueueItem[];
        currentIndex: number;
        currentTrack: Track | null;
        currentTime: number;
        duration: number;
        isPlaying: boolean;
        isRadioActive: boolean;
        currentStation: RadioStation | null;
        error: string | null;
        shuffleOrder: number[];
    }): Promise<void> {
        if (snapshot.currentTrack?.id !== this.currentTrack?.id && snapshot.currentTrack) this.localPlaybackStatuses.delete(this.playbackConfirmationId);
        this.queue = snapshot.queue;
        this.currentIndex = snapshot.currentIndex;
        this.currentTrack = snapshot.currentTrack;
        this.currentTime = snapshot.currentTime;
        this.duration = snapshot.duration;
        this.isPlaying = snapshot.isPlaying;
        this.isRadioActive = snapshot.isRadioActive;
        this.currentStation = snapshot.currentStation;
        this.error = snapshot.error;
        this.shuffleOrder = snapshot.shuffleOrder;
        this.markAction();
        const confirmationId = this.createPlaybackConfirmationId();
        this.emitQueueUpdate();
        this.persistQueue();
        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();

        const trackId = snapshot.currentTrack?.id;
        if (!trackId) return;
        if (snapshot.isPlaying) {
            if (this.isCasting) {
                await this.castService.playAndWait(snapshot.currentTrack!, snapshot.currentTime);
            } else {
                await this.waitForLocalPlaybackStatus(trackId, confirmationId, true, 5000, false);
            }
        } else if (this.isCasting) {
            await this.castService.pauseAndWait();
        }
    }

    private updatePowerSaveBlocker(): void {
        if (this.isPlaying && this.powerSaveBlockerId === null) {
            this.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
            console.log(`[PlayerService] Started powerSaveBlocker with ID: ${this.powerSaveBlockerId}`);
        } else if (!this.isPlaying && this.powerSaveBlockerId !== null) {
            if (powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
                powerSaveBlocker.stop(this.powerSaveBlockerId);
            }
            console.log(`[PlayerService] Stopped powerSaveBlocker with ID: ${this.powerSaveBlockerId}`);
            this.powerSaveBlockerId = null;
        }
    }

    private emitTrackChange(): void {
        this.emit('track-changed', this.currentTrack);
    }

    private emitTimeUpdate(): void {
        this.emit('time-update', { currentTime: this.currentTime, duration: this.duration });
    }

    private emitQueueUpdate(): void {
        this.queueVersion++;
        this.emit('queue-updated', this.getQueue());
    }

    getRadioState(): RadioState {
        return {
            isActive: this.isRadioActive,
            currentStation: this.currentStation,
            currentTrack: this.currentTrack,
        };
    }

    private emitRadioStateChange(): void {
        this.emit('radio-state-changed', this.getRadioState());
    }

    destroy(): void {
        if (this.saveVolumeTimeout) {
            clearTimeout(this.saveVolumeTimeout);
            this.saveVolumeTimeout = null;
        }
        if (this.persistQueueTimeout) {
            clearTimeout(this.persistQueueTimeout);
            this.persistQueueTimeout = null;
        }
    }
}
