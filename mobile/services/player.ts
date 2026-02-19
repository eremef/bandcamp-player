import TrackPlayer, {
    Capability,
    AppKilledPlaybackBehavior
} from 'react-native-track-player';
import { Track } from '@shared/types';

export async function setupPlayer() {
    let isSetup = false;
    try {
        await TrackPlayer.setupPlayer();
        isSetup = true;
    } catch (e: any) {
        if (e?.message?.includes('already been initialized')) {
            isSetup = true;
        } else {
            console.error('Error setting up player:', e);
        }
    }

    if (isSetup) {
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
            progressUpdateEventInterval: 2,
        });
    }
    return isSetup;
}

export async function addTrack(track: Track, hostIp?: string) {
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
        title: track.title || 'Untitled',
        artist: track.artist || 'Unknown Artist',
        artwork: track.artworkUrl,
        duration: track.duration,
    });

    // Set volume to 0 on the mobile device so we only hear the desktop
    await TrackPlayer.setVolume(0);
}
