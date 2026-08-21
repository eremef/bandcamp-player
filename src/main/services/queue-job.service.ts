import { EventEmitter } from "events";
import type {
  BulkJobProgress,
  BulkQueueRequest,
  CollectionItem,
  Track,
} from "../../shared/types";
import { mapWithConcurrency, RateGate } from "../../shared/utils/concurrency";
import { remoteConfigService } from "../../shared/remote-config.service";
import { PlayerService } from "./player.service";
import { ScraperService } from "./scraper.service";
import { CacheService } from "./cache.service";
import { PlaylistService } from "./playlist.service";

// ============================================================================
// Queue Job Service
//
// Owns long-running "do this to every item in the view" operations: adding a
// whole collection to the queue, queueing an artist, bulk downloads.
//
// This lives in the main process on purpose. The renderer used to drive these
// loops one album at a time, which meant two IPC round trips per album, a loop
// that died on navigation, and no way to cancel. More importantly it could not
// pace or abort the underlying scrapes, so a big collection monopolised the
// main process and playback could not start until it finished.
//
// Two invariants matter:
//   1. start() is synchronous. It returns before any await, so the IPC call
//      that kicks a job off never blocks the renderer.
//   2. Tracks are appended in *input order* via a prefix flush, even though
//      albums are fetched concurrently and settle out of order.
// ============================================================================

export interface QueueJobDeps {
  playerService: PlayerService;
  scraperService: ScraperService;
  cacheService: CacheService;
  playlistService: PlaylistService;
}

const DEFAULT_CONCURRENCY = 4;
const PROGRESS_INTERVAL_MS = 150;
const PLAYLIST_BATCH_SIZE = 25;

interface ActiveJob {
  progress: BulkJobProgress;
  request: BulkQueueRequest;
  controller: AbortController;
  epoch: number;
  /** Results waiting for their turn in the ordered flush. */
  buffer: Map<number, Track[]>;
  nextToFlush: number;
  /** Insertion point for playNext, advanced as batches land. */
  cursor: number;
  hasStartedPlaying: boolean;
  playlistBatch: Track[];
  lastProgressAt: number;
}

export class QueueJobService extends EventEmitter {
  private playerService: PlayerService;
  private scraperService: ScraperService;
  private cacheService: CacheService;
  private playlistService: PlaylistService;

  private activeJob: ActiveJob | null = null;
  private jobCounter = 0;

  constructor(deps: QueueJobDeps) {
    super();
    this.playerService = deps.playerService;
    this.scraperService = deps.scraperService;
    this.cacheService = deps.cacheService;
    this.playlistService = deps.playlistService;
  }

  /**
   * Begin a bulk operation. Synchronous by contract — the work continues in the
   * background and reports through the 'progress' event.
   */
  start(request: BulkQueueRequest): BulkJobProgress {
    // One job at a time: concurrent bulk adds would interleave unpredictably.
    if (this.activeJob) {
      this.cancel();
    }

    const progress: BulkJobProgress = {
      id: `bulk-${++this.jobCounter}`,
      action: request.action,
      label: request.label,
      total: request.items.length,
      completed: 0,
      failed: 0,
      tracksQueued: 0,
      status: "running",
    };

    if (request.items.length === 0) {
      progress.status = "done";
      this.emit("progress", progress);
      return progress;
    }

    // "Play all" replaces the queue up front so the first album can start
    // playing immediately rather than appending behind whatever was there.
    if (request.action === "play") {
      this.playerService.clearQueue(false);
    }

    const job: ActiveJob = {
      progress,
      request,
      controller: new AbortController(),
      epoch: this.playerService.getQueueEpoch(),
      buffer: new Map(),
      nextToFlush: 0,
      cursor:
        request.action === "playNext"
          ? this.playerService.getQueue().currentIndex + 1
          : -1,
      hasStartedPlaying: false,
      playlistBatch: [],
      lastProgressAt: 0,
    };

    this.activeJob = job;
    void this.run(job);

    this.emit("progress", { ...progress });
    return { ...progress };
  }

  cancel(jobId?: string): void {
    const job = this.activeJob;
    if (!job) return;
    if (jobId && job.progress.id !== jobId) return;

    this.finishJob(job, "cancelled", "user");
  }

  getState(): BulkJobProgress | null {
    return this.activeJob ? { ...this.activeJob.progress } : null;
  }

  destroy(): void {
    if (this.activeJob) {
      this.activeJob.controller.abort();
      this.activeJob = null;
    }
  }

  // ---- Internals ----

  private async run(job: ActiveJob): Promise<void> {
    const config = remoteConfigService.get();
    const gate = new RateGate(config.scraping.rateLimitDelay ?? 0);
    // Downloads are disk- and bandwidth-bound, and CacheService already
    // serialises per track, so there is nothing to gain from fanning out.
    const concurrency =
      job.request.action === "download"
        ? 1
        : config.scraping.albumDetailConcurrency ?? DEFAULT_CONCURRENCY;

    try {
      await mapWithConcurrency(
        job.request.items,
        concurrency,
        (item) => this.resolveItemTracks(item, job, gate),
        {
          signal: job.controller.signal,
          onSettled: (index, tracks, error) => {
            if (this.activeJob !== job) return;
            if (error) {
              job.progress.failed++;
            }
            job.buffer.set(index, tracks ?? []);
            this.drain(job);
          },
          // Without this the main process would run the whole job in one
          // uninterrupted stretch and no other IPC (including play) would land.
          onYield: () => new Promise<void>((resolve) => setImmediate(resolve)),
        },
      );

      if (this.activeJob !== job) return;

      this.flushPlaylistBatch(job, true);
      this.finishJob(job, "done");
    } catch (error) {
      if (this.activeJob !== job) return;
      console.error("[QueueJobService] Bulk job failed:", error);
      job.progress.error =
        error instanceof Error ? error.message : String(error);
      this.finishJob(job, "error");
    }
  }

  /**
   * Append every buffered result that is next in line. Anything that completed
   * early waits its turn, so the queue ends up in the same order the user sees
   * on screen regardless of which fetches finished first.
   */
  private drain(job: ActiveJob): void {
    while (job.buffer.has(job.nextToFlush)) {
      const tracks = job.buffer.get(job.nextToFlush)!;
      job.buffer.delete(job.nextToFlush);
      job.nextToFlush++;
      job.progress.completed++;

      if (tracks.length > 0) {
        this.applyTracks(job, tracks);
        job.progress.tracksQueued += tracks.length;
      }

      // The user replaced the queue (started a different track, cleared it).
      // Continuing would append into a queue they no longer expect.
      if (
        job.request.action !== "addToPlaylist" &&
        job.request.action !== "download" &&
        this.playerService.getQueueEpoch() !== job.epoch
      ) {
        this.finishJob(job, "cancelled", "queue-replaced");
        return;
      }

      this.emitProgress(job);
    }
  }

  private applyTracks(job: ActiveJob, tracks: Track[]): void {
    switch (job.request.action) {
      case "play":
      case "addToQueue": {
        const startIndex = this.playerService.getQueue().items.length;
        this.playerService.insertTracksAt(-1, tracks, "collection", {
          coalesce: true,
        });
        // Start playing on the very first batch so audio begins after one
        // album fetch instead of after the whole collection.
        if (job.request.action === "play" && !job.hasStartedPlaying) {
          job.hasStartedPlaying = true;
          // playIndex moves currentIndex but never replaces the queue, so it
          // does not bump the epoch and cannot trip our own cancellation guard.
          void this.playerService.playIndex(startIndex).catch(() => { });
        }
        break;
      }
      case "playNext": {
        job.cursor = this.playerService.insertTracksAt(
          job.cursor,
          tracks,
          "collection",
          { coalesce: true },
        );
        break;
      }
      case "addToPlaylist": {
        job.playlistBatch.push(...tracks);
        this.flushPlaylistBatch(job, false);
        break;
      }
      case "download":
        // Downloading happens in resolveItemTracks, where it can be awaited.
        break;
    }
  }

  /**
   * PlaylistService.addTracks emits playlists-changed per call and the renderer
   * re-fetches on each one, so batch rather than writing per album.
   */
  private flushPlaylistBatch(job: ActiveJob, force: boolean): void {
    const playlistId = job.request.playlistId;
    if (!playlistId) return;
    if (job.playlistBatch.length === 0) return;
    if (!force && job.playlistBatch.length < PLAYLIST_BATCH_SIZE) return;

    const batch = job.playlistBatch;
    job.playlistBatch = [];
    try {
      this.playlistService.addTracks(playlistId, batch);
    } catch (error) {
      console.error("[QueueJobService] Failed to add tracks to playlist:", error);
      job.progress.failed++;
    }
  }

  /**
   * Produce the playable tracks for one collection item. This is the single
   * place the collection, artist and offline branches converge — they were
   * duplicated (and subtly different) across three view components.
   */
  private async resolveItemTracks(
    item: CollectionItem,
    job: ActiveJob,
    gate: RateGate,
  ): Promise<Track[]> {
    const tracks = await this.resolveTracks(item, job, gate);

    if (job.request.action === "download") {
      await this.downloadTracks(tracks, job);
    }

    return tracks;
  }

  private async resolveTracks(
    item: CollectionItem,
    job: ActiveJob,
    gate: RateGate,
  ): Promise<Track[]> {
    if (item.type === "track" && item.track) {
      const track = item.track;
      if (track.streamUrl || this.cacheService.isCached(track.id)) {
        return [track];
      }
      // A bare collection track still needs its album scraped for a stream URL
      if (track.bandcampUrl) {
        const { album } = await this.scraperService.getAlbumDetailsWithSource(
          track.bandcampUrl,
          track.albumId,
          {
            signal: job.controller.signal,
            beforeNetwork: () => gate.acquire(job.controller.signal),
          },
        );
        const match = album?.tracks.find((t) => t.id === track.id);
        if (match) return [match];
      }
      return [track];
    }

    if (item.type !== "album" || !item.album) return [];
    const album = item.album;

    // Already complete (playlists and album detail views hand us full albums)
    if (album.tracks?.length > 0 && album.tracks.every((t) => !!t.streamUrl)) {
      return album.tracks;
    }

    // Offline mode can only ever play what is on disk, so skip the network
    if (this.isOfflineMode()) {
      return this.cacheService.getCachedTracksByAlbum(album.id);
    }

    if (!album.bandcampUrl) return [];

    const { album: details } =
      await this.scraperService.getAlbumDetailsWithSource(
        album.bandcampUrl,
        album.id,
        {
          signal: job.controller.signal,
          beforeNetwork: () => gate.acquire(job.controller.signal),
        },
      );

    return details?.tracks ?? [];
  }

  private async downloadTracks(tracks: Track[], job: ActiveJob): Promise<void> {
    for (const track of tracks) {
      if (job.controller.signal.aborted) return;
      if (this.cacheService.isCached(track.id)) continue;
      try {
        await this.cacheService.downloadTrack(track);
      } catch (error) {
        console.error(
          `[QueueJobService] Failed to download "${track.title}":`,
          error,
        );
      }
    }
  }

  private isOfflineMode(): boolean {
    return this.playerService.isOffline();
  }

  private emitProgress(job: ActiveJob, force = false): void {
    const now = Date.now();
    if (!force && now - job.lastProgressAt < PROGRESS_INTERVAL_MS) return;
    job.lastProgressAt = now;
    this.emit("progress", { ...job.progress });
  }

  private finishJob(
    job: ActiveJob,
    status: BulkJobProgress["status"],
    cancelReason?: BulkJobProgress["cancelReason"],
  ): void {
    if (status === "cancelled" || status === "error") {
      job.controller.abort();
    }

    job.progress.status = status;
    if (cancelReason) {
      job.progress.cancelReason = cancelReason;
    }

    // Identity check: a job that is finishing must not clear a newer job's slot.
    if (this.activeJob === job) {
      this.activeJob = null;
    }

    this.emitProgress(job, true);
  }
}
