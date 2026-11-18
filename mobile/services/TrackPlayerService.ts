import { nativePlayerAdapter as TrackPlayer, Event, PlaybackState } from './NitroPlayerAdapter';
import { useStore } from '../store';

let isPlayingTimeout: ReturnType<typeof setTimeout> | null = null;
let consecutiveErrors = 0;
let lastErrorTimestamp = 0;

function handleIsPlayingChanged(event: any) {
    if (useStore.getState().mode !== 'standalone') return;

    if (event.playing) {
        const { mobilePlayerService } = require('./MobilePlayerService');
        if (mobilePlayerService.shouldSuppressNativePlayback()) {
            void TrackPlayer.pause().catch(error => {
                console.warn('[TrackPlayerService] Could not pause suppressed playback:', error);
            });
            return;
        }
        if (useStore.getState().userIntendedPause) {
            console.log('[TrackPlayerService] Spontaneous play detected while userIntendedPause is true. Forcing pause.');
            void TrackPlayer.pause().catch(error => {
                console.warn('[TrackPlayerService] Could not pause unexpected playback:', error);
            });
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
                if (useStore.getState().mode === 'standalone') {
                    useStore.setState({ isPlaying: false });
                }
                isPlayingTimeout = null;
            }, 300);
        }
    }
}
async function handlePlaybackError(event: any) {
    const store = useStore.getState();
    if (event?.code === 'controller-connection-failed') {
        const { mobilePlayerService } = require('./MobilePlayerService');
        await mobilePlayerService.recoverControllerConnection();
        return;
    }
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
    const itemQueueIndex = event?.item?.extraPayload?.queueIndex;
    const matchingQueueIndex = typeof event?.mediaId === 'string'
        ? store.queue.items.findIndex((item) => item.id === event.mediaId)
        : -1;
    const candidateIndex = Number.isInteger(event?.queueIndex)
        ? event.queueIndex
        : Number.isInteger(itemQueueIndex)
            ? itemQueueIndex
            : matchingQueueIndex >= 0
                ? matchingQueueIndex
                : event?.index;
    const targetIndex = (typeof candidateIndex === 'number' && candidateIndex >= 0 && candidateIndex < store.queue.items.length)
        ? candidateIndex
        : store.queue.currentIndex;
    const targetTrack = store.queue.items[targetIndex]?.track || store.currentTrack;

    if (targetTrack) {
        let retryPosition = 0;
        if (targetTrack.id === store.currentTrack?.id) {
            try {
                const nativePosition = TrackPlayer.getProgress().position;
                const snapshotPosition = mobilePlayerService.getPositionForSnapshot(nativePosition);
                retryPosition = Number.isFinite(snapshotPosition) ? snapshotPosition : store.currentTime;
            } catch {
                retryPosition = store.currentTime;
            }
        }
        console.log(`[TrackPlayerService] Attempting URL refresh for ${targetTrack.title}...`);
        const success = await mobilePlayerService.loadTrack(targetTrack, retryPosition, true);
        if (success) {
            const resumeReady = await mobilePlayerService.waitForResumeReady();
            const latestStore = useStore.getState();
            if (!resumeReady || latestStore.mode !== 'standalone' || latestStore.currentTrack?.id !== targetTrack.id) return;
            consecutiveErrors = 0;
            if (!latestStore.userIntendedPause) {
                await TrackPlayer.play();
                useStore.setState({ isPlaying: true });
            }
            return;
        }
    }

    console.warn('[TrackPlayerService] Unrecoverable error. Skipping track...');
    await mobilePlayerService.next();
}
async function handleStateChanged(event: any) {
    const { mobilePlayerService } = require('./MobilePlayerService');
    mobilePlayerService.handlePlaybackStateChanged(event.state);
    if (useStore.getState().mode !== 'standalone') return;
    if (event.state === PlaybackState.Ended) {
        const nativeQueue = TrackPlayer.getQueue();
        const activeIndex = TrackPlayer.getActiveMediaItemIndex();
        if (nativeQueue[activeIndex]?.extraPayload?.remoteCommand === 'next') return;

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

    if (store.mode === 'remote') {
        if (event?.nativeCommand && event.direction === 'next') {
            useStore.getState().next();
        } else if (event?.nativeCommand && event.direction === 'previous') {
            useStore.getState().previous();
        }
        return;
    }

    // Standalone mode logic
    if (store.mode === 'standalone') {
        if (mobilePlayerService.handleNativeMediaItemTransition(event.index, event.item?.mediaId)) return;
        if (mobilePlayerService.isLoadingTrack) {
            return;
        }
        if (!mobilePlayerService.isNativeTransitionCurrent(event.index, event.item?.mediaId)) return;
        if (!store.currentTrack) {
            console.log('[MobilePlayer] Ignoring transition: currentTrack is null');
            return;
        }

        const queueIndex = Number.isInteger(event.queueIndex) ? event.queueIndex : event.index;
        const remoteCommand = event.item?.extraPayload?.remoteCommand;
        const targetQueueItem = store.queue.items[queueIndex];
        const targetTrackNeedsAppResolution = !!targetQueueItem?.track &&
            !targetQueueItem.track.streamUrl && !store.cachedTrackIds?.has?.(targetQueueItem.track.id);
        const requiresAppQueueLogic = store.isShuffled || remoteCommand === 'next' || remoteCommand === 'previous' ||
            targetQueueItem?.track?.hasStream === false || targetTrackNeedsAppResolution;
        if (event?.nativeCommand && requiresAppQueueLogic) {
            const previousQueueItemId = store.queue.items[store.queue.currentIndex]?.id;
            if (remoteCommand) await TrackPlayer.setVolume(0);
            if (event.direction === 'previous') await mobilePlayerService.previous();
            else await mobilePlayerService.next();

            const latest = useStore.getState();
            const currentItem = latest.queue.items[latest.queue.currentIndex];
            if (currentItem && currentItem.id !== previousQueueItemId && latest.currentTrack) {
                const { mobileScrobblerService } = require('./MobileScrobblerService');
                await mobileScrobblerService.handleTrackTransition(currentItem.id, latest.queue.currentIndex);
            }
            return;
        }

        const { mobileScrobblerService } = require('./MobileScrobblerService');
        await mobileScrobblerService.handleTrackTransition(event.item?.mediaId, queueIndex);
        if (useStore.getState().mode !== 'standalone' ||
            !mobilePlayerService.isNativeTransitionCurrent(event.index, event.item?.mediaId)) return;
        console.log(`[MobilePlayer] Native transitioned to index: ${event.index}. Current JS index: ${store.queue.currentIndex}`);
        if (queueIndex !== undefined && queueIndex !== null && queueIndex !== store.queue.currentIndex) {
            if (store.userIntendedPause || !store.isPlaying) {
                if (queueIndex >= 0 && queueIndex < store.queue.items.length) {
                    const item = store.queue.items[queueIndex];
                    useStore.setState({
                        queue: { ...store.queue, currentIndex: queueIndex },
                        currentTrack: item?.track || null,
                        duration: item?.track?.duration || 0,
                        currentTime: 0,
                        isPlaying: false
                    });
                }
                return;
            }

            if (queueIndex === mobilePlayerService.prefetchedQueueIndex) {
                store.syncNativeTransition(queueIndex);
            } else {
                setTimeout(() => {
                    if (useStore.getState().userIntendedPause || !useStore.getState().isPlaying) {
                        return;
                    }
                    mobilePlayerService.playQueueIndex(queueIndex);
                }, 0);
            }
        }
        return;
    }
}

async function handleProgressUpdated(event: any) {
    if (useStore.getState().mode !== 'standalone') return;
    const { mobileScrobblerService } = require('./MobileScrobblerService');
    await mobileScrobblerService.handleProgressUpdate(event.position, event.duration, event.mediaId);
}

export async function PlaybackService(event?: any) {
    if (!event) return;

    if (event?.type !== Event.PlaybackProgressUpdated) {
        console.log(`[PlaybackService] received event:`, event?.type);
    }

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
        case Event.PlaybackProgressUpdated:
            await handleProgressUpdated(event);
            break;
        case Event.TracksNeedUpdate: {
            const { mobilePlayerService } = require('./MobilePlayerService');
            await mobilePlayerService.handleTracksNeedUpdate(event.tracks || []);
            break;
        }
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
