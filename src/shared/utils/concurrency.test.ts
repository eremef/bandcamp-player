import { describe, it, expect, vi, afterEach } from "vitest";
import { mapWithConcurrency, RateGate } from "./concurrency";

describe("mapWithConcurrency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never exceeds the concurrency limit", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(items, 4, async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, item % 3));
      inFlight--;
      return item;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("processes every item exactly once", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: number[] = [];

    await mapWithConcurrency(items, 5, async (item) => {
      seen.push(item);
      return item;
    });

    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
  });

  it("reports settled items in completion order, not input order", async () => {
    const delays = [30, 0, 20, 5];
    const order: number[] = [];

    await mapWithConcurrency(
      delays,
      4,
      async (delay) => {
        await new Promise((r) => setTimeout(r, delay));
        return delay;
      },
      { onSettled: (index) => order.push(index) },
    );

    expect(order).toHaveLength(4);
    // index 1 (delay 0) must settle before index 0 (delay 30)
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(0));
  });

  it("reports rejections via onSettled with a null result and does not throw", async () => {
    const settled: Array<{ index: number; result: unknown; error: unknown }> = [];

    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        2,
        async (item) => {
          if (item === 2) throw new Error("boom");
          return item;
        },
        {
          onSettled: (index, result, error) =>
            settled.push({ index, result, error }),
        },
      ),
    ).resolves.toBeUndefined();

    expect(settled).toHaveLength(3);
    const failure = settled.find((s) => s.index === 1);
    expect(failure?.result).toBeNull();
    expect((failure?.error as Error).message).toBe("boom");
  });

  it("starts no further tasks once the signal aborts", async () => {
    const controller = new AbortController();
    const started: number[] = [];

    await mapWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      2,
      async (item) => {
        started.push(item);
        if (started.length === 4) controller.abort();
        return item;
      },
      { signal: controller.signal },
    );

    expect(started.length).toBeLessThan(40);
    expect(started.length).toBeGreaterThanOrEqual(4);
  });

  it("suppresses onSettled for results that land after an abort", async () => {
    const controller = new AbortController();
    const settled: number[] = [];

    await mapWithConcurrency(
      [1, 2],
      2,
      async () => {
        controller.abort();
        return 1;
      },
      { signal: controller.signal, onSettled: (i) => settled.push(i) },
    );

    expect(settled).toHaveLength(0);
  });

  it("awaits onYield between tasks", async () => {
    let yields = 0;
    await mapWithConcurrency(
      [1, 2, 3],
      1,
      async (item) => item,
      { onYield: () => { yields++; } },
    );
    expect(yields).toBe(3);
  });

  it("handles an empty input list", async () => {
    const onSettled = vi.fn();
    await mapWithConcurrency([], 4, async (i) => i, { onSettled });
    expect(onSettled).not.toHaveBeenCalled();
  });
});

describe("RateGate", () => {
  it("spaces concurrent acquisitions by the minimum interval", async () => {
    const gate = new RateGate(100);
    const start = Date.now();
    const stamps: number[] = [];

    await Promise.all(
      Array.from({ length: 4 }, () =>
        gate.acquire().then(() => stamps.push(Date.now() - start)),
      ),
    );

    expect(stamps).toHaveLength(4);
    const sorted = [...stamps].sort((a, b) => a - b);
    // Four callers over a 100ms gate: the last must wait ~300ms
    expect(sorted[3]).toBeGreaterThanOrEqual(250);
  });

  it("does not wait when spacing is zero", async () => {
    const gate = new RateGate(0);
    const start = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => gate.acquire()));
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("resolves immediately when the signal is already aborted", async () => {
    const gate = new RateGate(1000);
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    await gate.acquire(controller.signal);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("stops waiting when the signal aborts mid-wait", async () => {
    const gate = new RateGate(5000);
    const controller = new AbortController();

    await gate.acquire(); // consume the first slot
    const pending = gate.acquire(controller.signal);
    setTimeout(() => controller.abort(), 10);

    const start = Date.now();
    await pending;
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
