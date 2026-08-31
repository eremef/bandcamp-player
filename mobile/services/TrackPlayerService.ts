import TrackPlayer, { Event, PlaybackState } from '@rntp/player';
import { useStore } from '../store';

let isPlayingTimeout: ReturnType<typeof setTimeout> | null = null;
let consecutiveErrors = 0;
let lastErrorTimestamp = 0;

function handleIsPlayingChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;

    if (event.playing) {
        if (useStore.getState().userIntendedPause) {
            console.log('[TrackPlayerService] Spontaneous play detected while userIntendedPause is true. Forcing pause.');
            TrackPlayer.pause();
            return;
        }

        if (isPlayingTimeout) {
            clearTimeout(isPlayingTimeout);
            isPlayingTimeout = null;
        }
        useStore.setState({ isPlaying: true });
    } else {
        // Debounce the pause state to avoid flicker during track transitions
        if (!isPlayingTimeout) {
            isPlayingTimeout = setTimeout(() => {
                useStore.setState({ isPlaying: false });
                isPlayingTimeout = null;
            }, 300);
        }
    }
}

async function handlePlaybackError(event: any) {
    const store = useStore.getState();
    if (store.mode !== 'standalone') return;
    if (store.userIntendedPause || !store.isPlaying) return;

    const now = Date.now();
    if (now - lastErrorTimestamp < 5000) {
        consecutiveErrors++;
    } else {
        consecutiveErrors = 1;
    }
    lastErrorTimestamp = now;

    if (consecutiveErrors >= 3) {
        console.warn('[TrackPlayerService] Too many consecutive playback errors. Halting playback.');
        consecutiveErrors = 0;
        const { mobilePlayerService } = require('./MobilePlayerService');
        await mobilePlayerService.stop();
        useStore.setState({ collectionError: 'Playback stopped due to multiple stream errors.' });
        return;
    }

    console.warn('[TrackPlayerService] PlaybackError event received:', event);
    const { mobilePlayerService } = require('./MobilePlayerService');
    const targetIndex = (typeof event?.index === 'number' && event.index >= 0 && event.index < store.queue.items.length)
        ? event.index
        : store.queue.currentIndex;
    const targetTrack = store.queue.items[targetIndex]?.track || store.currentTrack;

    if (targetTrack) {
        console.log(`[TrackPlayerService] Attempting URL refresh for ${targetTrack.title}...`);
        const success = await mobilePlayerService.loadTrack(targetTrack, 0, true);
        if (success) {
            consecutiveErrors = 0;
            if (!useStore.getState().userIntendedPause && useStore.getState().isPlaying) {
                TrackPlayer.play();
                useStore.setState({ isPlaying: true });
            }
            return;
        }
    }

    console.warn('[TrackPlayerService] Unrecoverable error. Skipping track...');
    await mobilePlayerService.next();
}

async function handleStateChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    if (event.state === PlaybackState.Ended) {
        const store = useStore.getState();
        const { queue, repeatMode } = store;

        if (queue.items.length > 0) {
            if (queue.currentIndex === queue.items.length - 1) {
                if (repeatMode === 'all') {
                    console.log('[MobilePlayer] Queue ended. Native player should loop. Ignoring.');
                } else {
                    console.log('[MobilePlayer] Queue ended.');
                    const { mobilePlayerService } = require('./MobilePlayerService');
                    await mobilePlayerService.handleTrackEnd();
                }
            }
        }
    }
}

async function handleMediaItemTransition(event: any) {
    const store = useStore.getState();
    const { mobilePlayerService } = require('./MobilePlayerService');

    // Standalone mode logic
    if (store.mode === 'standalone') {
        if (mobilePlayerService.isLoadingTrack) {
            return;
        }
        if (!store.currentTrack) {
            console.log('[MobilePlayer] Ignoring transition: currentTrack is null');
            return;
        }
        console.log(`[MobilePlayer] Native transitioned to index: ${event.index}. Current JS index: ${store.queue.currentIndex}`);
        if (event.index !== undefined && event.index !== null && event.index !== store.queue.currentIndex) {
            if (store.userIntendedPause || !store.isPlaying) {
                if (event.index >= 0 && event.index < store.queue.items.length) {
                    const item = store.queue.items[event.index];
                    useStore.setState({
                        queue: { ...store.queue, currentIndex: event.index },
                        currentTrack: item?.track || null,
                        duration: item?.track?.duration || 0,
                        currentTime: 0,
                        isPlaying: false
                    });
                }
                return;
            }

            if (event.index === mobilePlayerService.prefetchedQueueIndex) {
                store.syncNativeTransition(event.index);
            } else {
                setTimeout(() => {
                    if (useStore.getState().userIntendedPause || !useStore.getState().isPlaying) {
                        return;
                    }
                    mobilePlayerService.playQueueIndex(event.index);
                }, 0);
            }
        }
        return;
    }

    // Remote mode logic
    if (store.mode === 'remote') {
        if (event.index !== undefined && event.index !== null && event.index !== store.queue.currentIndex) {
            console.log(`[RemoteMode] Native transitioned to index: ${event.index}, sending to desktop`);
            await store.playQueueIndex(event.index);
        }
    }
}

export async function PlaybackService(event?: any) {
    console.log(`[PlaybackService] received event:`, event?.type);
    if (!event) return;

    switch (event.type) {
        case Event.IsPlayingChanged:
            handleIsPlayingChanged(event);
            break;
        case Event.PlaybackStateChanged:
            await handleStateChanged(event);
            break;
        case Event.PlaybackError:
        case (Event as any).PlayerError:
            await handlePlaybackError(event);
            break;
        case Event.MediaItemTransition:
            await handleMediaItemTransition(event);
            break;
        case Event.RemotePlay:
            useStore.getState().play();
            break;
        case Event.RemotePause:
            useStore.getState().pause();
            break;
        case Event.RemoteNext:
            useStore.getState().next();
            break;
        case Event.RemotePrevious:
            useStore.getState().previous();
            break;
        case Event.RemoteSeek:
            useStore.getState().seek(event.position);
            break;
        case Event.RemoteSkipForward: {
            const p1 = TrackPlayer.getProgress();
            useStore.getState().seek(p1.position + event.interval);
            break;
        }
        case Event.RemoteSkipBackward: {
            const p2 = TrackPlayer.getProgress();
            useStore.getState().seek(p2.position - event.interval);
            break;
        }
        case Event.RemoteStop: {
            const store = useStore.getState();
            if (store.mode === 'remote' && store.connectionStatus === 'connected') {
                store.pause();
            }
            const { mobilePlayerService } = require('./MobilePlayerService');
            await mobilePlayerService.stop();
            break;
        }
    }
}

// Clean up previous listeners during hot-reloading in dev environment
if ((global as any).trackPlayerSubscriptions) {
    console.log('[TrackPlayerService] Cleaning up old TrackPlayer listeners before attaching new ones');
    (global as any).trackPlayerSubscriptions.forEach((sub: any) => {
        if (sub && typeof sub.remove === 'function') {
            sub.remove();
        }
    });
}

// Foreground Listeners
const subs = [
    TrackPlayer.addEventListener(Event.IsPlayingChanged, handleIsPlayingChanged),
    TrackPlayer.addEventListener(Event.PlaybackStateChanged, handleStateChanged),
    TrackPlayer.addEventListener(Event.PlaybackError, handlePlaybackError),
    TrackPlayer.addEventListener(Event.MediaItemTransition, handleMediaItemTransition),

    TrackPlayer.addEventListener(Event.RemotePlay, () => useStore.getState().play()),
    TrackPlayer.addEventListener(Event.RemotePause, () => useStore.getState().pause()),
    TrackPlayer.addEventListener(Event.RemoteNext, () => useStore.getState().next()),
    TrackPlayer.addEventListener(Event.RemotePrevious, () => useStore.getState().previous()),
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => useStore.getState().seek(event.position)),
    TrackPlayer.addEventListener(Event.RemoteSkipForward, async (event) => {
        const progress = TrackPlayer.getProgress();
        useStore.getState().seek(progress.position + event.interval);
    }),
    TrackPlayer.addEventListener(Event.RemoteSkipBackward, async (event) => {
        const progress = TrackPlayer.getProgress();
        useStore.getState().seek(progress.position - event.interval);
    }),
    TrackPlayer.addEventListener(Event.RemoteStop, async () => {
        const { mobilePlayerService } = require('./MobilePlayerService');
        await mobilePlayerService.stop();
    })
];

(global as any).trackPlayerSubscriptions = subs;
