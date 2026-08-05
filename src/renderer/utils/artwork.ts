import type { CollectionViewMode, CoverSize } from "../../shared/types";

/**
 * Bandcamp serves artwork variants from its CDN via a numeric suffix on the
 * image path (`.../img/a1234567890_16.jpg`). Scraped URLs are normalised to
 * `_10` — the original upload, up to 1200px and ~400 KB — which is far more
 * than a grid cell needs.
 *
 * Measured sizes (one real cover, 2026-08):
 *   _3  100x100     6 KB     _9   210x210    24 KB
 *   _7  150x150    13 KB     _2   350x350    61 KB
 *   _16 700x700   130 KB     _10  original  394 KB
 *
 * `_16` is preferred over `_5` — both are 700x700, but `_16` is compressed
 * more aggressively (130 KB vs 187 KB).
 */
const BANDCAMP_CDN = /^https?:\/\/[^/]*bcbits\.com\/img\//;
const SIZE_SUFFIX = /_\d+(\.\w+)$/;

/** Variants roughly 2x the rendered CSS size, so 2x displays stay sharp. */
const GRID_VARIANT: Record<CoverSize, number> = {
  small: 2, // 350px for a 120-180px cell
  medium: 16, // 700px for a 180-270px cell
  large: 10, // original for a 260-390px cell
};

/** All list thumbnails are <= 64px, so one 150px variant covers every size. */
const LIST_VARIANT = 7;

export function getCoverVariant(
  viewMode: CollectionViewMode,
  coverSize: CoverSize,
): number {
  return viewMode === "list" ? LIST_VARIANT : GRID_VARIANT[coverSize];
}

/**
 * Rewrite a Bandcamp artwork URL to request a specific size variant.
 *
 * Returns the URL untouched when it isn't a Bandcamp CDN image (simulation
 * mode serves picsum.photos, and some scraped items carry a raw `item_art_url`
 * from an arbitrary host) or when it carries no recognisable size suffix.
 */
export function getArtworkUrl(
  url: string | undefined | null,
  variant: number,
): string {
  if (!url) return "";
  if (!BANDCAMP_CDN.test(url)) return url;
  if (!SIZE_SUFFIX.test(url)) return url;
  return url.replace(SIZE_SUFFIX, `_${variant}$1`);
}
