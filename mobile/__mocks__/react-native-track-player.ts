const TrackPlayerMock = {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
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
    getPlaybackState: jest.fn().mockResolvedValue({ state: 'paused' }),
    useTrackPlayerEvents: jest.fn(),
    useProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
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

const State = {
    None: 'none',
    Ready: 'ready',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Buffering: 'buffering',
    Connecting: 'connecting',
};

const Event = {
    PlaybackState: 'playback-state',
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
};

const AppKilledPlaybackBehavior = {
    StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
    ContinuePlayback: 'continue-playback',
};

const RepeatMode = { Off: 0, Track: 1, Queue: 2 };

// Default export for ES module interop
export default TrackPlayerMock;

// Named exports for ES module interop
export {
    Capability,
    State,
    Event,
    AppKilledPlaybackBehavior,
    RepeatMode,
};

// Also export methods as named exports if components use { setupPlayer } from ...
export const setupPlayer = TrackPlayerMock.setupPlayer;
export const updateOptions = TrackPlayerMock.updateOptions;
export const reset = TrackPlayerMock.reset;
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
