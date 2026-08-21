// ============================================================================
// Concurrency helpers
//
// Used by long-running bulk jobs that fan out over many network fetches. The
// point is bounded parallelism that still yields to the event loop: on the
// Electron main process an unyielding loop blocks every IPC message, including
// the one that starts playback.
// ============================================================================

export interface MapWithConcurrencyOptions<R> {
  signal?: AbortSignal;
  /**
   * Called once per item, for successes *and* failures, in completion order.
   * A failed item reports `result: null` plus the error, so callers driving an
   * ordered flush can advance past it instead of stalling.
   */
  onSettled?: (index: number, result: R | null, error?: unknown) => void;
  /** Awaited after each task settles — pass setImmediate to unblock the event loop. */
  onYield?: () => Promise<void> | void;
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * Implemented as a worker pool over a shared cursor rather than sequential
 * `Promise.all` batches: a batch only advances when its slowest member settles,
 * which idles the other workers.
 *
 * Never rejects — per-item failures are reported through `onSettled`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: MapWithConcurrencyOptions<R>,
): Promise<void> {
  const total = items.length;
  if (total === 0) return;

  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, total));
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    for (;;) {
      if (opts?.signal?.aborted) return;

      const index = cursor++;
      if (index >= total) return;

      try {
        const result = await fn(items[index], index);
        // The signal may have tripped while this task was in flight; the
        // caller must not see results from a cancelled run.
        if (opts?.signal?.aborted) return;
        opts?.onSettled?.(index, result);
      } catch (error) {
        if (opts?.signal?.aborted) return;
        opts?.onSettled?.(index, null, error);
      }

      if (opts?.onYield) {
        await opts.onYield();
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

/**
 * Spaces out operations by a minimum interval, shared across concurrent callers.
 *
 * Bandcamp is scraped without an official API, so parallel album fetches still
 * need to be paced. A single `nextAllowedAt` cursor means N workers interleave
 * politely instead of each keeping its own timer.
 */
export class RateGate {
  private nextAllowedAt = 0;

  constructor(private readonly minSpacingMs: number) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    if (this.minSpacingMs <= 0) return;

    const now = Date.now();
    const startAt = Math.max(now, this.nextAllowedAt);
    this.nextAllowedAt = startAt + this.minSpacingMs;

    const waitMs = startAt - now;
    if (waitMs <= 0) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, waitMs);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
