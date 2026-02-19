export const TrackPlayer = {
    setupPlayer: jest.fn(),
    updateOptions: jest.fn(),
    reset: jest.fn(),
    add: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    skip: jest.fn(),
    seekTo: jest.fn(),
    setVolume: jest.fn(),
    getQueue: jest.fn().mockResolvedValue([]),
    getCurrentTrack: jest.fn(),
    getDuration: jest.fn(),
    getPosition: jest.fn(),
    getState: jest.fn(),
    addEventListener: jest.fn(),
    getPlaybackState: jest.fn().mockResolvedValue({ state: 'paused' }),
};

export const State = {
    None: 0,
    Ready: 1,
    Playing: 2,
    Paused: 3,
    Stopped: 4,
    Buffering: 5,
    Connecting: 6,
};
export const Event = {
    PlaybackState: 'playback-state',
    PlaybackError: 'playback-error',
    PlaybackQueueEnded: 'playback-queue-ended',
    PlaybackTrackChanged: 'playback-track-changed',
    PlaybackMetadataReceived: 'playback-metadata-received',
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
    RemoteSeek: 'remote-seek',
    RemoteDuck: 'remote-duck',
};
export const Capability = {};
export const AppKilledPlaybackBehavior = {};
export const RepeatMode = { Off: 0, Track: 1, Queue: 2 };

export default TrackPlayer;
