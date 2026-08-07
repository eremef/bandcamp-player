import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { EventEmitter } from "events";
import { Database } from "../database/database";
import type { Track, Album, CacheStats } from "../../shared/types";

// ============================================================================
// Cache Service
// ============================================================================

/** Hosts that must never be treated as a download source — they are us. */
const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/**
 * Tear down a stream without caring whether it supports destroy().
 * Test doubles are plain EventEmitters, so this must stay defensive.
 */
function destroyQuietly(stream: unknown): void {
  const candidate = stream as { destroy?: () => void } | null | undefined;
  if (candidate && typeof candidate.destroy === "function") {
    try {
      candidate.destroy();
    } catch {
      // Nothing useful to do — we are already on a failure path.
    }
  }
}

export class CacheService extends EventEmitter {
  private database: Database;
  private cacheDir: string;
  private activeDownloads: Map<string, AbortController> = new Map();

  constructor(database: Database, cacheDir: string) {
    super();
    this.database = database;
    this.cacheDir = cacheDir;

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Download and cache a track
   */
  async downloadTrack(track: Track): Promise<void> {
    if (this.activeDownloads.has(track.id)) {
      return; // Already downloading
    }

    const settings = this.database.getSettings();
    if (!settings?.cacheEnabled) {
      throw new Error("Caching is disabled");
    }

    // Check if already cached
    if (this.isCached(track.id)) {
      return;
    }

    // Validate before registering the download, so a bad URL can never leave a
    // stale entry behind in activeDownloads.
    this.assertDownloadableStreamUrl(track);

    const controller = new AbortController();
    this.activeDownloads.set(track.id, controller);

    try {
      // Ensure we have space
      await this.ensureCacheSpace(track);
      // NOTE: `await`, not `return`. Returning a promise from inside a try block
      // does not route its rejection through the enclosing catch/finally, which
      // used to leave failed downloads stuck in activeDownloads forever — every
      // retry then hit the guard above and resolved without downloading.
      await this.streamTrackToDisk(track, controller);
    } finally {
      // Identity check: never clear an entry belonging to a newer attempt
      // (cancel-then-immediately-retry registers a fresh controller).
      if (this.activeDownloads.get(track.id) === controller) {
        this.activeDownloads.delete(track.id);
      }
    }

    this.emitStatsUpdate();
  }

  /**
   * Stream a track's audio to the cache directory and record it in the database.
   * Rejects on any failure; the caller owns activeDownloads bookkeeping.
   */
  private async streamTrackToDisk(
    track: Track,
    controller: AbortController,
  ): Promise<void> {
    const filePath = this.getTrackFilePath(track.id);
    const tempPath = `${filePath}.tmp`;

    const response = await axios({
      method: "get",
      url: track.streamUrl,
      responseType: "stream",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    this.assertAudioResponse(response, track);

    const totalLength = parseInt(String(response.headers["content-length"] || "0"), 10);
    let downloadedLength = 0;

    const writer = fs.createWriteStream(tempPath);

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          destroyQuietly(response.data);
          destroyQuietly(writer);
          reject(error);
        };

        const onAbort = () =>
          fail(new Error(`Download cancelled: ${track.title || track.id}`));

        response.data.on("data", (chunk: Buffer) => {
          downloadedLength += chunk.length;
          const progress =
            totalLength > 0 ? (downloadedLength / totalLength) * 100 : 0;
          this.emit("download-progress", { trackId: track.id, progress });
        });

        response.data.on("error", fail);
        writer.on("error", fail);

        writer.on("finish", () => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          resolve();
        });

        // axios tears down its own abort plumbing once response headers arrive,
        // so cancellation only works if we listen for it ourselves.
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener("abort", onAbort, { once: true });

        response.data.pipe(writer);
      });
    } catch (error) {
      this.removeTempFile(tempPath);
      throw error;
    }

    // Deliberately outside the writer's "finish" listener: a throw in here used
    // to surface as an uncaught main-process exception instead of a rejection.
    fs.renameSync(tempPath, filePath);
    const stats = fs.statSync(filePath);

    const now = new Date().toISOString();
    this.database.addCacheEntry({
      trackId: track.id,
      albumId: track.albumId,
      filePath,
      fileSize: stats.size,
      cachedAt: now,
      lastAccessedAt: now,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      trackNumber: track.trackNumber,
      artworkUrl: track.artworkUrl,
    });
  }

  /**
   * Cancel an active download
   */
  cancelDownload(trackId: string): void {
    const controller = this.activeDownloads.get(trackId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(trackId);
    }
  }

  /**
   * Delete a cached track
   */
  deleteTrack(trackId: string): void {
    const entry = this.database.getCacheEntry(trackId);
    if (entry && fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }
    this.database.deleteCacheEntry(trackId);
    this.emitStatsUpdate();
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    const entries = this.database.getAllCacheEntries();
    for (const entry of entries) {
      if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath);
      }
    }
    this.database.clearCache();
    // Album metadata rows are part of the cache the user just cleared.
    this.database.clearAlbumCaches();
    this.emitStatsUpdate();
  }

  /**
   * Check if a track is cached
   */
  isCached(trackId: string): boolean {
    const entry = this.database.getCacheEntry(trackId);
    return entry !== null && fs.existsSync(entry.filePath);
  }

  /**
   * Get cached file path
   */
  getCachedPath(trackId: string): string | null {
    const entry = this.database.getCacheEntry(trackId);
    if (entry && fs.existsSync(entry.filePath)) {
      // Update last accessed time
      this.database.updateCacheAccess(trackId);
      return entry.filePath;
    }
    return null;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const settings = this.database.getSettings();
    const totalSize = this.database.getCacheTotalSize();
    const entries = this.database.getAllCacheEntries();
    const maxSize = (settings?.cacheMaxSizeGb || 5) * 1024 * 1024 * 1024; // GB to bytes

    return {
      totalSize,
      trackCount: entries.length,
      maxSize,
      usagePercent: maxSize > 0 ? (totalSize / maxSize) * 100 : 0,
    };
  }

  /**
   * Get all cached tracks (with track data)
   */
  getCachedTracks(): Track[] {
    const entries = this.database.getAllCacheEntries();
    return entries.map((entry) => ({
      id: entry.trackId,
      albumId: entry.albumId,
      title: "",
      artist: "",
      album: "",
      duration: 0,
      artworkUrl: "",
      streamUrl: "",
      bandcampUrl: "",
      isCached: true,
      cachedPath: entry.filePath,
    }));
  }

  /**
   * Download all tracks in an album
   */
  async downloadAlbum(album: Album): Promise<void> {
    const total = album.tracks.length;
    let completed = 0;

    for (const track of album.tracks) {
      try {
        if (!this.isCached(track.id)) {
          await this.downloadTrack(track);
        }
        completed++;
        this.emit("download-progress", {
          albumId: album.id,
          trackId: track.id,
          progress: (completed / total) * 100,
          total,
          completed,
        });
      } catch (error) {
        console.error(
          `[CacheService] Failed to download track ${track.id}:`,
          error,
        );
        completed++;
        this.emit("download-progress", {
          albumId: album.id,
          trackId: track.id,
          progress: (completed / total) * 100,
          total,
          completed,
        });
      }
    }
  }

  /**
   * Delete all cached tracks for an album
   */
  deleteAlbum(albumId: string): void {
    const entries = this.database.getAllCacheEntries();
    const albumEntries = entries.filter((entry) => entry.albumId === albumId);

    for (const entry of albumEntries) {
      if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath);
      }
      this.database.deleteCacheEntry(entry.trackId);
    }
    this.emitStatsUpdate();
  }

  /**
   * Get cached tracks with full details from collection cache
   */
  getCachedTracksWithDetails(): Track[] {
    const entries = this.database.getAllCacheEntries();
    const tracks: Track[] = [];

    for (const entry of entries) {
      let trackFound = false;

      if (entry.albumId) {
        const albumCache = this.database.getAlbumCache(entry.albumId);
        if (albumCache && albumCache.data && albumCache.data.tracks) {
          const trackData = albumCache.data.tracks.find(
            (t: Track) => t.id === entry.trackId,
          );
          if (trackData) {
            tracks.push({
              ...trackData,
              isCached: true,
              cachedPath: entry.filePath,
            });
            trackFound = true;
          }
        }
      }

      if (!trackFound) {
        tracks.push({
          id: entry.trackId,
          albumId: entry.albumId,
          title: entry.title || "",
          artist: entry.artist || "",
          album: entry.album || "",
          duration: entry.duration || 0,
          artworkUrl: entry.artworkUrl || "",
          streamUrl: "",
          bandcampUrl: "",
          isCached: true,
          cachedPath: entry.filePath,
          trackNumber: entry.trackNumber,
        });
      }
    }

    return tracks;
  }

  getCachedTracksByAlbum(albumId: string): Track[] {
    const entries = this.database.getCacheEntriesByAlbum(albumId);
    const tracks: Track[] = [];

    for (const entry of entries) {
      const albumCache = this.database.getAlbumCache(albumId);
      let trackData: Track | null = null;

      if (albumCache && albumCache.data && albumCache.data.tracks) {
        trackData = albumCache.data.tracks.find(
          (t: Track) => t.id === entry.trackId,
        ) || null;
      }

      if (trackData) {
        tracks.push({
          ...trackData,
          isCached: true,
          cachedPath: entry.filePath,
        });
      } else {
        tracks.push({
          id: entry.trackId,
          albumId: entry.albumId,
          title: entry.title || "",
          artist: entry.artist || "",
          album: entry.album || "",
          duration: entry.duration || 0,
          artworkUrl: entry.artworkUrl || "",
          streamUrl: "",
          bandcampUrl: "",
          isCached: true,
          cachedPath: entry.filePath,
          trackNumber: entry.trackNumber,
        });
      }
    }

    return tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
  }

  // ---- Private Helpers ----

  private getTrackFilePath(trackId: string): string {
    // Sanitize trackId for filename
    const safeId = trackId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.cacheDir, `${safeId}.mp3`);
  }

  /**
   * Remove a partial download. Guarded because a stream can fail before any
   * bytes land, and an unlink that throws would mask the real error.
   */
  private removeTempFile(tempPath: string): void {
    try {
      if (fs.existsSync(tempPath)) {
        // Ensure path uses forward slashes for consistency in tests and cross‑platform environments
        const normalizedPath = tempPath.replace(/\\/g, '/');
        fs.unlinkSync(normalizedPath);
      }
    } catch (error) {
      console.error(
        `[CacheService] Failed to remove temp file ${tempPath}:`,
        error,
      );
    }
  }

  /**
   * Reject stream URLs we must not download from.
   *
   * Empty URLs are reachable with real data: the cached-track stubs returned by
   * getCachedTracks()/getCachedTracksWithDetails() synthesize `streamUrl: ""`
   * and those objects round-trip through the renderer. Loopback URLs are
   * reachable because PlayerService rewrites `streamUrl` in place to point at
   * our own cache server — re-downloading such a track would have us fetch
   * from ourselves.
   */
  private assertDownloadableStreamUrl(track: Track): void {
    const raw = (track.streamUrl || "").trim();
    if (!raw) {
      throw new Error(
        `Track has no stream URL: "${track.title || track.id}"`,
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Invalid stream URL for "${track.title || track.id}"`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `Unsupported stream URL protocol "${parsed.protocol}" for "${track.title || track.id}"`,
      );
    }

    if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(
        `Refusing to download "${track.title || track.id}" from the local cache server`,
      );
    }
  }

  /**
   * Reject obviously-wrong response bodies. Kept permissive on content type —
   * Bandcamp CDNs sometimes serve audio as application/octet-stream — so this
   * only screens out bodies that are clearly not audio at all.
   */
  private assertAudioResponse(
    response: { status?: number; headers?: Record<string, unknown> },
    track: Track,
  ): void {
    const status = response.status;
    if (typeof status === "number" && (status < 200 || status > 299)) {
      throw new Error(
        `Download failed with HTTP ${status} for "${track.title || track.id}"`,
      );
    }

    const contentType = String(
      response.headers?.["content-type"] ?? "",
    ).toLowerCase();
    const isNotAudio =
      contentType.startsWith("text/") ||
      contentType.startsWith("application/json") ||
      contentType.startsWith("application/xml");
    if (isNotAudio) {
      throw new Error(
        `Expected audio but received "${contentType}" for "${track.title || track.id}"`,
      );
    }
  }

  private async ensureCacheSpace(_track: Track): Promise<void> {
    const settings = this.database.getSettings();
    const maxSize = (settings?.cacheMaxSizeGb || 5) * 1024 * 1024 * 1024;
    const estimatedTrackSize = 10 * 1024 * 1024; // Estimate 10MB per track

    let currentSize = this.database.getCacheTotalSize();

    // If we're at capacity, remove oldest entries
    while (currentSize + estimatedTrackSize > maxSize) {
      const oldest = this.database.getOldestCacheEntries(1);
      if (oldest.length === 0) break;

      const entry = oldest[0];
      if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath);
      }
      this.database.deleteCacheEntry(entry.trackId);
      currentSize = this.database.getCacheTotalSize();
    }
  }

  private emitStatsUpdate(): void {
    this.emit("stats-updated", this.getStats());
  }
}
