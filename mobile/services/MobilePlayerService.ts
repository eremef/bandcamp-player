import TrackPlayer, {
    PlaybackState
} from '@rntp/player';
import { useStore } from '../store';
import { mobileScraperService } from './MobileScraperService';
import { mobileDatabase } from './MobileDatabase';
import { Track, RepeatMode } from '@shared/types';
import { addTrack, setupPlayer } from './player';

class MobilePlayerService {
    private isInitialized = false;
    public isLoadingTrack = false;
    public onQueueChange?: () => void;
    private lastSetVolume: number = -1;
    private lastStoreUpdateTime = 0;
    private pausedPosition: number = 0;
    private loadGeneration = 0;
    private pendingResume: {
        mediaId: string;
        position: number;
        readyAfterRevision: number;
        promise: Promise<boolean>;
        resolve: (ready: boolean) => void;
    } | null = null;
    private authoritativeResume: { mediaId: string; position: number; seekIssued: boolean } | null = null;
    private playbackReadyRevision = 0;
    private controllerRecoveryPromise: Promise<boolean> | null = null;
    private controllerRecoveryNeedsReady = false;
    private controllerRecoveryFailed = false;
    private controllerRecoveryReadyAfterRevision = 0;
    private controllerRecoveryGeneration = 0;

    public prepareForModeChange() {
        this.loadGeneration++;
        this.isLoadingTrack = false;
        this.pausedPosition = 0;
        this.clearPendingResume();
        this.controllerRecoveryGeneration++;
        this.controllerRecoveryPromise = null;
        this.controllerRecoveryNeedsReady = false;
        this.controllerRecoveryFailed = false;
    }

    public getPositionForSnapshot(nativePosition: number): number {
        if (this.pendingResume) return this.pendingResume.position;
        const resume = this.authoritativeResume;
        if (!resume) return nativePosition;
        if (this.isNativeItemActive(resume.mediaId) && nativePosition >= resume.position - 2) {
            this.authoritativeResume = null;
            return nativePosition;
        }
        return resume.position;
    }

    public shouldSuppressNativePlayback() {
        return this.pendingResume !== null;
    }

    public handlePlaybackStateChanged(state: PlaybackState) {
        if (state === PlaybackState.Ready) {
            this.playbackReadyRevision++;
            this.applyPendingResume();
            if (this.controllerRecoveryNeedsReady &&
                this.playbackReadyRevision > this.controllerRecoveryReadyAfterRevision) {
                this.controllerRecoveryNeedsReady = false;
                this.controllerRecoveryFailed = false;
                if (useStore.getState().collectionError === 'The audio player could not reconnect. Try playback again.') {
                    useStore.setState({ collectionError: null });
                }
            }
        } else if (state === PlaybackState.Error && this.pendingResume) {
            this.pendingResume.resolve(false);
            this.pendingResume = null;
        }
    }

    public recoverControllerConnection() {
        const store = useStore.getState();
        if (store.mode !== 'standalone' && store.mode !== 'remote') return Promise.resolve(false);
        if (this.controllerRecoveryPromise) return this.controllerRecoveryPromise;

        if (this.controllerRecoveryNeedsReady) {
            if (!this.controllerRecoveryFailed) {
                this.failControllerRecovery();
            }
            return this.controllerRecoveryPromise || Promise.resolve(false);
        }

        this.controllerRecoveryNeedsReady = true;
        this.controllerRecoveryReadyAfterRevision = this.playbackReadyRevision;
        const recoveryGeneration = ++this.controllerRecoveryGeneration;
        this.controllerRecoveryPromise = this.performControllerRecovery(store.mode, recoveryGeneration);
        return this.controllerRecoveryPromise;
    }

    private cancelControllerRecovery() {
        this.loadGeneration++;
        this.isLoadingTrack = false;
        this.clearPendingResume();
    }

    private failControllerRecovery() {
        const store = useStore.getState();
        const mediaId = store.queue.items[store.queue.currentIndex]?.id || store.currentTrack?.id;
        let position = Number.isFinite(store.currentTime) ? Math.max(0, store.currentTime) : 0;
        if (this.pendingResume) position = this.pendingResume.position;
        else if (this.authoritativeResume) position = this.authoritativeResume.position;
        try {
            const progress = TrackPlayer.getProgress();
            if (Number.isFinite(progress.position) && progress.position > 0) {
                position = this.getPositionForSnapshot(progress.position);
            }
        } catch {
            position = this.pendingResume?.position ?? this.authoritativeResume?.position ?? position;
        }
        this.controllerRecoveryFailed = true;
        this.cancelControllerRecovery();
        if (mediaId) this.authoritativeResume = { mediaId, position, seekIssued: false };
        useStore.setState({ collectionError: 'The audio player could not reconnect. Try playback again.' });
    }

    private async performControllerRecovery(mode: 'standalone' | 'remote', recoveryGeneration: number) {
        const store = useStore.getState();
        if (store.mode !== mode) return false;

        const currentIndex = Math.max(0, store.queue.currentIndex);
        const queueTrack = store.queue.items[currentIndex]?.track;
        const track = store.currentTrack || queueTrack || null;
        const storePosition = Number.isFinite(store.currentTime) ? Math.max(0, store.currentTime) : 0;
        let nativePosition = 0;
        try {
            const progress = TrackPlayer.getProgress();
            if (Number.isFinite(progress.position)) nativePosition = Math.max(0, progress.position);
        } catch {
            nativePosition = 0;
        }
        let position = storePosition;
        try {
            position = this.getPositionForSnapshot(nativePosition > 0 ? nativePosition : storePosition);
        } catch {
            position = storePosition;
        }
        const shouldPlay = mode === 'remote'
            ? store.isPlaying
            : store.isPlaying && !store.userIntendedPause;

        this.cancelControllerRecovery();
        const loadGeneration = this.loadGeneration;
        this.isInitialized = false;
        this.lastSetVolume = -1;

        try {
            TrackPlayer.destroy();
            await this.setupPlayer();
            if (!this.isInitialized) {
                if (this.controllerRecoveryGeneration === recoveryGeneration) this.failControllerRecovery();
                return false;
            }
            if (this.controllerRecoveryFailed || this.loadGeneration !== loadGeneration ||
                this.controllerRecoveryGeneration !== recoveryGeneration) return false;

            const latestStore = useStore.getState();
            if (latestStore.mode !== mode || this.controllerRecoveryFailed ||
                this.controllerRecoveryGeneration !== recoveryGeneration) return false;

            if (mode === 'remote') {
                if (track) {
                    const queuedItemIds = latestStore.queue.items.map(item => item.id);
                    await addTrack(track, latestStore.hostIp, latestStore.queue.items, latestStore.queue.currentIndex);
                    const currentStore = useStore.getState();
                    const currentTrackId = currentStore.currentTrack?.id ||
                        currentStore.queue.items[currentStore.queue.currentIndex]?.track.id;
                    const originalTrackId = store.currentTrack?.id || queueTrack?.id;
                    if (currentStore.mode !== mode || currentTrackId !== originalTrackId ||
                        currentStore.queue.currentIndex !== latestStore.queue.currentIndex ||
                        currentStore.queue.items.length !== queuedItemIds.length ||
                        currentStore.queue.items.some((item, index) => item.id !== queuedItemIds[index]) ||
                        this.controllerRecoveryFailed || this.controllerRecoveryGeneration !== recoveryGeneration) return false;
                    TrackPlayer.setRepeatMode(currentStore.repeatMode as any);
                    if (position > 0) TrackPlayer.seekTo(position);
                }
                if (useStore.getState().isPlaying) {
                    TrackPlayer.play();
                } else {
                    TrackPlayer.pause();
                }
                return true;
            }

            if (!track) return true;
            const loaded = await this.loadTrack(track, position);
            if (!loaded || this.controllerRecoveryFailed) return false;

            const recoveryLoadGeneration = this.loadGeneration;
            const resumeReady = position > 0 ? this.waitForResumeReady() : Promise.resolve(true);
            void resumeReady.then(ready => {
                const current = useStore.getState();
                if (!ready || !shouldPlay || this.controllerRecoveryFailed || this.loadGeneration !== recoveryLoadGeneration ||
                    this.controllerRecoveryGeneration !== recoveryGeneration ||
                    current.mode !== 'standalone' || current.currentTrack?.id !== track.id ||
                    current.userIntendedPause) return;
                TrackPlayer.play();
                useStore.setState({ isPlaying: true });
            }).catch(error => {
                console.warn('[MobilePlayer] Controller recovery resume failed:', error);
            });
            return true;
        } catch (error) {
            if (this.controllerRecoveryGeneration !== recoveryGeneration) return false;
            this.failControllerRecovery();
            console.warn('[MobilePlayer] Controller recovery failed:', error);
            return false;
        } finally {
            if (this.controllerRecoveryGeneration === recoveryGeneration) {
                this.controllerRecoveryPromise = null;
            }
        }
    }

    public handleNativeMediaItemTransition(index?: number, mediaId?: string) {
        if (this.pendingResume) {
            this.applyPendingResume();
            return true;
        }
        if (this.authoritativeResume && mediaId && mediaId !== this.authoritativeResume.mediaId &&
            this.isNativeTransitionCurrent(index, mediaId)) {
            this.authoritativeResume = null;
        }
        return false;
    }

    public isNativeTransitionCurrent(index: number | null | undefined, mediaId?: string) {
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 ||
            typeof TrackPlayer.getActiveMediaItemIndex !== 'function') return false;
        const activeIndex = TrackPlayer.getActiveMediaItemIndex();
        if (typeof activeIndex !== 'number' || activeIndex < 0 || activeIndex !== index) return false;

        const nativeQueue = TrackPlayer.getQueue();
        if (!Array.isArray(nativeQueue) || !nativeQueue[index]) return false;
        return mediaId === undefined || mediaId === null || nativeQueue[index].mediaId === mediaId;
    }

    public async waitForResumeReady() {
        if (!this.pendingResume) return true;
        this.applyPendingResume();
        const pending = this.pendingResume;
        return pending ? pending.promise : true;
    }

    private clearPendingResume() {
        this.pendingResume?.resolve(false);
        this.pendingResume = null;
        this.authoritativeResume = null;
    }

    private isNativeItemActive(mediaId: string) {
        if (typeof TrackPlayer.getActiveMediaItemIndex !== 'function') return false;
        const activeIndex = TrackPlayer.getActiveMediaItemIndex();
        const nativeQueue = TrackPlayer.getQueue();
        return typeof activeIndex === 'number' && Array.isArray(nativeQueue) && nativeQueue[activeIndex]?.mediaId === mediaId;
    }

    private applyPendingResume() {
        const pending = this.pendingResume;
        if (!pending || useStore.getState().mode !== 'standalone') return false;
        if (this.playbackReadyRevision <= pending.readyAfterRevision ||
            TrackPlayer.getPlaybackState() !== PlaybackState.Ready ||
            !this.isNativeItemActive(pending.mediaId)) return false;

        TrackPlayer.seekTo(pending.position);
        this.authoritativeResume = { mediaId: pending.mediaId, position: pending.position, seekIssued: true };
        this.pendingResume = null;
        pending.resolve(true);
        return true;
    }

    private confirmAuthoritativeResume(position: number) {
        const resume = this.authoritativeResume;
        if (resume && position >= resume.position - 2 && this.isNativeItemActive(resume.mediaId)) {
            this.authoritativeResume = null;
        }
    }

    private createPendingResume(mediaId: string, position: number) {
        let resolve!: (ready: boolean) => void;
        const promise = new Promise<boolean>(done => {
            resolve = done;
        });
        this.pendingResume = { mediaId, position, readyAfterRevision: this.playbackReadyRevision, promise, resolve };
        this.authoritativeResume = { mediaId, position, seekIssued: false };
    }

    async setupPlayer() {
        if (this.isInitialized) return;

        const success = await setupPlayer();
        if (!success) return;

        const { volume, mode } = useStore.getState();
        const playerVolume = mode === 'remote' ? 0 : volume;
        TrackPlayer.setVolume(playerVolume);
        this.lastSetVolume = playerVolume;

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
            if (state.mode !== 'standalone' || !state.isPlaying || this.controllerRecoveryNeedsReady) return;

            try {
                const progress = TrackPlayer.getProgress();
                this.confirmAuthoritativeResume(progress.position);
                const now = Date.now();

                // Update UI state roughly every second
                if (now - this.lastStoreUpdateTime >= 1000) {
                    const update: { currentTime: number; duration?: number } = {
                        currentTime: this.getPositionForSnapshot(progress.position),
                    };
                    if (progress.duration > 0) {
                        update.duration = progress.duration;
                        if (state.currentTrack && (!state.currentTrack.duration || state.currentTrack.duration === 0)) {
                            (update as any).currentTrack = { ...state.currentTrack, duration: progress.duration };
                        }
                    }
                    useStore.setState(update);
                    this.lastStoreUpdateTime = now;

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
        if (useStore.getState().mode === 'standalone' && this.controllerRecoveryFailed) {
            useStore.setState({ userIntendedPause: false, isPlaying: true, collectionError: null });
            this.controllerRecoveryGeneration++;
            this.controllerRecoveryPromise = null;
            this.controllerRecoveryNeedsReady = false;
            this.controllerRecoveryFailed = false;
            await this.recoverControllerConnection();
            return;
        }

        useStore.setState({ userIntendedPause: false });
        if (!this.isInitialized) await this.setupPlayer();

        // If a track is provided, play it directly
        if (track) {
            await this.playTrack(track);
            return;
        }

        const generation = this.loadGeneration;
        const resumeReady = await this.waitForResumeReady();
        if (!resumeReady || generation !== this.loadGeneration || useStore.getState().userIntendedPause) return;

        const store = useStore.getState();
        if (this.pendingResume || store.mode && store.mode !== 'standalone') return;
        this.prefetchedQueueIndex = -1; // Reset prefetch index on explicit play

        // If no track provided, resume current or play from queue
        const expectedMediaId = store.queue.items[store.queue.currentIndex]?.id || store.currentTrack?.id;
        const authoritativeResume = this.authoritativeResume;
        const savedResume = expectedMediaId && authoritativeResume?.mediaId === expectedMediaId
            ? authoritativeResume.position
            : 0;
        const resumePosition = savedResume || (this.pausedPosition > 0 ? this.pausedPosition : store.currentTime);
        this.pausedPosition = 0;

        const playbackState = TrackPlayer.getPlaybackState();
        const playing = TrackPlayer.isPlaying();
        const nativeQueue = TrackPlayer.getQueue();
        const activeIndex = TrackPlayer.getActiveMediaItemIndex();
        const hasExpectedNativeTrack = typeof activeIndex === 'number' && Array.isArray(nativeQueue) &&
            nativeQueue[activeIndex]?.mediaId === expectedMediaId;
        if (!playing && playbackState !== PlaybackState.Error && hasExpectedNativeTrack) {
            if (savedResume > 0 && expectedMediaId && this.isNativeItemActive(expectedMediaId)) {
                const currentPosition = TrackPlayer.getProgress().position;
                if (currentPosition < savedResume - 2 && !this.authoritativeResume?.seekIssued) {
                    TrackPlayer.seekTo(savedResume);
                }
            }
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
        const nativePosition = TrackPlayer.getProgress().position;
        const position = this.pendingResume
            ? this.pendingResume.position
            : this.getPositionForSnapshot(nativePosition);
        this.pausedPosition = position;
        useStore.setState({ userIntendedPause: true, currentTime: position });
        TrackPlayer.pause();
        useStore.setState({ isPlaying: false });
        useStore.getState().saveQueue();
    }

    async stop() {
        useStore.setState({ userIntendedPause: true });
        this.prepareForModeChange();
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
        const totalItems = queue.items.length;

        // Skip unstreamable/unreleased tracks during queue playback
        while (nextIndex < totalItems && queue.items[nextIndex].track.hasStream === false) {
            console.log(`[MobilePlayer] Skipping unreleased track at index ${nextIndex}: ${queue.items[nextIndex].track.title}`);
            nextIndex++;
        }

        if (isShuffled) {
            // Filter streamable indices for shuffle
            const validIndices = queue.items
                .map((item, i) => item.track.hasStream !== false ? i : -1)
                .filter(i => i !== -1);
            if (validIndices.length > 0) {
                nextIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
            }
        }

        if (nextIndex >= totalItems) {
            if (repeatMode === 'all') {
                nextIndex = 0;
                while (nextIndex < totalItems && queue.items[nextIndex].track.hasStream === false) {
                    nextIndex++;
                }
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
        while (prevIndex >= 0 && queue.items[prevIndex].track.hasStream === false) {
            console.log(`[MobilePlayer] Skipping unreleased track backward at index ${prevIndex}: ${queue.items[prevIndex].track.title}`);
            prevIndex--;
        }

        if (prevIndex < 0) {
            if (store.repeatMode === 'all') {
                prevIndex = queue.items.length - 1;
                while (prevIndex >= 0 && queue.items[prevIndex].track.hasStream === false) {
                    prevIndex--;
                }
            } else {
                prevIndex = 0;
            }
        }

        await this.playQueueIndex(prevIndex);
    }

    seek(position: number) {
        this.pausedPosition = position;
        if (this.pendingResume) {
            this.pendingResume.position = position;
            this.authoritativeResume = { mediaId: this.pendingResume.mediaId, position, seekIssued: false };
        } else {
            this.authoritativeResume = null;
            TrackPlayer.seekTo(position);
        }
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
    public async loadTrack(track: Track, initialPosition: number = 0, forceRefreshUrl: boolean = false): Promise<boolean> {
        const generation = ++this.loadGeneration;
        this.clearPendingResume();
        this.isLoadingTrack = true;
        try {
            if (!this.isInitialized) await this.setupPlayer();
            if (generation !== this.loadGeneration) return false;

            const store = useStore.getState();
            const { offlineMode, cachedTrackIds } = store;
            const isCached = cachedTrackIds.has(track.id);

            // In offline mode, skip non-cached tracks
            if (offlineMode && !isCached) {
                console.log(`[MobilePlayer] Skipping track ${track.id} - offline mode active and track not cached`);
                if (generation === this.loadGeneration) {
                    useStore.setState({ collectionError: 'Track not available offline.' });
                }
                return false;
            }

            let streamUrl = forceRefreshUrl ? '' : track.streamUrl;

            // Check if track is cached locally
            if (isCached) {
                const { mobileCacheService } = require('./MobileCacheService');
                const cachedUri = await mobileCacheService.getCachedUri(track.id);
                if (generation !== this.loadGeneration) return false;
                if (cachedUri) {
                    streamUrl = cachedUri;
                    console.log(`[MobilePlayer] Using cached file: ${cachedUri}`);
                } else {
                    console.log(`[MobilePlayer] Cache entry exists but file missing for track ${track.id}. Proceeding with stream.`);
                }
            }

            if (!streamUrl) {
                console.log(`[MobilePlayer] fetching stream URL for ${track.title} (forceRefresh=${forceRefreshUrl})`);
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
                            if (generation !== this.loadGeneration) return false;
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
                            } catch {
                                // Ignore invalid URL errors
                            }
                        }
                        const albumDetails = await mobileScraperService.getAlbumDetails(finalUrlToFetch);
                        if (generation !== this.loadGeneration) return false;
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
                console.warn(`[MobilePlayer] Track "${track.title}" is unreleased or missing stream URL.`);
                if (generation === this.loadGeneration) {
                    useStore.setState({ collectionError: `"${track.title}" is unreleased (pre-order track)` });
                }
                return false;
            }

            const currentMode = (useStore.getState() as { mode?: string }).mode;
            if (currentMode && currentMode !== 'standalone') {
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

            console.log(`[MobilePlayer] Final stream URL: ${streamUrl}`);

            const nativeQueue = await Promise.all(queueItems.map(async (qTrack, idx) => {
                let itemUrl = 'http://localhost/dummy.mp3';
                if (idx === currentIndex) {
                    itemUrl = streamUrl;
                } else if (qTrack.track.streamUrl) {
                    itemUrl = qTrack.track.streamUrl;
                } else if (cachedTrackIds?.has?.(qTrack.track.id)) {
                    try {
                        const { mobileCacheService } = require('./MobileCacheService');
                        const cachedUri = await mobileCacheService?.getCachedUri?.(qTrack.track.id);
                        if (cachedUri) {
                            itemUrl = cachedUri;
                        }
                    } catch {
                        // Keep dummy fallback
                    }
                }

                return {
                    mediaId: qTrack.id,
                    url: itemUrl,
                    title: qTrack.track.title || 'Untitled',
                    artist: qTrack.track.artist || 'Unknown Artist',
                    albumTitle: qTrack.track.album,
                    artworkUrl: qTrack.track.artworkUrl,
                    duration: qTrack.track.duration,
                };
            }));
            if (generation !== this.loadGeneration) return false;

            const latestStore = useStore.getState();
            if (latestStore.mode && latestStore.mode !== 'standalone') return false;
            if (queueItems.length > 0 && (
                latestStore.queue.currentIndex !== currentIndex ||
                latestStore.queue.items[currentIndex]?.track.id !== track.id
            )) return false;

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

            const resumePosition = Number.isFinite(initialPosition) ? Math.max(0, initialPosition) : 0;
            const resumeMediaId = finalQueue[finalIndex]?.mediaId;
            if (resumePosition > 0 && resumeMediaId) {
                this.createPendingResume(resumeMediaId, resumePosition);
            }

            const artistName = track.artist || 'Unknown Artist';
            useStore.setState({
                currentTrack: { ...track, streamUrl, artist: artistName },
                duration: track.duration,
                currentTime: resumePosition,
                collectionError: null
            });

            TrackPlayer.setMediaItems(finalQueue, finalIndex);
            TrackPlayer.setRepeatMode(latestStore.repeatMode as any);
            this.applyPendingResume();

            return true;
        } catch (e) {
            console.error('[MobilePlayer] Load failed:', e);
            if (generation === this.loadGeneration) {
                this.clearPendingResume();
                useStore.setState({ collectionError: 'Failed to load track.' });
            }
            return false;
        } finally {
            if (generation === this.loadGeneration) {
                this.isLoadingTrack = false;
            }
        }
    }

    /**
     * Load and play a specific track
     */
    public async playTrack(track: Track, initialPosition: number = 0, forceRefreshUrl: boolean = false) {
        const loadPromise = this.loadTrack(track, initialPosition, forceRefreshUrl);
        const generation = this.loadGeneration;
        const success = await loadPromise;
        if (generation !== this.loadGeneration) return;
        if (success) {
            const resumeReady = await this.waitForResumeReady();
            const latestStore = useStore.getState();
            if (!resumeReady || generation !== this.loadGeneration ||
                (latestStore.mode && latestStore.mode !== 'standalone') ||
                latestStore.currentTrack?.id !== track.id ||
                (initialPosition > 0 && latestStore.userIntendedPause)) return;

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

    async playQueueIndex(index: number, initialPosition: number = 0, forceRefreshUrl: boolean = false) {
        if (this.isLoadingTrack && index === this.lastPlayedQueueIndex && !forceRefreshUrl) {
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

            await this.playTrack(item.track, initialPosition, forceRefreshUrl);
            this.onQueueChange?.();
        }
    }

    async addTrackToQueue(_track: Track, _playNext: boolean) {
        // This hook is just for any side effects of adding to queue
        // e.g. logging or analytics
    }
}

export const mobilePlayerService = new MobilePlayerService();
