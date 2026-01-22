import { EventEmitter } from 'events';
import type { Track, QueueItem, RepeatMode, PlayerState, RadioStation, RadioState } from '../../shared/types';
import { CacheService } from './cache.service';
import { ScrobblerService } from './scrobbler.service';
import { ScraperService } from './scraper.service';

// ============================================================================
// Player Service
// ============================================================================

export class PlayerService extends EventEmitter {
    private cacheService: CacheService;
    private scrobblerService: ScrobblerService;
    private scraperService: ScraperService;

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

    constructor(cacheService: CacheService, scrobblerService: ScrobblerService, scraperService: ScraperService) {
        super();
        this.cacheService = cacheService;
        this.scrobblerService = scrobblerService;
        this.scraperService = scraperService;
    }

    // ---- Playback Control ----

    async play(track?: Track): Promise<void> {
        if (track) {
            // Play a specific track
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
    }

    async playStation(station: RadioStation): Promise<void> {
        this.stop();
        this.currentStation = station;
        this.isRadioActive = true;

        // Fetch stream URL on demand if missing
        let streamUrl = station.streamUrl;
        if (!streamUrl) {
            console.log(`Resolving stream URL for station: ${station.name}`);
            streamUrl = await this.scraperService.getStationStreamUrl(station.id);
            if (!streamUrl) {
                console.error(`Failed to resolve stream URL for station: ${station.name}`);
                // Could handle error here? But for now let it fail or play silence.
            } else {
                // Update station object too
                station.streamUrl = streamUrl;
            }
        }

        const radioTrack: Track = {
            id: `radio-${station.id}`,
            title: station.name,
            artist: 'Bandcamp Radio',
            album: station.description || '',
            duration: 0,
            artworkUrl: station.imageUrl || '',
            streamUrl: streamUrl,
            bandcampUrl: 'https://bandcamp.com',
            isCached: false
        };

        this.currentTrack = radioTrack;
        console.log('Playing radio station track:', JSON.stringify(radioTrack, null, 2));
        this.isPlaying = true;
        this.emitStateChange();
        this.emitTrackChange();
        this.emitRadioStateChange();
    }

    stopRadio(): void {
        this.stop();
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
                this.stop();
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
        this.currentTime = Math.max(0, Math.min(time, this.duration));
        this.emitTimeUpdate();
    }

    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        this.isMuted = false;
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

    addToQueue(track: Track, source: QueueItem['source'] = 'collection', playNext = false): void {
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

        this.emitQueueUpdate();
    }

    addTracksToQueue(tracks: Track[], source: QueueItem['source'] = 'collection'): void {
        for (const track of tracks) {
            this.addToQueue(track, source, false);
        }
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

    clearQueue(): void {
        const currentItem = this.currentIndex >= 0 ? this.queue[this.currentIndex] : null;
        this.queue = currentItem ? [currentItem] : [];
        this.currentIndex = currentItem ? 0 : -1;
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
        this.play(queueItem.track);
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
                items: this.queue,
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
