import TrackPlayer, {
    Capability,
    AppKilledPlaybackBehavior
} from 'react-native-track-player';

export async function setupPlayer() {
    let isSetup = false;
    try {
        const activeTrack = await TrackPlayer.getActiveTrackIndex();
        if (activeTrack !== undefined) {
            isSetup = true;
        }
    } catch { }

    if (!isSetup) {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
            android: {
                appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
            },
            // capabilities defines the media controls available
            capabilities: [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
                Capability.SeekTo,
            ],
            // compactCapabilities is removed in v4+, Android uses capabilities
            progressUpdateEventInterval: 2,
        });
        isSetup = true;
    }
    return isSetup;
}

export async function addTrack(track: any, hostIp?: string) {
    // We add a "dummy" track that represents the remote state
    // We don't actually play audio on the phone (to avoid double audio), 
    // but TrackPlayer needs some URL to show metadata.

    let streamUrl = track.streamUrl;

    // Fix localhost URL if running on a real device
    if (hostIp && (streamUrl.includes('localhost') || streamUrl.includes('127.0.0.1'))) {
        streamUrl = streamUrl.replace(/localhost|127\.0\.0\.1/g, hostIp);
    }

    await TrackPlayer.reset();
    await TrackPlayer.add({
        id: track.id,
        url: streamUrl, // Use executable URL
        title: track.title,
        artist: track.artist,
        artwork: track.artworkUrl,
        duration: track.duration,
    });

    // Set volume to 0 on the mobile device so we only hear the desktop
    await TrackPlayer.setVolume(0);
}
