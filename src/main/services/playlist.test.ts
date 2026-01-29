import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PlaylistService } from './playlist.service';
import { Database } from '../database/database';
import { Track, Playlist } from '../../shared/types';

vi.mock('../database/database');
vi.mock('uuid', () => ({ v4: () => 'mock-uuid-123' }));

describe('PlaylistService', () => {
    let playlistService: PlaylistService;
    let mockDatabase: any;

    const mockPlaylist: Playlist = {
        id: '1',
        name: 'Test Playlist',
        description: 'A test playlist',
        tracks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        trackCount: 10,
        totalDuration: 180,
    };

    const mockTrack: Track = {
        id: 'track-1',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        artworkUrl: '',
        streamUrl: '',
        bandcampUrl: '',
        isCached: false,
    };

    beforeEach(() => {
        mockDatabase = {
            getAllPlaylists: vi.fn().mockReturnValue([mockPlaylist]),
            getPlaylistById: vi.fn().mockReturnValue(mockPlaylist),
            createPlaylist: vi.fn().mockReturnValue(mockPlaylist),
            updatePlaylist: vi.fn(),
            deletePlaylist: vi.fn(),
            addTracksToPlaylist: vi.fn(),
            addTrackToPlaylist: vi.fn(),
            removeTrackFromPlaylist: vi.fn(),
            reorderPlaylistTracks: vi.fn(),
        };

        playlistService = new PlaylistService(mockDatabase as unknown as Database);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('CRUD Operations', () => {
        it('should get all playlists', () => {
            const result = playlistService.getAll();
            expect(mockDatabase.getAllPlaylists).toHaveBeenCalled();
            expect(result).toEqual([mockPlaylist]);
        });

        it('should get playlist by ID', () => {
            const result = playlistService.getById('1');
            expect(mockDatabase.getPlaylistById).toHaveBeenCalledWith('1');
            expect(result).toEqual(mockPlaylist);
        });

        it('should create a new playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            const result = playlistService.create({ name: 'New Playlist', description: 'Desc' });

            expect(mockDatabase.createPlaylist).toHaveBeenCalledWith('mock-uuid-123', 'New Playlist', 'Desc');
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
            expect(result).toEqual(mockPlaylist);
        });

        it('should update a playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.update({ id: '1', name: 'Updated', description: 'Updated Desc' });

            expect(mockDatabase.updatePlaylist).toHaveBeenCalledWith('1', 'Updated', 'Updated Desc');
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });

        it('should delete a playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.delete('1');

            expect(mockDatabase.deletePlaylist).toHaveBeenCalledWith('1');
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });
    });

    describe('Track Management', () => {
        it('should add multiple tracks to playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.addTracks('1', [mockTrack]);

            expect(mockDatabase.addTracksToPlaylist).toHaveBeenCalledWith('1', [mockTrack]);
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });

        it('should add a single track to playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.addTrack('1', mockTrack);

            expect(mockDatabase.addTrackToPlaylist).toHaveBeenCalledWith(
                '1',
                expect.stringContaining('1-track-1-'),
                mockTrack
            );
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });

        it('should remove track from playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.removeTrack('1', 'track-1');

            expect(mockDatabase.removeTrackFromPlaylist).toHaveBeenCalledWith('1', 'track-1');
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });

        it('should reorder tracks in playlist', () => {
            const emitSpy = vi.spyOn(playlistService, 'emit');
            playlistService.reorderTracks('1', 0, 2);

            expect(mockDatabase.reorderPlaylistTracks).toHaveBeenCalledWith('1', 0, 2);
            expect(emitSpy).toHaveBeenCalledWith('playlists-changed');
        });
    });
});
