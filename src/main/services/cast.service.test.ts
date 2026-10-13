/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/types';
import { CastService } from './cast.service';

vi.mock('bonjour-service', () => ({
    Bonjour: class {
        destroy = vi.fn();
    },
}));

vi.mock('@foxxmd/chromecast-client', () => ({
    connect: vi.fn(),
    DefaultMediaApp: { launchAndJoin: vi.fn() },
    createPlatform: vi.fn(),
}));

const track: Track = {
    id: 'track-1',
    title: 'Track One',
    artist: 'Artist',
    album: '',
    duration: 90,
    artworkUrl: '',
    streamUrl: 'https://t4.bcbits.com/stream/test',
    bandcampUrl: 'https://artist.bandcamp.com/track/track-one',
    isCached: false,
};

const result = (playerState: string, currentTime = 37) => ({
    unwrapWithErr: () => ({ isOk: true, value: { playerState, currentTime } }),
});

describe('CastService handoff acknowledgements', () => {
    const services: CastService[] = [];

    afterEach(() => {
        for (const service of services.splice(0)) {
            (service as any).stopStatusPolling();
            service.disconnect();
        }
        vi.restoreAllMocks();
    });

    const createService = (getStatus: () => ReturnType<typeof result>, loadResult = result('BUFFERING')) => {
        const service = new CastService();
        const mediaController = {
            getStatus: vi.fn(getStatus),
            load: vi.fn().mockResolvedValue(loadResult),
            pause: vi.fn().mockResolvedValue(result('PAUSED', 39)),
            play: vi.fn().mockResolvedValue(result('PLAYING', 39)),
            stop: vi.fn().mockResolvedValue(result('IDLE', 0)),
        };
        Object.assign(service as any, {
            client: { close: vi.fn() },
            mediaController,
            connectedDeviceName: 'Chromecast',
            hasActiveSession: true,
        });
        services.push(service);
        return { service, mediaController };
    };

    it('confirms cast playback only after the receiver reports PLAYING at the requested position', async () => {
        const { service, mediaController } = createService(() => result('PLAYING', 39));

        await expect(service.playAndWait(track, 37, 50)).resolves.toBe(true);
        expect(mediaController.load).toHaveBeenCalledWith(expect.objectContaining({
            currentTime: 37,
            autoplay: true,
        }));
        expect(mediaController.getStatus).toHaveBeenCalled();
    });

    it('does not acknowledge cast playback when load fails and the receiver remains paused', async () => {
        const loadError = { unwrapWithErr: () => ({ isOk: false, value: new Error('receiver rejected load') }) };
        const { service } = createService(() => result('PAUSED', 0), loadError as any);

        await expect(service.playAndWait(track, 37, 1)).resolves.toBe(false);
    });

    it('acknowledges cast pause from PAUSED status and rejects it when playback remains active', async () => {
        const paused = createService(() => result('PAUSED', 39));
        await expect(paused.service.pauseAndWait(50)).resolves.toBe(true);

        const stillPlaying = createService(() => result('PLAYING', 39));
        stillPlaying.mediaController.pause.mockRejectedValue(new Error('pause failed'));
        await expect(stillPlaying.service.pauseAndWait(1)).resolves.toBe(false);
    });
});
