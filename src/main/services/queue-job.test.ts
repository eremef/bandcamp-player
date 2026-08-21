import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueueJobService } from "./queue-job.service";
import type { PlayerService } from "./player.service";
import type { ScraperService } from "./scraper.service";
import type { CacheService } from "./cache.service";
import type { PlaylistService } from "./playlist.service";
import type {
  Album,
  BulkJobProgress,
  CollectionItem,
  Track,
} from "../../shared/types";

vi.mock("../../shared/remote-config.service", () => ({
  remoteConfigService: {
    get: () => ({
      scraping: {
        rateLimitDelay: 0,
        rateLimitJitter: 0,
        albumDetailConcurrency: 4,
        batchSize: 100,
        maxBatches: 1000,
      },
    }),
  },
}));

const makeTrack = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artist: "Artist",
  album: "Album",
  duration: 100,
  artworkUrl: "",
  streamUrl: `https://stream/${id}`,
  bandcampUrl: `https://bc/${id}`,
  isCached: false,
});

const makeAlbumItem = (id: string): CollectionItem => ({
  id,
  type: "album",
  album: {
    id,
    title: `Album ${id}`,
    artist: "Artist",
    artworkUrl: "",
    bandcampUrl: `https://bc/album/${id}`,
    tracks: [],
    trackCount: 2,
  } as Album,
});

/** Wait for the background job to settle. */
const settle = async (ticks = 40) => {
  for (let i = 0; i < ticks; i++) {
    await new Promise((r) => setImmediate(r));
  }
};

describe("QueueJobService", () => {
  let service: QueueJobService;
  let playerService: any;
  let scraperService: any;
  let cacheService: any;
  let playlistService: any;
  let queueLength: number;
  let epoch: number;

  beforeEach(() => {
    queueLength = 0;
    epoch = 0;

    playerService = {
      clearQueue: vi.fn(() => {
        queueLength = 0;
        epoch++;
      }),
      insertTracksAt: vi.fn((index: number, tracks: Track[]) => {
        queueLength += tracks.length;
        return (index < 0 ? queueLength : index + tracks.length);
      }),
      playIndex: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn(() => ({ items: { length: queueLength }, currentIndex: -1 })),
      getQueueEpoch: vi.fn(() => epoch),
      isOffline: vi.fn(() => false),
    };

    scraperService = {
      getAlbumDetailsWithSource: vi.fn(async (url: string) => ({
        album: {
          id: url,
          tracks: [makeTrack(`${url}-1`), makeTrack(`${url}-2`)],
        },
        source: "network",
      })),
    };

    cacheService = {
      isCached: vi.fn(() => false),
      getCachedTracksByAlbum: vi.fn(() => []),
      downloadTrack: vi.fn().mockResolvedValue(undefined),
    };

    playlistService = { addTracks: vi.fn() };

    service = new QueueJobService({
      playerService: playerService as unknown as PlayerService,
      scraperService: scraperService as unknown as ScraperService,
      cacheService: cacheService as unknown as CacheService,
      playlistService: playlistService as unknown as PlaylistService,
    });

    vi.spyOn(console, "log").mockImplementation(() => { });
    vi.spyOn(console, "error").mockImplementation(() => { });
  });

  afterEach(() => {
    service.destroy();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("start() returns before any album fetch resolves", () => {
    let resolveFetch: (v: unknown) => void = () => { };
    scraperService.getAlbumDetailsWithSource.mockReturnValue(
      new Promise((r) => { resolveFetch = r; }),
    );

    const seed = service.start({
      action: "addToQueue",
      items: [makeAlbumItem("a"), makeAlbumItem("b")],
    });

    // Synchronous contract: no tracks queued yet, but we already have state
    expect(seed.status).toBe("running");
    expect(seed.total).toBe(2);
    expect(seed.completed).toBe(0);
    expect(playerService.insertTracksAt).not.toHaveBeenCalled();

    resolveFetch({ album: { id: "a", tracks: [] }, source: "network" });
  });

  it("appends in input order even when fetches settle out of order", async () => {
    const items = ["0", "1", "2", "3", "4"].map(makeAlbumItem);
    // Completion order: 3, 1, 4, 0, 2
    const delays: Record<string, number> = {
      "https://bc/album/0": 40,
      "https://bc/album/1": 10,
      "https://bc/album/2": 50,
      "https://bc/album/3": 1,
      "https://bc/album/4": 20,
    };
    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (url: string) => {
        await new Promise((r) => setTimeout(r, delays[url]));
        return { album: { id: url, tracks: [makeTrack(url)] }, source: "network" };
      },
    );

    service.start({ action: "addToQueue", items });
    await new Promise((r) => setTimeout(r, 300));

    const queuedIds = playerService.insertTracksAt.mock.calls.map(
      (c: any[]) => c[1][0].id,
    );
    expect(queuedIds).toEqual([
      "https://bc/album/0",
      "https://bc/album/1",
      "https://bc/album/2",
      "https://bc/album/3",
      "https://bc/album/4",
    ]);
  });

  it("does not append anything until the first item lands", async () => {
    const items = ["0", "1"].map(makeAlbumItem);
    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (url: string) => {
        // item 0 is slow, item 1 is instant
        if (url.endsWith("/0")) await new Promise((r) => setTimeout(r, 80));
        return { album: { id: url, tracks: [makeTrack(url)] }, source: "network" };
      },
    );

    service.start({ action: "addToQueue", items });
    await new Promise((r) => setTimeout(r, 30));

    // item 1 is done but must wait for item 0
    expect(playerService.insertTracksAt).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 200));
    expect(playerService.insertTracksAt).toHaveBeenCalledTimes(2);
  });

  it("play clears the queue once and starts playback on the first batch only", async () => {
    service.start({
      action: "play",
      items: ["0", "1", "2"].map(makeAlbumItem),
    });
    await settle();

    expect(playerService.clearQueue).toHaveBeenCalledTimes(1);
    expect(playerService.clearQueue).toHaveBeenCalledWith(false);
    expect(playerService.playIndex).toHaveBeenCalledTimes(1);
    expect(playerService.playIndex).toHaveBeenCalledWith(0);
  });

  it("addToQueue never starts playback", async () => {
    service.start({
      action: "addToQueue",
      items: ["0", "1"].map(makeAlbumItem),
    });
    await settle();

    expect(playerService.clearQueue).not.toHaveBeenCalled();
    expect(playerService.playIndex).not.toHaveBeenCalled();
  });

  it("playNext advances the insertion cursor so batch order is preserved", async () => {
    playerService.getQueue.mockReturnValue({
      items: { length: 3 },
      currentIndex: 1,
    });

    service.start({
      action: "playNext",
      items: ["0", "1", "2"].map(makeAlbumItem),
    });
    await settle();

    const indices = playerService.insertTracksAt.mock.calls.map(
      (c: any[]) => c[0],
    );
    // Starts just after currentIndex and advances by each batch (2 tracks)
    expect(indices).toEqual([2, 4, 6]);
  });

  it("cancel stops further inserts and reports a cancelled terminal event", async () => {
    const progressEvents: BulkJobProgress[] = [];
    service.on("progress", (p) => progressEvents.push(p));

    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (url: string) => {
        await new Promise((r) => setTimeout(r, 20));
        return { album: { id: url, tracks: [makeTrack(url)] }, source: "network" };
      },
    );

    service.start({
      action: "addToQueue",
      items: Array.from({ length: 30 }, (_, i) => makeAlbumItem(String(i))),
    });
    await new Promise((r) => setTimeout(r, 40));

    service.cancel();
    const insertsAtCancel = playerService.insertTracksAt.mock.calls.length;

    await new Promise((r) => setTimeout(r, 200));

    expect(playerService.insertTracksAt.mock.calls.length).toBe(insertsAtCancel);
    const terminal = progressEvents[progressEvents.length - 1];
    expect(terminal.status).toBe("cancelled");
    expect(terminal.cancelReason).toBe("user");
    expect(service.getState()).toBeNull();
  });

  it("counts an aborted fetch as cancelled rather than failed", async () => {
    const progressEvents: BulkJobProgress[] = [];
    service.on("progress", (p) => progressEvents.push(p));

    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (_url: string, _id: string, opts: any) => {
        await new Promise((r) => setTimeout(r, 20));
        if (opts?.signal?.aborted) {
          throw new Error("canceled");
        }
        return { album: { id: "x", tracks: [] }, source: "network" };
      },
    );

    service.start({
      action: "addToQueue",
      items: Array.from({ length: 20 }, (_, i) => makeAlbumItem(String(i))),
    });
    await new Promise((r) => setTimeout(r, 30));
    service.cancel();
    await new Promise((r) => setTimeout(r, 150));

    const terminal = progressEvents[progressEvents.length - 1];
    expect(terminal.status).toBe("cancelled");
    expect(terminal.failed).toBe(0);
  });

  it("self-cancels when the user replaces the queue mid-job", async () => {
    const progressEvents: BulkJobProgress[] = [];
    service.on("progress", (p) => progressEvents.push(p));

    service.start({
      action: "addToQueue",
      items: Array.from({ length: 10 }, (_, i) => makeAlbumItem(String(i))),
    });

    // Simulate the user starting a different track: the queue is replaced
    await new Promise((r) => setImmediate(r));
    epoch++;

    await settle();

    const terminal = progressEvents[progressEvents.length - 1];
    expect(terminal.status).toBe("cancelled");
    expect(terminal.cancelReason).toBe("queue-replaced");
  });

  it("keeps going past a failed album and records the failure", async () => {
    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (url: string) => {
        if (url.endsWith("/1")) throw new Error("scrape failed");
        return { album: { id: url, tracks: [makeTrack(url)] }, source: "network" };
      },
    );

    const progressEvents: BulkJobProgress[] = [];
    service.on("progress", (p) => progressEvents.push(p));

    service.start({
      action: "addToQueue",
      items: ["0", "1", "2"].map(makeAlbumItem),
    });
    await settle();

    const terminal = progressEvents[progressEvents.length - 1];
    expect(terminal.status).toBe("done");
    expect(terminal.failed).toBe(1);
    expect(terminal.completed).toBe(3);
    // Albums 0 and 2 still made it into the queue
    expect(playerService.insertTracksAt).toHaveBeenCalledTimes(2);
  });

  it("batches playlist writes instead of one per album", async () => {
    service.start({
      action: "addToPlaylist",
      playlistId: "pl1",
      items: Array.from({ length: 40 }, (_, i) => makeAlbumItem(String(i))),
    });
    await settle(80);

    // 40 albums x 2 tracks = 80 tracks, batched at 25
    expect(playlistService.addTracks.mock.calls.length).toBeLessThan(10);
    expect(playlistService.addTracks).toHaveBeenCalled();
    const totalTracks = playlistService.addTracks.mock.calls.reduce(
      (sum: number, c: any[]) => sum + c[1].length,
      0,
    );
    expect(totalTracks).toBe(80);
  });

  it("throttles progress events but always emits the terminal one", async () => {
    const progressEvents: BulkJobProgress[] = [];
    service.on("progress", (p) => progressEvents.push(p));

    service.start({
      action: "addToQueue",
      items: Array.from({ length: 100 }, (_, i) => makeAlbumItem(String(i))),
    });
    await settle(200);

    expect(progressEvents.length).toBeLessThan(100);
    expect(progressEvents[progressEvents.length - 1].status).toBe("done");
    expect(progressEvents[progressEvents.length - 1].completed).toBe(100);
  });

  it("starting a new job cancels the old one without the dying job clearing the new slot", async () => {
    scraperService.getAlbumDetailsWithSource.mockImplementation(
      async (url: string) => {
        await new Promise((r) => setTimeout(r, 30));
        return { album: { id: url, tracks: [makeTrack(url)] }, source: "network" };
      },
    );

    service.start({
      action: "addToQueue",
      items: Array.from({ length: 20 }, (_, i) => makeAlbumItem(`old${i}`)),
    });
    await new Promise((r) => setTimeout(r, 20));

    const second = service.start({
      action: "addToQueue",
      items: [makeAlbumItem("new0")],
    });

    // The old job's teardown must not null out the new job
    await new Promise((r) => setTimeout(r, 60));
    const state = service.getState();
    expect(state === null || state.id === second.id).toBe(true);

    await settle();
  });

  it("uses cached tracks instead of scraping when offline", async () => {
    playerService.isOffline.mockReturnValue(true);
    cacheService.getCachedTracksByAlbum.mockReturnValue([makeTrack("cached-1")]);

    service.start({ action: "addToQueue", items: [makeAlbumItem("a")] });
    await settle();

    expect(scraperService.getAlbumDetailsWithSource).not.toHaveBeenCalled();
    expect(playerService.insertTracksAt).toHaveBeenCalledWith(
      -1,
      [expect.objectContaining({ id: "cached-1" })],
      "collection",
      { coalesce: true },
    );
  });

  it("skips the scrape for albums that already carry full tracks", async () => {
    const item = makeAlbumItem("a");
    item.album!.tracks = [makeTrack("t1"), makeTrack("t2")];

    service.start({ action: "addToQueue", items: [item] });
    await settle();

    expect(scraperService.getAlbumDetailsWithSource).not.toHaveBeenCalled();
    expect(playerService.insertTracksAt).toHaveBeenCalledTimes(1);
  });

  it("uses a track item directly when it already has a stream URL", async () => {
    const item: CollectionItem = {
      id: "t",
      type: "track",
      track: makeTrack("t"),
    };

    service.start({ action: "addToQueue", items: [item] });
    await settle();

    expect(scraperService.getAlbumDetailsWithSource).not.toHaveBeenCalled();
    expect(playerService.insertTracksAt).toHaveBeenCalledTimes(1);
  });

  it("reports done immediately for an empty item list", () => {
    const onProgress = vi.fn();
    service.on("progress", onProgress);

    const seed = service.start({ action: "addToQueue", items: [] });

    expect(seed.status).toBe("done");
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(service.getState()).toBeNull();
  });

  it("downloads resolved tracks serially for the download action", async () => {
    service.start({
      action: "download",
      items: ["0", "1"].map(makeAlbumItem),
    });
    await settle(60);

    // 2 albums x 2 tracks
    expect(cacheService.downloadTrack).toHaveBeenCalledTimes(4);
    // Download must not touch the queue
    expect(playerService.insertTracksAt).not.toHaveBeenCalled();
  });

  it("skips already-cached tracks when downloading", async () => {
    cacheService.isCached.mockReturnValue(true);

    service.start({ action: "download", items: [makeAlbumItem("0")] });
    await settle(40);

    expect(cacheService.downloadTrack).not.toHaveBeenCalled();
  });
});
