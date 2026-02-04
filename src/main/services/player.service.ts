import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { Track, QueueItem, RepeatMode, PlayerState, RadioStation, RadioState } from '../../shared/types';
import { CacheService } from './cache.service';
import { ScrobblerService } from './scrobbler.service';
import { ScraperService } from './scraper.service';
import { Database } from '../database/database';

// ============================================================================
// Player Service
// ============================================================================

export class PlayerService extends EventEmitter {
    private cacheService: CacheService;
    private scrobblerService: ScrobblerService;
    private scraperService: ScraperService;
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

    // Queue state
    private queue: QueueItem[] = [];
    private currentIndex = -1;
    private shuffleOrder: number[] = [];

    // Scrobble tracking
    private scrobbleStartTime: number | null = null;
    private hasScrobbled = false;

    // Radio state
    private isRadioActive = false;
    private currentStation: RadioStation | null = null;

    constructor(cacheService: CacheService, scrobblerService: ScrobblerService, scraperService: ScraperService, database: Database) {
        super();
        this.cacheService = cacheService;
        this.scrobblerService = scrobblerService;
        this.scraperService = scraperService;
        this.database = database;

        // Initialize volume from settings
        const settings = this.database.getSettings();
        if (settings) {
            this.volume = settings.defaultVolume;
        }
    }

    // ---- Playback Control ----

    async play(track?: Track, clearQueueBefore = !!track): Promise<void> {

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
                const index = this.queue.findIndex(item => item.track.id === track.id);
                if (index !== -1) {
                    this.currentIndex = index;
                } else {
                    const targetIndex = this.currentIndex >= 0 ? this.currentIndex + 1 : this.queue.length;
                    this.addToQueue(track, 'collection', true, false);
                    this.currentIndex = targetIndex;
                }
            }
            this.emitQueueUpdate();

            // Check if it's a radio track and stream URL needs valid check
            if (track.id.startsWith('radio-')) {
                const stationId = track.id.replace('radio-', '');
                console.log(`[PlayerService] Checking radio stream URL for: ${track.title}`);

                try {
                    // Always refresh radio stream URL as they expire
                    const { streamUrl, duration } = await this.scraperService.getStationStreamUrl(stationId);
                    if (streamUrl) {
                        console.log('[PlayerService] Refreshed radio stream URL');
                        track.streamUrl = streamUrl;
                        if (duration > 0 && !track.duration) {
                            track.duration = duration;
                        }
                    } else {
                        console.warn('[PlayerService] Failed to refresh radio stream URL');
                    }
                } catch (error) {
                    console.error('[PlayerService] Error refreshing radio stream URL:', error);
                }
            }

            // Play a specific track
            if (!track.streamUrl) {
                console.error('[PlayerService] CRITICAL: Track has no stream URL!');
            }

            this.currentTrack = track;
            this.currentTime = 0;
            this.isPlaying = true;
            this.scrobbleStartTime = Date.now();
            this.hasScrobbled = false;

            // Notify Now Playing
            this.scrobblerService.updateNowPlaying(track);

            this.emitStateChange();
            this.emitTrackChange();
        } else if (this.currentTrack) {
            // Resume current track
            this.isPlaying = true;
            this.emitStateChange();
        } else if (this.queue.length > 0) {
            // Play first item in queue
            this.playIndex(0);
        } else {
            console.warn('[PlayerService] play called but nothing to play');
        }
    }

    pause(): void {
        this.isPlaying = false;
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
        this.isPlaying = false;
        this.currentTrack = null;
        this.currentTime = 0;
        this.duration = 0;
        this.currentIndex = -1;
        this.isRadioActive = false;
        this.currentStation = null;
        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();
        this.emitQueueUpdate();
    }

    async playStation(station: RadioStation): Promise<void> {
        this.stop();
        this.currentStation = station;
        this.isRadioActive = true;

        const radioTrack = await this.stationToTrack(station);

        this.currentTrack = radioTrack;
        console.log('Playing radio station track:', JSON.stringify(radioTrack, null, 2));
        this.isPlaying = true;
        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();
    }

    /**
     * Convert a RadioStation to a Track object for queue/playlist use
     */
    async stationToTrack(station: RadioStation): Promise<Track> {
        const log = (msg: string) => fs.appendFileSync('debug-radio-fix.log', `[Player] ${msg}\n`);

        // Resolve stream URL if missing
        let streamUrl = station.streamUrl;
        let duration = station.duration || 0;

        log(`stationToTrack called for '${station.name}' (ID: ${station.id}). URL present: ${!!streamUrl}, Duration: ${duration}`);

        if (!streamUrl || !duration) {
            console.log(`Resolving stream URL/duration for station: ${station.name}`);
            const result = await this.scraperService.getStationStreamUrl(station.id);
            log(`Resolution result - URL present: ${!!result.streamUrl}, Duration: ${result.duration}`);

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
            artist: 'Bandcamp Radio',
            album: station.description || '',
            duration: duration,
            artworkUrl: station.imageUrl || '',
            streamUrl: streamUrl,
            bandcampUrl: 'https://bandcamp.com',
            isCached: false
        };
    }

    /**
     * Add a radio station to the queue as a track
     */
    async addStationToQueue(station: RadioStation, playNext = false): Promise<void> {
        const radioTrack = await this.stationToTrack(station);
        this.addToQueue(radioTrack, 'radio', playNext);
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

        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();
        this.emitQueueUpdate();
    }

    async next(): Promise<void> {
        if (this.queue.length === 0) return;

        let nextIndex: number;

        if (this.isShuffled && this.shuffleOrder.length > 0) {
            const currentShufflePos = this.shuffleOrder.indexOf(this.currentIndex);
            const nextShufflePos = (currentShufflePos + 1) % this.shuffleOrder.length;
            nextIndex = this.shuffleOrder[nextShufflePos];
        } else {
            nextIndex = this.currentIndex + 1;
        }

        if (nextIndex >= this.queue.length) {
            if (this.repeatMode === 'all') {
                nextIndex = 0;
            } else {
                this.finishQueue();
                return;
            }
        }

        this.playIndex(nextIndex);
    }

    async previous(): Promise<void> {
        if (this.queue.length === 0) return;

        // If we're more than 3 seconds into the track, restart it
        if (this.currentTime > 3) {
            this.seek(0);
            return;
        }

        let prevIndex: number;

        if (this.isShuffled && this.shuffleOrder.length > 0) {
            const currentShufflePos = this.shuffleOrder.indexOf(this.currentIndex);
            const prevShufflePos = currentShufflePos > 0 ? currentShufflePos - 1 : this.shuffleOrder.length - 1;
            prevIndex = this.shuffleOrder[prevShufflePos];
        } else {
            prevIndex = this.currentIndex - 1;
        }

        if (prevIndex < 0) {
            if (this.repeatMode === 'all') {
                prevIndex = this.queue.length - 1;
            } else {
                this.seek(0);
                return;
            }
        }

        this.playIndex(prevIndex);
    }

    seek(time: number): void {
        const seekTime = Number(time);
        this.currentTime = Math.max(0, Math.min(seekTime, this.duration));
        this.emitTimeUpdate();
        // Emit command to renderer to actually seek the audio element
        this.emit('seek-command', this.currentTime);
    }

    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        this.isMuted = false;

        // Save to settings
        this.database.setSettings({ defaultVolume: this.volume });

        this.emitStateChange();
    }

    toggleMute(): void {
        this.isMuted = !this.isMuted;
        this.emitStateChange();
    }

    setRepeat(mode: RepeatMode): void {
        this.repeatMode = mode;
        this.emitStateChange();
    }

    toggleShuffle(): void {
        this.isShuffled = !this.isShuffled;
        if (this.isShuffled) {
            this.generateShuffleOrder();
        }
        this.emitStateChange();
    }

    // ---- Queue Management ----

    addToQueue(track: Track, source: QueueItem['source'] = 'collection', playNext = false, emitUpdate = true): void {
        const queueItem: QueueItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            track,
            source,
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
    }

    addTracksToQueue(tracks: Track[], source: QueueItem['source'] = 'collection', playNext = false): void {
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
    }

    removeFromQueue(queueItemId: string): void {
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
                this.playIndex(this.currentIndex);
            }
        }

        if (this.isShuffled) {
            this.generateShuffleOrder();
        }

        this.emitQueueUpdate();
    }

    clearQueue(keepCurrent = true): void {
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
    }

    reorderQueue(fromIndex: number, toIndex: number): void {
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
    }

    playIndex(index: number): void {
        if (index < 0 || index >= this.queue.length) return;

        this.currentIndex = index;
        const queueItem = this.queue[index];
        this.play(queueItem.track, false);
        this.emitQueueUpdate();
    }

    getQueue(): { items: QueueItem[]; currentIndex: number } {
        return {
            items: [...this.queue],
            currentIndex: this.currentIndex,
        };
    }

    // ---- Time Updates (called from renderer via IPC) ----

    updateTime(currentTime: number, duration: number): void {
        this.currentTime = currentTime;
        this.duration = duration;
        this.emitTimeUpdate();

        // Check for scrobble
        this.checkScrobble();

        // Check if track ended
        if (currentTime >= duration && duration > 0) {
            this.handleTrackEnd();
        }
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

    private handleTrackEnd(): void {
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
        };
    }

    getStreamUrl(track: Track): string {
        // Check if cached
        const cachedPath = this.cacheService.getCachedPath(track.id);
        if (cachedPath) {
            return `file://${cachedPath}`;
        }
        return track.streamUrl;
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
    }

    private emitTrackChange(): void {
        this.emit('track-changed', this.currentTrack);
    }

    private emitTimeUpdate(): void {
        this.emit('time-update', { currentTime: this.currentTime, duration: this.duration });
    }

    private emitQueueUpdate(): void {
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
}
