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
            getStationStreamUrl: vi.fn(),
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

            // Ensure current playing track is first in shuffle order (logic check)
            // The implementation moves current index to front of shuffle order?
            // Checking implementation: yes, shuffleOrder[0] swapped with shuffleOrder[indexOf(currentIndex)]
            // Since currentIndex is 0, it might remain at 0 or be swapped back.
            // Actually, implementation does: currentPos = indexOf(currentIndex), then swap 0 and currentPos.
            // So playIndex(0) makes currentIndex=0. 
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
});
