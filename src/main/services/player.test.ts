import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PlayerService } from './player.service';
import { CacheService } from './cache.service';
import { ScrobblerService } from './scrobbler.service';
import { ScraperService } from './scraper.service';
import { CastService } from './cast.service';
import { Database } from '../database/database';
import { Track } from '../../shared/types';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('./cache.service');
vi.mock('./scrobbler.service');
vi.mock('./scraper.service');
vi.mock('./cast.service');
vi.mock('../database/database');

describe('PlayerService', () => {
    let playerService: PlayerService;
    let mockCacheService: any;
    let mockScrobblerService: any;
    let mockScraperService: any;
    let mockCastService: any;
    let mockDatabase: any;

    const mockTrack: Track = {
        id: '1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 100,
        artworkUrl: '',
        streamUrl: 'http://test.com/stream',
        bandcampUrl: '',
        isCached: false,
    };

    beforeEach(() => {
        // Setup mocks
        mockCacheService = {
            getCachedPath: vi.fn(),
        };
        mockScrobblerService = {
            updateNowPlaying: vi.fn(),
            scrobble: vi.fn(),
        };
        mockScraperService = {
            getStationStreamUrl: vi.fn().mockResolvedValue({ streamUrl: 'http://default.stream', duration: 0 }),
            getTrackStreamUrl: vi.fn().mockResolvedValue('http://default.stream'),
        };

        // Make cast service an EventEmitter for listener tests
        mockCastService = Object.assign(new EventEmitter(), {
            play: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            stop: vi.fn(),
            seek: vi.fn(),
            setVolume: vi.fn(),
            setMuted: vi.fn(),
            getConnectedDevice: vi.fn().mockReturnValue(null),
        });

        mockDatabase = {
            getSettings: vi.fn().mockReturnValue({ defaultVolume: 0.5 }),
            setSettings: vi.fn(),
        };

        playerService = new PlayerService(
            mockCacheService as unknown as CacheService,
            mockScrobblerService as unknown as ScrobblerService,
            mockScraperService as unknown as ScraperService,
            mockCastService as unknown as CastService,
            mockDatabase as unknown as Database
        );

        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Cast Listeners', () => {
        it('should handle status-changed to connected', async () => {
            playerService.play(mockTrack);
            mockCastService.emit('status-changed', { status: 'connected' });

            expect(playerService.getState().isCasting).toBe(true);
            expect(mockScraperService.getTrackStreamUrl).toHaveBeenCalledWith(mockTrack);

            // Wait for promise resolution
            await new Promise(r => setTimeout(r, 0));
            expect(mockCastService.play).toHaveBeenCalledWith(mockTrack, 0);
        });

        it('should handle failed track stream refresh on cast connect', async () => {
            playerService.play(mockTrack);
            mockScraperService.getTrackStreamUrl.mockRejectedValue(new Error('Network error'));

            mockCastService.emit('status-changed', { status: 'connected' });
            await new Promise(r => setTimeout(r, 0));

            expect(mockCastService.play).toHaveBeenCalledWith(mockTrack, 0); // Play anyway with old URL
        });

        it('should handle finished event when casting', () => {
            playerService.play(mockTrack);
            mockCastService.emit('status-changed', { status: 'connected' });

            vi.spyOn(playerService as any, 'handleTrackEnd');
            mockCastService.emit('finished');

            expect((playerService as any).handleTrackEnd).toHaveBeenCalled();
        });

        it('should handle device-status event when casting', () => {
            mockCastService.emit('status-changed', { status: 'connected' });
            mockCastService.emit('device-status', { currentTime: 50, duration: 200 });

            const state = playerService.getState();
            expect(state.currentTime).toBe(50);
            expect(state.duration).toBe(200);
        });

        it('should handle error event when casting', () => {
            playerService.play(mockTrack);
            mockCastService.emit('status-changed', { status: 'connected' });

            mockCastService.emit('error', new Error('Cast Error'));

            const state = playerService.getState();
            expect(state.isPlaying).toBe(false);
            expect(state.isCasting).toBe(false);
            expect(state.error).toContain('Cast Error');
        });
    });

    describe('Playback Control', () => {
        it('should play a track directly and add it to the queue', async () => {
            await playerService.play(mockTrack);
            const state = playerService.getState();
            expect(state.isPlaying).toBe(true);
            expect(state.currentTrack).toEqual(mockTrack);
            expect(state.queue.items).toHaveLength(1);
            expect(state.queue.currentIndex).toBe(0);
            expect(mockScrobblerService.updateNowPlaying).toHaveBeenCalledWith(mockTrack);
        });

        it('should resume playback if already playing a track', async () => {
            await playerService.play(mockTrack);
            playerService.pause();
            await playerService.play();
            expect(playerService.getState().isPlaying).toBe(true);
        });

        it('should play next from queue if clearQueueBefore is false', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            await playerService.play(track1, true);
            await playerService.play(track2, false);

            const state = playerService.getState();
            expect(state.queue.items).toHaveLength(2);
            expect(state.queue.currentIndex).toBe(1);
        });

        it('should refresh stream URL if track id starts with radio-', async () => {
            const radioTrack = { ...mockTrack, id: 'radio-123', streamUrl: 'old' };
            mockScraperService.getTrackStreamUrl.mockResolvedValue('new');

            await playerService.play(radioTrack);
            expect(mockScraperService.getTrackStreamUrl).toHaveBeenCalled();
            expect(playerService.getState().currentTrack?.streamUrl).toBe('new');
        });

        it('should handle updateNowPlaying error', async () => {
            mockScrobblerService.updateNowPlaying.mockImplementation(() => { throw new Error('Update err') });
            await playerService.play(mockTrack);
            expect(playerService.getState().isPlaying).toBe(true);
        });

        it('should warn when playing an empty queue', async () => {
            vi.spyOn(console, 'warn');
            await playerService.play();
            expect(console.warn).toHaveBeenCalledWith('[PlayerService] play called but nothing to play');
        });

        it('should stop playback and clear state', async () => {
            await playerService.play(mockTrack);
            playerService.stop();
            const state = playerService.getState();
            expect(state.isPlaying).toBe(false);
            expect(state.currentTrack).toBeNull();
            expect(state.currentTime).toBe(0);
        });
    });

    describe('Time Updates & Scrobbling', () => {
        it('should update time and fire scrobble if past threshold', async () => {
            await playerService.play(mockTrack);

            // Advance time manually to bypass actual time passage
            (playerService as any).scrobbleStartTime = Date.now() - 60000;

            playerService.updateTime(51, 100); // Past 50%

            expect(playerService.getState().currentTime).toBe(51);
            expect(mockScrobblerService.scrobble).toHaveBeenCalledWith(mockTrack);
        });

        it('should handle track end and play next', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            await playerService.play(track1);
            playerService.addToQueue(track2);

            playerService.updateTime(100, 100); // Simulate end

            expect(playerService.getState().currentTrack?.id).toBe('2');
        });

        it('should repeat track on end if repeatMode is one', async () => {
            await playerService.play(mockTrack);
            playerService.setRepeat('one');

            vi.spyOn(playerService, 'seek');
            playerService.updateTime(100, 100);

            expect(playerService.seek).toHaveBeenCalledWith(0);
            expect(playerService.getState().currentTrack?.id).toBe('1');
        });

        it('should seek to specific time', async () => {
            await playerService.play(mockTrack);
            playerService.updateTime(0, 100);
            playerService.seek(50);
            expect(playerService.getState().currentTime).toBe(50);
        });

        it('should not update local time from renderer if casting', () => {
            playerService.play(mockTrack);
            mockCastService.emit('status-changed', { status: 'connected' });

            playerService.updateTime(10, 100);

            expect(playerService.getState().currentTime).toBe(0);
        });
    });

    describe('Queue Management', () => {
        it('should add multiple tracks to queue reverse order when playNext=true', () => {
            const tracks = [
                { ...mockTrack, id: '1' },
                { ...mockTrack, id: '2' },
                { ...mockTrack, id: '3' }
            ];
            // Prime queue
            playerService.addToQueue({ ...mockTrack, id: '0' });
            playerService.playIndex(0);

            playerService.addTracksToQueue(tracks, 'collection', true);

            const q = playerService.getQueue().items;
            expect(q[1].track.id).toBe('1');
            expect(q[2].track.id).toBe('2');
            expect(q[3].track.id).toBe('3');
        });

        it('should remove currently playing track', async () => {
            playerService.addToQueue(mockTrack);
            playerService.playIndex(0);

            const qid = playerService.getQueue().items[0].id;
            playerService.removeFromQueue(qid);

            expect(playerService.getState().isPlaying).toBe(false);
            expect(playerService.getQueue().items).toHaveLength(0);
        });

        it('should handle previous correctly depending on time and queue', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            playerService.addToQueue(track1);
            playerService.addToQueue(track2);
            playerService.playIndex(1);

            // Time > 3 resets current track
            playerService.updateTime(5, 100);
            await playerService.previous();
            expect(playerService.getState().currentTime).toBe(0);
            expect(playerService.getState().currentTrack?.id).toBe('2');

            // Time < 3 goes to previous track
            playerService.updateTime(1, 100);
            await playerService.previous();
            expect(playerService.getState().currentTrack?.id).toBe('1');

            // Previous at 0 loops if repeat all
            playerService.setRepeat('all');
            await playerService.previous();
            expect(playerService.getState().currentTrack?.id).toBe('2');

            // Previous at 0 seeks to 0 if no repeat
            playerService.setRepeat('off');
            playerService.playIndex(0);
            await playerService.previous();
            expect(playerService.getState().currentTime).toBe(0);
        });

        it('should play next in shuffled order', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            const track3 = { ...mockTrack, id: '3' };

            playerService.addToQueue(track1);
            playerService.addToQueue(track2);
            playerService.addToQueue(track3);

            playerService.playIndex(0);

            // Force shuffle array
            (playerService as any).shuffleOrder = [0, 2, 1];
            playerService.toggleShuffle(); // Actually this toggles it and generates random. 
            // So we just set it manually to test logic.
            (playerService as any).isShuffled = true;
            (playerService as any).shuffleOrder = [0, 2, 1];
            (playerService as any).currentIndex = 0;

            await playerService.next();
            expect(playerService.getState().currentTrack?.id).toBe('3');
        });

        it('should reorder invalid boundaries gracefully', () => {
            playerService.addToQueue(mockTrack);
            playerService.reorderQueue(-1, 0);
            playerService.reorderQueue(0, 5);
            expect(playerService.getQueue().items).toHaveLength(1);
        });
    });

    describe('Radio Functionality', () => {
        const mockStation: any = {
            id: 1, name: 'Test Radio', streamUrl: 'http://stream.url', duration: 100
        };

        it('should play radio station', async () => {
            await playerService.playStation(mockStation);
            expect(playerService.getRadioState().isActive).toBe(true);
            expect(playerService.getState().isPlaying).toBe(true);
        });

        it('should stop radio', async () => {
            await playerService.playStation(mockStation);
            playerService.stopRadio();
            expect(playerService.getRadioState().isActive).toBe(false);
        });
    });

    describe('Extras', () => {
        it('should set volume and toggle mute', async () => {
            vi.useFakeTimers();
            await playerService.setVolume(1.5); // Clamped to 1
            expect(playerService.getState().volume).toBe(1);

            playerService.toggleMute();
            expect(playerService.getState().isMuted).toBe(true);

            vi.advanceTimersByTime(3000);
            expect(mockDatabase.setSettings).toHaveBeenCalledWith({ defaultVolume: 1 });
            vi.useRealTimers();
        });

        it('should get stream root based on cache', () => {
            mockCacheService.getCachedPath.mockReturnValue('/cached/file.mp3');
            const url = playerService.getStreamUrl(mockTrack);
            expect(url).toBe('file:///cached/file.mp3');
        });
    });
});
