import TrackPlayer, { PlayerCommand } from '@rntp/player';
import { Track } from '@shared/types';

export async function setupPlayer() {
    let isSetup = false;
    try {
        await TrackPlayer.setupPlayer({
            android: {
                taskRemovedBehavior: 'stop',
            }
        });
        await TrackPlayer.setCommands({
            capabilities: [
                PlayerCommand.PlayPause,
                PlayerCommand.Next,
                PlayerCommand.Previous,
                PlayerCommand.Seek,
                PlayerCommand.Stop,
                PlayerCommand.SkipForward,
                PlayerCommand.SkipBackward,
            ],
            handling: 'js'
        });
        isSetup = true;
    } catch (e: any) {
        if (e?.message?.includes('already been initialized') || e?.message?.includes('already initialized') || e?.message?.includes('already set up')) {
            isSetup = true;
        } else {
            console.error('Error setting up player:', e);
        }
    }
    return isSetup;
}

export async function addTrack(track: Track, hostIp?: string) {
    // Ensure player is set up before adding track
    await setupPlayer();

    // We add a "dummy" track that represents the remote state
    // We don't actually play audio on the phone (to avoid double audio), 
    // but TrackPlayer needs some URL to show metadata.

    let streamUrl = track.streamUrl;

    // Fix localhost URL if running on a real device
    if (hostIp && (streamUrl.includes('localhost') || streamUrl.includes('127.0.0.1'))) {
        streamUrl = streamUrl.replace(/localhost|127\.0\.0\.1/g, hostIp);
    }

    await TrackPlayer.setMediaItem({
        mediaId: track.id,
        url: streamUrl, // Use executable URL
        title: track.title || 'Untitled',
        artist: track.artist || 'Unknown Artist',
        albumTitle: track.album,
        artworkUrl: track.artworkUrl,
        duration: track.duration,
    });

    // Set volume to 0 on the mobile device so we only hear the desktop.
    // The phone still "plays" the track to keep the media session active
    // and provide lock screen controls/metadata, but without outputting sound.
    await TrackPlayer.setVolume(0);
}
