import TrackPlayer, {
    State
} from 'react-native-track-player';
import { useStore } from '../store';
import { mobileScraperService } from './MobileScraperService';
import { mobileDatabase } from './MobileDatabase';
import { Track, RepeatMode } from '@shared/types';
import { setupPlayer } from './player';

class MobilePlayerService {
    private isInitialized = false;
    public onQueueChange?: () => void;
    private progressPollInterval: ReturnType<typeof setInterval> | null = null;

    private startProgressPolling() {
        this.stopProgressPolling();
        this.progressPollInterval = setInterval(async () => {
            try {
                const progress = await TrackPlayer.getProgress();
                const update: { currentTime: number; duration?: number } = {
                    currentTime: progress.position,
                };
                if (progress.duration > 0) {
                    update.duration = progress.duration;
                }
                useStore.setState(update);
            } catch {
                // Player not ready
            }
        }, 1000);
    }

    private stopProgressPolling() {
        if (this.progressPollInterval !== null) {
            clearInterval(this.progressPollInterval);
            this.progressPollInterval = null;
        }
    }

    async setupPlayer() {
        if (this.isInitialized) return;

        const success = await setupPlayer();
        if (!success) return;

        // Set initial volume from store
        const { volume } = useStore.getState();
        await TrackPlayer.setVolume(volume);

        this.isInitialized = true;
    }

    async play(track?: Track) {
        if (!this.isInitialized) await this.setupPlayer();

        const store = useStore.getState();

        // If a track is provided, play it directly
        if (track) {
            await this.playTrack(track);
            return;
        }

        // If no track provided, resume current or play from queue
        // If we are already paused on a track, resume
        const playbackState = await TrackPlayer.getPlaybackState();
        if (playbackState.state === State.Paused || playbackState.state === State.Ready) {
            await TrackPlayer.play();
            useStore.setState({ isPlaying: true });
            this.startProgressPolling();
        } else if (store.currentTrack) {
            // If we have a track but player state is stopped/none, re-load it?
            // Maybe.
            await this.playTrack(store.currentTrack);
        } else if (store.queue.items.length > 0) {
            // If queue has items but no current track, play first/current index
            const index = Math.max(0, store.queue.currentIndex);
            await this.playQueueIndex(index);
        }
    }

    async pause() {
        this.stopProgressPolling();
        await TrackPlayer.pause();
        useStore.setState({ isPlaying: false });
    }

    async stop() {
        this.stopProgressPolling();
        await TrackPlayer.reset();
        useStore.setState({ isPlaying: false, currentTrack: null, currentTime: 0, duration: 0 });
    }

    async next() {
        const store = useStore.getState();
        const { queue, repeatMode, isShuffled } = store;

        if (queue.items.length === 0) return;

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
                return;
            }
        }

        console.log('[MobilePlayer] Next track index:', nextIndex);
        await this.playQueueIndex(nextIndex);
    }

    async previous() {
        const store = useStore.getState();
        const { queue, currentTime } = store;

        // If played more than 3 sec, restart track
        if (currentTime > 3) {
            await this.seek(0);
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

    async seek(position: number) {
        await TrackPlayer.seekTo(position);
        useStore.setState({ currentTime: position });
    }

    async setVolume(level: number) {
        await TrackPlayer.setVolume(level);
        useStore.setState({ volume: level });
        await mobileDatabase.setSetting('standalone_volume', level);
    }

    async toggleShuffle() {
        const store = useStore.getState();
        const isShuffled = !store.isShuffled;
        useStore.setState({ isShuffled });
        this.onQueueChange?.();
    }

    async setRepeat(mode: RepeatMode) {
        useStore.setState({ repeatMode: mode });
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
            await this.seek(0);
            await TrackPlayer.play();
        } else {
            // Delay slightly to prevent race conditions?
            await this.next();
        }
    }

    /**
     * Prepare the player with a track (resolve URL, add to player) without playing
     */
    public async loadTrack(track: Track, initialPosition: number = 0): Promise<boolean> {
        try {
            if (!this.isInitialized) await this.setupPlayer();

            const store = useStore.getState();
            if (store.mode === 'standalone') {
                await TrackPlayer.reset();
            }

            let streamUrl = track.streamUrl;

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
                        const albumDetails = await mobileScraperService.getAlbumDetails(urlToFetch);
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

            // Update Store (but don't set isPlaying yet)
            const artistName = track.artist || 'Unknown Artist';
            useStore.setState({
                currentTrack: { ...track, streamUrl, artist: artistName },
                duration: track.duration,
                currentTime: initialPosition,
                collectionError: null
            });

            console.log(`[MobilePlayer] Final stream URL: ${streamUrl}`);

            const queue = await TrackPlayer.getQueue();
            const nextIndex = queue.length;

            await TrackPlayer.add({
                id: track.id,
                url: streamUrl,
                title: track.title || 'Untitled',
                artist: artistName,
                album: track.album,
                artwork: track.artworkUrl,
                duration: track.duration,
            });

            if (nextIndex > 0) {
                await TrackPlayer.skip(nextIndex);
                // Clean up previous tracks
                const oldIndices = Array.from({ length: nextIndex }, (_, i) => i);
                await TrackPlayer.remove(oldIndices);
            }

            if (initialPosition > 0) {
                console.log(`[MobilePlayer] Seeking to initial position: ${initialPosition}`);
                await TrackPlayer.seekTo(initialPosition);
            }

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
    public async playTrack(track: Track) {
        const success = await this.loadTrack(track);
        if (success) {
            // Restore volume from store to be safe (might have been 0 from remote mode)
            const { volume } = useStore.getState();
            await TrackPlayer.setVolume(volume);

            useStore.setState({ isPlaying: true });
            console.log('[MobilePlayer] Calling TrackPlayer.play()');
            await TrackPlayer.play();
            console.log('[MobilePlayer] Playback started');
            this.startProgressPolling();
        } else {
            useStore.setState({ isPlaying: false });
        }
    }

    async playQueueIndex(index: number) {
        const store = useStore.getState();
        const { queue } = store;

        if (index >= 0 && index < queue.items.length) {
            const item = queue.items[index];

            // Update index
            useStore.setState({
                queue: { ...queue, currentIndex: index }
            });

            await this.playTrack(item.track);
            this.onQueueChange?.();
        }
    }

    async addTrackToQueue(_track: Track, _playNext: boolean) {
        // This hook is just for any side effects of adding to queue
        // e.g. logging or analytics
    }
}

export const mobilePlayerService = new MobilePlayerService();
