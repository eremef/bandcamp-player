import { describe, it, expect } from "vitest";
import { getArtworkUrl, getCoverVariant } from "./artwork";

describe("getArtworkUrl", () => {
  it("rewrites the size suffix on Bandcamp CDN URLs", () => {
    expect(
      getArtworkUrl("https://f4.bcbits.com/img/a2793963001_10.jpg", 16),
    ).toBe("https://f4.bcbits.com/img/a2793963001_16.jpg");
  });

  it("handles multi-digit source suffixes", () => {
    expect(
      getArtworkUrl("https://f4.bcbits.com/img/a2793963001_16.jpg", 7),
    ).toBe("https://f4.bcbits.com/img/a2793963001_7.jpg");
  });

  it("preserves the original file extension", () => {
    expect(getArtworkUrl("https://f4.bcbits.com/img/a123_10.png", 2)).toBe(
      "https://f4.bcbits.com/img/a123_2.png",
    );
  });

  it("matches any bcbits subdomain and http", () => {
    expect(getArtworkUrl("http://f0.bcbits.com/img/a1_10.jpg", 9)).toBe(
      "http://f0.bcbits.com/img/a1_9.jpg",
    );
  });

  it("leaves non-Bandcamp URLs untouched", () => {
    const picsum = "https://picsum.photos/seed/album_10/400/400.jpg";
    expect(getArtworkUrl(picsum, 7)).toBe(picsum);
  });

  it("leaves Bandcamp URLs without a size suffix untouched", () => {
    const url = "https://f4.bcbits.com/img/custom-header.jpg";
    expect(getArtworkUrl(url, 7)).toBe(url);
  });

  it("returns an empty string for missing URLs", () => {
    expect(getArtworkUrl(undefined, 7)).toBe("");
    expect(getArtworkUrl(null, 7)).toBe("");
    expect(getArtworkUrl("", 7)).toBe("");
  });
});

describe("getCoverVariant", () => {
  it("uses one small variant for every list thumbnail size", () => {
    expect(getCoverVariant("list", "small")).toBe(7);
    expect(getCoverVariant("list", "medium")).toBe(7);
    expect(getCoverVariant("list", "large")).toBe(7);
  });

  it("scales the grid variant with cover size", () => {
    expect(getCoverVariant("grid", "small")).toBe(2);
    expect(getCoverVariant("grid", "medium")).toBe(16);
    expect(getCoverVariant("grid", "large")).toBe(10);
  });

  it("requests progressively larger images as the cover grows", () => {
    const sizesInPx = { 2: 350, 16: 700, 10: 1200 } as Record<number, number>;
    expect(sizesInPx[getCoverVariant("grid", "small")]).toBeLessThan(
      sizesInPx[getCoverVariant("grid", "medium")],
    );
    expect(sizesInPx[getCoverVariant("grid", "medium")]).toBeLessThan(
      sizesInPx[getCoverVariant("grid", "large")],
    );
  });
});
