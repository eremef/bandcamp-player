type Callback = (...args: any[]) => void;

const eventListeners = {
    trackChange: new Set<Callback>(),
    playbackStateChange: new Set<Callback>(),
    seek: new Set<Callback>(),
    playbackProgressChange: new Set<Callback>(),
    temporaryQueueChange: new Set<Callback>(),
    timedMetadata: new Set<Callback>(),
    tracksNeedUpdate: new Set<Callback>(),
    androidAutoConnectionChange: new Set<Callback>(),
    notificationButtonPress: new Set<Callback>(),
    appStartedWithNotification: new Set<Callback>(),
};

function registerListener(name: keyof typeof eventListeners, callback: Callback) {
    eventListeners[name].add(callback);
}

export const TrackPlayer = {
    configure: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    playSong: jest.fn().mockResolvedValue(undefined),
    skipToNext: jest.fn().mockResolvedValue(undefined),
    skipToPrevious: jest.fn().mockResolvedValue(undefined),
    skipToIndex: jest.fn().mockResolvedValue(true),
    seek: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    setPlaybackSpeed: jest.fn().mockResolvedValue(undefined),
    getPlaybackSpeed: jest.fn().mockResolvedValue(1),
    setRepeatMode: jest.fn().mockResolvedValue(undefined),
    getRepeatMode: jest.fn(() => 'off'),
    getState: jest.fn().mockResolvedValue({
        currentTrack: null,
        currentPosition: 0,
        totalDuration: 0,
        currentState: 'stopped',
        currentPlaylistId: null,
        currentIndex: -1,
        currentPlayingType: 'not-playing',
    }),
    getActualQueue: jest.fn().mockResolvedValue([]),
    getCurrentTrackIndex: jest.fn().mockResolvedValue(-1),
    getTracksById: jest.fn().mockResolvedValue([]),
    updateTracks: jest.fn().mockResolvedValue(undefined),
    addToUpNext: jest.fn().mockResolvedValue(undefined),
    playNext: jest.fn().mockResolvedValue(undefined),
    removeFromPlayNext: jest.fn().mockResolvedValue(false),
    removeFromUpNext: jest.fn().mockResolvedValue(false),
    clearPlayNext: jest.fn().mockResolvedValue(undefined),
    clearUpNext: jest.fn().mockResolvedValue(undefined),
    reorderTemporaryTrack: jest.fn().mockResolvedValue(false),
    getPlayNextQueue: jest.fn().mockResolvedValue([]),
    getUpNextQueue: jest.fn().mockResolvedValue([]),
    getTracksNeedingUrls: jest.fn().mockResolvedValue([]),
    getNextTracks: jest.fn().mockResolvedValue([]),
    onTracksNeedUpdate: jest.fn((callback: Callback) => registerListener('tracksNeedUpdate', callback)),
    onChangeTrack: jest.fn((callback: Callback) => registerListener('trackChange', callback)),
    onPlaybackStateChange: jest.fn((callback: Callback) => registerListener('playbackStateChange', callback)),
    onSeek: jest.fn((callback: Callback) => registerListener('seek', callback)),
    onPlaybackProgressChange: jest.fn((callback: Callback) => registerListener('playbackProgressChange', callback)),
    onTemporaryQueueChange: jest.fn((callback: Callback) => registerListener('temporaryQueueChange', callback)),
    onTimedMetadata: jest.fn((callback: Callback) => registerListener('timedMetadata', callback)),
    appStartedWithNotification: jest.fn((callback: Callback) => registerListener('appStartedWithNotification', callback)),
    onAndroidAutoConnectionChange: jest.fn((callback: Callback) => registerListener('androidAutoConnectionChange', callback)),
    onNotificationButtonPress: jest.fn((callback: Callback) => registerListener('notificationButtonPress', callback)),
    setNotificationButtonState: jest.fn(),
    isAndroidAutoConnected: jest.fn(() => false),
};

export const PlayerQueue = {
    createPlaylist: jest.fn().mockImplementation(async () => `mock-playlist-id-${PlayerQueue.createPlaylist.mock.calls.length}`),
    deletePlaylist: jest.fn().mockResolvedValue(undefined),
    updatePlaylist: jest.fn().mockResolvedValue(undefined),
    getPlaylist: jest.fn(() => null),
    getAllPlaylists: jest.fn(() => []),
    loadPlaylist: jest.fn().mockResolvedValue(undefined),
    getCurrentPlaylistId: jest.fn(() => null),
    addTrackToPlaylist: jest.fn().mockResolvedValue(undefined),
    addTracksToPlaylist: jest.fn().mockResolvedValue(undefined),
    removeTrackFromPlaylist: jest.fn().mockResolvedValue(undefined),
    reorderTrackInPlaylist: jest.fn().mockResolvedValue(undefined),
    removeTracksFromPlaylist: jest.fn().mockResolvedValue(undefined),
    shufflePlaylist: jest.fn().mockResolvedValue(undefined),
};

export const __emitTrackChange = (...args: Parameters<Callback>) => {
    eventListeners.trackChange.forEach((callback) => callback(...args));
};

export const __emitPlaybackStateChange = (...args: Parameters<Callback>) => {
    eventListeners.playbackStateChange.forEach((callback) => callback(...args));
};

export const __emitSeek = (...args: Parameters<Callback>) => {
    eventListeners.seek.forEach((callback) => callback(...args));
};

export const __emitPlaybackProgressChange = (...args: Parameters<Callback>) => {
    eventListeners.playbackProgressChange.forEach((callback) => callback(...args));
};

export const __emitTracksNeedUpdate = async (...args: Parameters<Callback>) => {
    await Promise.all([...eventListeners.tracksNeedUpdate].map((callback) => callback(...args)));
};
export const __emitNotificationButtonPress = (...args: Parameters<Callback>) => {
    eventListeners.notificationButtonPress.forEach((callback) => callback(...args));
};
