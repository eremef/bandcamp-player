import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PlayerService } from './player.service';
import { CacheService } from './cache.service';
import { ScrobblerService } from './scrobbler.service';
import { ScraperService } from './scraper.service';
import { Database } from '../database/database';
import { Track } from '../../shared/types';

// Mock dependencies
vi.mock('./cache.service');
vi.mock('./scrobbler.service');
vi.mock('./scraper.service');
vi.mock('../database/database');

describe('PlayerService', () => {
    let playerService: PlayerService;
    let mockCacheService: any;
    let mockScrobblerService: any;
    let mockScraperService: any;
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
        };
        mockDatabase = {
            getSettings: vi.fn().mockReturnValue({ defaultVolume: 0.5 }),
            setSettings: vi.fn(),
        };

        playerService = new PlayerService(
            mockCacheService as unknown as CacheService,
            mockScrobblerService as unknown as ScrobblerService,
            mockScraperService as unknown as ScraperService,
            mockDatabase as unknown as Database
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Playback Control', () => {
        it('should play a track directly', async () => {
            await playerService.play(mockTrack);
            const state = playerService.getState();
            expect(state.isPlaying).toBe(true);
            expect(state.currentTrack).toEqual(mockTrack);
            expect(mockScrobblerService.updateNowPlaying).toHaveBeenCalledWith(mockTrack);
        });

        it('should pause playback', async () => {
            await playerService.play(mockTrack);
            playerService.pause();
            expect(playerService.getState().isPlaying).toBe(false);
        });

        it('should toggle playback', async () => {
            await playerService.play(mockTrack);
            playerService.togglePlay();
            expect(playerService.getState().isPlaying).toBe(false);
            playerService.togglePlay();
            expect(playerService.getState().isPlaying).toBe(true);
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

    describe('Queue Management', () => {
        it('should add track to queue', () => {
            playerService.addToQueue(mockTrack);
            const queue = playerService.getQueue();
            expect(queue.items).toHaveLength(1);
            expect(queue.items[0].track).toEqual(mockTrack);
        });

        it('should remove track from queue', () => {
            playerService.addToQueue(mockTrack);
            const queueId = playerService.getQueue().items[0].id;
            playerService.removeFromQueue(queueId);
            expect(playerService.getQueue().items).toHaveLength(0);
        });

        it('should clear queue', () => {
            playerService.addToQueue(mockTrack);
            playerService.addToQueue({ ...mockTrack, id: '2' });
            playerService.clearQueue(false);
            expect(playerService.getQueue().items).toHaveLength(0);
        });

        it('should play next track in queue', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            playerService.addToQueue(track1);
            playerService.addToQueue(track2);

            // Start playing first
            playerService.playIndex(0);
            expect(playerService.getState().currentTrack?.id).toBe('1');

            // Next
            await playerService.next();
            expect(playerService.getState().currentTrack?.id).toBe('2');
        });

        it('should play previous track', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            playerService.addToQueue(track1);
            playerService.addToQueue(track2);

            playerService.playIndex(1); // Play 2
            await playerService.previous();
            expect(playerService.getState().currentTrack?.id).toBe('1');
        });

        it('should handle shuffle properly', async () => {
            const track1 = { ...mockTrack, id: '1' };
            const track2 = { ...mockTrack, id: '2' };
            const track3 = { ...mockTrack, id: '3' };

            playerService.addToQueue(track1);
            playerService.addToQueue(track2);
            playerService.addToQueue(track3);

            playerService.playIndex(0);
            playerService.toggleShuffle();

            const state = playerService.getState();
            expect(state.isShuffled).toBe(true);
            expect(state.queue.shuffleOrder).toBeDefined();
            expect(state.queue.shuffleOrder).toHaveLength(3);
        });
    });

    describe('Volume Control', () => {
        it('should set volume and save to db', () => {
            playerService.setVolume(0.8);
            expect(playerService.getState().volume).toBe(0.8);
            expect(mockDatabase.setSettings).toHaveBeenCalledWith({ defaultVolume: 0.8 });
        });

        it('should toggle mute', () => {
            playerService.toggleMute();
            expect(playerService.getState().isMuted).toBe(true);
            playerService.toggleMute();
            expect(playerService.getState().isMuted).toBe(false);
        });
    });

    describe('Radio Functionality', () => {
        const mockStation: any = {
            id: 1,
            name: 'Test Radio',
            description: 'Test Description',
            imageUrl: 'http://image.url',
            streamUrl: 'http://stream.url',
            date: '2023'
        };

        it('should convert station to track correctly', async () => {
            mockScraperService.getStationStreamUrl.mockResolvedValue({ streamUrl: 'http://stream.url', duration: 0 });
            const track = await playerService.stationToTrack(mockStation);
            expect(track.id).toBe('radio-1');
            expect(track.title).toBe('Test Radio');
            expect(track.artist).toBe('Bandcamp Radio');
            expect(track.streamUrl).toBe('http://stream.url');
        });

        it('should fetch stream URL if missing', async () => {
            const stationWithoutStream = { ...mockStation, streamUrl: undefined };
            mockScraperService.getStationStreamUrl.mockResolvedValue({ streamUrl: 'http://fetched.stream', duration: 120 });

            const track = await playerService.stationToTrack(stationWithoutStream);

            expect(mockScraperService.getStationStreamUrl).toHaveBeenCalledWith(1);
            expect(track.streamUrl).toBe('http://fetched.stream');
        });

        it('should add station to queue', async () => {
            await playerService.addStationToQueue(mockStation);
            const queue = playerService.getQueue();
            expect(queue.items).toHaveLength(1);
            expect(queue.items[0].track.title).toBe('Test Radio');
            expect(queue.items[0].source).toBe('radio');
        });

        it('should play station next (add to queue next)', async () => {
            playerService.addToQueue(mockTrack);
            playerService.playIndex(0);

            await playerService.addStationToQueue(mockStation, true);

            const queue = playerService.getQueue();
            expect(queue.items).toHaveLength(2);
            expect(queue.items[1].track.title).toBe('Test Radio');
        });

        it('should refresh radio stream URL on play if track id indicates radio', async () => {
            const radioTrack = {
                ...mockTrack,
                id: 'radio-123',
                streamUrl: 'http://old.url'
            };

            mockScraperService.getStationStreamUrl.mockResolvedValue({ streamUrl: 'http://new.url', duration: 0 });

            await playerService.play(radioTrack);

            expect(mockScraperService.getStationStreamUrl).toHaveBeenCalledWith('123');
            expect(playerService.getState().currentTrack?.streamUrl).toBe('http://new.url');
        });

        it('should not refresh regular track stream URL', async () => {
            const regularTrack = { ...mockTrack, id: '123' };
            await playerService.play(regularTrack);
            expect(mockScraperService.getStationStreamUrl).not.toHaveBeenCalled();
        });
        it('should fetch and cache duration if missing even if streamUrl is present', async () => {
            const stationInit: any = {
                id: '999',
                name: 'Cached URL No Duration',
                streamUrl: 'http://cached.url',
                // no duration
            };

            mockScraperService.getStationStreamUrl.mockResolvedValue({ streamUrl: 'http://cached.url', duration: 300 });

            const track = await playerService.stationToTrack(stationInit);

            expect(mockScraperService.getStationStreamUrl).toHaveBeenCalledWith('999');
            expect(track.duration).toBe(300);
            expect(stationInit.duration).toBe(300); // Check caching
        });
    });

    describe('Bulk Queue Operations', () => {
        it('should add multiple tracks to queue', () => {
            const tracks = [
                { ...mockTrack, id: '1' },
                { ...mockTrack, id: '2' },
                { ...mockTrack, id: '3' }
            ];
            playerService.addTracksToQueue(tracks);
            expect(playerService.getQueue().items).toHaveLength(3);
            expect(playerService.getQueue().items[0].track.id).toBe('1');
            expect(playerService.getQueue().items[2].track.id).toBe('3');
        });
    });
});