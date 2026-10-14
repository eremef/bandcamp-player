import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../../store';
import { mobileDatabase } from '../../services/MobileDatabase';
import { webSocketService } from '../../services/WebSocketService';

jest.mock('../../services/WebSocketService', () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    let connected = false;
    const webSocketService = {
        on: jest.fn((event: string, listener: (...args: any[]) => void) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(listener);
        }),
        send: jest.fn(),
        isConnected: jest.fn(() => connected),
        emit: (event: string, ...args: any[]) => listeners[event]?.forEach((listener) => listener(...args)),
        setConnected: (value: boolean) => { connected = value; },
    };
    return { webSocketService };
});

jest.mock('../../services/MobileDatabase', () => ({
    mobileDatabase: {
        getSettings: jest.fn().mockResolvedValue({}),
        getAllPlaylists: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('../../services/MobilePlayerService', () => ({
    mobilePlayerService: {
        prepareForModeChange: jest.fn(),
        setVolume: jest.fn().mockResolvedValue(undefined),
        getPositionForSnapshot: jest.fn((position: number) => position),
        loadTrack: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../services/MobileAuthService', () => ({
    mobileAuthService: {
        checkSession: jest.fn().mockResolvedValue({ isAuthenticated: false, user: null }),
    },
}));

jest.mock('../../services/MobileScrobblerService', () => ({
    mobileScrobblerService: {
        handleModeChanged: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../services/PlaylistSyncService', () => ({
    playlistSyncService: {
        sync: jest.fn().mockResolvedValue(undefined),
        getMode: jest.fn(() => 'two-way'),
        getDroppedCount: jest.fn(() => 0),
    },
}));

const socket = webSocketService as unknown as {
    emit: (event: string, ...args: any[]) => void;
    setConnected: (connected: boolean) => void;
};

const phoneQueue = {
    items: [{
        id: 'phone-queue-item',
        source: 'collection',
        track: {
            id: 'phone-track',
            title: 'Phone track',
            artist: 'Phone artist',
            album: 'Phone album',
            artworkUrl: '',
            bandcampUrl: '',
            streamUrl: '',
            duration: 120,
        },
    }],
    currentIndex: 0,
};

const desktopQueueState = {
    queue: {
        items: [{
            id: 'desktop-queue-item',
            source: 'collection',
            track: {
                id: 'desktop-track',
                title: 'Desktop track',
                artist: 'Desktop artist',
                album: 'Desktop album',
                artworkUrl: '',
                bandcampUrl: '',
                duration: 180,
            },
        }],
        currentIndex: 0,
    },
    currentTrack: { id: 'desktop-track' },
    currentTime: 12,
    duration: 180,
};

describe('queue handoff capability across mode changes', () => {
    beforeEach(async () => {
        jest.useFakeTimers();
        Object.defineProperty(globalThis, 'requestIdleCallback', { configurable: true, value: jest.fn() });
        await AsyncStorage.clear();
        jest.clearAllMocks();
        socket.setConnected(false);
        (mobileDatabase.getSettings as jest.Mock).mockResolvedValue({});
        useStore.setState({
            mode: 'standalone',
            connectionStatus: 'connected',
            desktopSocketConnected: false,
            desktopQueueAvailability: 'unknown',
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
            desktopQueueCurrentTrackAvailable: false,
            queueHandoff: { status: 'idle', direction: null, message: null },
            queue: { items: [], currentIndex: -1 },
            currentTrack: null,
            currentTime: 0,
            duration: 0,
        });
    });

    afterEach(() => {
        jest.clearAllTimers();
        delete (globalThis as any).requestIdleCallback;
        jest.useRealTimers();
    });

    it('keeps both handoff capabilities through repeated switches and refreshes desktop queue state on return', async () => {
        socket.setConnected(true);
        socket.emit('connection-status', 'connected');
        socket.emit('capabilities', { capabilities: ['queue-handoff-v1'] });
        useStore.setState({
            desktopSocketConnected: true,
            desktopQueueAvailability: 'nonempty',
            desktopQueueCurrentTrackAvailable: true,
            queue: phoneQueue as any,
            currentTrack: phoneQueue.items[0].track as any,
            queueHandoff: { status: 'awaiting-confirmation', direction: 'export', message: null },
        });

        for (let i = 0; i < 2; i++) {
            await useStore.getState().setMode('remote');
            expect(useStore.getState()).toMatchObject({
                mode: 'remote',
                desktopSocketConnected: true,
                desktopQueueAvailability: 'unknown',
                desktopQueueHandoffAvailable: true,
                desktopQueueHandoffCapabilityChecked: true,
                desktopQueueCurrentTrackAvailable: false,
                queueHandoff: { status: 'idle', direction: null, message: null },
            });

            await useStore.getState().setMode('standalone');
            expect(useStore.getState()).toMatchObject({
                mode: 'standalone',
                desktopSocketConnected: true,
                desktopQueueAvailability: 'unknown',
                desktopQueueHandoffAvailable: true,
                desktopQueueHandoffCapabilityChecked: true,
                desktopQueueCurrentTrackAvailable: false,
            });
            expect(useStore.getState().queue.items).toHaveLength(1);
        }

        expect(webSocketService.send).toHaveBeenCalledWith('get-state');
        socket.emit('state-changed', desktopQueueState);
        expect(useStore.getState()).toMatchObject({
            desktopQueueAvailability: 'nonempty',
            desktopQueueCurrentTrackAvailable: true,
        });
        expect(useStore.getState().desktopQueueHandoffAvailable).toBe(true);
    });

    it('keeps the capability timeout through a mode switch for a legacy desktop', async () => {
        socket.setConnected(true);
        useStore.setState({ mode: 'remote' });
        socket.emit('connection-status', 'connected');

        await useStore.getState().setMode('standalone');
        expect(useStore.getState().desktopQueueHandoffCapabilityChecked).toBe(false);

        jest.advanceTimersByTime(3000);
        expect(useStore.getState()).toMatchObject({
            desktopSocketConnected: true,
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: true,
        });
    });

    it('invalidates the capability when the desktop disconnects during standalone restoration', async () => {
        let finishSettings: ((settings: Record<string, unknown>) => void) | undefined;
        (mobileDatabase.getSettings as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
            finishSettings = resolve;
        }));
        socket.setConnected(true);
        useStore.setState({ mode: 'remote' });
        socket.emit('connection-status', 'connected');
        socket.emit('capabilities', { capabilities: ['queue-handoff-v1'] });

        const transition = useStore.getState().setMode('standalone');
        for (let i = 0; i < 10 && !finishSettings; i++) await Promise.resolve();
        expect(mobileDatabase.getSettings).toHaveBeenCalled();

        socket.setConnected(false);
        socket.emit('connection-status', 'disconnected');
        finishSettings?.({});
        await transition;

        expect(useStore.getState()).toMatchObject({
            mode: 'standalone',
            desktopSocketConnected: false,
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
        });
    });

    it('updates eligibility from compact status without replacing phone playback and switches subscriptions', async () => {
        socket.setConnected(true);
        socket.emit('connection-status', 'connected');
        useStore.setState({ queue: phoneQueue as any, currentTrack: phoneQueue.items[0].track as any });
        const status = { queueNonempty: true, hasActiveTrack: true, queueVersion: 3, actionVersion: 7 };
        socket.emit('capabilities', {
            capabilities: ['queue-handoff-v1', 'queue-handoff-status-v1'], queueHandoffStatus: status,
        });
        expect(useStore.getState()).toMatchObject({
            desktopQueueAvailability: 'nonempty', desktopQueueCurrentTrackAvailable: true,
            desktopQueueHandoffAvailable: true,
        });
        expect(useStore.getState().queue).toBe(phoneQueue);
        expect(webSocketService.send).toHaveBeenCalledWith('set-state-subscription', { mode: 'standalone' });
        expect(webSocketService.send).not.toHaveBeenCalledWith('get-state');
        socket.emit('queue-handoff-status', { ...status, queueNonempty: false });
        expect(useStore.getState().desktopQueueAvailability).toBe('nonempty');
        socket.emit('queue-handoff-status', { ...status, queueNonempty: false, hasActiveTrack: false });
        expect(useStore.getState().desktopQueueAvailability).toBe('empty');
        await useStore.getState().setMode('remote');
        expect(webSocketService.send).toHaveBeenCalledWith('set-state-subscription', { mode: 'remote' });
        await useStore.getState().setMode('standalone');
        expect(webSocketService.send).toHaveBeenLastCalledWith('set-state-subscription', { mode: 'standalone' });
        socket.setConnected(false);
        socket.emit('connection-status', 'disconnected');
        socket.emit('queue-handoff-status', status);
        expect(useStore.getState().desktopQueueAvailability).toBe('unknown');
    });

    it('uses full state refreshes when the desktop has the older handoff capability', () => {
        socket.setConnected(true);
        socket.emit('connection-status', 'connected');
        socket.emit('capabilities', { capabilities: ['queue-handoff-v1'] });
        expect(webSocketService.send).toHaveBeenCalledWith('get-state');
        expect(webSocketService.send).not.toHaveBeenCalledWith('set-state-subscription', expect.anything());
        socket.emit('state-changed', desktopQueueState);
        expect(useStore.getState().desktopQueueCurrentTrackAvailable).toBe(true);
    });

    it('requires a fresh capability announcement after reconnecting to another desktop', () => {
        socket.setConnected(true);
        useStore.setState({ mode: 'standalone' });
        socket.emit('connection-status', 'connected');
        socket.emit('capabilities', { capabilities: ['queue-handoff-v1'] });
        expect(useStore.getState().desktopQueueHandoffAvailable).toBe(true);

        socket.setConnected(false);
        socket.emit('connection-status', 'disconnected');
        expect(useStore.getState()).toMatchObject({
            desktopSocketConnected: false,
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
        });

        socket.setConnected(true);
        socket.emit('connection-status', 'connected');
        expect(useStore.getState()).toMatchObject({
            desktopSocketConnected: true,
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: false,
        });
        socket.emit('capabilities', { capabilities: [] });
        expect(useStore.getState()).toMatchObject({
            desktopQueueHandoffAvailable: false,
            desktopQueueHandoffCapabilityChecked: true,
        });
    });
});
