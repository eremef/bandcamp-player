import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database';
import type { Playlist, PlaylistCreateInput, PlaylistUpdateInput, Track } from '../../shared/types';

// ============================================================================
// Playlist Service
// ============================================================================

export class PlaylistService {
    private database: Database;

    constructor(database: Database) {
        this.database = database;
    }

    /**
     * Get all playlists
     */
    getAll(): Playlist[] {
        return this.database.getAllPlaylists();
    }

    /**
     * Get playlist by ID with full track data
     */
    getById(id: string): Playlist | null {
        return this.database.getPlaylistById(id);
    }

    /**
     * Create a new playlist
     */
    create(input: PlaylistCreateInput): Playlist {
        const id = uuidv4();
        return this.database.createPlaylist(id, input.name, input.description);
    }

    /**
     * Update playlist
     */
    update(input: PlaylistUpdateInput): Playlist | null {
        this.database.updatePlaylist(input.id, input.name, input.description);
        return this.database.getPlaylistById(input.id);
    }

    /**
     * Delete playlist
     */
    delete(id: string): void {
        this.database.deletePlaylist(id);
    }

    /**
     * Add multiple tracks to playlist
     */
    addTracks(playlistId: string, tracks: Track[]): void {
        this.database.addTracksToPlaylist(playlistId, tracks);
    }

    /**
     * Add track to playlist
     */
    addTrack(playlistId: string, track: Track): void {
        const trackId = `${playlistId}-${track.id}-${Date.now()}`;
        this.database.addTrackToPlaylist(playlistId, trackId, track);
    }

    /**
     * Remove track from playlist
     */
    removeTrack(playlistId: string, trackId: string): void {
        this.database.removeTrackFromPlaylist(playlistId, trackId);
    }

    /**
     * Reorder tracks in playlist
     */
    reorderTracks(playlistId: string, fromIndex: number, toIndex: number): void {
        this.database.reorderPlaylistTracks(playlistId, fromIndex, toIndex);
    }
}
