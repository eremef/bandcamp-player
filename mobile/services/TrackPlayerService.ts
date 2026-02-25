import TrackPlayer, { Event, Capability, AppKilledPlaybackBehavior, State } from 'react-native-track-player';
import { useStore } from '../store';

export async function PlaybackService() {
    // Initial configuration
    await TrackPlayer.updateOptions({
        android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
        capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
            Capability.JumpForward,
            Capability.JumpBackward,
        ],
        notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
        ],
        progressUpdateEventInterval: 1,
    });

    // Progress and state listeners for Standalone mode
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
        if (useStore.getState().mode !== 'standalone') return;
        // Only update duration from the event if valid — streaming URLs often
        // report duration=0 until fully buffered, which would clobber the correct
        // duration set from the scraper response.
        const update: { currentTime: number; duration?: number } = {
            currentTime: event.position,
        };
        if (event.duration > 0) {
            update.duration = event.duration;
        }
        useStore.setState(update);

        // Scrobble tracking
        const { mobileScrobblerService } = require('./MobileScrobblerService');
        mobileScrobblerService.handleProgressUpdate(event.position, event.duration);
    });

    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
        if (useStore.getState().mode !== 'standalone') return;
        const isPlaying = event.state === State.Playing;
        useStore.setState({ isPlaying });
    });

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
        useStore.getState().play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
        useStore.getState().pause();
    });

    TrackPlayer.addEventListener(Event.RemotePlayPause, () => {
        if (useStore.getState().isPlaying) {
            useStore.getState().pause();
        } else {
            useStore.getState().play();
        }
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
        useStore.getState().next();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        useStore.getState().previous();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
        useStore.getState().seek(event.position);
    });

    TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
        const progress = await TrackPlayer.getProgress();
        useStore.getState().seek(progress.position + event.interval);
    });

    TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
        const progress = await TrackPlayer.getProgress();
        useStore.getState().seek(progress.position - event.interval);
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
        TrackPlayer.reset();
    });

    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (_event) => {
        // Only handle track end in standalone mode
        // In remote mode, TrackPlayer.reset() in addTrack() fires this event spuriously
        if (useStore.getState().mode !== 'standalone') return;
        const { mobilePlayerService } = require('./MobilePlayerService');
        await mobilePlayerService.handleTrackEnd();
    });
}
