import TrackPlayer from 'react-native-track-player';
import { Track } from '@shared/types';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { mobileCacheService } from './MobileCacheService';

async function fileExists(path: string): Promise<boolean> {
    try {
        const file = new File(path);
        return file.exists;
    } catch {
        return false;
    }
}

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
    return isSetup;
}

export async function addTrack(track: Track, hostIp?: string) {
    await setupPlayer();

    let url = track.streamUrl;
    let isLocal = false;

    const cacheEntry = await mobileCacheService.getCacheEntry(track.id);
    if (cacheEntry) {
        const filePath = cacheEntry.filePath;
        const exists = await fileExists(filePath);
        if (exists) {
            url = Platform.OS === 'ios' 
                ? `file://${filePath}`
                : `content://${filePath}`;
            isLocal = true;
            await mobileCacheService.updateLastAccessed(track.id);
        }
    }

    if (!isLocal && hostIp && (url.includes('localhost') || url.includes('127.0.0.1'))) {
        url = url.replace(/localhost|127\.0\.0\.1/g, hostIp);
    }

    const tracks = await TrackPlayer.getQueue();
    const newTrackIndex = tracks.length;

    await TrackPlayer.add({
        id: track.id,
        url: url,
        title: track.title || 'Untitled',
        artist: track.artist || 'Unknown Artist',
        album: track.album,
        artwork: track.artworkUrl,
        duration: track.duration,
    });

    if (newTrackIndex > 0) {
        await TrackPlayer.skip(newTrackIndex);
        const indicesToRemove = Array.from({ length: newTrackIndex }, (_, i) => i);
        await TrackPlayer.remove(indicesToRemove);
    }

    await TrackPlayer.setVolume(0);
}
