/**
 * Core domain types for the Bandcamp Player application
 */

// ============================================================================
// Track & Album Types
// ============================================================================

export interface Track {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    album: string;
    albumId?: string;
    duration: number; // in seconds
    trackNumber?: number;
    artworkUrl: string;
    streamUrl: string;
    bandcampUrl: string;
    isCached: boolean;
    cachedPath?: string;
    playlistEntryId?: string;
    radioStationId?: string; // For radio stations added to playlists - resolved lazily
}

export interface Album {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    artworkUrl: string;
    bandcampUrl: string;
    releaseDate?: string;
    tracks: Track[];
    trackCount: number;
}

export interface Artist {
    id: string;
    name: string;
    bandcampUrl: string;
    imageUrl?: string;
}

// ============================================================================
// Collection Types
// ============================================================================

export interface CollectionItem {
    id: string;
    type: 'album' | 'track';
    token?: string;
    album?: Album;
    track?: Track;
    purchaseDate: string;
}

export interface Collection {
    items: CollectionItem[];
    totalCount: number;
    lastUpdated: string;
    isSimulated?: boolean;
    offset?: number;
    limit?: number;
}

// ============================================================================
// Playlist Types
// ============================================================================

export interface Playlist {
    id: string;
    name: string;
    description?: string;
    tracks: Track[];
    trackCount: number;
    totalDuration: number; // in seconds
    artworkUrl?: string; // First track's artwork or custom
    createdAt: string;
    updatedAt: string;
}

export interface PlaylistCreateInput {
    name: string;
    description?: string;
}

export interface PlaylistUpdateInput {
    id: string;
    name?: string;
    description?: string;
}

// ============================================================================
// Queue Types
// ============================================================================

export interface QueueItem {
    id: string; // Unique queue item ID
    track: Track;
    source: 'collection' | 'playlist' | 'radio' | 'search';
    sourceId?: string; // Playlist ID if from playlist
    radioStation?: RadioStation; // Store radio station for lazy loading
}

export interface Queue {
    items: QueueItem[];
    currentIndex: number;
    shuffleOrder?: number[]; // Indices for shuffle mode
}

// ============================================================================
// Player State Types
// ============================================================================

export type RepeatMode = 'off' | 'one' | 'all';
export type Theme = 'light' | 'dark' | 'system';

export interface PlayerState {
    isPlaying: boolean;
    currentTrack: Track | null;
    currentTime: number;
    duration: number;
    volume: number; // 0-1
    isMuted: boolean;
    repeatMode: RepeatMode;
    isShuffled: boolean;
    queue: Queue;
    isCasting: boolean;
    castDevice?: CastDevice;
    error?: string | null;
}

// ============================================================================
// Radio Types
// ============================================================================

export interface RadioStation {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    streamUrl: string;
    date?: string;
    duration?: number;
}

export interface RadioState {
    isActive: boolean;
    currentStation: RadioStation | null;
    currentTrack: Track | null;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface BandcampUser {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    profileUrl: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    user: BandcampUser | null;
    sessionExpiry?: string;
}

// ============================================================================
// Last.fm Types
// ============================================================================

export interface LastfmUser {
    name: string;
    url: string;
    imageUrl?: string;
}

export interface LastfmState {
    isConnected: boolean;
    user: LastfmUser | null;
}

export interface ScrobbleData {
    artist: string;
    track: string;
    album?: string;
    duration?: number;
    timestamp: number;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
    // Cache settings
    cacheEnabled: boolean;
    cacheMaxSizeGB: number;
    cacheLocation: string;

    // Playback settings
    defaultVolume: number;
    crossfadeDuration: number; // in seconds, 0 = disabled

    // UI settings
    startMinimized: boolean;
    minimizeToTray: boolean;
    showNotifications: boolean;
    remoteEnabled: boolean;
    theme: Theme;

    // Scrobbling
    scrobblingEnabled: boolean;
    scrobbleThreshold: number; // percentage (0-100)

    // Last.fm credentials (encrypted)
    lastfmSessionKey?: string;
    lastfmApiKey?: string;
    lastfmApiSecret?: string;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry {
    trackId: string;
    filePath: string;
    fileSize: number; // in bytes
    cachedAt: string;
    lastAccessedAt: string;
}

export interface CacheStats {
    totalSize: number; // in bytes
    trackCount: number;
    maxSize: number; // in bytes
    usagePercent: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export type ViewType = 'collection' | 'playlists' | 'playlist-detail' | 'album-detail' | 'artists' | 'radio' | 'settings';

export interface UIState {
    currentView: ViewType;
    selectedPlaylistId?: string;
    isQueueVisible: boolean;
    isMiniPlayer: boolean;
    isLoading: boolean;
    searchQuery: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface AppError {
    code: string;
    message: string;
    details?: unknown;
}

// ============================================================================
// Chromecast Types
// ============================================================================

export interface CastDevice {
    id: string;
    name: string;
    host: string;
    friendlyName: string;
    type: string;
    status: 'connected' | 'disconnected' | 'connecting';
}

export interface CastStatus {
    status: 'connected' | 'disconnected' | 'connecting';
    device?: CastDevice;
}

// ============================================================================
// Remote Control Types
// ============================================================================

export interface RemoteClient {
    id: string;
    ip: string;
    userAgent: string;
    connectedAt: string;
    lastActiveAt: string;
}
