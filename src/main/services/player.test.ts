import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PlayerService } from "./player.service";
import { CacheService } from "./cache.service";
import { ScrobblerService } from "./scrobbler.service";
import { ScraperService } from "./scraper.service";
import { CastService } from "./cast.service";
import { Database } from "../database/database";
import { Track } from "../../shared/types";
import { EventEmitter } from "events";

// Mock dependencies
vi.mock("./cache.service");
vi.mock("./scrobbler.service");
vi.mock("./scraper.service");
vi.mock("./cast.service");
vi.mock("../database/database");

// Mock electron
vi.mock("electron", () => ({
  powerSaveBlocker: {
    start: vi.fn().mockReturnValue(1),
    stop: vi.fn(),
    isStarted: vi.fn().mockReturnValue(true),
  },
}));

describe("PlayerService", () => {
  let playerService: PlayerService;
  let mockCacheService: any;
  let mockScrobblerService: any;
  let mockScraperService: any;
  let mockCastService: any;
  let mockDatabase: any;

  const mockTrack: Track = {
    id: "1",
    title: "Test Track",
    artist: "Test Artist",
    album: "Test Album",
    duration: 100,
    artworkUrl: "",
    streamUrl: "http://test.com/stream",
    bandcampUrl: "",
    isCached: false,
  };

  beforeEach(() => {
    // Setup mocks
    mockCacheService = {
      getCachedPath: vi.fn(),
      isCached: vi.fn().mockReturnValue(false),
    };
    mockScrobblerService = {
      updateNowPlaying: vi.fn(),
      scrobble: vi.fn(),
    };
    mockScraperService = {
      getStationStreamUrl: vi
        .fn()
        .mockResolvedValue({ streamUrl: "http://default.stream", duration: 0 }),
      getTrackStreamUrl: vi.fn().mockResolvedValue("http://default.stream"),
    };

    // Make cast service an EventEmitter for listener tests
    mockCastService = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setMuted: vi.fn(),
      getConnectedDevice: vi.fn().mockReturnValue(null),
    });

    mockDatabase = {
      getSettings: vi.fn().mockReturnValue({ defaultVolume: 0.5 }),
      setSettings: vi.fn(),
      getSavedQueue: vi.fn().mockReturnValue(null),
      setSavedQueue: vi.fn(),
    };

    playerService = new PlayerService(
      mockCacheService as unknown as CacheService,
      mockScrobblerService as unknown as ScrobblerService,
      mockScraperService as unknown as ScraperService,
      mockCastService as unknown as CastService,
      mockDatabase as unknown as Database,
    );

    vi.spyOn(console, "log").mockImplementation(() => { });
    vi.spyOn(console, "error").mockImplementation(() => { });
    vi.spyOn(console, "warn").mockImplementation(() => { });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Cast Listeners", () => {
    it("should handle status-changed to connected", async () => {
      playerService.play(mockTrack);
      mockCastService.emit("status-changed", { status: "connected" });

      expect(playerService.getState().isCasting).toBe(true);
      expect(mockScraperService.getTrackStreamUrl).toHaveBeenCalledWith(
        mockTrack,
      );

      // Wait for promise resolution
      await new Promise((r) => setTimeout(r, 0));
      expect(mockCastService.play).toHaveBeenCalledWith(mockTrack, 0);
    });

    it("should handle failed track stream refresh on cast connect", async () => {
      playerService.play(mockTrack);
      mockScraperService.getTrackStreamUrl.mockRejectedValue(
        new Error("Network error"),
      );

      mockCastService.emit("status-changed", { status: "connected" });
      await new Promise((r) => setTimeout(r, 0));

      expect(mockCastService.play).toHaveBeenCalledWith(mockTrack, 0); // Play anyway with old URL
    });

    it("should handle finished event when casting", () => {
      playerService.play(mockTrack);
      mockCastService.emit("status-changed", { status: "connected" });

      vi.spyOn(playerService as any, "handleTrackEnd");
      mockCastService.emit("finished");

      expect((playerService as any).handleTrackEnd).toHaveBeenCalled();
    });

    it("should handle device-status event when casting", () => {
      mockCastService.emit("status-changed", { status: "connected" });
      mockCastService.emit("device-status", { currentTime: 50, duration: 200 });

      const state = playerService.getState();
      expect(state.currentTime).toBe(50);
      expect(state.duration).toBe(200);
    });

    it("should handle error event when casting", () => {
      playerService.play(mockTrack);
      mockCastService.emit("status-changed", { status: "connected" });

      mockCastService.emit("error", new Error("Cast Error"));

      const state = playerService.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isCasting).toBe(false);
      expect(state.error).toContain("Cast Error");
    });
  });

  describe("Playback Control", () => {
    it("should play a track directly and add it to the queue", async () => {
      await playerService.play(mockTrack);
      const state = playerService.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.currentTrack).toEqual(mockTrack);
      expect(state.queue.items).toHaveLength(1);
      expect(state.queue.currentIndex).toBe(0);
      expect(mockScrobblerService.updateNowPlaying).toHaveBeenCalledWith(
        mockTrack,
      );
    });

    it("should resume playback if already playing a track", async () => {
      await playerService.play(mockTrack);
      playerService.pause();
      await playerService.play();
      expect(playerService.getState().isPlaying).toBe(true);
    });

    it("should play next from queue if clearQueueBefore is false", async () => {
      const track1 = { ...mockTrack, id: "1" };
      const track2 = { ...mockTrack, id: "2" };
      await playerService.play(track1, true);
      await playerService.play(track2, false);

      const state = playerService.getState();
      expect(state.queue.items).toHaveLength(2);
      expect(state.queue.currentIndex).toBe(1);
    });

    it("should refresh stream URL if track id starts with radio-", async () => {
      const radioTrack = { ...mockTrack, id: "radio-123", streamUrl: "old" };
      mockScraperService.getTrackStreamUrl.mockResolvedValue("new");

      await playerService.play(radioTrack);
      expect(mockScraperService.getTrackStreamUrl).toHaveBeenCalled();
      expect(playerService.getState().currentTrack?.streamUrl).toBe("new");
    });

    it("should handle updateNowPlaying error", async () => {
      mockScrobblerService.updateNowPlaying.mockImplementation(() => {
        throw new Error("Update err");
      });
      await playerService.play(mockTrack);
      expect(playerService.getState().isPlaying).toBe(true);
    });

    it("should warn when playing an empty queue", async () => {
      vi.spyOn(console, "warn");
      await playerService.play();
      expect(console.warn).toHaveBeenCalledWith(
        "[PlayerService] play called but nothing to play",
      );
    });

    it("should stop playback and clear state", async () => {
      await playerService.play(mockTrack);
      playerService.stop();
      const state = playerService.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(state.currentTime).toBe(0);
    });

    it("should attempt stream URL refresh on reportPlaybackError for non-cached track", async () => {
      const staleTrack = { ...mockTrack, id: "stale-1", streamUrl: "http://expired.stream/1" };
      await playerService.play(staleTrack, true);

      mockScraperService.getTrackStreamUrl.mockResolvedValue("http://fresh.stream/1");

      await playerService.reportPlaybackError("stale-1");

      expect(mockScraperService.getTrackStreamUrl).toHaveBeenCalledWith(staleTrack);
      expect(playerService.getState().currentTrack?.streamUrl).toBe("http://fresh.stream/1");
      expect(playerService.getState().isPlaying).toBe(true);
    });

    it("should auto-skip to next track if stream refresh fails on reportPlaybackError", async () => {
      vi.useFakeTimers();
      const track1 = { ...mockTrack, id: "t1", streamUrl: "http://expired.stream/1" };
      const track2 = { ...mockTrack, id: "t2", streamUrl: "http://valid.stream/2" };
      await playerService.play(track1, true);
      playerService.addToQueue(track2);

      mockScraperService.getTrackStreamUrl.mockRejectedValue(new Error("403 Forbidden"));

      await playerService.reportPlaybackError("t1");

      expect(playerService.getState().isPlaying).toBe(false);
      expect(playerService.getState().error).toContain("Stream URL expired");

      vi.advanceTimersByTime(1600);
      await vi.runAllTimersAsync();

      expect(playerService.getState().currentTrack?.id).toBe("t2");
      vi.useRealTimers();
    });
  });

  describe("Time Updates & Scrobbling", () => {
    it("should update time and fire scrobble if past threshold", async () => {
      await playerService.play(mockTrack);

      // Advance time manually to bypass actual time passage
      (playerService as any).scrobbleStartTime = Date.now() - 60000;

      playerService.updateTime(51, 100); // Past 50%

      expect(playerService.getState().currentTime).toBe(51);
      expect(mockScrobblerService.scrobble).toHaveBeenCalledWith(mockTrack);
    });

    it("should handle track end and play next", async () => {
      const track1 = { ...mockTrack, id: "1" };
      const track2 = { ...mockTrack, id: "2" };
      await playerService.play(track1, true);
      playerService.addToQueue(track2);

      playerService.updateTime(50, 100);
      playerService.handleTrackEnd();

      expect(playerService.getState().currentTrack?.id).toBe("2");
    });

    it("should repeat track on end if repeatMode is one", async () => {
      const track1 = { ...mockTrack, id: "1" };
      await playerService.play(track1, true);
      playerService.setRepeat("one");
      vi.spyOn(playerService, "seek");

      playerService.handleTrackEnd();

      expect(playerService.seek).toHaveBeenCalledWith(0);
      expect(playerService.getState().currentTrack?.id).toBe("1");
    });

    it("should seek to specific time", async () => {
      await playerService.play(mockTrack);
      playerService.updateTime(0, 100);
      playerService.seek(50);
      expect(playerService.getState().currentTime).toBe(50);
    });

    it("should not update local time from renderer if casting", () => {
      playerService.play(mockTrack);
      mockCastService.emit("status-changed", { status: "connected" });

      playerService.updateTime(10, 100);

      expect(playerService.getState().currentTime).toBe(0);
    });
  });

  describe("Queue Management", () => {
    it("should add multiple tracks to queue reverse order when playNext=true", () => {
      const tracks = [
        { ...mockTrack, id: "1" },
        { ...mockTrack, id: "2" },
        { ...mockTrack, id: "3" },
      ];
      // Prime queue
      playerService.addToQueue({ ...mockTrack, id: "0" });
      playerService.playIndex(0);

      playerService.addTracksToQueue(tracks, "collection", true);

      const q = playerService.getQueue().items;
      expect(q[1].track.id).toBe("1");
      expect(q[2].track.id).toBe("2");
      expect(q[3].track.id).toBe("3");
    });

    it("should insert tracks in batch order without a reverse loop", () => {
      const tracks = [
        { ...mockTrack, id: "1" },
        { ...mockTrack, id: "2" },
        { ...mockTrack, id: "3" },
      ];
      playerService.addToQueue({ ...mockTrack, id: "0" });
      playerService.addToQueue({ ...mockTrack, id: "9" });
      playerService.playIndex(0);

      playerService.addTracksToQueue(tracks, "collection", true);

      const ids = playerService.getQueue().items.map((i) => i.track.id);
      expect(ids).toEqual(["0", "1", "2", "3", "9"]);
    });

    it("insertTracksAt returns the index past the block and appends on -1", () => {
      const end = playerService.insertTracksAt(-1, [
        { ...mockTrack, id: "a" },
        { ...mockTrack, id: "b" },
      ]);
      expect(end).toBe(2);
      expect(playerService.getQueue().items).toHaveLength(2);
    });

    it("insertTracksAt keeps currentIndex pointed at the same track", () => {
      playerService.addToQueue({ ...mockTrack, id: "x" });
      playerService.addToQueue({ ...mockTrack, id: "y" });
      playerService.playIndex(1);
      expect(playerService.getQueue().currentIndex).toBe(1);

      playerService.insertTracksAt(0, [{ ...mockTrack, id: "before" }]);

      const q = playerService.getQueue();
      expect(q.currentIndex).toBe(2);
      expect(q.items[q.currentIndex].track.id).toBe("y");
    });

    it("regenerates the shuffle order once per batch add, not once per track", () => {
      playerService.addToQueue({ ...mockTrack, id: "0" });
      playerService.toggleShuffle();

      const spy = vi.spyOn(
        playerService as unknown as { generateShuffleOrder: () => void },
        "generateShuffleOrder",
      );

      playerService.addTracksToQueue(
        Array.from({ length: 20 }, (_, i) => ({ ...mockTrack, id: `t${i}` })),
        "collection",
      );

      // extendShuffleOrder is used instead — a full regen must not happen at all
      expect(spy).not.toHaveBeenCalled();
      expect(playerService.getQueue().items).toHaveLength(21);
    });

    it("extending the shuffle order preserves the relative order of existing entries", () => {
      playerService.addTracksToQueue(
        Array.from({ length: 5 }, (_, i) => ({ ...mockTrack, id: `t${i}` })),
        "collection",
      );
      playerService.playIndex(0);
      playerService.toggleShuffle();

      const before = [
        ...(playerService as unknown as { shuffleOrder: number[] }).shuffleOrder,
      ];

      playerService.insertTracksAt(-1, [{ ...mockTrack, id: "new" }]);

      const after = (playerService as unknown as { shuffleOrder: number[] })
        .shuffleOrder;
      expect(after).toHaveLength(6);
      // The pre-existing indices keep their relative order (none were >= 5, so
      // none were remapped) and the new index 5 has been spliced in.
      expect(after.filter((i) => i !== 5)).toEqual(before);
      expect(after).toContain(5);
    });

    it("coalesces queue broadcasts for bulk inserts and cancels a pending emit", () => {
      vi.useFakeTimers();
      const listener = vi.fn();
      playerService.on("queue-updated", listener);

      for (let i = 0; i < 5; i++) {
        playerService.insertTracksAt(
          -1,
          [{ ...mockTrack, id: `c${i}` }],
          "collection",
          { coalesce: true },
        );
      }
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(listener).toHaveBeenCalledTimes(1);

      // A synchronous emit must swallow any pending coalesced emit
      listener.mockClear();
      playerService.insertTracksAt(-1, [{ ...mockTrack, id: "c9" }], "collection", {
        coalesce: true,
      });
      playerService.addToQueue({ ...mockTrack, id: "sync" });
      expect(listener).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(200);
      expect(listener).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("bumps the queue epoch when the queue is replaced", async () => {
      const start = playerService.getQueueEpoch();

      playerService.addToQueue(mockTrack);
      expect(playerService.getQueueEpoch()).toBe(start);

      playerService.clearQueue(false);
      expect(playerService.getQueueEpoch()).toBe(start + 1);

      await playerService.play(mockTrack);
      expect(playerService.getQueueEpoch()).toBe(start + 2);
    });

    it("adds many radio stations in one batch with one broadcast", () => {
      const listener = vi.fn();
      playerService.on("queue-updated", listener);

      playerService.addStationsToQueue([
        { id: "s1", name: "One" } as never,
        { id: "s2", name: "Two" } as never,
      ]);

      expect(listener).toHaveBeenCalledTimes(1);
      const items = playerService.getQueue().items;
      expect(items).toHaveLength(2);
      expect(items[0].source).toBe("radio");
      expect(items[0].radioStation).toBeDefined();
      expect(items[0].track.id).toBe("radio-s1");
    });

    it("should remove currently playing track", async () => {
      playerService.addToQueue(mockTrack);
      playerService.playIndex(0);

      const qid = playerService.getQueue().items[0].id;
      playerService.removeFromQueue(qid);

      expect(playerService.getState().isPlaying).toBe(false);
      expect(playerService.getQueue().items).toHaveLength(0);
    });

    it("should handle previous correctly depending on time and queue", async () => {
      const track1 = { ...mockTrack, id: "1" };
      const track2 = { ...mockTrack, id: "2" };
      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      playerService.playIndex(1);

      // Time > 3 resets current track
      playerService.updateTime(5, 100);
      await playerService.previous();
      expect(playerService.getState().currentTime).toBe(0);
      expect(playerService.getState().currentTrack?.id).toBe("2");

      // Time < 3 goes to previous track
      playerService.updateTime(1, 100);
      await playerService.previous();
      expect(playerService.getState().currentTrack?.id).toBe("1");

      // Previous at 0 loops if repeat all
      playerService.setRepeat("all");
      await playerService.previous();
      expect(playerService.getState().currentTrack?.id).toBe("2");

      // Previous at 0 seeks to 0 if no repeat
      playerService.setRepeat("off");
      playerService.playIndex(0);
      await playerService.previous();
      expect(playerService.getState().currentTime).toBe(0);
    });

    it("should play next in shuffled order", async () => {
      const track1 = { ...mockTrack, id: "1" };
      const track2 = { ...mockTrack, id: "2" };
      const track3 = { ...mockTrack, id: "3" };

      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      playerService.addToQueue(track3);

      playerService.playIndex(0);

      // Force shuffle array
      (playerService as any).shuffleOrder = [0, 2, 1];
      playerService.toggleShuffle(); // Actually this toggles it and generates random.
      // So we just set it manually to test logic.
      (playerService as any).isShuffled = true;
      (playerService as any).shuffleOrder = [0, 2, 1];
      (playerService as any).currentIndex = 0;

      await playerService.next();
      expect(playerService.getState().currentTrack?.id).toBe("3");
    });

    it("should reorder invalid boundaries gracefully", () => {
      playerService.addToQueue(mockTrack);
      playerService.reorderQueue(-1, 0);
      playerService.reorderQueue(0, 5);
      expect(playerService.getQueue().items).toHaveLength(1);
    });
  });

  describe("Radio Functionality", () => {
    const mockStation: any = {
      id: 1,
      name: "Test Radio",
      streamUrl: "http://stream.url",
      duration: 100,
    };

    it("should play radio station", async () => {
      await playerService.playStation(mockStation);
      expect(playerService.getRadioState().isActive).toBe(true);
      expect(playerService.getState().isPlaying).toBe(true);
    });

    it("should stop radio", async () => {
      await playerService.playStation(mockStation);
      playerService.stopRadio();
      expect(playerService.getRadioState().isActive).toBe(false);
    });
  });

  describe("Offline Mode", () => {
    beforeEach(() => {
      // offlineMode is cached at construction (it is read on every play()),
      // so the service must be rebuilt after changing the settings mock.
      mockDatabase.getSettings.mockReturnValue({
        defaultVolume: 0.5,
        offlineMode: true,
      });
      playerService = new PlayerService(
        mockCacheService as unknown as CacheService,
        mockScrobblerService as unknown as ScrobblerService,
        mockScraperService as unknown as ScraperService,
        mockCastService as unknown as CastService,
        mockDatabase as unknown as Database,
      );
    });

    it("play() in offline mode with non-cached track should set error and not start playing", async () => {
      mockCacheService.isCached.mockReturnValue(false);

      await playerService.play(mockTrack);

      const state = playerService.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.error).toContain("Offline mode");
      expect(state.error).toContain(mockTrack.title);
    });

    it("play() in offline mode with cached track should play normally", async () => {
      mockCacheService.isCached.mockReturnValue(true);

      await playerService.play(mockTrack);

      const state = playerService.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.currentTrack).toEqual(mockTrack);
      expect(state.error).toBeFalsy();
    });

    it("next() in offline mode should skip non-cached tracks and land on the next cached one", async () => {
      const track1 = { ...mockTrack, id: "1", title: "Track 1" };
      const track2 = { ...mockTrack, id: "2", title: "Track 2" };
      const track3 = { ...mockTrack, id: "3", title: "Track 3" };

      // Only track3 is cached
      mockCacheService.isCached.mockImplementation((id: string) => id === "3");

      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      playerService.addToQueue(track3);
      playerService.playIndex(0);

      await playerService.next();

      // Should have skipped track2 (not cached) and landed on track3
      expect(playerService.getState().currentTrack?.id).toBe("3");
    });
  });

  describe("Queue Navigation (next / previous)", () => {
    it("next() should advance to next track when streamUrl is empty (lazy resolution)", async () => {
      const track1 = { ...mockTrack, id: "1", title: "Track 1", streamUrl: "http://stream.1" };
      const track2 = { ...mockTrack, id: "2", title: "Track 2", streamUrl: "" };

      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      await playerService.playIndex(0);

      await playerService.next();

      expect(playerService.getState().currentTrack?.id).toBe("2");
      expect(playerService.getState().queue.currentIndex).toBe(1);
    });

    it("next() should skip tracks when hasStream is explicitly false", async () => {
      const track1 = { ...mockTrack, id: "1", title: "Track 1", streamUrl: "http://stream.1" };
      const track2 = { ...mockTrack, id: "2", title: "Track 2", streamUrl: "", hasStream: false };
      const track3 = { ...mockTrack, id: "3", title: "Track 3", streamUrl: "" };

      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      playerService.addToQueue(track3);
      await playerService.playIndex(0);

      await playerService.next();

      // Track 2 was skipped because hasStream is false
      expect(playerService.getState().currentTrack?.id).toBe("3");
      expect(playerService.getState().queue.currentIndex).toBe(2);
    });

    it("previous() should advance to previous track with lazy streamUrl and skip hasStream: false", async () => {
      const track1 = { ...mockTrack, id: "1", title: "Track 1", streamUrl: "" };
      const track2 = { ...mockTrack, id: "2", title: "Track 2", streamUrl: "", hasStream: false };
      const track3 = { ...mockTrack, id: "3", title: "Track 3", streamUrl: "http://stream.3" };

      playerService.addToQueue(track1);
      playerService.addToQueue(track2);
      playerService.addToQueue(track3);
      await playerService.playIndex(2);

      await playerService.previous();

      // Skipped track 2 (hasStream: false) and landed on track 1
      expect(playerService.getState().currentTrack?.id).toBe("1");
      expect(playerService.getState().queue.currentIndex).toBe(0);
    });
  });

  describe("Extras", () => {
    it("should set volume and toggle mute", async () => {
      vi.useFakeTimers();
      await playerService.setVolume(1.5); // Clamped to 1
      expect(playerService.getState().volume).toBe(1);

      playerService.toggleMute();
      expect(playerService.getState().isMuted).toBe(true);

      vi.advanceTimersByTime(3000);
      expect(mockDatabase.setSettings).toHaveBeenCalledWith({
        defaultVolume: 1,
      });
      vi.useRealTimers();
    });

    it("restores the persisted queue from its own row, not the settings blob", () => {
      mockDatabase.getSavedQueue.mockReturnValue({
        items: [{ id: "q1", track: mockTrack, source: "collection" }],
        currentIndex: 0,
        shuffleOrder: [0],
      });

      const svc = new PlayerService(
        mockCacheService as unknown as CacheService,
        mockScrobblerService as unknown as ScrobblerService,
        mockScraperService as unknown as ScraperService,
        mockCastService as unknown as CastService,
        mockDatabase as unknown as Database,
      );

      const q = svc.getQueue();
      expect(q.items).toHaveLength(1);
      expect(q.currentIndex).toBe(0);
      expect(svc.getState().isShuffled).toBe(true);
    });

    it("persists the queue via setSavedQueue and never through setSettings", () => {
      vi.useFakeTimers();
      playerService.addToQueue(mockTrack);

      vi.advanceTimersByTime(1500);

      expect(mockDatabase.setSavedQueue).toHaveBeenCalledWith(
        expect.objectContaining({ currentIndex: expect.any(Number) }),
      );
      expect(mockDatabase.setSettings).not.toHaveBeenCalledWith(
        expect.objectContaining({ savedQueue: expect.anything() }),
      );
      vi.useRealTimers();
    });

    it("persists despite a continuously reset debounce once the max wait elapses", () => {
      vi.useFakeTimers();
      // Mutate faster than the 1000ms debounce for longer than the 10s deadline
      for (let i = 0; i < 30; i++) {
        playerService.addToQueue({ ...mockTrack, id: `d${i}` });
        vi.advanceTimersByTime(500);
      }
      expect(mockDatabase.setSavedQueue).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("reads offlineMode from cache, never from the DB, during play()", async () => {
      playerService.applySettings({ offlineMode: true });
      mockCacheService.isCached.mockReturnValue(false);
      mockDatabase.getSettings.mockClear();

      await playerService.play(mockTrack);

      expect(playerService.getState().error).toContain("Offline mode");
      expect(mockDatabase.getSettings).not.toHaveBeenCalled();
    });

    it("should get stream root based on cache", () => {
      mockCacheService.getCachedPath.mockReturnValue("/cached/file.mp3");
      (global as any).cacheServerPort = 12345;
      const url = playerService.getStreamUrl(mockTrack);
      expect(url).toBe("http://127.0.0.1:12345/cached/file.mp3");
    });
  });
});
