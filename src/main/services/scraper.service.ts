import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { AuthService } from "./auth.service";
import { simulationService } from "./simulation.service";
import { Database } from "../database/database";
import type {
  Track,
  Album,
  Collection,
  CollectionItem,
  RadioStation,
  Playlist,
} from "../../shared/types";
import { EventEmitter } from "events";
import { remoteConfigService } from "../../shared/remote-config.service";
// ============================================================================
// Bandcamp Scraper Service
// ============================================================================

/** Lets a long-running caller pace and abort the HTTP requests it triggers. */
export interface AlbumFetchOptions {
  signal?: AbortSignal;
  /** Awaited immediately before every HTTP request, so cache hits cost nothing. */
  beforeNetwork?: () => Promise<void>;
}

export interface AlbumDetailsResult {
  album: Album | null;
  source: "cache" | "network" | "none";
}

export class ScraperService extends EventEmitter {
  private authService: AuthService;
  private database?: Database;
  private http: AxiosInstance;
  private cachedCollection: Collection | null = null;
  private lastCacheId: string | null = null;
  /** Epoch ms the in-memory collection was cached at, so staleness can be
   *  evaluated on a warm hit without re-parsing the multi-MB JSON blob. */
  private cachedCollectionAt: number | null = null;
  private lastBackgroundRefreshAt = 0;

  private static readonly COLLECTION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
  /** A failed refresh never advances cachedAt, so without a backoff a stale
   *  cache plus a flaky network would re-scrape on every single call. */
  private static readonly BACKGROUND_REFRESH_BACKOFF_MS = 15 * 60 * 1000;

  /** Album titles/durations/artwork are immutable in practice. */
  private static readonly ALBUM_METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  /** Bandcamp stream URLs expire, so they are refreshed far more often. */
  private static readonly ALBUM_STREAM_TTL_MS = 6 * 60 * 60 * 1000;

  constructor(authService: AuthService, database?: Database) {
    super();
    this.authService = authService;
    this.database = database;
    const config = remoteConfigService.get();
    this.http = axios.create({
      timeout: 30000,
      headers: {
        "User-Agent": config.userAgents.desktop,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  }

  /**
   * Clean artist name by removing "by Artist" suffix patterns
   * Bandcamp data sometimes includes formats like "Artistby Artist" or "Artist by Artist"
   */
  private cleanArtistName(name: string | undefined | null): string {
    if (!name) return "";
    const config = remoteConfigService.get().cleaning;
    // Remove " by Artist" or "by Artist" suffix
    let cleaned = name
      .replace(new RegExp(config.artistCleanRegex, "i"), "")
      .trim();
    // Also strip leading "by " if present
    cleaned = cleaned
      .replace(new RegExp(config.artistPrefixCleanRegex, "i"), "")
      .trim();
    return cleaned;
  }

  /**
   * Clean album/track title by removing suffixes and "gift given" infix
   */
  private cleanTitle(rawTitle: string, artist?: string): string {
    if (!rawTitle) return "Untitled";

    let title = rawTitle.trim();
    const config = remoteConfigService.get().cleaning;

    // 1. Remove " by Artist" suffix if present
    if (artist && title.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) {
      title = title.slice(0, -` by ${artist}`.length);
    }

    // 1b. Remove "Artist - " prefix if present (label catalog format)
    if (artist) {
      const prefix = `${artist} - `;
      if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
        title = title.slice(prefix.length);
      }
    }

    // 2. Remove "(gift given)" infix/suffix
    // Enhanced regex to capture the part before " (gift given)" for deduplication
    // Matches: "Title (gift given) Title" -> captures "Title"
    const dedupeMatch = title.match(new RegExp(config.dedupeRegex, "i"));
    if (dedupeMatch) {
      return dedupeMatch[1].trim() || "Untitled";
    }

    // Fallback: just remove "(gift given)" from anywhere
    title = title.replace(new RegExp(config.titleCleanRegex, "gi"), " ").trim();

    // 3. General deduplication check (e.g. "Title Title")
    if (title.length > 0) {
      const parts = title.split(/\s+/);
      if (parts.length % 2 === 0) {
        const halfCount = parts.length / 2;
        const firstPart = parts.slice(0, halfCount).join(" ");
        const secondPart = parts.slice(halfCount).join(" ");
        if (firstPart === secondPart) {
          title = firstPart;
        }
      }
    }

    return title.trim() || "Untitled";
  }

  /**
   * Helper to robustly extract a JSON object from a string starting with a variable assignment
   * e.g. "var foo = { ... };"
   * Handles nested braces correctly unlike simple regex checks.
   */
  private extractJsonObject(content: string, keys: string[]): any | null {
    // Find one of the keys followed by assignment
    for (const key of keys) {
      // Look for "key =" or "key:" or "var key ="
      // We use a simplified search to find the start index
      // Escape key for regex
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `(?:var|let|const)?\\s*${escapedKey}\\s*[:=]\\s*`,
      );

      const match = content.match(regex);
      if (match && match.index !== undefined) {
        const startSearchIndex = match.index + match[0].length;
        // Find the first '{'
        const openBraceIndex = content.indexOf("{", startSearchIndex);
        if (openBraceIndex === -1) continue;

        let closeBraceIndex = -1;

        // Simpler approach: Use a stack or counter, treating " and ' as string delimiters
        // Reset indices

        let stack = 0;
        let quoteChar: string | null = null;

        for (let i = openBraceIndex; i < content.length; i++) {
          const char = content[i];

          // Handle escaping
          if (i > 0 && content[i - 1] === "\\" && content[i - 2] !== "\\") {
            // Escaped character, ignore
            continue;
          }

          if (quoteChar) {
            if (char === quoteChar) {
              quoteChar = null; // End string
            }
          } else {
            if (char === '"' || char === "'") {
              quoteChar = char;
            } else if (char === "{") {
              stack++;
            } else if (char === "}") {
              stack--;
              if (stack === 0) {
                closeBraceIndex = i;
                break;
              }
            }
          }
        }

        if (closeBraceIndex !== -1) {
          const jsonString = content.substring(
            openBraceIndex,
            closeBraceIndex + 1,
          );
          let parsedObject: any | null = null;
          try {
            // Try standard parse
            parsedObject = JSON.parse(jsonString);
          } catch {
            // Try relax parse (e.g. key: value instead of "key": "value")
            try {
              // Simplified JSON5-like parsing attempt for keys and quotes
              const sanitizedValue = jsonString
                .replace(/([{,])\s*([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":') // Quote keys
                .replace(/'/g, '"'); // Replace single quotes
              parsedObject = JSON.parse(sanitizedValue);
            } catch (e3) {
              console.error(
                `[Scraper] Failed to parse extracted object for ${key}:`,
                e3,
              );
            }
          }

          // Basic validation: ensure it's an object and not null
          if (parsedObject && typeof parsedObject === "object") {
            return parsedObject;
          }
        }
      }
    }
    return null;
  }

  /**
   * Fetch user's collection (purchased music)
   */
  private fetchPromise: Promise<Collection> | null = null;

  /**
   * Build every cache key the collection may be stored under.
   *
   * `userId` comes from the menubar API and is not stable across launches: it
   * falls back to the cookie fan id when that API fails, and it is the *band*
   * id for artist accounts. The write path therefore saves under both keys and
   * the read path has to try both.
   */
  private getCollectionCacheIds(includeWishlist: boolean): {
    userId: string | undefined;
    fanId: string | undefined;
    isSimulating: boolean;
    cacheId: string;
    fanCacheId: string | null;
    anonymousCacheId: string;
  } {
    const userId = this.authService.getUser().user?.id;
    const fanId = (this.authService as any).getFanIdFromCookie?.() || undefined;
    const isSimulating = simulationService.shouldSimulate();
    const suffix = includeWishlist ? "_withWishlist" : "";

    // Guard before interpolating: `${undefined}_withWishlist` would otherwise
    // write the literal junk key "undefined_withWishlist".
    const base = isSimulating
      ? `${userId || "anonymous"}_sim`
      : userId || "anonymous";

    return {
      userId,
      fanId,
      isSimulating,
      cacheId: `${base}${suffix}`,
      fanCacheId: fanId ? `${fanId}${suffix}` : null,
      anonymousCacheId: `anonymous${suffix}`,
    };
  }

  /**
   * Read the collection cache, falling back through the alternative keys.
   * Returns the row plus the key it was found under so callers can re-save
   * under the primary key and self-heal.
   */
  private readCollectionCache(
    ids: ReturnType<ScraperService["getCollectionCacheIds"]>,
    context: string,
  ): { cached: { data: any; cachedAt: string }; hitId: string } | null {
    if (!this.database) return null;

    const candidates = [ids.cacheId, ids.fanCacheId, ids.anonymousCacheId];
    const tried = new Set<string>();

    for (const key of candidates) {
      if (!key || tried.has(key)) continue;
      tried.add(key);
      const cached = this.database.getCollectionCache(key);
      console.log(
        `[Scraper] ${context}: cache key "${key}" -> ${cached ? "FOUND" : "NOT FOUND"}`,
      );
      if (cached) return { cached, hitId: key };
    }
    return null;
  }

  /** Adopt a collection into the in-memory cache along with its age. */
  private setCachedCollection(
    collection: Collection,
    cachedAtMs: number,
  ): Collection {
    this.cachedCollection = collection;
    this.cachedCollectionAt = cachedAtMs;
    return collection;
  }

  /**
   * Kick off a background refresh when the cached collection is stale.
   * Called from both the memory-hit and DB-hit paths — the memory path is what
   * makes the periodic timer in main.ts effective once the cache is warm.
   */
  private maybeBackgroundRefresh(isSimulating: boolean): void {
    if (isSimulating) return;
    if (this.database?.getSettings()?.offlineMode) return;
    if (this.fetchPromise) return; // a scrape is already running
    if (this.cachedCollectionAt === null) return;

    const now = Date.now();
    if (now - this.cachedCollectionAt <= ScraperService.COLLECTION_STALE_AFTER_MS) {
      return;
    }
    if (
      now - this.lastBackgroundRefreshAt <
      ScraperService.BACKGROUND_REFRESH_BACKOFF_MS
    ) {
      return;
    }

    this.lastBackgroundRefreshAt = now;
    console.log("[Scraper] Cache is stale, refreshing in background...");
    this.fetchCollection(true).catch((e) =>
      console.error("[Scraper] Background collection refresh failed:", e),
    );
    this.getRadioStations(true).catch((e) =>
      console.error("[Scraper] Background radio refresh failed:", e),
    );
  }

  /**
   * Fetch user's collection (purchased music)
   */
  async fetchCollection(
    forceRefresh = false,
    includeWishlistOverride?: boolean,
  ): Promise<Collection> {
    // ── Offline-first guard ──────────────────────────────────────────────────
    // Check offline mode BEFORE consulting fetchPromise so we never return a
    // stale/failing network promise when the user is in offline mode.
    if (!forceRefresh) {
      const isOfflineMode = this.database?.getSettings()?.offlineMode ?? false;
      if (isOfflineMode) {
        // 1. Try in-memory cache
        if (this.cachedCollection) {
          return this.cachedCollection;
        }

        // 2. Try database cache
        const includeWishlistInCollection =
          includeWishlistOverride ??
          this.database?.getSettings()?.includeWishlistInCollection ??
          false;
        const ids = this.getCollectionCacheIds(includeWishlistInCollection);

        console.log(
          `[Scraper] Offline mode: trying cache with userId=${ids.userId}, cacheId=${ids.cacheId}, fanIdFromCookie=${ids.fanId}, isSimulating=${ids.isSimulating}`,
        );

        const hit = this.readCollectionCache(ids, "Offline mode");
        if (hit) {
          console.log("[Scraper] Offline mode: loaded collection from cache");
          this.setCachedCollection(
            hit.cached.data,
            new Date(hit.cached.cachedAt).getTime(),
          );
          this.consolidateArtistIds(this.cachedCollection!.items);
          this.extractAndSaveArtists(hit.cached.data.items, ids.isSimulating);
          return this.cachedCollection!;
        }

        // 3. Nothing cached — return empty collection, do NOT hit the network
        console.log(
          "[Scraper] Offline mode: no cached collection found, returning empty collection",
        );
        this.setCachedCollection(
          {
            items: [],
            totalCount: 0,
            lastUpdated: new Date().toISOString(),
          },
          Date.now(),
        );
        return this.cachedCollection!;
      }
    }
    // ── End offline-first guard ──────────────────────────────────────────────

    const includeWishlistInCollection =
      includeWishlistOverride ??
      this.database?.getSettings()?.includeWishlistInCollection ??
      false;
    const ids = this.getCollectionCacheIds(includeWishlistInCollection);
    const { userId, isSimulating, cacheId } = ids;

    if (this.cachedCollection && !forceRefresh && this.lastCacheId === cacheId) {
      console.log(`[Scraper] Returning memory-cached collection for cacheId: ${cacheId}`);
      // Evaluate staleness here too, otherwise the periodic refresh in main.ts
      // can never reach the check once the in-memory cache is warm.
      this.maybeBackgroundRefresh(isSimulating);
      return this.cachedCollection;
    }

    this.lastCacheId = cacheId;

    // Try to load from database first if not forcing refresh.
    // cacheId already falls back to 'anonymous' when userId is null, so no userId guard needed.
    if (!forceRefresh && this.database) {
      const hit = this.readCollectionCache(ids, "Collection");
      const cached = hit?.cached;

      if (cached) {
        const hasMissingArtwork =
          isSimulating &&
          cached.data?.items &&
          cached.data.items.length > 0 &&
          !(cached.data.items || []).some(
            (item: any) => item.track?.artworkUrl || item.album?.artworkUrl,
          );

        if (hasMissingArtwork) {
          console.log(
            "[Scraper] Cached simulation is missing artwork, forcing refresh...",
          );
        } else {
          console.log(
            `[Scraper] Loaded ${isSimulating ? "simulated " : ""}collection from cache for ${userId || "anonymous"}`,
          );
          this.setCachedCollection(
            cached.data,
            new Date(cached.cachedAt).getTime(),
          );

          // Consolidate IDs even from cache to fix existing data
          this.consolidateArtistIds(this.cachedCollection!.items);

          this.extractAndSaveArtists(cached.data.items, isSimulating);

          // Self-heal: the row was found under the cookie fan-id key, which is
          // the same identity under a different name, so copy it to the primary
          // key and the next launch hits on the first try. Deliberately NOT done
          // for the anonymous key — that would stamp an anonymous collection
          // onto a real user's key.
          if (hit && hit.hitId === ids.fanCacheId && hit.hitId !== cacheId) {
            console.log(
              `[Scraper] Re-saving cache under primary key "${cacheId}" (was found under "${hit.hitId}")`,
            );
            this.database.saveCollectionCache(
              cacheId,
              "collection",
              cached.data,
            );
          }

          this.maybeBackgroundRefresh(isSimulating);

          return this.cachedCollection!;
        }
      }
    }

    // Single-flight guard sits BELOW the cache reads on purpose: a renderer
    // fetch that lands while a background scrape is running must return cached
    // data immediately rather than awaiting the whole scrape.
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Only the network path signals this, so a cache hit never flashes the
    // "Updating…" indicator in the renderer.
    this.emit("collection-refresh-started");

    this.fetchPromise = (async () => {
      try {
        const { isAuthenticated, user } = this.authService.getUser();
        if (!isSimulating && (!isAuthenticated || !user)) {
          throw new Error("User not authenticated");
        }

        const cookies = isSimulating
          ? ""
          : await this.authService.getSessionCookies();
        const profileUrl = isSimulating ? "" : user?.profileUrl || "";
        const items: CollectionItem[] = [];

        if (!isSimulating) {
          // Real scraping flow
          const response = await this.http.get(profileUrl, {
            headers: { Cookie: cookies },
          });
          const $ = cheerio.load(response.data);

          // Parse initial page items
          const config = remoteConfigService.get();
          const scripts = $("script")
            .map((_, el) => $(el).html() || "")
            .get();

          // Find and parse collection script
          const collectionScript = scripts.find((s) =>
            (config.scriptKeys?.collection || []).some((k) => s.includes(k)),
          );

          if (collectionScript) {
            const collectionData = this.extractJsonObject(
              collectionScript,
              config.scriptKeys?.collection || [],
            );
            if (collectionData?.items) {
              console.log(
                `[Scraper] Found ${collectionData.items.length} initial collection items in page script`,
              );
              for (const item of collectionData.items) {
                const parsed = this.parseCollectionItem(item, "collection");
                if (parsed) items.push(parsed);
              }
            }
          }

          // Find and parse wishlist script if enabled
          const wishlistItems: CollectionItem[] = [];
          if (includeWishlistInCollection) {
            const wishlistScript = scripts.find((s) =>
              (config.scriptKeys?.wishlist || []).some((k) => s.includes(k)),
            );
            if (wishlistScript) {
              const wishlistData = this.extractJsonObject(
                wishlistScript,
                config.scriptKeys?.wishlist || [],
              );
              if (wishlistData) {
                const blobItems = wishlistData.items || wishlistData.tracklist || wishlistData.collection_items;
                if (blobItems && Array.isArray(blobItems)) {
                  console.log(
                    `[Scraper] Found ${blobItems.length} initial wishlist items in page script`,
                  );
                  for (const raw of blobItems) {
                    const parsed = this.parseCollectionItem(raw, "wishlist");
                    if (parsed) wishlistItems.push(parsed);
                  }
                } else {
                  console.log(`[Scraper] Wishlist script found but no items/tracklist array. Keys: ${Object.keys(wishlistData).join(", ")}`);
                }
              }
            }
          }

          if (items.length === 0) {
            console.log("[Scraper] No collection items in script, falling back to DOM parsing");
            $(config.selectors.collection.itemContainer).each((_, el) => {
              const parsed = this.parseCollectionItemFromDOM($, $(el));
              if (parsed) items.push(parsed);
            });
            console.log(`[Scraper] DOM parsing found ${items.length} items`);
          }

          // Fetch more via API
          const pageFanId = this.extractFanId(response.data);
          const activeFanId = pageFanId ? String(pageFanId) : user!.id;
          console.log(`[Scraper] Using activeFanId: ${activeFanId} (from page: ${!!pageFanId})`);

          // Initial API fetch
          const initialBatch = await this.fetchMoreCollectionItems(
            activeFanId,
            undefined,
            cookies,
            config.endpoints.collectionItemsApi,
            "collection",
          );
          for (const item of initialBatch) {
            if (!items.some((existing) => existing.id === item.id))
              items.push(item);
          }

          // Iterative fetch with retry logic
          let hasMore = items.length > 0;
          let batchCount = 0;
          let retryCount = 0;
          const MAX_RETRIES = 3;
          const scrapingConfig = remoteConfigService.get().scraping;

          while (hasMore && batchCount < scrapingConfig.maxBatches) {
            const lastItem = items[items.length - 1];
            if (!lastItem?.token) break;

            try {
              const batch = await this.fetchMoreCollectionItems(
                activeFanId,
                lastItem.token,
                cookies,
                config.endpoints.collectionItemsApi,
                "collection",
              );
              if (batch.length === 0) {
                hasMore = false;
              } else {
                const newItems = batch.filter(
                  (b) => !items.some((e) => e.id === b.id),
                );
                if (newItems.length === 0) {
                  hasMore = false;
                } else {
                  items.push(...newItems);
                  retryCount = 0; // Reset on success
                }
              }
              batchCount++;
            } catch {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                console.error(
                  `[Scraper] Max retries reached for batch ${batchCount}, stopping.`,
                );
                break;
              }
              console.warn(
                `[Scraper] Error fetching batch ${batchCount}, retry ${retryCount}/${MAX_RETRIES}...`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * retryCount),
              );
            }
          }

          if (includeWishlistInCollection) {
            console.log(`[Scraper] Fetching more wishlist items for fan ${activeFanId}...`);
            const wishlistEndpoint =
              config.endpoints.wishlistItemsApi ||
              "https://bandcamp.com/api/fancollection/1/wishlist_items";

            // If we have no wishlist items yet, fetch the first batch from API
            if (wishlistItems.length === 0) {
              const initialWishlistBatch = await this.fetchMoreCollectionItems(
                activeFanId,
                undefined,
                cookies,
                wishlistEndpoint,
                "wishlist",
              );
              console.log(`[Scraper] Initial wishlist API batch returned ${initialWishlistBatch.length} items`);
              wishlistItems.push(...initialWishlistBatch);
            }

            let hasMoreWishlist = wishlistItems.length > 0;
            let wishlistBatchCount = 0;
            let wishlistRetryCount = 0;

            while (
              hasMoreWishlist &&
              wishlistBatchCount < scrapingConfig.maxBatches
            ) {
              const lastWishlistItem = wishlistItems[wishlistItems.length - 1];
              if (!lastWishlistItem?.token) break;

              try {
                const batch = await this.fetchMoreCollectionItems(
                  activeFanId,
                  lastWishlistItem.token,
                  cookies,
                  wishlistEndpoint,
                  "wishlist",
                );
                if (batch.length === 0) {
                  hasMoreWishlist = false;
                } else {
                  const newItems = batch.filter(
                    (b) => !wishlistItems.some((e) => e.id === b.id),
                  );
                  if (newItems.length === 0) {
                    hasMoreWishlist = false;
                  } else {
                    wishlistItems.push(...newItems);
                    wishlistRetryCount = 0;
                  }
                }
                wishlistBatchCount++;
              } catch {
                wishlistRetryCount++;
                if (wishlistRetryCount > MAX_RETRIES) {
                  console.error(
                    `[Scraper] Max retries reached for wishlist batch ${wishlistBatchCount}, stopping.`,
                  );
                  break;
                }
                console.warn(
                  `[Scraper] Error fetching wishlist batch ${wishlistBatchCount}, retry ${wishlistRetryCount}/${MAX_RETRIES}...`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * wishlistRetryCount),
                );
              }
            }

            for (const item of wishlistItems) {
              const existingIndex = items.findIndex(
                (existing) => existing.id === item.id,
              );
              if (existingIndex === -1) {
                items.push(item);
              } else if (
                item.source === "wishlist" &&
                items[existingIndex].source !== "collection"
              ) {
                items[existingIndex] = item;
              }
            }
          }
        } else {
          // Simulation Flow with retries
          console.log("[Scraper] Starting large collection simulation...");
          let hasMore = true;
          let lastToken: string | undefined = undefined;
          let retryCount = 0;
          const MAX_RETRIES = 5;

          while (hasMore) {
            try {
              const batch = await simulationService.fetchBatch(lastToken);
              if (batch.length === 0) {
                hasMore = false;
              } else {
                items.push(...batch);
                lastToken = batch[batch.length - 1].token;
                retryCount = 0; // Reset on success
              }
            } catch {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                console.error(
                  "[Scraper] Simulation failed repeatedly, stopping.",
                );
                break;
              }
              console.warn(
                `[Scraper] Simulation error (retry ${retryCount}/${MAX_RETRIES})...`,
              );
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }

        // Assign original sequence index for stable tie-breaking during sorting
        items.forEach((item, idx) => {
          item.index = idx;
        });

        this.consolidateArtistIds(items);

        const collection = this.setCachedCollection(
          {
            items,
            totalCount: items.length,
            lastUpdated: new Date().toISOString(),
            isSimulated: isSimulating,
          },
          Date.now(),
        );

        this.emit("collection-updated", collection);

        if (this.database && items.length > 0) {
          const { fanId, fanCacheId } = ids;
          console.log(
            `[Scraper] Saving collection to cache with userId=${userId}, fanIdFromCookie=${fanId}, cacheId=${cacheId}, items=${items.length}`,
          );
          // Save with primary cacheId
          this.database.saveCollectionCache(
            cacheId,
            "collection",
            collection,
          );
          // Also save with fanIdFromCookie if different (handles cookie format changes)
          if (fanCacheId && fanCacheId !== cacheId) {
            this.database.saveCollectionCache(
              fanCacheId,
              "collection",
              collection,
            );
            console.log(
              `[Scraper] Also saved collection to cache with fanIdFromCookie=${fanId}`,
            );
          }
          console.log(
            `[Scraper] Saved ${isSimulating ? "simulated " : ""}collection to cache (${items.length} items)`,
          );
          this.extractAndSaveArtists(items, isSimulating);
        }

        // Also refresh radio stations when collection is refreshed from network
        if (!isSimulating) {
          this.getRadioStations(true).catch((e) =>
            console.error("[Scraper] Background radio refresh failed after collection fetch:", e),
          );
        }

        return collection;
      } catch (error: any) {
        console.error("[Scraper] Collection fetch failed:", error.message);
        // On network failure, try to fall back to any available DB cache before throwing
        if (this.database) {
          const fallback = this.readCollectionCache(ids, "Network fallback");
          if (fallback) {
            console.log(
              "[Scraper] Network failed, using cached collection as fallback",
            );
            this.setCachedCollection(
              fallback.cached.data,
              new Date(fallback.cached.cachedAt).getTime(),
            );
            return this.cachedCollection!;
          }
        }
        // If offline mode is explicitly on, return empty collection rather than surfacing an error
        if (this.database?.getSettings()?.offlineMode) {
          console.log(
            "[Scraper] Offline mode: network failed, no cache — returning empty collection",
          );
          this.setCachedCollection(
            {
              items: [],
              totalCount: 0,
              lastUpdated: new Date().toISOString(),
            },
            Date.now(),
          );
          return this.cachedCollection!;
        }
        throw error;
      } finally {
        this.fetchPromise = null;
        this.emit("collection-refresh-finished");
      }
    })();

    return this.fetchPromise;
  }

  private extractFanId(html: string): number | null {
    const $ = cheerio.load(html);
    const dataBlob = $("#pagedata").attr("data-blob");
    if (dataBlob) {
      try {
        const entities: Record<string, string> = {
          "&quot;": '"',
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
        };
        const decoded = dataBlob.replace(
          /&quot;|&amp;|&lt;|&gt;/g,
          (match) => entities[match],
        );
        const pd = JSON.parse(decoded);
        return pd.fan_stats?.fan_id || pd.fan_id || null;
      } catch (e) {
        console.error("[Scraper] Failed to parse #pagedata:", e);
      }
    }
    return null;
  }

  /**
   * Extract unique artists from collection items and save to database
   */
  private extractAndSaveArtists(
    items: CollectionItem[],
    isSimulated = false,
  ): void {
    if (!this.database) return;

    // Collect unique artists by name, using frequency to pick the best name for a given numeric ID
    const nameFrequency = new Map<string, Map<string, number>>();
    const artistsMap = new Map<string, { id: string; name: string; url: string; imageUrl?: string }>();

    for (const item of items) {
      const data = item.type === "album" ? item.album : item.track;
      if (!data || !data.artist?.trim()) continue;

      const id =
        data.artistId ||
        `name-${data.artist.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")}`;

      if (!nameFrequency.has(id)) nameFrequency.set(id, new Map());
      const names = nameFrequency.get(id)!;
      names.set(data.artist, (names.get(data.artist) || 0) + 1);

      if (!artistsMap.has(id)) {
        let url = "";
        if (data.bandcampUrl) {
          try {
            const urlObj = new URL(data.bandcampUrl);
            url = `${urlObj.protocol}//${urlObj.host}`;
          } catch {
            url = data.bandcampUrl;
          }
        }
        if (!url) url = `https://bandcamp.com/search?q=${encodeURIComponent(data.artist)}`;
        artistsMap.set(id, { id, name: data.artist, url, imageUrl: data.artworkUrl || undefined });
      } else {
        const entry = artistsMap.get(id)!;
        if (!entry.imageUrl && data.artworkUrl) entry.imageUrl = data.artworkUrl;
      }
    }

    // Apply most-frequent name for each ID
    for (const [id, entry] of artistsMap) {
      const names = nameFrequency.get(id);
      if (!names || names.size <= 1) continue;
      let bestName = entry.name;
      let bestCount = 0;
      for (const [name, count] of names) {
        if (count > bestCount) { bestCount = count; bestName = name; }
      }
      if (bestName !== entry.name) entry.name = bestName;
    }

    const artists = Array.from(artistsMap.values());
    if (artists.length > 0) {
      this.database.replaceArtists(artists, isSimulated);
    }
  }


  /**
   * Fetch additional collection items via Bandcamp's API
   */
  private async fetchMoreCollectionItems(
    fanId: string,
    lastToken: string | undefined,
    cookies: string,
    endpoint: string,
    source: "collection" | "wishlist",
  ): Promise<CollectionItem[]> {
    // Check for simulation mode
    if (simulationService.shouldSimulate()) {
      return simulationService.fetchBatch(lastToken);
    }

    const config = remoteConfigService.get();
    const items: CollectionItem[] = [];
    const batchSize = config.scraping.batchSize;

    const requestBody: any = {
      fan_id: parseInt(fanId, 10),
      count: batchSize,
    };
    if (lastToken) {
      requestBody.older_than_token = lastToken;
    } else {
      requestBody.older_than_token = `${Math.floor(Date.now() / 1000)}::a::`;
    }
    const response = await this.http.post(endpoint, requestBody, {
      headers: {
        Cookie: cookies,
        "Content-Type": "application/json",
      },
    });

    if (response.data.items) {
      for (const item of response.data.items) {
        const collectionItem = this.parseCollectionItem(item, source);
        if (collectionItem) {
          items.push(collectionItem);
        }
      }
    }

    // Rate limiting logic from config
    const jitter = Math.floor(Math.random() * config.scraping.rateLimitJitter);
    await new Promise((resolve) =>
      setTimeout(resolve, config.scraping.rateLimitDelay + jitter),
    );

    return items;
  }

  /**
   * Parse a collection item from API response
   */
  private parseCollectionItem(
    item: any,
    source: "collection" | "wishlist" = "collection",
  ): CollectionItem | null {
    try {
      const config = remoteConfigService.get();
      const isAlbum =
        item.item_type === "album" ||
        item.tralbum_type === "a" ||
        item.type === "album";
      const id = String(item.item_id || item.tralbum_id || item.id);
      const rawTitle = (item.album_title || item.item_title || item.title || "").trim();
      const rawBandName = item.band_name || item.artist || item.artist_name || "";

      let actualArtist = this.cleanArtistName(rawBandName);
      let artistId = item.band_id ? String(item.band_id) : undefined;

      const byIndex = rawTitle.lastIndexOf(" by ");
      if (byIndex !== -1) {
        const artistFromTitle = this.cleanArtistName(rawTitle.slice(byIndex + 4));
        if (artistFromTitle.toLowerCase() !== actualArtist.toLowerCase()) {
          actualArtist = artistFromTitle;
          artistId = `name-${actualArtist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        }
      } else {
        // Check for "Artist - Title" format common on label catalog pages (e.g. "Mirt - Album")
        // Guards: prefix ≤40 chars, not a pure number, no parens/brackets, no 4-digit years
        const dashIndex = rawTitle.indexOf(" - ");
        if (dashIndex > 0 && dashIndex <= 40) {
          const possibleArtist = this.cleanArtistName(rawTitle.slice(0, dashIndex));
          if (
            possibleArtist &&
            possibleArtist.toLowerCase() !== actualArtist.toLowerCase() &&
            !/^\d+$/.test(possibleArtist.trim()) &&
            !/[()[]]/.test(possibleArtist) &&
            !/\d{4}/.test(possibleArtist)
          ) {
            actualArtist = possibleArtist;
            artistId = `name-${actualArtist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          }
        }
      }

      // Use shared helper for title cleaning
      const title = this.cleanTitle(rawTitle, actualArtist);

      if (isAlbum) {
        return {
          id,
          type: "album",
          source,
          isWishlist: source === "wishlist",
          token: item.token || item.sale_token, // Capture token
          album: {
            id,
            title,
            artist: actualArtist,
            artistId,
            artworkUrl:
              item.item_art_url ||
              item.art_url ||
              item.image_url ||
              (item.art_id || item.item_art_id || item.image_id
                ? config.endpoints.artworkFormat.replace(
                  "{art_id}",
                  (item.art_id || item.item_art_id || item.image_id).toString(),
                )
                : ""),
            bandcampUrl: item.item_url || item.bandcamp_url || item.url,
            tracks: [],
            trackCount: item.num_tracks || 0,
          },
          purchaseDate: item.purchased || item.added,
        };
      } else {
        // Also clean track title using shared helper
        const trackTitle = this.cleanTitle(
          item.item_title || item.track_title || "",
          actualArtist,
        );

        return {
          id,
          type: "track",
          source,
          isWishlist: source === "wishlist",
          token: item.token || item.sale_token, // Capture token
          track: {
            id,
            title: trackTitle,
            artist: actualArtist,
            artistId,
            album: item.album_title || "",
            duration: item.duration || 0,
            artworkUrl:
              item.item_art_url ||
              item.art_url ||
              item.image_url ||
              (item.art_id || item.item_art_id || item.image_id
                ? config.endpoints.artworkFormat.replace(
                  "{art_id}",
                  (item.art_id || item.item_art_id || item.image_id).toString(),
                )
                : ""),
            streamUrl: "", // Will be fetched separately
            bandcampUrl: item.item_url || item.bandcamp_url || item.url,
            isCached: false,
          },
          purchaseDate: item.purchased || item.added,
        };
      }
    } catch (error) {
      console.error("Error parsing collection item:", error);
      return null;
    }
  }

  /**
   * Parse collection item from DOM element
   */
  private parseCollectionItemFromDOM(
    $: cheerio.CheerioAPI,
    $item: cheerio.Cheerio<any>,
  ): CollectionItem | null {
    try {
      const config = remoteConfigService.get().selectors.collection;
      const artistDOM = $item.find(config.artist).text().replace("by ", "");
      let actualArtist = this.cleanArtistName(artistDOM || config.fallbackArtist);
      const titleDOM = $item.find(config.title).text();
      const byIndex = titleDOM.lastIndexOf(" by ");
      if (byIndex !== -1) {
        const artistFromTitle = this.cleanArtistName(titleDOM.slice(byIndex + 4));
        if (artistFromTitle.toLowerCase() !== actualArtist.toLowerCase()) {
          actualArtist = artistFromTitle;
        }
      }

      const title = this.cleanTitle(titleDOM || config.fallbackTitle, actualArtist);
      const url = $item.find(config.link).attr("href") || "";
      const artworkUrl = $item.find(config.artwork).attr("src") || "";
      const id =
        $item.attr("data-tralbumid") ||
        url.split("/").pop() ||
        String(Date.now());
      const artistId = $item.attr("data-bandid");
      const type = $item.attr("data-itemtype") === "track" ? "track" : "album";
      const token = $item.attr("data-token");

      if (type === "album") {
        return {
          id,
          type: "album",
          token,
          album: {
            id,
            title,
            artist: actualArtist,
            artistId,
            artworkUrl: artworkUrl.replace("_9.jpg", "_10.jpg"),
            bandcampUrl: url,
            tracks: [],
            trackCount: 0,
          },
          purchaseDate: undefined,
        };
      } else {
        return {
          id,
          type: "track",
          token,
          track: {
            id,
            title,
            artist: actualArtist,
            artistId,
            album: "", // DOM doesn't always have album name for tracks easily accessible
            duration: 0,
            artworkUrl: artworkUrl.replace("_9.jpg", "_10.jpg"),
            streamUrl: "",
            bandcampUrl: url,
            isCached: false,
          },
          purchaseDate: undefined,
        };
      }
    } catch (error) {
      console.error("Error parsing DOM collection item:", error);
      return null;
    }
  }

  /**
   * Fetch a tralbum from Bandcamp's mobile API. Returns the raw `tracks` array,
   * which for `tralbum_type=a` covers every track on the album in one request.
   */
  private async fetchMobileTralbumTracks(
    bandId: string,
    id: string,
    type: "a" | "t",
    opts?: AlbumFetchOptions,
  ): Promise<any[]> {
    const config = remoteConfigService.get();
    const mobileUrl = config.endpoints.mobileTralbumDetailsApi
      .replace("{band_id}", String(bandId))
      .replace("tralbum_type=t", `tralbum_type=${type}`)
      .replace("{track_id}", String(id));
    const cookies = await this.authService.getSessionCookies();
    await opts?.beforeNetwork?.();
    const response = await this.http.get(mobileUrl, {
      headers: { Cookie: cookies },
      signal: opts?.signal,
    });
    return response.data?.tracks ?? [];
  }

  /**
   * Refill expired stream URLs on a cached album using a single mobile-API
   * request. Returns false when the refresh could not be completed, in which
   * case the caller blanks the URLs so they get resolved lazily at play time.
   */
  private async refreshAlbumStreamUrls(
    album: Album,
    opts?: AlbumFetchOptions,
  ): Promise<boolean> {
    if (!album.artistId || !album.id) return false;
    try {
      const mobileTracks = await this.fetchMobileTralbumTracks(
        album.artistId,
        album.id,
        "a",
        opts,
      );
      if (mobileTracks.length === 0) return false;

      const byId = new Map<string, any>(
        mobileTracks.map((t: any) => [String(t.track_id), t]),
      );

      let refreshed = 0;
      for (const track of album.tracks) {
        const mobileTrack = byId.get(String(track.id));
        const freshUrl =
          mobileTrack?.streaming_url?.["mp3-128"] ||
          mobileTrack?.streaming_url?.["mp3-v0"];
        if (freshUrl) {
          track.streamUrl = await this.resolveRedirect(freshUrl, opts);
          track.hasStream = true;
          refreshed++;
        }
      }

      console.log(
        `[ScraperService] Refreshed ${refreshed}/${album.tracks.length} cached stream URLs for "${album.title}"`,
      );
      return refreshed > 0;
    } catch (error: any) {
      console.error(
        "[ScraperService] Bulk stream URL refresh failed:",
        error.message,
      );
      return false;
    }
  }

  /**
   * Serve album details from the DB cache when possible.
   *
   * Metadata is effectively immutable, so it is cached for a long time, but
   * Bandcamp stream URLs expire — hence the shorter stream TTL and the
   * refresh/blank fallback. Pre-orders are never served from cache because
   * their tracks gain stream URLs at release.
   */
  private async readAlbumCache(
    albumId: string,
    opts?: AlbumFetchOptions,
  ): Promise<Album | null> {
    if (!this.database) return null;

    const cached = this.database.getAlbumCache(albumId);
    if (!cached?.data?.tracks?.length) return null;

    const album = cached.data;
    const age = Date.now() - new Date(cached.cachedAt).getTime();

    if (age > ScraperService.ALBUM_METADATA_TTL_MS) return null;
    if (album.isPreorder) {
      console.log(
        `[ScraperService] Cached album "${album.title}" is a pre-order, re-scraping`,
      );
      return null;
    }

    if (age > ScraperService.ALBUM_STREAM_TTL_MS) {
      const refreshed = await this.refreshAlbumStreamUrls(album, opts);
      if (!refreshed) {
        // Blank the URLs but keep hasStream: PlayerService resolves an empty
        // streamUrl on demand, so the first play recovers instead of failing.
        console.log(
          `[ScraperService] Serving "${album.title}" from cache with stream URLs to be resolved on play`,
        );
        for (const track of album.tracks) {
          if (track.hasStream !== false) {
            track.streamUrl = "";
          }
        }
      }
      // Persist whatever we refreshed so the next open is fast again.
      this.database.saveAlbumCache(album);
    }

    console.log(
      `[ScraperService] Loaded album "${album.title}" from cache (${album.tracks.length} tracks)`,
    );
    return album;
  }

  /**
   * Get full album details including tracks and stream URLs
   */
  async getAlbumDetails(
    albumUrl: string,
    albumId?: string,
  ): Promise<Album | null> {
    const { album } = await this.getAlbumDetailsWithSource(albumUrl, albumId);
    return album;
  }

  /**
   * As getAlbumDetails, but reports whether the result came from the cache or
   * the network, and lets the caller pace and abort the underlying requests.
   *
   * `beforeNetwork` is awaited immediately before *every* HTTP request on this
   * path, so a warm cache hit consumes no rate-limit budget — that is what lets
   * a bulk job over thousands of albums run at full speed once warmed.
   */
  async getAlbumDetailsWithSource(
    albumUrl: string,
    albumId?: string,
    opts?: AlbumFetchOptions,
  ): Promise<AlbumDetailsResult> {
    // Callers that already know the album id can skip the network entirely.
    // The URL alone is not a usable key: trailing slashes, ?from= params and
    // the track→album redirect below all produce different strings per album.
    if (albumId) {
      const cached = await this.readAlbumCache(albumId, opts);
      if (cached) return { album: cached, source: "cache" };
    }

    try {
      const config = remoteConfigService.get();
      const cookies = await this.authService.getSessionCookies();
      await opts?.beforeNetwork?.();
      const response = await this.http.get(albumUrl, {
        headers: { Cookie: cookies },
        signal: opts?.signal,
      });

      const $ = cheerio.load(response.data);

      // Extract album data from embedded JSON
      const tralbumData = this.extractTralbumData($);
      if (!tralbumData) {
        console.error("Could not find album data in page");
        return { album: null, source: "none" };
      }

      // If we accidentally scraped a track page instead of an album, redirect to the album page
      if (tralbumData.item_type === "track" && tralbumData.album_url) {
        console.log(`[ScraperService] Track URL provided, redirecting to album: ${tralbumData.album_url}`);
        const baseUrl = tralbumData.url ? new URL(tralbumData.url).origin : new URL(albumUrl).origin;
        const fullAlbumUrl = new URL(tralbumData.album_url, baseUrl).toString();
        return this.getAlbumDetailsWithSource(fullAlbumUrl, undefined, opts);
      }

      const tracks: Track[] = await Promise.all(
        (tralbumData.trackinfo || []).map(
          async (trackInfo: any, index: number) => {
            let streamUrl =
              trackInfo.file?.["mp3-128"] || trackInfo.file?.["mp3-v0"] || "";

            // Fallback to Mobile API if stream URL is missing
            if (!streamUrl && tralbumData.band_id && trackInfo.track_id) {
              try {
                console.log(
                  `[ScraperService] Fetching fallback stream for ${trackInfo.title} via Mobile API...`,
                );
                const mobileUrl = config.endpoints.mobileTralbumDetailsApi
                  .replace("{band_id}", tralbumData.band_id.toString())
                  .replace("{track_id}", trackInfo.track_id.toString());
                const response = await this.http.get(mobileUrl, {
                  headers: { Cookie: cookies },
                });

                if (
                  response.data &&
                  response.data.tracks &&
                  response.data.tracks.length > 0
                ) {
                  const mobileTrack = response.data.tracks[0];
                  streamUrl =
                    mobileTrack.streaming_url?.["mp3-128"] ||
                    mobileTrack.streaming_url?.["mp3-v0"] ||
                    "";
                }
              } catch (e: any) {
                console.error(
                  "[ScraperService] Mobile API fallback failed:",
                  e.message,
                );
              }
            }

            if (!streamUrl) {
              console.warn(
                `[ScraperService] No stream URL found for track ${trackInfo.title} (ID: ${trackInfo.track_id})`,
              );
            }

            return {
              id: String(trackInfo.track_id || `${tralbumData.id}-${index}`),
              title: trackInfo.title,
              artist: this.cleanArtistName(tralbumData.artist),
              artistId: String(tralbumData.band_id),
              album: tralbumData.current?.title || tralbumData.album_title,
              albumId: String(tralbumData.id),
              duration: trackInfo.duration || 0,
              trackNumber: trackInfo.track_num || index + 1,
              artworkUrl: tralbumData.art_id
                ? config.endpoints.artworkFormat.replace(
                  "{art_id}",
                  tralbumData.art_id.toString(),
                )
                : "",
              streamUrl,
              bandcampUrl: (() => {
                if (!trackInfo.title_link) return albumUrl;
                try {
                  const baseOrigin = new URL(tralbumData.url || albumUrl).origin;
                  if (trackInfo.title_link.startsWith('http')) return trackInfo.title_link;
                  const path = trackInfo.title_link.startsWith('/') ? trackInfo.title_link : `/${trackInfo.title_link}`;
                  return new URL(path, baseOrigin).href;
                } catch {
                  return albumUrl;
                }
              })(),
              isCached: false,
              hasStream: !!streamUrl,
              isPreorderTrack: !streamUrl,
            };
          },
        ),
      );

      const isPreorder =
        tralbumData.is_preorder === true ||
        tralbumData.has_audio === false ||
        (tracks.length > 0 && tracks.some((t) => !t.hasStream));

      const album: Album = {
        id: String(tralbumData.id),
        title: tralbumData.current?.title || tralbumData.album_title,
        artist: this.cleanArtistName(tralbumData.artist),
        artistId: String(tralbumData.band_id),
        artworkUrl: tralbumData.art_id
          ? config.endpoints.artworkFormat.replace(
            "{art_id}",
            tralbumData.art_id.toString(),
          )
          : "",
        bandcampUrl: albumUrl,
        releaseDate: tralbumData.current?.release_date,
        tracks,
        trackCount: tracks.length,
        isPreorder,
      };

      // Persist so reopening the album after a restart doesn't re-scrape.
      // Simulated data is kept out of the cache, matching the _sim convention.
      if (
        this.database &&
        tracks.length > 0 &&
        !simulationService.shouldSimulate()
      ) {
        this.database.saveAlbumCache(album);
      }

      return { album, source: "network" };
    } catch (error: any) {
      // An aborted request is a cancellation, not a failure — the caller
      // distinguishes them by checking its own signal.
      if (opts?.signal?.aborted) {
        return { album: null, source: "none" };
      }
      console.error("Error fetching album details:", error);
      return { album: null, source: "none" };
    }
  }

  /**
   * Extract tralbum data from page scripts
   */
  private extractTralbumData($: cheerio.CheerioAPI): any {
    // Try data attribute first
    const dataAttr = $("script[data-tralbum]").attr("data-tralbum");
    if (dataAttr) {
      try {
        return JSON.parse(dataAttr);
      } catch (e) {
        console.error("Error parsing data-tralbum:", e);
      }
    }

    // Try to find in inline scripts
    let tralbumData = null;
    const scriptContent = $("script")
      .map((_, el) => $(el).html())
      .get()
      .join("\n");

    const config = remoteConfigService.get();
    tralbumData = this.extractJsonObject(
      scriptContent,
      config.scriptKeys.album,
    );

    // Validation for tralbumData
    if (tralbumData && (!tralbumData.trackinfo || !tralbumData.id)) {
      console.warn(
        "[Scraper] Extracted album data failed validation (missing tracks or id)",
      );
      return null;
    }

    return tralbumData;
  }

  /**
   * Get Bandcamp Radio stations
   */
  async getRadioStations(forceRefresh = false): Promise<RadioStation[]> {
    // Check cache first
    if (!forceRefresh && this.database) {
      const cached = this.database.getRadioCache();
      if (cached) {
        this.emit("radio-stations-updated", cached.data);
        return cached.data;
      }
    }

    // Do not attempt network fetch in offline mode — return empty list
    const isOfflineMode = this.database?.getSettings()?.offlineMode ?? false;
    if (isOfflineMode) {
      console.log("[Scraper] Offline mode: skipping radio stations fetch");
      return [];
    }

    const config = remoteConfigService.get();
    try {
      const response = await this.http.get(config.endpoints.radioListApi);
      const stations: RadioStation[] = [];

      if (response.data.results) {
        // Fetch all available episodes
        // Note: We don't fetch stream URLs upfront to avoid rate limiting (429)
        // Stream URLs are fetched on-demand when playing a station
        for (const episode of response.data.results) {
          stations.push({
            id: String(episode.show_id || episode.id),
            name: episode.title || `Bandcamp Weekly ${episode.id}`,
            description: episode.subtitle,
            longDescription: episode.desc,
            imageCaption: episode.image_caption ? cheerio.load(episode.image_caption).text() : undefined,
            imageUrl: episode.image_id
              ? config.endpoints.radioImageFormat.replace(
                "{image_id}",
                episode.image_id.toString(),
              )
              : undefined,
            streamUrl: "", // Fetched on-demand when playing
            date: episode.published_date
              ? new Date(episode.published_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
              : undefined,
          });
        }
      }

      // Save to cache
      if (this.database) {
        this.database.saveRadioCache(stations);
      }
      this.emit("radio-stations-updated", stations);

      return stations;
    } catch (error) {
      console.error("Error fetching radio stations:", error);
      // Return some default stations
      return [
        {
          id: "weekly",
          name: "Bandcamp Weekly",
          description: "The best new music on Bandcamp",
          streamUrl: config.endpoints.radioFallbackStream,
        },
      ];
    }
  }

  /**
   * Search within collection
   */
  searchCollection(query: string): Collection {
    if (!this.cachedCollection) {
      return {
        items: [],
        totalCount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    const lowerQuery = query.toLowerCase();
    const filteredItems = this.cachedCollection.items.filter((item) => {
      if (item.type === "album" && item.album) {
        return (
          item.album.title.toLowerCase().includes(lowerQuery) ||
          item.album.artist.toLowerCase().includes(lowerQuery)
        );
      }
      if (item.type === "track" && item.track) {
        return (
          item.track.title.toLowerCase().includes(lowerQuery) ||
          item.track.artist.toLowerCase().includes(lowerQuery)
        );
      }
      return false;
    });

    return {
      items: filteredItems,
      totalCount: filteredItems.length,
      lastUpdated: this.cachedCollection.lastUpdated,
    };
  }

  /**
   * Consolidate artist IDs across collection items
   * Ensures that if we have found a numeric ID for an artist anywhere,
   * we apply it to all items by that artist (fixing "doubled artist" issue)
   */
  private consolidateArtistIds(items: CollectionItem[]): void {
    const artistMap = new Map<string, string>(); // Name -> Best ID

    // Pass 1: Find best ID for each artist name
    for (const item of items) {
      const data = item.type === "album" ? item.album : item.track;
      if (!data) continue;

      const name = data.artist.trim().toLowerCase();
      const currentBest = artistMap.get(name);
      const id = data.artistId;

      if (id) {
        // If we don't have a best ID yet, use this one
        if (!currentBest) {
          artistMap.set(name, id);
        }
        // If we have a non-numeric ID and found a numeric one, upgrade
        else if (!/^\d+$/.test(currentBest) && /^\d+$/.test(id)) {
          artistMap.set(name, id);
        }
      }
    }

    // Pass 2: Apply best IDs
    let updatedCount = 0;
    for (const item of items) {
      const data = item.type === "album" ? item.album : item.track;
      if (!data) continue;

      const name = data.artist.trim().toLowerCase();
      const bestId = artistMap.get(name);

      if (bestId && data.artistId !== bestId) {
        // console.log(`[Scraper] Updating artist ID for "${data.artist}": ${data.artistId} -> ${bestId}`);
        data.artistId = bestId;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(
        `[Scraper] Consolidated artist IDs for ${updatedCount} items`,
      );
    }
  }
  /**
   * Get stream URL for a specific radio station/episode
   */
  async getStationStreamUrl(
    showId: string,
  ): Promise<{ streamUrl: string; duration: number }> {
    try {
      const config = remoteConfigService.get();
      // Bandcamp's new Radio API endpoint
      const response = await this.http.post(
        config.endpoints.radioPlayerDataApi,
        {
          item_type: "radio",
          item_id: parseInt(showId, 10),
        },
      );

      const tracklist = response.data?.tracklist;
      const compiledTrack = tracklist?.compiledTrack;

      if (compiledTrack && compiledTrack.streamUrl) {
        return {
          streamUrl: compiledTrack.streamUrl,
          duration: compiledTrack.duration || 0,
        };
      }

      console.error(
        "[Scraper] Stream URL not found in player_data_web response for radio track",
      );
      return { streamUrl: "", duration: 0 };
    } catch (error) {
      console.error(`Error fetching station stream URL for ${showId}:`, error);
      return { streamUrl: "", duration: 0 };
    }
  }

  /**
   * Extract individual tracks from a radio show
   */
  async getStationTracks(showId: string): Promise<Track[]> {
    try {
      const config = remoteConfigService.get();
      const response = await this.http.post(
        config.endpoints.radioPlayerDataApi,
        {
          item_type: "radio",
          item_id: parseInt(showId, 10),
        },
      );

      const tracklist = response.data?.tracklist;
      const rawTracks = tracklist?.tracks || [];

      return rawTracks
        .filter((t: any) => t.streamUrl) // Only include playable tracks
        .map((t: any): Track => ({
          id: `radio-track-${t.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: t.title || config.radioData.fallbackTitle,
          artist: t.artistName || config.radioData.fallbackArtist,
          album: t.album?.title || config.radioData.fallbackAlbum,
          duration: t.duration || 0,
          artworkUrl: t.artId
            ? config.endpoints.radioTrackArtworkFormat.replace("{art_id}", t.artId)
            : tracklist.imageId
              ? config.endpoints.radioTrackImageFormat.replace("{image_id}", tracklist.imageId)
              : "",
          streamUrl: t.streamUrl,
          bandcampUrl: t.url || t.album?.url || config.radioData.fallbackUrl,
          isCached: false,
        }));
    } catch (error) {
      console.error(`Error fetching station tracks for ${showId}:`, error);
      return [];
    }
  }

  /**
   * Get fresh stream URL for a track
   */
  async getTrackStreamUrl(track: Track): Promise<string> {
    const config = remoteConfigService.get();

    // Radio tracks
    if (track.id.startsWith("radio-")) {
      const { streamUrl } = await this.getStationStreamUrl(
        track.id.replace("radio-", ""),
      );
      return await this.resolveRedirect(streamUrl || track.streamUrl);
    }

    // Normal tracks
    if (!track.artistId || !track.id) return track.streamUrl;

    try {
      console.log(
        `[ScraperService] Refreshing stream URL for ${track.title} (ID: ${track.id})...`,
      );
      const type = track.albumId ? "a" : "t";
      const id = track.albumId || track.id;
      const mobileUrl = config.endpoints.mobileTralbumDetailsApi
        .replace("{band_id}", track.artistId)
        .replace("tralbum_type=t", `tralbum_type=${type}`)
        .replace("{track_id}", id);
      const cookies = await this.authService.getSessionCookies();
      const response = await this.http.get(mobileUrl, {
        headers: { Cookie: cookies },
      });

      if (
        response.data &&
        response.data.tracks &&
        response.data.tracks.length > 0
      ) {
        const mobileTrack = response.data.tracks.find((t: any) => t.track_id?.toString() === track.id) || response.data.tracks[0];
        const freshUrl =
          mobileTrack.streaming_url?.["mp3-128"] ||
          mobileTrack.streaming_url?.["mp3-v0"];
        if (freshUrl) {
          console.log("[ScraperService] Successfully refreshed stream URL via mobile API");
          return await this.resolveRedirect(freshUrl);
        }
      }

      // Fallback: fetch track.bandcampUrl and scrape data-tralbum
      if (track.bandcampUrl) {
        try {
          let urlToScrape = track.bandcampUrl;
          // Self-healing: fix mangled URLs (e.g. /album/.../track/...) from older versions
          if (urlToScrape.includes('/album/') && urlToScrape.includes('/track/')) {
            try {
              const urlObj = new URL(urlToScrape);
              const trackIdx = urlObj.pathname.indexOf('/track/');
              if (trackIdx > 0) {
                urlObj.pathname = urlObj.pathname.substring(trackIdx);
                urlToScrape = urlObj.href;
                console.log(`[ScraperService] Un-mangled track URL to: ${urlToScrape}`);
              }
            } catch {
              // Ignore invalid URL errors
            }
          }
          console.log(`[ScraperService] Falling back to scraping track URL: ${urlToScrape}`);
          const html = await this.http.get(urlToScrape, {
            headers: { Cookie: cookies },
          }).then(res => res.data);

          const $ = cheerio.load(html);
          const tralbumData = this.extractTralbumData($);
          if (tralbumData && tralbumData.trackinfo) {
            const foundTrack = tralbumData.trackinfo.find((t: any) => t.track_id?.toString() === track.id) || tralbumData.trackinfo[0];
            if (foundTrack && foundTrack.file) {
              const scrapedUrl = foundTrack.file["mp3-128"] || foundTrack.file["mp3-v0"];
              if (scrapedUrl) {
                console.log("[ScraperService] Successfully refreshed stream URL via HTML scrape");
                return await this.resolveRedirect(scrapedUrl);
              }
            }
          }
        } catch (scrapeErr) {
          console.error("[ScraperService] HTML scraping fallback failed:", scrapeErr);
        }
      }
    } catch (e) {
      console.error("[ScraperService] Error refreshing track stream URL:", e);
    }

    return await this.resolveRedirect(track.streamUrl);
  }

  /**
   * Resolve Bandcamp stream redirects to get direct media URLs
   */
  private async resolveRedirect(
    url: string,
    opts?: AlbumFetchOptions,
  ): Promise<string> {
    if (!url || !url.includes("stream_redirect")) return url;
    try {
      await opts?.beforeNetwork?.();
      const response = await this.http.get(url, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 300 && status < 400,
        signal: opts?.signal,
      });
      return response.headers.location || url;
    } catch (e) {
      console.warn(
        "[ScraperService] Failed to resolve redirect, using original URL:",
        e,
      );
      return url;
    }
  }

  /**
   * Fetch a user's public Bandcamp playlists
   */
  async fetchBandcampPlaylists(): Promise<Playlist[]> {
    try {
      const config = remoteConfigService.get();
      const endpoint = config.endpoints.bandcampPlaylistsApi;
      if (!endpoint) {
        console.warn("[ScraperService] No endpoint found for bandcampPlaylistsApi, returning []");
        return [];
      }

      const { isAuthenticated, user } = this.authService.getUser();
      if (!isAuthenticated || !user) throw new Error("User not authenticated");

      const cookies = await this.authService.getSessionCookies();
      const profileUrl = user.profileUrl || "";

      let pageFanId = user.id;
      try {
        const response = await this.http.get(profileUrl, { headers: { Cookie: cookies } });
        const extractedFanId = this.extractFanId(response.data);
        if (extractedFanId) {
          pageFanId = String(extractedFanId);
          console.log(`[ScraperService] Extracted fan_id ${pageFanId} from profile page`);
        }
      } catch {
        console.warn("[ScraperService] Failed to fetch profile page to extract fan_id, using auth user id");
      }

      console.log(`[ScraperService] Fetching Bandcamp playlists for fan_id: ${pageFanId}`);
      const playlistsResponse = await this.http.post(
        endpoint,
        { page_fan_id: parseInt(pageFanId, 10), page_size: 20 },
        { headers: { Cookie: cookies, "Content-Type": "application/json" } }
      );

      const playlistsData = playlistsResponse.data?.items || playlistsResponse.data?.playlists || [];
      const playlists: Playlist[] = [];

      for (const p of playlistsData) {
        const playlistUrl = p.itemUrl || `${profileUrl}/playlist/${p.slug || p.itemId}`;
        const artworkUrl = p.imageId ? config.endpoints.radioImageFormat.replace('{image_id}', p.imageId.toString()) : undefined;

        const playlist: Playlist = {
          id: `bc-${p.itemId}`,
          name: p.title,
          description: p.description || "",
          tracks: [],
          trackCount: p.tracksSummary?.totalCount || 0,
          totalDuration: p.tracksSummary?.totalDuration || 0,
          createdAt: p.modDate || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isBandcampPlaylist: true,
          bandcampUrl: playlistUrl,
          artworkUrl: artworkUrl,
        };
        playlists.push(playlist);
      }

      console.log(`[ScraperService] Successfully parsed ${playlists.length} Bandcamp playlists`);
      return playlists;
    } catch (error) {
      console.error("[ScraperService] Error fetching Bandcamp playlists:", error);
      return [];
    }
  }

  /**
   * Fetch tracks for a specific Bandcamp playlist by parsing its HTML
   */
  async fetchBandcampPlaylistTracks(playlistUrl: string): Promise<Track[]> {
    try {
      console.log(`[ScraperService] Fetching tracks for Bandcamp playlist: ${playlistUrl}`);
      const cookies = await this.authService.getSessionCookies();
      const response = await this.http.get(playlistUrl, { headers: { Cookie: cookies } });
      const html = response.data || "";

      const $ = cheerio.load(html);
      let dataBlobStr = $("#PlaylistPage").attr("data-blob") || $("[data-blob]").attr("data-blob");

      if (!dataBlobStr) {
        const blobMatch = html.match(/data-blob="([^"]+)"/);
        if (blobMatch) {
          dataBlobStr = blobMatch[1];
        }
      }

      if (!dataBlobStr) {
        console.warn("[ScraperService] No data-blob found for playlist page:", playlistUrl);
        return [];
      }

      const entities: Record<string, string> = {
        "&quot;": '"',
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&#39;": "'",
      };
      const decoded = dataBlobStr.replace(
        /&quot;|&amp;|&lt;|&gt;|&#39;/g,
        (match) => entities[match],
      );

      const pd = JSON.parse(decoded);

      const rawTracklist = pd.appData?.tracklist || pd.appData?.tracks;
      const tracksData =
        (Array.isArray(rawTracklist) ? rawTracklist : (rawTracklist?.items || rawTracklist?.tracks)) ||
        pd.appData?.playlist_tracks ||
        pd.appData?.items ||
        pd.tracks ||
        pd.track_list ||
        pd.playlist_data?.tracks ||
        pd.playlist?.tracks ||
        pd.items ||
        [];

      if (!tracksData || tracksData.length === 0) {
        console.warn("[ScraperService] No tracksData array found in data-blob for playlist:", playlistUrl);
        return [];
      }

      const tracks: Track[] = [];

      for (let i = 0; i < tracksData.length; i++) {
        const t = tracksData[i];
        let streamUrl =
          t.streamUrl ||
          t.stream_url ||
          t.file?.["mp3-128"] ||
          t.file?.["mp3-v0"] ||
          "";

        if (!streamUrl && t.encodings) {
          const mp3Enc = t.encodings.find(
            (e: any) => e.format_id === 1 || e.name === "mp3-128",
          );
          if (mp3Enc) streamUrl = mp3Enc.url;
        }

        const artId = t.artId || t.art_id || t.imageId || t.image_id;

        const track: Track = {
          id: String(t.id || t.track_id || t.itemId || `bc-pl-track-${i}`),
          title: t.title || t.trackTitle || "Unknown Title",
          artist: t.artistName || t.artist || t.band_name || t.bandName || "Unknown Artist",
          artistId: t.bandId ? String(t.bandId) : t.band_id ? String(t.band_id) : undefined,
          album: t.album?.title || t.albumTitle || t.album_title || "",
          albumId: t.album?.id ? String(t.album.id) : t.album_id ? String(t.album_id) : undefined,
          duration: t.duration || t.length || 0,
          artworkUrl: artId ? `https://f4.bcbits.com/img/a${artId}_10.jpg` : "",
          streamUrl,
          bandcampUrl: t.url || t.track_url || playlistUrl,
          isCached: false,
        };
        tracks.push(track);
      }

      console.log(`[ScraperService] Successfully parsed ${tracks.length} tracks for playlist`);
      return tracks;
    } catch (error) {
      console.error("[ScraperService] Error fetching Bandcamp playlist tracks:", error);
      return [];
    }
  }
}
