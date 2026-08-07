import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CacheService } from "./cache.service";
import { Database } from "../database/database";
import * as fs from "fs";
import axios from "axios";
import { EventEmitter } from "events";
import { Track } from "../../shared/types";

// Mock dependencies
vi.mock("axios");
vi.mock("../database/database");
vi.mock("fs", () => {
  return {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(),
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      createWriteStream: vi.fn(),
      unlinkSync: vi.fn(),
      renameSync: vi.fn(),
      statSync: vi.fn(),
    },
  };
});

describe("CacheService", () => {
  let cacheService: CacheService;
  let mockDatabase: any;
  const mockCacheDir = "/mock/cache/dir";

  beforeEach(() => {
    // Setup mocks
    mockDatabase = {
      getSettings: vi
        .fn()
        .mockReturnValue({ cacheEnabled: true, cacheMaxSizeGb: 1 }),
      getCacheEntry: vi.fn().mockReturnValue(null),
      addCacheEntry: vi.fn(),
      deleteCacheEntry: vi.fn(),
      getAllCacheEntries: vi.fn().mockReturnValue([]),
      getCacheTotalSize: vi.fn().mockReturnValue(0),
      getOldestCacheEntries: vi.fn().mockReturnValue([]),
      updateCacheAccess: vi.fn(),
      clearCache: vi.fn(),
      clearAlbumCaches: vi.fn(),
      getAlbumCache: vi.fn().mockReturnValue(null),
    };

    // Mock fs default behaviors
    (fs.existsSync as any).mockReturnValue(false);
    (fs.mkdirSync as any).mockImplementation(() => { });

    cacheService = new CacheService(
      mockDatabase as unknown as Database,
      mockCacheDir,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should create cache directory if it does not exist", () => {
      expect(fs.existsSync).toHaveBeenCalledWith(mockCacheDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockCacheDir, {
        recursive: true,
      });
    });
  });

  describe("Cache Management", () => {
    it("should return true if track is cached and file exists", () => {
      const trackId = "1";
      const mockEntry = { trackId, filePath: "/path/to/file.mp3" };

      mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
      (fs.existsSync as any).mockReturnValue(true);

      expect(cacheService.isCached(trackId)).toBe(true);
    });

    it("should return false if track is in DB but file missing", () => {
      const trackId = "1";
      const mockEntry = { trackId, filePath: "/path/to/file.mp3" };

      mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
      (fs.existsSync as any).mockReturnValue(false);

      expect(cacheService.isCached(trackId)).toBe(false);
    });

    it("should return cached path if valid", () => {
      const trackId = "1";
      const mockEntry = { trackId, filePath: "/path/to/file.mp3" };

      mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
      (fs.existsSync as any).mockReturnValue(true);

      const path = cacheService.getCachedPath(trackId);
      expect(path).toBe(mockEntry.filePath);
      expect(mockDatabase.updateCacheAccess).toHaveBeenCalledWith(trackId);
    });

    it("should delete track from cache", () => {
      const trackId = "1";
      const mockEntry = { trackId, filePath: "/path/to/file.mp3" };

      mockDatabase.getCacheEntry.mockReturnValue(mockEntry);
      (fs.existsSync as any).mockReturnValue(true);
      (fs.unlinkSync as any).mockImplementation(() => { });

      cacheService.deleteTrack(trackId);

      expect(fs.unlinkSync).toHaveBeenCalledWith(mockEntry.filePath);
      expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledWith(trackId);
    });

    it("should clear entire cache", () => {
      const mockEntries = [
        { trackId: "1", filePath: "/file1.mp3" },
        { trackId: "2", filePath: "/file2.mp3" },
      ];
      mockDatabase.getAllCacheEntries.mockReturnValue(mockEntries);
      (fs.existsSync as any).mockReturnValue(true);
      (fs.unlinkSync as any).mockImplementation(() => { });

      cacheService.clearCache();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(mockDatabase.clearCache).toHaveBeenCalled();
      // Album metadata rows are part of the cache the user just cleared.
      expect(mockDatabase.clearAlbumCaches).toHaveBeenCalled();
    });

    it("should hydrate cached track details from the album cache", () => {
      // This branch was dead until album details gained a writer.
      mockDatabase.getAllCacheEntries.mockReturnValue([
        { trackId: "t1", albumId: "a1", filePath: "/t1.mp3" },
      ]);
      mockDatabase.getAlbumCache.mockReturnValue({
        cachedAt: new Date().toISOString(),
        data: {
          id: "a1",
          tracks: [
            {
              id: "t1",
              title: "Real Title",
              artist: "Real Artist",
              album: "Real Album",
              trackNumber: 3,
            },
          ],
        },
      });

      const tracks = cacheService.getCachedTracksWithDetails();

      expect(mockDatabase.getAlbumCache).toHaveBeenCalledWith("a1");
      expect(tracks[0]).toMatchObject({
        id: "t1",
        title: "Real Title",
        artist: "Real Artist",
        isCached: true,
        cachedPath: "/t1.mp3",
      });
    });
  });

  describe("Stats", () => {
    it("should return cache stats", () => {
      mockDatabase.getCacheTotalSize.mockReturnValue(1024 * 1024 * 100); // 100MB
      mockDatabase.getAllCacheEntries.mockReturnValue([{}, {}]); // 2 items

      const stats = cacheService.getStats();
      expect(stats.totalSize).toBe(1024 * 1024 * 100);
      expect(stats.trackCount).toBe(2);
      expect(stats.maxSize).toBe(1 * 1024 * 1024 * 1024); // 1GB
      expect(stats.usagePercent).toBeCloseTo(9.76, 1); // ~10%
    });
  });

  describe("Download", () => {
    const mockTrack: Track = {
      id: "123",
      title: "Test Track",
      artist: "Test Artist",
      albumId: "album-456",
      streamUrl: "http://example.com/stream.mp3",
      duration: 100,
      album: "Test Album",
      artworkUrl: "http://example.com/art.jpg",
      bandcampUrl: "http://test.bandcamp.com/track/test",
      isCached: false,
    };

    it("should not download if caching is disabled", async () => {
      mockDatabase.getSettings.mockReturnValue({ cacheEnabled: false });
      await expect(cacheService.downloadTrack(mockTrack)).rejects.toThrow(
        "Caching is disabled",
      );
    });

    it("should not download if already cached", async () => {
      mockDatabase.getCacheEntry.mockReturnValue({
        trackId: "123",
        filePath: "some/path",
      });
      (fs.existsSync as any).mockReturnValue(true);

      await cacheService.downloadTrack(mockTrack);
      expect(axios).not.toHaveBeenCalled();
    });

    it("should successfully download a track", async () => {
      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      const mockWriter = new EventEmitter();
      (mockWriter as any).path = "/mock/cache/dir/123.mp3.tmp";

      (axios as any).mockResolvedValue({
        data: mockStream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(mockWriter);
      (fs.statSync as any).mockReturnValue({ size: 100 });
      (fs.renameSync as any).mockImplementation(() => { });

      const downloadPromise = cacheService.downloadTrack(mockTrack);

      // Simulate stream events
      setTimeout(() => {
        mockStream.emit("data", Buffer.alloc(50));
        mockStream.emit("data", Buffer.alloc(50));
        // Simulate pipe finishing (writer finish)
        mockWriter.emit("finish");
      }, 10);

      await downloadPromise;

      expect(axios).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
      expect(mockDatabase.addCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          trackId: mockTrack.id,
          albumId: mockTrack.albumId,
        }),
      );
    });

    it("should handle download errors and cleanup", async () => {
      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      const mockWriter = new EventEmitter();

      (axios as any).mockResolvedValue({
        data: mockStream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(mockWriter);
      (fs.existsSync as any).mockReturnValue(true);
      (fs.unlinkSync as any).mockImplementation(() => { });

      const downloadPromise = cacheService.downloadTrack(mockTrack);

      setTimeout(() => {
        const error = new Error("Network Error");
        mockStream.emit("error", error);
      }, 10);

      await expect(downloadPromise).rejects.toThrow("Network Error");
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it("should ensure cache space before downloading", async () => {
      // Mock cache full scenario
      mockDatabase.getSettings.mockReturnValue({
        cacheEnabled: true,
        cacheMaxSizeGb: 0.00001,
      }); // very small limit
      mockDatabase.getCacheTotalSize.mockReturnValue(20 * 1024 * 1024); // 20MB currently used
      mockDatabase.getOldestCacheEntries.mockReturnValueOnce([
        { trackId: "old1", filePath: "/old/file1.mp3" },
      ]);

      (fs.existsSync as any).mockReturnValue(true);
      (fs.unlinkSync as any).mockImplementation(() => { });

      // Mock successful download setup
      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      const mockWriter = new EventEmitter();
      (axios as any).mockResolvedValue({
        data: mockStream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(mockWriter);
      (fs.statSync as any).mockReturnValue({ size: 100 });

      const downloadPromise = cacheService.downloadTrack(mockTrack);

      setTimeout(() => {
        mockWriter.emit("finish");
      }, 10);

      await downloadPromise;

      expect(mockDatabase.getOldestCacheEntries).toHaveBeenCalled();
      expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledWith("old1");
    });

    it("should emit progress events", async () => {
      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      const mockWriter = new EventEmitter();
      const progressSpy = vi.fn();

      cacheService.on("download-progress", progressSpy);

      (axios as any).mockResolvedValue({
        data: mockStream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(mockWriter);
      (fs.statSync as any).mockReturnValue({ size: 100 });

      const downloadPromise = cacheService.downloadTrack(mockTrack);

      setTimeout(() => {
        mockStream.emit("data", Buffer.alloc(50));
      }, 10);

      setTimeout(() => {
        mockWriter.emit("finish");
      }, 20);

      await downloadPromise;

      expect(progressSpy).toHaveBeenCalledWith({
        trackId: mockTrack.id,
        progress: 50,
      });
    });

    it("should reject and clean up the temp file when a download is cancelled", async () => {
      const mockStream = new EventEmitter();
      (mockStream as any).pipe = vi.fn();
      const mockWriter = new EventEmitter();

      (axios as any).mockResolvedValue({
        status: 200,
        data: mockStream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(mockWriter);
      (fs.existsSync as any).mockReturnValue(true);

      const downloadPromise = cacheService.downloadTrack(mockTrack);
      // Let the axios promise settle so the abort listener is registered.
      await Promise.resolve();
      await Promise.resolve();

      cacheService.cancelDownload(mockTrack.id);

      await expect(downloadPromise).rejects.toThrow(/cancel/i);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        `${mockCacheDir}/${mockTrack.id}.mp3.tmp`,
      );
      expect(mockDatabase.addCacheEntry).not.toHaveBeenCalled();
    });
  });

  describe("Download failure recovery", () => {
    const mockTrack: Track = {
      id: "123",
      title: "Test Track",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      artworkUrl: "",
      streamUrl: "http://stream.url/track.mp3",
      bandcampUrl: "",
      isCached: false,
    };

    /** Arm axios + fs with a fresh stream/writer pair for one attempt. */
    const armDownload = () => {
      const stream = new EventEmitter();
      (stream as any).pipe = vi.fn();
      const writer = new EventEmitter();
      (axios as any).mockResolvedValue({
        status: 200,
        data: stream,
        headers: { "content-length": "100" },
      });
      (fs.createWriteStream as any).mockReturnValue(writer);
      return { stream, writer };
    };

    it("clears activeDownloads after a stream error so a retry re-downloads", async () => {
      // The original bug: `return new Promise(...)` inside a try meant the
      // rejection never reached the catch, so the track stayed in
      // activeDownloads and every retry resolved without downloading anything.
      (fs.existsSync as any).mockReturnValue(true);

      const first = armDownload();
      const attempt1 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      first.stream.emit("error", new Error("Network Error"));
      await expect(attempt1).rejects.toThrow("Network Error");

      const second = armDownload();
      (fs.statSync as any).mockReturnValue({ size: 1000 });
      const attempt2 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      second.writer.emit("finish");
      await attempt2;

      expect(axios).toHaveBeenCalledTimes(2);
      expect(mockDatabase.addCacheEntry).toHaveBeenCalledTimes(1);
    });

    it("clears activeDownloads after a writer error", async () => {
      (fs.existsSync as any).mockReturnValue(true);

      const first = armDownload();
      const attempt1 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      first.writer.emit("error", new Error("EACCES"));
      await expect(attempt1).rejects.toThrow("EACCES");
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        `${mockCacheDir}/${mockTrack.id}.mp3.tmp`,
      );

      const second = armDownload();
      (fs.statSync as any).mockReturnValue({ size: 1000 });
      const attempt2 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      second.writer.emit("finish");
      await attempt2;

      expect(axios).toHaveBeenCalledTimes(2);
    });

    it("clears activeDownloads when axios itself rejects", async () => {
      (axios as any).mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(cacheService.downloadTrack(mockTrack)).rejects.toThrow(
        "ECONNREFUSED",
      );

      const second = armDownload();
      (fs.statSync as any).mockReturnValue({ size: 1000 });
      const attempt2 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      second.writer.emit("finish");
      await attempt2;

      expect(axios).toHaveBeenCalledTimes(2);
    });

    it("does not unlink a temp file that was never created", async () => {
      (fs.existsSync as any).mockReturnValue(false);

      const { stream } = armDownload();
      const attempt = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      stream.emit("error", new Error("Network Error"));

      // The original error must survive, not be replaced by an ENOENT.
      await expect(attempt).rejects.toThrow("Network Error");
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it("propagates a rename failure instead of throwing inside the finish handler", async () => {
      (fs.existsSync as any).mockReturnValue(true);
      const { writer } = armDownload();
      (fs.renameSync as any).mockImplementationOnce(() => {
        throw new Error("EXDEV");
      });

      const attempt = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      writer.emit("finish");

      await expect(attempt).rejects.toThrow("EXDEV");
      expect(mockDatabase.addCacheEntry).not.toHaveBeenCalled();

      // And the track is not poisoned for subsequent attempts.
      const second = armDownload();
      (fs.statSync as any).mockReturnValue({ size: 1000 });
      const attempt2 = cacheService.downloadTrack(mockTrack);
      await Promise.resolve();
      await Promise.resolve();
      second.writer.emit("finish");
      await attempt2;
      expect(axios).toHaveBeenCalledTimes(2);
    });
  });

  describe("Download validation", () => {
    const baseTrack: Track = {
      id: "123",
      title: "Test Track",
      artist: "Test Artist",
      album: "Test Album",
      duration: 180,
      artworkUrl: "",
      streamUrl: "http://stream.url/track.mp3",
      bandcampUrl: "",
      isCached: false,
    };

    it("rejects a track with no stream URL without calling axios", async () => {
      await expect(
        cacheService.downloadTrack({ ...baseTrack, streamUrl: "" }),
      ).rejects.toThrow(/no stream url/i);
      expect(axios).not.toHaveBeenCalled();
    });

    it("refuses to download from the local cache server", async () => {
      // PlayerService rewrites streamUrl in place to point at our own cache
      // server; re-downloading such a track must not fetch from ourselves.
      await expect(
        cacheService.downloadTrack({
          ...baseTrack,
          streamUrl: "http://127.0.0.1:53125/123.mp3",
        }),
      ).rejects.toThrow(/local cache server/i);
      expect(axios).not.toHaveBeenCalled();
    });

    it("rejects a non-2xx response before opening a file", async () => {
      (axios as any).mockResolvedValue({
        status: 403,
        data: new EventEmitter(),
        headers: {},
      });

      await expect(cacheService.downloadTrack(baseTrack)).rejects.toThrow(
        /HTTP 403/,
      );
      expect(fs.createWriteStream).not.toHaveBeenCalled();
    });

    it("rejects an HTML error body served as 200", async () => {
      (axios as any).mockResolvedValue({
        status: 200,
        data: new EventEmitter(),
        headers: { "content-type": "text/html; charset=utf-8" },
      });

      await expect(cacheService.downloadTrack(baseTrack)).rejects.toThrow(
        /expected audio/i,
      );
      expect(mockDatabase.addCacheEntry).not.toHaveBeenCalled();
    });
  });

  describe("Album operations", () => {
    const makeTrack = (id: string): Track => ({
      id,
      title: `Track ${id}`,
      artist: "Test Artist",
      album: "Test Album",
      albumId: "album1",
      duration: 180,
      artworkUrl: "",
      streamUrl: `http://stream.url/${id}.mp3`,
      bandcampUrl: "",
      isCached: false,
    });

    it("downloadAlbum continues after one track fails", async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1000 });

      const progress: any[] = [];
      cacheService.on("download-progress", (data) => progress.push(data));

      let call = 0;
      (axios as any).mockImplementation(() => {
        call++;
        if (call === 1) return Promise.reject(new Error("Network Error"));
        const stream = new EventEmitter();
        (stream as any).pipe = vi.fn();
        const writer = new EventEmitter();
        (fs.createWriteStream as any).mockReturnValue(writer);
        setTimeout(() => writer.emit("finish"), 0);
        return Promise.resolve({
          status: 200,
          data: stream,
          headers: { "content-length": "100" },
        });
      });

      await cacheService.downloadAlbum({
        id: "album1",
        title: "Test Album",
        artist: "Test Artist",
        artworkUrl: "",
        bandcampUrl: "",
        tracks: [makeTrack("t1"), makeTrack("t2")],
      } as any);

      expect(axios).toHaveBeenCalledTimes(2);
      expect(progress[progress.length - 1]).toMatchObject({
        total: 2,
        completed: 2,
      });
    });

    it("deleteAlbum only removes entries for the given album", () => {
      mockDatabase.getAllCacheEntries.mockReturnValue([
        { trackId: "in", albumId: "album1", filePath: "/a.mp3" },
        { trackId: "out", albumId: "album2", filePath: "/b.mp3" },
      ]);
      (fs.existsSync as any).mockReturnValue(true);

      cacheService.deleteAlbum("album1");

      expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledTimes(1);
      expect(mockDatabase.deleteCacheEntry).toHaveBeenCalledWith("in");
    });
  });
});
