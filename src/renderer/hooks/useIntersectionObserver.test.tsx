import { render, screen, act } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useIntersectionObserver } from "./useIntersectionObserver";

/**
 * Whether the sentinel is currently in view. This is a property of the layout,
 * not of any one observer — the hook discards and rebuilds its observer on every
 * re-arm, and a fresh observation must still see the world as it is.
 */
let inView = false;

/**
 * Minimal IntersectionObserver stand-in that keeps the two semantics this hook
 * depends on: an `observe()` call queues one *initial* notification, and after
 * that only genuine intersection *changes* are reported. Deliveries happen when
 * the test calls `flush()`, standing in for the browser's per-frame delivery.
 *
 * The hook only ever watches one element, so a single target is enough.
 */
class FakeIntersectionObserver {
  static live: FakeIntersectionObserver | undefined;

  target: Element | null = null;
  pending = false;
  disconnected = false;

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.live = this;
  }

  observe(element: Element) {
    this.target = element;
    this.pending = true;
  }

  unobserve(_element: Element) {
    this.target = null;
    this.pending = false;
  }

  disconnect() {
    this.target = null;
    this.pending = false;
    this.disconnected = true;
  }

  /** One frame of delivery. */
  flush() {
    if (!this.pending || !this.target) return;
    this.pending = false;
    this.callback(
      [{ target: this.target, isIntersecting: inView } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** The sentinel moved in or out of view. Only changes queue notifications. */
function setInView(value: boolean) {
  if (value === inView) return;
  inView = value;
  const observer = FakeIntersectionObserver.live;
  if (observer?.target) observer.pending = true;
}

/** Stands in for ItemsGrid: a paged list with a sentinel below the last page. */
function PagedList({ total, pageSize }: { total: number; pageSize: number }) {
  const [visible, setVisible] = useState(pageSize);
  // Unclamped, like both real call sites — `slice` bounds the render instead.
  const loadMore = useCallback(() => setVisible((prev) => prev + pageSize), [pageSize]);
  const setTarget = useIntersectionObserver({
    onIntersect: loadMore,
    enabled: visible < total,
  });

  return (
    <>
      <span data-testid="visible">{visible}</span>
      {visible < total && <div ref={setTarget} data-testid="sentinel" />}
    </>
  );
}

/** A bare always-mounted sentinel, for asserting on the callback directly. */
function Sentinel({ onIntersect, enabled }: { onIntersect: () => void; enabled?: boolean }) {
  const setTarget = useIntersectionObserver({ onIntersect, enabled });
  return <div ref={setTarget} data-testid="sentinel" />;
}

function observer() {
  const instance = FakeIntersectionObserver.live;
  if (!instance) throw new Error("no IntersectionObserver was created");
  return instance;
}

describe("useIntersectionObserver", () => {
  const original = global.IntersectionObserver;

  beforeEach(() => {
    inView = false;
    FakeIntersectionObserver.live = undefined;
    global.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.IntersectionObserver = original;
  });

  it("keeps loading while the sentinel stays in view", () => {
    // A window tall enough that a page or two still doesn't overflow: the
    // sentinel never leaves the viewport, so the observer never reports a
    // change. Loading must continue anyway instead of waiting for a resize.
    render(<PagedList total={100} pageSize={20} />);
    setInView(true);

    // Exactly the four loads 20 → 100 needs; re-arming is what supplies the
    // three deliveries after the first.
    for (let frame = 0; frame < 4; frame++) {
      act(() => observer().flush());
    }

    expect(screen.getByTestId("visible")).toHaveTextContent("100");
  });

  it("loads one page per commit even when frames arrive back to back", () => {
    // The regression guard on how the re-arm is scheduled. An IO callback runs
    // in its own task, so the browser can deliver a second frame before React
    // has committed the first load. Re-arming synchronously inside the callback
    // would measure that frame against the pre-load layout and load again, so a
    // single scroll could jump several pages.
    render(<PagedList total={100} pageSize={20} />);
    setInView(true);

    act(() => {
      observer().flush();
      observer().flush();
    });

    expect(screen.getByTestId("visible")).toHaveTextContent("40");
  });

  it("stops once the list is exhausted", () => {
    render(<PagedList total={40} pageSize={20} />);
    setInView(true);

    act(() => observer().flush());

    expect(screen.getByTestId("visible")).toHaveTextContent("40");
    expect(screen.queryByTestId("sentinel")).not.toBeInTheDocument();
    expect(observer().disconnected).toBe(true);
  });

  it("ignores deliveries where the sentinel is out of view", () => {
    const onIntersect = vi.fn();
    render(<Sentinel onIntersect={onIntersect} />);

    act(() => observer().flush());

    expect(onIntersect).not.toHaveBeenCalled();
    // Still observed, so a later scroll into view is picked up.
    expect(observer().target).not.toBeNull();

    setInView(true);
    act(() => observer().flush());
    expect(onIntersect).toHaveBeenCalledTimes(1);
  });

  it("does not observe while disabled", () => {
    render(<Sentinel onIntersect={vi.fn()} enabled={false} />);

    expect(FakeIntersectionObserver.live).toBeUndefined();
  });
});
