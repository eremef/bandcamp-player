import TrackPlayer, {
    PlaybackState
} from '@rntp/player';
import { useStore } from '../store';
import { mobileScraperService } from './MobileScraperService';
import { mobileDatabase } from './MobileDatabase';
import { Track, RepeatMode } from '@shared/types';
import { setupPlayer } from './player';

class MobilePlayerService {
    private isInitialized = false;
    public isLoadingTrack = false;
    public onQueueChange?: () => void;
    private lastSetVolume: number = -1;
    private lastStoreUpdateTime = 0;
    private pausedPosition: number = 0;

    async setupPlayer() {
        if (this.isInitialized) return;

        const success = await setupPlayer();
        if (!success) return;

        const { volume } = useStore.getState();
        TrackPlayer.setVolume(volume);
        this.lastSetVolume = volume;

        this.isInitialized = true;
        this.startProgressPolling();
    }

    private progressInterval?: ReturnType<typeof setInterval>;

    private applyVolume(targetVolume: number) {
        if (Math.abs(this.lastSetVolume - targetVolume) > 0.01) {
            this.lastSetVolume = targetVolume;
            try {
                TrackPlayer.setVolume(targetVolume);
            } catch {
                // Ignore volume errors
            }
        }
    }

    private isPrefetching = false;
    private prefetchedQueueIndex = -1;

    private async prefetchNextTrack() {
        if (this.isPrefetching) return;
        const store = useStore.getState();
        const { queue, isShuffled, repeatMode } = store;

        if (queue.items.length === 0) return;

        let nextIndex = queue.currentIndex + 1;

        if (isShuffled) {
            // Can't reliably prefetch if next() uses random
            return;
        }

        if (nextIndex >= queue.items.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                return;
            }
        }

        if (this.prefetchedQueueIndex === nextIndex) return;

        const nextQueueItem = queue.items[nextIndex];
        const nextTrack = nextQueueItem.track;

        let streamUrl = nextTrack.streamUrl;

        this.isPrefetching = true;
        try {
            const isCached = store.cachedTrackIds?.has?.(nextTrack.id) || false;
            
            if (store.offlineMode && !isCached) {
                // In offline mode, don't prefetch non-cached tracks
                this.isPrefetching = false;
                return;
            }

            if (isCached) {
                const { mobileCacheService } = require('./MobileCacheService');
                const cachedUri = await mobileCacheService?.getCachedTrackUri?.(nextTrack.id);
                if (cachedUri) {
                    streamUrl = cachedUri;
                }
            }

            if (!streamUrl && nextTrack.bandcampUrl) {
                const { mobileScraperService } = require('./MobileScraperService');
                const urlToFetch = nextTrack.bandcampUrl;
                if (urlToFetch?.includes?.('show=')) {
                    const showId = urlToFetch?.split?.('show=')?.pop()?.split?.('&')?.[0];
                    if (showId) {
                        const result = await mobileScraperService?.getStationStreamUrl?.(showId);
                        if (result?.streamUrl) streamUrl = result.streamUrl;
                    }
                } else {
                    const albumDetails = await mobileScraperService?.getAlbumDetails?.(urlToFetch);
                    if (albumDetails) {
                        const foundTrack = albumDetails.tracks?.find?.((t: any) => t.title?.toLowerCase?.() === nextTrack.title?.toLowerCase?.() || t.id === nextTrack.id);
                        if (foundTrack?.streamUrl) streamUrl = foundTrack.streamUrl;
                        else if (albumDetails.tracks?.length === 1) streamUrl = albumDetails.tracks[0].streamUrl;
                    }
                }
            }

            if (streamUrl) {
                const updatedItem = {
                    mediaId: nextQueueItem.id,
                    url: streamUrl,
                    title: nextTrack.title || 'Untitled',
                    artist: nextTrack.artist || 'Unknown Artist',
                    albumTitle: nextTrack.album,
                    artworkUrl: nextTrack.artworkUrl,
                    duration: nextTrack.duration,
                };
                try {
                    if (typeof TrackPlayer.replaceMediaItem === 'function') {
                        TrackPlayer.replaceMediaItem(nextIndex, updatedItem);
                    } else if (typeof TrackPlayer.updateMetadata === 'function') {
                        TrackPlayer.updateMetadata(nextIndex, updatedItem);
                    }
                } catch (err) {
                    console.warn('[MobilePlayer] Error replacing media item:', err);
                }

                const newItems = [...queue.items];
                newItems[nextIndex] = {
                    ...nextQueueItem,
                    track: { ...nextTrack, streamUrl }
                };
                useStore.setState({ queue: { ...queue, items: newItems } });
                this.prefetchedQueueIndex = nextIndex;
            }
        } catch (e: any) {
            console.log('[MobilePlayer] Prefetch failed', e?.message || e);
            if (e?.stack) console.log(e.stack);
        } finally {
            this.isPrefetching = false;
        }
    }

    private startProgressPolling() {
        if (this.progressInterval) return;
        this.progressInterval = setInterval(() => {
            const state = useStore.getState();
            if (state.mode !== 'standalone' || !state.isPlaying) return;

            try {
                const progress = TrackPlayer.getProgress();
                const now = Date.now();

                // Update UI state roughly every second
                if (now - this.lastStoreUpdateTime >= 1000) {
                    const update: { currentTime: number; duration?: number } = {
                        currentTime: progress.position,
                    };
                    if (progress.duration > 0) {
                        update.duration = progress.duration;
                    }
                    useStore.setState(update);
                    this.lastStoreUpdateTime = now;

                    const { mobileScrobblerService } = require('./MobileScrobblerService');
                    mobileScrobblerService.handleProgressUpdate(progress.position, progress.duration);
                }

                // Handle Simulated Crossfade (Volume fading)
                const { crossfadeEnabled, crossfadeDuration, volume } = state;
                const timeRemaining = progress.duration - progress.position;

                if (progress.duration > 0 && progress.position >= 5) {
                    this.prefetchNextTrack();
                }

                if (crossfadeEnabled && crossfadeDuration > 0 && progress.duration > 0) {
                    if (timeRemaining <= crossfadeDuration && timeRemaining > 0) {
                        // Fade out
                        const fadeRatio = Math.max(0, timeRemaining / crossfadeDuration);
                        this.applyVolume(volume * fadeRatio);
                    } else if (progress.position < crossfadeDuration && progress.position > 0) {
                        // Fade in
                        const fadeRatio = Math.min(1, progress.position / crossfadeDuration);
                        this.applyVolume(volume * fadeRatio);
                    } else {
                        this.applyVolume(volume);
                    }
                } else {
                    this.applyVolume(volume);
                }

            } catch {
                // Ignore errors if player is not fully ready
            }
        }, 250);
    }

    async play(track?: Track) {
        useStore.setState({ userIntendedPause: false });
        if (!this.isInitialized) await this.setupPlayer();

        const store = useStore.getState();
        this.prefetchedQueueIndex = -1; // Reset prefetch index on explicit play

        // If a track is provided, play it directly
        if (track) {
            await this.playTrack(track);
            return;
        }

        // If no track provided, resume current or play from queue
        const resumePosition = this.pausedPosition;
        this.pausedPosition = 0;

        const playbackState = TrackPlayer.getPlaybackState();
        const playing = TrackPlayer.isPlaying();
        if (!playing && playbackState === PlaybackState.Ready) {
            TrackPlayer.play();
            useStore.setState({ isPlaying: true });
        } else if (store.currentTrack) {
            await this.playTrack(store.currentTrack, resumePosition);
        } else if (store.queue.items.length > 0) {
            const index = Math.max(0, store.queue.currentIndex);
            await this.playQueueIndex(index, resumePosition);
        }
    }

    pause() {
        useStore.setState({ userIntendedPause: true });
        this.pausedPosition = TrackPlayer.getProgress().position;
        TrackPlayer.pause();
        useStore.setState({ isPlaying: false });
        useStore.getState().saveQueue();
    }

    async stop() {
        useStore.setState({ userIntendedPause: true });
        try {
            await TrackPlayer.stop();
            await TrackPlayer.clear();
        } catch (e) {
            console.log('[MobilePlayer] Error stopping player:', e);
        }
        useStore.setState({ isPlaying: false });
        useStore.getState().saveQueue();
    }

    async next() {
        const store = useStore.getState();
        const { queue, repeatMode, isShuffled } = store;

        this.prefetchedQueueIndex = -1; // Reset prefetch index on explicit next

        if (queue.items.length === 0) return;

        // If we are already at the end of the queue and not repeating, do nothing
        if (queue.currentIndex >= queue.items.length && repeatMode !== 'all') {
            return;
        }

        let nextIndex = queue.currentIndex + 1;

        if (isShuffled) {
            // Simple random next
            nextIndex = Math.floor(Math.random() * queue.items.length);
        }

        if (nextIndex >= queue.items.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                // End of queue
                await this.stop();
                useStore.setState({
                    currentTrack: null,
                    currentTime: 0,
                    duration: 0,
                    queue: { ...queue, currentIndex: queue.items.length }
                });
                return;
            }
        }

        console.log('[MobilePlayer] Next track index:', nextIndex);
        await this.playQueueIndex(nextIndex);
    }

    async previous() {
        const store = useStore.getState();
        const { queue, currentTime } = store;

        this.prefetchedQueueIndex = -1; // Reset prefetch index on explicit previous

        // If played more than 3 sec, restart track
        if (currentTime > 3) {
            this.seek(0);
            return;
        }

        if (queue.items.length === 0) return;

        let prevIndex = queue.currentIndex - 1;
        if (prevIndex < 0) {
            if (store.repeatMode === 'all') {
                prevIndex = queue.items.length - 1;
            } else {
                prevIndex = 0;
            }
        }

        await this.playQueueIndex(prevIndex);
    }

    seek(position: number) {
        TrackPlayer.seekTo(position);
        useStore.setState({ currentTime: position });
    }

    async setVolume(level: number) {
        this.lastSetVolume = level;
        TrackPlayer.setVolume(level);
        useStore.setState({ volume: level });
        await mobileDatabase.setSetting('standalone_volume', level);
    }

    toggleShuffle() {
        const store = useStore.getState();
        const isShuffled = !store.isShuffled;
        useStore.setState({ isShuffled });
        this.onQueueChange?.();
    }

    setRepeat(mode: RepeatMode) {
        useStore.setState({ repeatMode: mode });
        try {
            TrackPlayer.setRepeatMode(mode as any);
        } catch (e) {
            console.log('[MobilePlayer] Failed to set native repeat mode', e);
        }
        this.onQueueChange?.();
    }

    /**
     * Called when track finishes (via Event.PlaybackQueueEnded)
     */
    async handleTrackEnd() {
        const store = useStore.getState();
        const { repeatMode, currentTrack } = store;

        console.log('[MobilePlayer] Track ended. Repeat mode:', repeatMode);

        if (repeatMode === 'one' && currentTrack) {
            this.seek(0);
            TrackPlayer.play();
        } else {
            // Delay slightly to prevent race conditions?
            await this.next();
        }
    }

    /**
     * Prepare the player with a track (resolve URL, add to player) without playing
     */
    public async loadTrack(track: Track, initialPosition: number = 0): Promise<boolean> {
        this.isLoadingTrack = true;
        try {
            if (!this.isInitialized) await this.setupPlayer();

            const store = useStore.getState();
            const { offlineMode, cachedTrackIds } = store;
            const isCached = cachedTrackIds.has(track.id);

            // In offline mode, skip non-cached tracks
            if (offlineMode && !isCached) {
                console.log(`[MobilePlayer] Skipping track ${track.id} - offline mode active and track not cached`);
                this.isLoadingTrack = false;
                useStore.setState({ collectionError: 'Track not available offline.' });
                return false;
            }

            let streamUrl = track.streamUrl;

            // Check if track is cached locally
            if (isCached) {
                const { mobileCacheService } = require('./MobileCacheService');
                const cachedUri = await mobileCacheService.getCachedUri(track.id);
                if (cachedUri) {
                    streamUrl = cachedUri;
                    console.log(`[MobilePlayer] Using cached file: ${cachedUri}`);
                } else {
                     console.log(`[MobilePlayer] Cache entry exists but file missing for track ${track.id}. Proceeding with stream.`);
                }
            }

            if (!streamUrl) {
                console.log(`[MobilePlayer] fetching stream URL for ${track.title}`);
                // Try to get album details using bandcampUrl
                // If bandcampUrl is missing, try to construct it or fail

                const urlToFetch = track.bandcampUrl;
                if (urlToFetch) {
                    if (urlToFetch.includes('show=')) {
                        // Radio show branch
                        const showId = urlToFetch.split('show=').pop()?.split('&')[0];
                        if (showId) {
                            console.log(`[MobilePlayer] fetching radio stream URL for show ${showId}`);
                            const result = await mobileScraperService.getStationStreamUrl(showId);
                            if (result && result.streamUrl) {
                                streamUrl = result.streamUrl;
                                if (result.duration) {
                                    track.duration = result.duration;
                                }
                            }
                        }
                    } else {
                        // Album/Track branch
                        let finalUrlToFetch = urlToFetch;
                        // Self-healing: fix mangled URLs (e.g. /album/.../track/...) from older versions
                        if (finalUrlToFetch.includes('/album/') && finalUrlToFetch.includes('/track/')) {
                            try {
                                const urlObj = new URL(finalUrlToFetch);
                                const trackIdx = urlObj.pathname.indexOf('/track/');
                                if (trackIdx > 0) {
                                    urlObj.pathname = urlObj.pathname.substring(trackIdx);
                                    finalUrlToFetch = urlObj.href;
                                    console.log(`[MobilePlayer] Un-mangled track URL to: ${finalUrlToFetch}`);
                                }
                            } catch (e) {
                                // Ignore invalid URL errors
                            }
                        }
                        const albumDetails = await mobileScraperService.getAlbumDetails(finalUrlToFetch);
                        if (albumDetails) {
                            // Find matching track
                            const foundTrack = albumDetails.tracks.find(t =>
                                t.title.toLowerCase() === track.title.toLowerCase() ||
                                t.id === track.id
                            );

                            if (foundTrack && foundTrack.streamUrl) {
                                streamUrl = foundTrack.streamUrl;
                                console.log(`[MobilePlayer] Found stream URL: ${streamUrl}`);
                            } else if (albumDetails.tracks.length === 1) {
                                // Single track fallback
                                streamUrl = albumDetails.tracks[0].streamUrl;
                            }
                        }
                    }
                }
            }

            if (!streamUrl) {
                console.error('[MobilePlayer] No stream URL found for playTrack');
                useStore.setState({ collectionError: 'Could not find stream URL for this track.' });
                return false;
            }

            const state = useStore.getState();
            const queueItems = state.queue.items;
            const currentIndex = state.queue.currentIndex;

            if (queueItems.length > 0) {
                if (currentIndex < 0 || currentIndex >= queueItems.length || queueItems[currentIndex].track.id !== track.id) {
                    console.log(`[MobilePlayer] Aborting loadTrack for ${track.title} - superseded`);
                    return false;
                }
            }

            // Update Store (but don't set isPlaying yet)
            const artistName = track.artist || 'Unknown Artist';
            useStore.setState({
                currentTrack: { ...track, streamUrl, artist: artistName },
                duration: track.duration,
                currentTime: initialPosition,
                collectionError: null
            });

            console.log(`[MobilePlayer] Final stream URL: ${streamUrl}`);

            // To support native Next/Previous buttons and correct lock screen metadata,
            // we feed the entire queue to the native player. We only provide the real URL
            // for the current track. The others get dummy URLs and will be resolved when skipped to.
            const nativeQueue = queueItems.map((qTrack, idx) => ({
                mediaId: qTrack.id,
                url: idx === currentIndex ? streamUrl : 'http://localhost/dummy.mp3',
                title: qTrack.track.title || 'Untitled',
                artist: qTrack.track.artist || 'Unknown Artist',
                albumTitle: qTrack.track.album,
                artworkUrl: qTrack.track.artworkUrl,
                duration: qTrack.track.duration,
            }));

            let finalQueue = [...nativeQueue];
            let finalIndex = currentIndex;
            if (finalQueue.length === 0) {
                finalQueue = [{
                    mediaId: track.id,
                    url: streamUrl,
                    title: track.title || 'Untitled',
                    artist: track.artist || 'Unknown Artist',
                    albumTitle: track.album,
                    artworkUrl: track.artworkUrl,
                    duration: track.duration,
                }];
                finalIndex = 0;
            }

            try {
                TrackPlayer.setMediaItems(finalQueue, finalIndex);
                TrackPlayer.setRepeatMode(state.repeatMode as any);
            } finally {
                this.isLoadingTrack = false;
            }
            console.log(`[MobilePlayer] Seeking to position: ${initialPosition || 0}`);
            TrackPlayer.seekTo(initialPosition || 0);

            return true;
        } catch (e) {
            console.error('[MobilePlayer] Load failed:', e);
            useStore.setState({ collectionError: 'Failed to load track.' });
            return false;
        }
    }

    /**
     * Load and play a specific track
     */
    public async playTrack(track: Track, initialPosition: number = 0) {
        const success = await this.loadTrack(track, initialPosition);
        if (success) {
            const { volume } = useStore.getState();
            TrackPlayer.setVolume(volume);

            useStore.setState({ isPlaying: true, userIntendedPause: false });
            useStore.getState().saveQueue();
            console.log('[MobilePlayer] Calling TrackPlayer.play()');
            TrackPlayer.play();
            console.log('[MobilePlayer] Playback started');
        } else {
            useStore.setState({ isPlaying: false });
        }
    }

    private lastPlayedQueueIndex = -1;

    async playQueueIndex(index: number, initialPosition: number = 0) {
        if (this.isLoadingTrack && index === this.lastPlayedQueueIndex) {
            console.log('[MobilePlayer] Ignoring duplicate call to playQueueIndex');
            return;
        }
        this.lastPlayedQueueIndex = index;

        const store = useStore.getState();
        const { queue } = store;

        if (index >= 0 && index < queue.items.length) {
            const item = queue.items[index];

            useStore.setState({
                queue: { ...queue, currentIndex: index }
            });

            await this.playTrack(item.track, initialPosition);
            this.onQueueChange?.();
        }
    }

    async addTrackToQueue(_track: Track, _playNext: boolean) {
        // This hook is just for any side effects of adding to queue
        // e.g. logging or analytics
    }
}

export const mobilePlayerService = new MobilePlayerService();
