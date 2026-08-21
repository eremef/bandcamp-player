import { test, expect } from "./fixtures";

// ---------------------------------------------------------------------------
// End-to-end coverage for the main-process bulk queue job.
//
// Note on stubbing: the job calls ScraperService directly inside the main
// process, so it does NOT go through the `collection:get-album` IPC channel —
// stubbing that handler has no effect here (unlike the renderer-driven loop it
// replaced). To keep these specs off the real network, every mock album already
// carries tracks with stream URLs, which makes the job take the no-fetch path.
//
// Concurrency, out-of-order settling, rate limiting and cancellation mid-fetch
// are covered by src/main/services/queue-job.test.ts, which can control fetch
// timing directly.
// ---------------------------------------------------------------------------

const ALBUM_COUNT = 12;

const makeAlbumItem = (i: number) => {
  const url = `https://bulk.bandcamp.com/album/${i}`;
  return {
    id: `bulk-album-${i}`,
    type: "album" as const,
    token: `tok-${i}`,
    purchaseDate: new Date(Date.now() - i * 1000).toISOString(),
    album: {
      id: `bulk-album-${i}`,
      title: `Bulk Album ${String(i).padStart(2, "0")}`,
      artist: "Bulk Artist",
      artistId: "artist-bulk",
      artworkUrl: "",
      bandcampUrl: url,
      trackCount: 2,
      tracks: [
        {
          id: `bulk-${i}-t1`,
          title: `Bulk ${i} One`,
          artist: "Bulk Artist",
          artistId: "artist-bulk",
          album: `Bulk Album ${i}`,
          albumId: `bulk-album-${i}`,
          duration: 120,
          artworkUrl: "",
          streamUrl: `${url}/one.mp3`,
          bandcampUrl: url,
          isCached: true,
          hasStream: true,
        },
        {
          id: `bulk-${i}-t2`,
          title: `Bulk ${i} Two`,
          artist: "Bulk Artist",
          artistId: "artist-bulk",
          album: `Bulk Album ${i}`,
          albumId: `bulk-album-${i}`,
          duration: 130,
          artworkUrl: "",
          streamUrl: `${url}/two.mp3`,
          bandcampUrl: url,
          isCached: true,
          hasStream: true,
        },
      ],
    },
  };
};

const MOCK_COLLECTION = {
  items: Array.from({ length: ALBUM_COUNT }, (_, i) => makeAlbumItem(i)),
  totalCount: ALBUM_COUNT,
  lastUpdated: new Date().toISOString(),
};

test.describe("Bulk queue jobs", () => {
  test.beforeEach(async ({ electronApp, window }) => {
    await electronApp.evaluate(({ ipcMain }, collection) => {
      ipcMain.removeHandler("collection:fetch");
      ipcMain.removeHandler("collection:refresh");
      ipcMain.handle("collection:fetch", async () => collection);
      ipcMain.handle("collection:refresh", async () => collection);
    }, MOCK_COLLECTION);

    await window.evaluate(async () => {
      if (window.electron?.settings?.set) {
        await window.electron.settings.set({ offlineMode: false });
      }
    });

    const loginBtn = window.getByRole("button", {
      name: "Login with Bandcamp",
    });
    const collectionBtn = window.getByRole("button", {
      name: "Collection",
      exact: true,
    });
    if (await loginBtn.isVisible()) await loginBtn.click();
    await expect(collectionBtn).toBeVisible({ timeout: 15000 });

    await collectionBtn.click();
    await expect(window.getByTestId("album-card").first()).toBeVisible({
      timeout: 15000,
    });

    await window.getByTitle("Refresh").click();
    await expect(window.locator("text=Bulk Artist").first()).toBeVisible({
      timeout: 10000,
    });

    // Start from a clean queue so counts are unambiguous
    await window.evaluate(async () => {
      await window.electron.queue.clear(false);
    });
  });

  const runBulkAction = async (window: any, label: RegExp) => {
    await window.getByTitle("Bulk actions for current view").click();
    const entry = window.locator("button", { hasText: label }).first();
    await expect(entry).toBeVisible({ timeout: 3000 });
    await entry.click();
  };

  // Waiting on the progress button disappearing is racy: with no network to
  // wait for, the job can finish before the button ever renders, so
  // `not.toBeVisible()` would pass while the queue is still filling. Poll the
  // queue itself instead.
  const waitForQueueLength = async (window: any, expected: number) => {
    await window.waitForFunction(
      async (target: number) => {
        const queue = await window.electron.queue.get();
        return queue.items.length >= target;
      },
      expected,
      { timeout: 30000 },
    );
  };

  const getQueue = (window: any) =>
    window.evaluate(async () => {
      const queue = await window.electron.queue.get();
      return {
        length: queue.items.length,
        currentIndex: queue.currentIndex,
        ids: queue.items.map((i: any) => i.track.id),
      };
    });

  test("Add to Queue enqueues every item without blocking the UI", async ({
    window,
  }) => {
    await runBulkAction(window, /Add to Queue/);

    // The click returns immediately — the collection grid is still usable
    const search = window.getByPlaceholder(/Search/i).first();
    await search.fill("Bulk Album 01");
    await expect(window.getByTestId("album-card").first()).toBeVisible({
      timeout: 5000,
    });
    await search.fill("");

    await waitForQueueLength(window, ALBUM_COUNT * 2);

    const queue = await getQueue(window);
    expect(queue.length).toBe(ALBUM_COUNT * 2);
  });

  test("queues albums in the collection's displayed order", async ({
    window,
  }) => {
    await runBulkAction(window, /Add to Queue/);
    await waitForQueueLength(window, ALBUM_COUNT * 2);

    const queue = await getQueue(window);
    const expected = Array.from({ length: ALBUM_COUNT }, (_, i) => [
      `bulk-${i}-t1`,
      `bulk-${i}-t2`,
    ]).flat();
    expect(queue.ids).toEqual(expected);
  });

  test("Play All starts playback rather than only filling the queue", async ({
    window,
  }) => {
    await runBulkAction(window, /Play All/);

    // Playback begins on the first batch, not after the last album
    await window.waitForFunction(
      async () => {
        const state = await window.electron.player.getState();
        return !!state.currentTrack;
      },
      undefined,
      { timeout: 15000 },
    );

    const state = await window.evaluate(() =>
      window.electron.player.getState(),
    );
    expect(state.currentTrack?.id).toBe("bulk-0-t1");
  });

  test("bulk progress is not shown once no job is running", async ({
    window,
  }) => {
    await expect(window.getByTestId("bulk-progress")).not.toBeVisible();
    await expect(
      window.getByTitle("Bulk actions for current view"),
    ).toBeVisible();
  });
});
