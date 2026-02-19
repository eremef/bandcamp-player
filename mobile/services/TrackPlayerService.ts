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
        useStore.setState({
            currentTime: event.position,
            duration: event.duration
        });
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
}
