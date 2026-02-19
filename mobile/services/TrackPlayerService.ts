import TrackPlayer, { Event } from 'react-native-track-player';
import { useStore } from '../store';

export async function PlaybackService() {
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
