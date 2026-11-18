import { nativePlayerAdapter as TrackPlayer } from './NitroPlayerAdapter';
import type { NativeMediaItem } from './NitroPlayerAdapter';
import { Track } from '@shared/types';
import { useStore } from '../store';

export async function setupPlayer() {
    try {
        await TrackPlayer.setupPlayer();
        return true;
    } catch (error) {
        console.error('Error setting up player:', error);
        return false;
    }
}

export async function addTrack(track: Track, hostIp?: string, queueItems: any[] = [], currentIndex: number = 0) {
    // Ensure player is set up before adding track
    await setupPlayer();

    // Keep a native proxy item for remote metadata; its volume remains zero to avoid double audio.

    let streamUrl = track.streamUrl || 'http://localhost/dummy.mp3';

    // Fix localhost URL if running on a real device
    if (hostIp && (streamUrl.includes('localhost') || streamUrl.includes('127.0.0.1'))) {
        streamUrl = streamUrl.replace(/localhost|127\.0\.0\.1/g, hostIp);
    }

    const storeDuration = useStore.getState().duration;

    // To support native Next/Previous buttons and correct lock screen metadata in remote mode,
    // we feed the entire queue to the native player. We only provide the real URL
    // for the current track.
    let nativeQueue: NativeMediaItem[] = queueItems.map((qTrack, idx) => {
        let dur = qTrack.track.duration;
        if ((!dur || dur <= 0) && (idx === currentIndex || qTrack.track.id === track.id) && storeDuration > 0) {
            dur = storeDuration;
        }
        return {
            mediaId: qTrack.id,
            url: streamUrl,
            title: qTrack.track.title || 'Untitled',
            artist: qTrack.track.artist || 'Unknown Artist',
            albumTitle: qTrack.track.album,
            artworkUrl: qTrack.track.artworkUrl,
            duration: dur && dur > 0 ? dur : 0,
            extraPayload: { queueIndex: idx },
        };
    });

    // Fallback if queue is empty for some reason
    if (nativeQueue.length === 0) {
        const dur = track.duration || (storeDuration > 0 ? storeDuration : 0);
        nativeQueue = [{
            mediaId: track.id,
            url: streamUrl,
            title: track.title || 'Untitled',
            artist: track.artist || 'Unknown Artist',
            albumTitle: track.album,
            artworkUrl: track.artworkUrl,
            duration: dur && dur > 0 ? dur : 0,
            extraPayload: { queueIndex: 0 },
        }];
        currentIndex = 0;
    }

    const activeIndex = Math.min(Math.max(0, currentIndex), nativeQueue.length - 1);
    const remoteQueue: NativeMediaItem[] = [
        {
            ...nativeQueue[0],
            mediaId: `__beta_remote_previous__${nativeQueue[0].mediaId}`,
            extraPayload: { remoteCommand: 'previous', queueIndex: 0 },
        },
        ...nativeQueue,
        {
            ...nativeQueue[nativeQueue.length - 1],
            mediaId: `__beta_remote_next__${nativeQueue[nativeQueue.length - 1].mediaId}`,
            extraPayload: { remoteCommand: 'next', queueIndex: nativeQueue.length - 1 },
        },
    ];

    await TrackPlayer.setMediaItems(remoteQueue, activeIndex + 1);

    // Set volume to 0 on the mobile device so we only hear the desktop.
    // The phone still "plays" the track to keep the media session active
    // and provide lock screen controls/metadata, but without outputting sound.
    await TrackPlayer.setVolume(0);
}
