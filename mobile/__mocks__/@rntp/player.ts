const TrackPlayerMock = {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    skip: jest.fn().mockResolvedValue(undefined),
    skipToNext: jest.fn().mockResolvedValue(undefined),
    skipToPrevious: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    getVolume: jest.fn().mockResolvedValue(1),
    getQueue: jest.fn().mockResolvedValue([]),
    getCurrentTrack: jest.fn().mockResolvedValue(0),
    getDuration: jest.fn().mockResolvedValue(0),
    getPosition: jest.fn().mockResolvedValue(0),
    getProgress: jest.fn().mockResolvedValue({ position: 0, duration: 0 }),
    getState: jest.fn().mockResolvedValue('paused'),
    addEventListener: jest.fn(),
    getPlaybackState: jest.fn().mockResolvedValue('paused'),
    useTrackPlayerEvents: jest.fn(),
    useProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
    setRepeatMode: jest.fn().mockResolvedValue(undefined),
    setMediaItem: jest.fn().mockResolvedValue(undefined),
    setMediaItems: jest.fn().mockResolvedValue(undefined),
    skipToIndex: jest.fn().mockResolvedValue(undefined),
    removeMediaItems: jest.fn().mockResolvedValue(undefined),
    isPlaying: jest.fn().mockReturnValue(false),
    setCommands: jest.fn().mockResolvedValue(undefined),
    addMediaItem: jest.fn().mockResolvedValue(undefined),
    getActiveMediaItemIndex: jest.fn().mockReturnValue(0),
};

const Capability = {
    Play: 0,
    Pause: 1,
    Stop: 2,
    SkipToNext: 3,
    SkipToPrevious: 4,
    SeekTo: 5,
    JumpForward: 6,
    JumpBackward: 7,
};

const PlayerCommand = {
    PlayPause: 'play-pause',
    Play: 'play',
    Pause: 'pause',
    Next: 'next',
    Previous: 'previous',
    Stop: 'stop',
    Seek: 'seek',
    SkipForward: 'skip-forward',
    SkipBackward: 'skip-backward',
};

const State = {
    None: 'none',
    Ready: 'ready',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Buffering: 'buffering',
    Connecting: 'connecting',
};

const PlaybackState = {
    Idle: 'idle',
    Ready: 'ready',
    Buffering: 'buffering',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Ended: 'ended',
    Error: 'error',
    None: 'none',
};

const Event = {
    PlaybackState: 'playback-state',
    PlaybackStateChanged: 'playback-state-changed',
    IsPlayingChanged: 'is-playing-changed',
    MediaItemTransition: 'media-item-transition',
    PlaybackError: 'playback-error',
    PlaybackQueueEnded: 'playback-queue-ended',
    PlaybackTrackChanged: 'playback-track-changed',
    PlaybackMetadataReceived: 'playback-metadata-received',
    PlaybackProgressUpdated: 'playback-progress-updated',
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
    RemoteSeek: 'remote-seek',
    RemoteDuck: 'remote-duck',
    RemotePlayPause: 'remote-play-pause',
    RemoteJumpForward: 'remote-jump-forward',
    RemoteJumpBackward: 'remote-jump-backward',
    RemoteSkipForward: 'remote-skip-forward',
    RemoteSkipBackward: 'remote-skip-backward',
};

const RepeatMode = { Off: 0, Track: 1, Queue: 2 };

// Default export for ES module interop
export default TrackPlayerMock;

// Named exports for ES module interop
export {
    Capability,
    PlayerCommand,
    State,
    Event,
    RepeatMode,
    PlaybackState,
};

// Also export methods as named exports if components use { setupPlayer } from ...
export const setupPlayer = TrackPlayerMock.setupPlayer;
export const updateOptions = TrackPlayerMock.updateOptions;
export const reset = TrackPlayerMock.reset;
export const stop = TrackPlayerMock.stop;
export const clear = TrackPlayerMock.clear;
export const add = TrackPlayerMock.add;
export const remove = TrackPlayerMock.remove;
export const play = TrackPlayerMock.play;
export const pause = TrackPlayerMock.pause;
export const skip = TrackPlayerMock.skip;
export const skipToNext = TrackPlayerMock.skipToNext;
export const skipToPrevious = TrackPlayerMock.skipToPrevious;
export const seekTo = TrackPlayerMock.seekTo;
export const setVolume = TrackPlayerMock.setVolume;
export const getVolume = TrackPlayerMock.getVolume;
export const getQueue = TrackPlayerMock.getQueue;
export const getCurrentTrack = TrackPlayerMock.getCurrentTrack;
export const getDuration = TrackPlayerMock.getDuration;
export const getPosition = TrackPlayerMock.getPosition;
export const getProgress = TrackPlayerMock.getProgress;
export const getState = TrackPlayerMock.getState;
export const addEventListener = TrackPlayerMock.addEventListener;
export const getPlaybackState = TrackPlayerMock.getPlaybackState;
export const useTrackPlayerEvents = TrackPlayerMock.useTrackPlayerEvents;
export const useProgress = TrackPlayerMock.useProgress;
export const setRepeatMode = TrackPlayerMock.setRepeatMode;
export const setMediaItem = TrackPlayerMock.setMediaItem;
export const setMediaItems = TrackPlayerMock.setMediaItems;
export const skipToIndex = TrackPlayerMock.skipToIndex;
export const removeMediaItems = TrackPlayerMock.removeMediaItems;
export const isPlaying = TrackPlayerMock.isPlaying;
export const setCommands = TrackPlayerMock.setCommands;
export const addMediaItem = TrackPlayerMock.addMediaItem;
export const getActiveMediaItemIndex = TrackPlayerMock.getActiveMediaItemIndex;
