import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database';
import type { Playlist, PlaylistCreateInput, PlaylistUpdateInput, Track } from '../../shared/types';

// ============================================================================
// Playlist Service
// ============================================================================

export class PlaylistService extends EventEmitter {
    private database: Database;

    constructor(database: Database) {
        super();
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
        const playlist = this.database.createPlaylist(id, input.name, input.description);
        this.emit('playlists-changed');
        return playlist;
    }

    /**
     * Update playlist
     */
    update(input: PlaylistUpdateInput): Playlist | null {
        // console.log(`[PlaylistService] Updating playlist: ${JSON.stringify(input)}`);
        this.database.updatePlaylist(input.id, input.name, input.description);
        this.emit('playlists-changed');
        return this.database.getPlaylistById(input.id);
    }

    /**
     * Delete playlist
     */
    delete(id: string): void {
        this.database.deletePlaylist(id);
        this.emit('playlists-changed');
    }

    /**
     * Add multiple tracks to playlist
     */
    addTracks(playlistId: string, tracks: Track[]): void {
        this.database.addTracksToPlaylist(playlistId, tracks);
        this.emit('playlists-changed');
    }

    /**
     * Add track to playlist
     */
    addTrack(playlistId: string, track: Track): void {
        const trackId = `${playlistId}-${track.id}-${Date.now()}`;
        this.database.addTrackToPlaylist(playlistId, trackId, track);
        this.emit('playlists-changed');
    }

    /**
     * Remove track from playlist
     */
    removeTrack(playlistId: string, trackId: string): void {
        this.database.removeTrackFromPlaylist(playlistId, trackId);
        this.emit('playlists-changed');
    }

    /**
     * Reorder tracks in playlist
     */
    reorderTracks(playlistId: string, fromIndex: number, toIndex: number): void {
        this.database.reorderPlaylistTracks(playlistId, fromIndex, toIndex);
        this.emit('playlists-changed');
    }
}
