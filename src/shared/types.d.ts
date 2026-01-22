/**
 * Core domain types for the Bandcamp Player application
 */
export interface Track {
    id: string;
    title: string;
    artist: string;
    artistId?: string;
    album: string;
    albumId?: string;
    duration: number;
    trackNumber?: number;
    artworkUrl: string;
    streamUrl: string;
    bandcampUrl: string;
    isCached: boolean;
    cachedPath?: string;
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
export interface CollectionItem {
    id: string;
    type: 'album' | 'track';
    album?: Album;
    track?: Track;
    purchaseDate: string;
}
export interface Collection {
    items: CollectionItem[];
    totalCount: number;
    lastUpdated: string;
}
export interface Playlist {
    id: string;
    name: string;
    description?: string;
    tracks: Track[];
    trackCount: number;
    totalDuration: number;
    artworkUrl?: string;
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
export interface QueueItem {
    id: string;
    track: Track;
    source: 'collection' | 'playlist' | 'radio' | 'search';
    sourceId?: string;
}
export interface Queue {
    items: QueueItem[];
    currentIndex: number;
    shuffleOrder?: number[];
}
export type RepeatMode = 'off' | 'one' | 'all';
export interface PlayerState {
    isPlaying: boolean;
    currentTrack: Track | null;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    repeatMode: RepeatMode;
    isShuffled: boolean;
    queue: Queue;
}
export interface RadioStation {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    streamUrl: string;
}
export interface RadioState {
    isActive: boolean;
    currentStation: RadioStation | null;
    currentTrack: Track | null;
}
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
export interface AppSettings {
    cacheEnabled: boolean;
    cacheMaxSizeGB: number;
    cacheLocation: string;
    defaultVolume: number;
    crossfadeDuration: number;
    startMinimized: boolean;
    minimizeToTray: boolean;
    showNotifications: boolean;
    scrobblingEnabled: boolean;
    scrobbleThreshold: number;
    lastfmSessionKey?: string;
}
export interface CacheEntry {
    trackId: string;
    filePath: string;
    fileSize: number;
    cachedAt: string;
    lastAccessedAt: string;
}
export interface CacheStats {
    totalSize: number;
    trackCount: number;
    maxSize: number;
    usagePercent: number;
}
export type ViewType = 'collection' | 'playlists' | 'playlist-detail' | 'radio' | 'settings';
export interface UIState {
    currentView: ViewType;
    selectedPlaylistId?: string;
    isQueueVisible: boolean;
    isMiniPlayer: boolean;
    isLoading: boolean;
    searchQuery: string;
}
export interface AppError {
    code: string;
    message: string;
    details?: unknown;
}
//# sourceMappingURL=types.d.ts.map