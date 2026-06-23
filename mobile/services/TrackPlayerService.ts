import TrackPlayer, { Event, PlaybackState } from '@rntp/player';
import { useStore } from '../store';

let isPlayingTimeout: ReturnType<typeof setTimeout> | null = null;

function handleIsPlayingChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    
    if (event.playing) {
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


async function handleStateChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    if (event.state === PlaybackState.Ended) {
        
        // RNTP v5 triggers Ended when the final track naturally finishes.
        // It does not trigger on dummy tracks because those throw PlaybackError.
        const store = useStore.getState();
        const { queue, repeatMode } = store;
        
        if (queue.items.length > 0) {
            if (queue.currentIndex === queue.items.length - 1) {
                if (repeatMode === 'all') {
                    console.log('[MobilePlayer] Queue ended. Native player should loop. Ignoring.');
                } else {
                    console.log('[MobilePlayer] Queue ended.');
                    // Just reset the play state or notify MobilePlayerService
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
        console.log(`[MobilePlayer] Native transitioned to index: ${event.index}. Current JS index: ${store.queue.currentIndex}`);
        if (event.index !== undefined && event.index !== null && event.index !== store.queue.currentIndex) {
            if (event.index === mobilePlayerService.prefetchedQueueIndex) {
                // If it was prefetched, the native player already has the real URL and is playing it.
                // Just sync the UI state.
                store.syncNativeTransition(event.index);
            } else {
                // Not prefetched. The native player hit a dummy.mp3 and stopped.
                // We must load and play it properly.
                // Use setTimeout to avoid doing this synchronously inside the event handler
                setTimeout(() => {
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
            const p1 = await TrackPlayer.getProgress();
            useStore.getState().seek(p1.position + event.interval);
            break;
        }
        case Event.RemoteSkipBackward: {
            const p2 = await TrackPlayer.getProgress();
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
    TrackPlayer.addEventListener(Event.MediaItemTransition, handleMediaItemTransition),

    TrackPlayer.addEventListener(Event.RemotePlay, () => useStore.getState().play()),
    TrackPlayer.addEventListener(Event.RemotePause, () => useStore.getState().pause()),
    TrackPlayer.addEventListener(Event.RemoteNext, () => useStore.getState().next()),
    TrackPlayer.addEventListener(Event.RemotePrevious, () => useStore.getState().previous()),
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => useStore.getState().seek(event.position)),
    TrackPlayer.addEventListener(Event.RemoteSkipForward, async (event) => {
        const progress = await TrackPlayer.getProgress();
        useStore.getState().seek(progress.position + event.interval);
    }),
    TrackPlayer.addEventListener(Event.RemoteSkipBackward, async (event) => {
        const progress = await TrackPlayer.getProgress();
        useStore.getState().seek(progress.position - event.interval);
    }),
    TrackPlayer.addEventListener(Event.RemoteStop, async () => {
        const { mobilePlayerService } = require('./MobilePlayerService');
        await mobilePlayerService.stop();
    })
];

(global as any).trackPlayerSubscriptions = subs;
