import TrackPlayer, {
    Capability,
    AppKilledPlaybackBehavior
} from 'react-native-track-player';

export async function setupPlayer() {
    let isSetup = false;
    try {
        await TrackPlayer.getCurrentTrack();
        isSetup = true;
    } catch {
        await TrackPlayer.setupPlayer();
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
            ],
            compactCapabilities: [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
            ],
            progressUpdateEventInterval: 2,
        });
        isSetup = true;
    }
    return isSetup;
}

export async function addTrack(track: any) {
    // We add a "dummy" track that represents the remote state
    // We don't actually play audio on the phone (to avoid double audio), 
    // but TrackPlayer needs some URL to show metadata.
    // We can use a silent 1s mp3 or just the actual URL but at volume 0.
    await TrackPlayer.reset();
    await TrackPlayer.add({
        id: track.id,
        url: track.streamUrl, // Use actual URL to show 'playing' status
        title: track.title,
        artist: track.artist,
        artwork: track.artworkUrl,
        duration: track.duration,
    });

    // Set volume to 0 on the mobile device so we only hear the desktop
    await TrackPlayer.setVolume(0);
}
