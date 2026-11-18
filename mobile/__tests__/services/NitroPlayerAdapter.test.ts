jest.mock('react-native-nitro-player');

import type { TrackItem } from 'react-native-nitro-player';

type NitroPlayerMock = {
    TrackPlayer: Record<string, jest.Mock>;
    PlayerQueue: Record<string, jest.Mock>;
    __emitTrackChange: (track: TrackItem, reason?: string) => void;
    __emitPlaybackStateChange: (state: string, reason?: string) => void;
    __emitSeek: (position: number, totalDuration: number) => void;
    __emitNotificationButtonPress: (buttonId: string, track: TrackItem, event: unknown) => void;
};

describe('NitroPlayerAdapter', () => {
    let adapter: typeof import('../../services/NitroPlayerAdapter').nativePlayerAdapter;
    let event: typeof import('../../services/NitroPlayerAdapter').Event;
    let playbackState: typeof import('../../services/NitroPlayerAdapter').PlaybackState;
    let playerMock: NitroPlayerMock;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        delete (globalThis as typeof globalThis & { __betaPlayerNitroAdapterV1?: unknown }).__betaPlayerNitroAdapterV1;
        playerMock = jest.requireMock('react-native-nitro-player') as NitroPlayerMock;
        const adapterModule = require('../../services/NitroPlayerAdapter') as typeof import('../../services/NitroPlayerAdapter');
        adapter = adapterModule.nativePlayerAdapter;
        event = adapterModule.Event;
        playbackState = adapterModule.PlaybackState;
    });

    function createItem(mediaId: string, url = `https://audio.example/${mediaId}.mp3`) {
        return {
            mediaId,
            url,
            title: `Title ${mediaId}`,
            artist: 'Artist',
            albumTitle: 'Album',
            artworkUrl: 'https://art.example/cover.jpg',
            duration: 90,
        };
    }

    function createNitroTrack(id: string): TrackItem {
        return {
            id,
            url: `https://audio.example/${id}.mp3`,
            title: `Title ${id}`,
            artist: 'Artist',
            album: 'Album',
            duration: 90,
        };
    }

    it('configures Nitro once and registers native callbacks only once', async () => {
        await adapter.setupPlayer();
        await adapter.setupPlayer();

        expect(playerMock.TrackPlayer.configure).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.configure).toHaveBeenCalledWith(expect.objectContaining({
            showInNotification: true,
            remoteSkipForwardInterval: 15,
            remoteSkipBackwardInterval: 15,
            lookaheadCount: 5,
            androidAudioFocus: 'ignore',
        }));
        expect(playerMock.TrackPlayer.onChangeTrack).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.onPlaybackStateChange).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.onSeek).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.onPlaybackProgressChange).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.onTracksNeedUpdate).toHaveBeenCalledTimes(1);
        expect(playerMock.TrackPlayer.onNotificationButtonPress).toHaveBeenCalledTimes(1);
    });

    it('maps queue identity and selected index into a serialized Nitro playlist', async () => {
        await adapter.setMediaItems([createItem('queue-a'), createItem('queue-b')], 1);

        expect(playerMock.PlayerQueue.createPlaylist).toHaveBeenCalledWith(
            'Beta Player Active Queue',
            'Ephemeral Beta Player playback queue',
        );
        expect(playerMock.PlayerQueue.addTracksToPlaylist).toHaveBeenCalledWith(
            'mock-playlist-id-1',
            [
                expect.objectContaining({ id: 'queue-a', album: 'Album', artwork: 'https://art.example/cover.jpg' }),
                expect.objectContaining({ id: 'queue-b', album: 'Album', artwork: 'https://art.example/cover.jpg' }),
            ],
        );
        expect(playerMock.PlayerQueue.loadPlaylist).toHaveBeenCalledWith('mock-playlist-id-1', 1);
        expect(adapter.getQueue().map((item) => item.mediaId)).toEqual(['queue-a', 'queue-b']);
        expect(adapter.getActiveMediaItemIndex()).toBe(1);
        expect(adapter.getPlaybackState()).toBe(playbackState.Ready);
    });

    it('serializes overlapping queue replacements', async () => {
        const first = adapter.setMediaItems([createItem('queue-a')], 0);
        const second = adapter.setMediaItems([createItem('queue-b')], 0);
        await Promise.all([first, second]);

        expect(playerMock.PlayerQueue.addTracksToPlaylist.mock.calls.map((call) => call[1][0].id)).toEqual([
            'queue-a',
            'queue-b',
        ]);
        expect(adapter.getQueue().map((item) => item.mediaId)).toEqual(['queue-b']);
    });

    it('does not dispatch a track transition caused by its own playlist load', async () => {
        await adapter.setupPlayer();
        const serviceEvents: Array<Record<string, unknown>> = [];
        adapter.registerPlaybackService((nativeEvent) => { serviceEvents.push(nativeEvent); });
        playerMock.PlayerQueue.loadPlaylist.mockImplementationOnce(async () => {
            playerMock.__emitTrackChange(createNitroTrack('queue-a'));
        });

        await adapter.setMediaItems([createItem('queue-a')], 0);

        expect(serviceEvents.some((nativeEvent) => nativeEvent.type === event.MediaItemTransition)).toBe(false);
        expect(adapter.getActiveMediaItemIndex()).toBe(0);
    });

    it('keeps the active playlist and playback when a staged replacement fails', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        await adapter.play();
        playerMock.PlayerQueue.createPlaylist.mockResolvedValueOnce('staging-playlist');
        playerMock.PlayerQueue.addTracksToPlaylist.mockRejectedValueOnce(new Error('playlist write failed'));

        await expect(adapter.setMediaItems([createItem('queue-b')], 0)).rejects.toThrow('playlist write failed');

        expect(adapter.getQueue().map((item) => item.mediaId)).toEqual(['queue-a']);
        expect(adapter.getActiveMediaItemIndex()).toBe(0);
        expect(adapter.isPlaying()).toBe(true);
        expect(playerMock.TrackPlayer.play).toHaveBeenCalledTimes(2);
        expect(playerMock.PlayerQueue.deletePlaylist).toHaveBeenCalledWith('staging-playlist');
    });

    it('translates Beta Player volume and repeat settings to Nitro', async () => {
        await adapter.setVolume(0.35);
        await adapter.setRepeatMode('all');

        expect(playerMock.TrackPlayer.setVolume).toHaveBeenCalledWith(35);
        expect(playerMock.TrackPlayer.setRepeatMode).toHaveBeenCalledWith('Playlist');
    });

    it('keeps progress and player state reads synchronous from callback snapshots', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        playerMock.__emitPlaybackStateChange('playing', 'user_action');
        playerMock.__emitSeek(23, 90);

        expect(adapter.isPlaying()).toBe(true);
        expect(adapter.getPlaybackState()).toBe(playbackState.Playing);
        expect(adapter.getProgress()).toMatchObject({ position: 23, duration: 90 });
        expect(adapter.getQueue()[0].mediaId).toBe('queue-a');
    });

    it('normalizes native skips as inferred transitions with direction and indices', async () => {
        await adapter.setMediaItems([createItem('queue-a'), createItem('queue-b')], 0);
        const serviceEvents: Array<Record<string, unknown>> = [];
        adapter.registerPlaybackService((nativeEvent) => { serviceEvents.push(nativeEvent); });

        const currentTime = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime + 3000);
        playerMock.__emitTrackChange(createNitroTrack('queue-b'), 'skip');

        const transition = serviceEvents.find((nativeEvent) => nativeEvent.type === event.MediaItemTransition);
        expect(transition).toMatchObject({
            previousIndex: 0,
            index: 1,
            nativeCommand: true,
            inferred: true,
            direction: 'next',
        });
        expect(serviceEvents.some((nativeEvent) => nativeEvent.type === event.RemoteNext)).toBe(false);
        expect(adapter.getActiveMediaItemIndex()).toBe(1);
        jest.restoreAllMocks();
    });

    it('infers external play, pause, stop, and seek only when callbacks are unsuppressed', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        const serviceEvents: Array<Record<string, unknown>> = [];
        adapter.registerPlaybackService((nativeEvent) => { serviceEvents.push(nativeEvent); });

        const currentTime = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime + 3000);
        playerMock.__emitPlaybackStateChange('playing', 'user_action');
        playerMock.__emitPlaybackStateChange('paused', 'user_action');
        playerMock.__emitSeek(42, 90);
        playerMock.__emitPlaybackStateChange('stopped', 'user_action');

        expect(serviceEvents.map((nativeEvent) => nativeEvent.type)).toEqual(expect.arrayContaining([
            event.RemotePlay,
            event.RemotePause,
            event.RemoteSeek,
            event.RemoteStop,
        ]));
        expect(serviceEvents.filter((nativeEvent) => nativeEvent.nativeCommand === true)).toHaveLength(4);
        jest.restoreAllMocks();
    });

    it('routes the patched iOS system Stop command from Nitro notification callbacks', async () => {
        await adapter.setupPlayer();
        const serviceEvents: Array<Record<string, unknown>> = [];
        adapter.registerPlaybackService((nativeEvent) => { serviceEvents.push(nativeEvent); });
        const callback = playerMock.TrackPlayer.onNotificationButtonPress.mock.calls[0][0] as (
            buttonId: string,
            track: TrackItem,
            event: unknown,
        ) => void;

        callback('remote-stop', createNitroTrack('queue-a'), {});

        expect(serviceEvents).toContainEqual(expect.objectContaining({
            type: event.RemoteStop,
            nativeCommand: true,
            inferred: false,
        }));
    });

    it('routes the native notification Stop callback through PlaybackService', async () => {
        const pause = jest.fn();
        const stop = jest.fn().mockResolvedValue(undefined);
        jest.doMock('../../store', () => ({
            useStore: { getState: () => ({ mode: 'remote', connectionStatus: 'disconnected', pause }) },
        }));
        jest.doMock('../../services/MobilePlayerService', () => ({ mobilePlayerService: { stop } }));
        const { PlaybackService } = require('../../services/TrackPlayerService') as typeof import('../../services/TrackPlayerService');

        await adapter.setupPlayer();
        adapter.registerPlaybackService(PlaybackService);
        playerMock.__emitNotificationButtonPress('remote-stop', createNitroTrack('queue-a'), {});

        expect(stop).toHaveBeenCalledTimes(1);
        expect(pause).not.toHaveBeenCalled();
        jest.dontMock('../../store');
        jest.dontMock('../../services/MobilePlayerService');
    });

    it('suppresses callbacks caused by adapter-issued play and seek commands', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        const serviceEvents: Array<Record<string, unknown>> = [];
        adapter.registerPlaybackService((nativeEvent) => { serviceEvents.push(nativeEvent); });

        await adapter.play();
        playerMock.__emitPlaybackStateChange('playing', 'user_action');
        await adapter.seekTo(10);
        playerMock.__emitSeek(10, 90);

        expect(serviceEvents.some((nativeEvent) => nativeEvent.type === event.RemotePlay)).toBe(false);
        expect(serviceEvents.some((nativeEvent) => nativeEvent.type === event.RemoteSeek)).toBe(false);
    });

    it('updates the cached queue and Nitro metadata for a replaced item', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        const replacement = { ...createItem('queue-a', 'file:///cached-a.mp3'), title: 'Cached title' };

        await adapter.replaceMediaItem(0, replacement);

        expect(playerMock.TrackPlayer.updateTracks).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'queue-a', url: 'file:///cached-a.mp3', title: 'Cached title' }),
        ]);
        expect(adapter.getQueue()[0]).toMatchObject({ url: 'file:///cached-a.mp3', title: 'Cached title' });
    });

    it('implements stop, empty queue clear, and logical destroy using public playlist APIs', async () => {
        await adapter.setMediaItems([createItem('queue-a')], 0);
        await adapter.stop();

        expect(playerMock.TrackPlayer.pause).toHaveBeenCalled();
        expect(playerMock.TrackPlayer.seek).toHaveBeenCalledWith(0);
        expect(adapter.getQueue()).toHaveLength(1);
        expect(adapter.getPlaybackState()).toBe(playbackState.Stopped);

        await adapter.clear();
        expect(playerMock.PlayerQueue.removeTracksFromPlaylist).toHaveBeenCalledWith('mock-playlist-id-1', ['queue-a']);
        expect(adapter.getQueue()).toEqual([]);
        expect(adapter.getActiveMediaItemIndex()).toBe(-1);
        expect(adapter.getPlaybackState()).toBe(playbackState.Idle);

        await adapter.setMediaItems([createItem('queue-b')], 0);
        await adapter.destroy();
        expect(playerMock.PlayerQueue.deletePlaylist).toHaveBeenCalledWith('mock-playlist-id-2');
        expect(adapter.getQueue()).toEqual([]);
        expect(adapter.isPlaying()).toBe(false);
    });

    it('uses clear for an empty setMediaItems request without creating an empty playlist', async () => {
        await adapter.setMediaItems([], 0);

        expect(playerMock.PlayerQueue.createPlaylist).not.toHaveBeenCalled();
        expect(playerMock.PlayerQueue.addTracksToPlaylist).not.toHaveBeenCalled();
        expect(adapter.getQueue()).toEqual([]);
        expect(adapter.getActiveMediaItemIndex()).toBe(-1);
    });
});
