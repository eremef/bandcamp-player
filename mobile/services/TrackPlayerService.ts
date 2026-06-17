import TrackPlayer, { Event, PlaybackState } from '@rntp/player';
import { useStore } from '../store';

function handleIsPlayingChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    useStore.setState({ isPlaying: event.playing });
}

async function handleTrackEnd() {
    if (useStore.getState().mode !== 'standalone') return;
    const { mobilePlayerService } = require('./MobilePlayerService');
    await mobilePlayerService.handleTrackEnd();
}

async function handleStateChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    if (event.state === PlaybackState.Ended) {
        const state = useStore.getState();
        const { currentTime, duration } = state;
        
        // RNTP v5 triggers Ended when the final track naturally finishes.
        // It does not trigger on dummy tracks because those throw PlaybackError.
        const store = useStore.getState();
        const { queue, repeatMode } = store;
        
        if (queue.items.length > 0) {
            if (queue.currentIndex === queue.items.length - 1) {
                if (repeatMode === 'all') {
                    console.log('[MobilePlayer] Queue ended. Looping to start.');
                    await useStore.getState().playQueueIndex(0);
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
    if (useStore.getState().mode !== 'standalone') return;
    const { mobilePlayerService } = require('./MobilePlayerService');
    if (mobilePlayerService.isLoadingTrack) {
        return;
    }
    const store = useStore.getState();
    console.log(`[MobilePlayer] Native transitioned to index: ${event.index}. Current JS index: ${store.queue.currentIndex}`);
    if (event.index !== undefined && event.index !== null && event.index !== store.queue.currentIndex) {
        await store.playQueueIndex(event.index);
    }
}

export async function PlaybackService(event?: any) {
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
            const p1 = TrackPlayer.getProgress();
            useStore.getState().seek(p1.position + event.interval);
            break;
        }
        case Event.RemoteSkipBackward: {
            const p2 = TrackPlayer.getProgress();
            useStore.getState().seek(p2.position - event.interval);
            break;
        }
        case Event.RemoteStop:
            await TrackPlayer.clear();
            break;
    }
}

// Foreground Listeners
TrackPlayer.addEventListener(Event.IsPlayingChanged, handleIsPlayingChanged);
TrackPlayer.addEventListener(Event.PlaybackStateChanged, handleStateChanged);
TrackPlayer.addEventListener(Event.MediaItemTransition, handleMediaItemTransition);

TrackPlayer.addEventListener(Event.RemotePlay, () => useStore.getState().play());
TrackPlayer.addEventListener(Event.RemotePause, () => useStore.getState().pause());
TrackPlayer.addEventListener(Event.RemoteNext, () => useStore.getState().next());
TrackPlayer.addEventListener(Event.RemotePrevious, () => useStore.getState().previous());
TrackPlayer.addEventListener(Event.RemoteSeek, (event) => useStore.getState().seek(event.position));
TrackPlayer.addEventListener(Event.RemoteSkipForward, async (event) => {
    const progress = await TrackPlayer.getProgress();
    useStore.getState().seek(progress.position + event.interval);
});
TrackPlayer.addEventListener(Event.RemoteSkipBackward, async (event) => {
    const progress = await TrackPlayer.getProgress();
    useStore.getState().seek(progress.position - event.interval);
});
TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.clear());
