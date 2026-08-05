import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ItemsGrid } from "./ItemsGrid";
import type { CollectionItem } from "../../../shared/types";
import "@testing-library/jest-dom";

// AlbumCard pulls in the whole store; stub it and surface the layout props so
// prop passthrough is assertable.
vi.mock("./AlbumCard", () => ({
  AlbumCard: ({ album, variant, coverSize, isTrackItem }: any) => (
    <div
      data-testid="album-card"
      data-variant={variant}
      data-cover-size={coverSize}
      data-track-item={String(!!isTrackItem)}
    >
      {album.title}
    </div>
  ),
}));

const mockObserve = vi.fn();
vi.mock("../../hooks/useIntersectionObserver", () => ({
  useIntersectionObserver: (...args: unknown[]) => {
    mockObserve(...args);
    return { current: null };
  },
}));

function makeItems(count: number): CollectionItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    type: "album" as const,
    album: {
      id: `album-${i}`,
      title: `Album ${i}`,
      artist: `Artist ${i}`,
      artworkUrl: `https://f4.bcbits.com/img/a${i}_10.jpg`,
      bandcampUrl: `https://test.bandcamp.com/album/${i}`,
      tracks: [],
      trackCount: 0,
    },
  })) as CollectionItem[];
}

describe("ItemsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a grid at medium cover size by default", () => {
    const { container } = render(<ItemsGrid items={makeItems(3)} />);
    const layout = container.querySelector('[class*="grid"][class*="size"]');

    expect(layout).toBeInTheDocument();
    expect(layout?.className).toMatch(/sizeMedium/);
    expect(layout?.className).not.toMatch(/list/);
    expect(screen.getAllByTestId("album-card")).toHaveLength(3);
  });

  it("switches to the list layout", () => {
    const { container } = render(
      <ItemsGrid items={makeItems(3)} viewMode="list" />,
    );
    const layout = container.querySelector('[class*="list"]');

    expect(layout).toBeInTheDocument();
    expect(screen.getAllByTestId("album-card")).toHaveLength(3);
  });

  it("applies the requested cover size class", () => {
    const { container, rerender } = render(
      <ItemsGrid items={makeItems(1)} coverSize="small" />,
    );
    expect(container.innerHTML).toMatch(/sizeSmall/);

    rerender(<ItemsGrid items={makeItems(1)} coverSize="large" />);
    expect(container.innerHTML).toMatch(/sizeLarge/);
  });

  it("passes the layout props down to each card", () => {
    render(
      <ItemsGrid items={makeItems(2)} viewMode="list" coverSize="large" />,
    );
    for (const card of screen.getAllByTestId("album-card")) {
      expect(card).toHaveAttribute("data-variant", "list");
      expect(card).toHaveAttribute("data-cover-size", "large");
    }
  });

  it("renders track items through the same card", () => {
    const items = [
      {
        id: "t1",
        type: "track",
        track: {
          id: "track-1",
          title: "A Track",
          artist: "An Artist",
          artworkUrl: "https://f4.bcbits.com/img/a1_10.jpg",
          bandcampUrl: "https://test.bandcamp.com/track/1",
        },
      },
    ] as unknown as CollectionItem[];

    render(<ItemsGrid items={items} viewMode="list" />);
    const card = screen.getByTestId("album-card");

    expect(card).toHaveAttribute("data-track-item", "true");
    expect(card).toHaveAttribute("data-variant", "list");
    expect(card).toHaveTextContent("A Track");
  });

  describe("initial page size", () => {
    it("renders more items when covers are smaller", () => {
      render(<ItemsGrid items={makeItems(100)} coverSize="small" />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(40);
    });

    it("renders 20 at the default medium size", () => {
      render(<ItemsGrid items={makeItems(100)} />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(20);
    });

    it("renders fewer items when covers are larger", () => {
      render(<ItemsGrid items={makeItems(100)} coverSize="large" />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(12);
    });

    it("uses a fixed page size for list rows regardless of thumb size", () => {
      const { rerender } = render(
        <ItemsGrid items={makeItems(100)} viewMode="list" coverSize="small" />,
      );
      expect(screen.getAllByTestId("album-card")).toHaveLength(30);

      rerender(
        <ItemsGrid items={makeItems(100)} viewMode="list" coverSize="large" />,
      );
      expect(screen.getAllByTestId("album-card")).toHaveLength(30);
    });
  });

  describe("visible count reset", () => {
    it("resets to the first page when the item set changes size", () => {
      const { rerender } = render(<ItemsGrid items={makeItems(100)} />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(20);

      // Simulate scrolling further into the list.
      const [{ onIntersect }] = mockObserve.mock.calls.at(-1) as [any];
      onIntersect();
      rerender(<ItemsGrid items={makeItems(100)} />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(40);

      // A search/filter narrows the set — the grown page must not persist.
      rerender(<ItemsGrid items={makeItems(60)} />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(20);
    });

    it("resets when the layout changes page size", () => {
      const { rerender } = render(<ItemsGrid items={makeItems(100)} />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(20);

      rerender(<ItemsGrid items={makeItems(100)} coverSize="large" />);
      expect(screen.getAllByTestId("album-card")).toHaveLength(12);
    });

    it("keeps the grown page across re-renders that do not change the set", () => {
      const items = makeItems(100);
      const { rerender } = render(<ItemsGrid items={items} />);

      const [{ onIntersect }] = mockObserve.mock.calls.at(-1) as [any];
      onIntersect();
      // A new-but-equivalent array, as the sort pipeline produces.
      rerender(<ItemsGrid items={[...items]} />);

      expect(screen.getAllByTestId("album-card")).toHaveLength(40);
    });
  });

  it("shows the empty state with a hint", () => {
    render(
      <ItemsGrid items={[]} emptyMessage="Nothing here" emptyHint="Try again" />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByTestId("album-card")).not.toBeInTheDocument();
  });

  it("renders the infinite-scroll sentinel only while items remain", () => {
    const { container, rerender } = render(<ItemsGrid items={makeItems(100)} />);
    expect(
      container.querySelector('[class*="loadMoreContainer"]'),
    ).toBeInTheDocument();

    rerender(<ItemsGrid items={makeItems(5)} />);
    expect(container.querySelector('[class*="loadMoreContainer"]')).toBeNull();
  });
});
