import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkProgressButton } from "./BulkProgressButton";
import { useStore } from "../../store/store";
import type { BulkJobProgress } from "../../../shared/types";

vi.mock("../../store/store", () => ({
  useStore: vi.fn(),
}));

// This mock is an explicit allowlist — a missing icon renders as `undefined`
// and only blows up once that branch actually renders.
vi.mock("lucide-react", () => ({
  MoreHorizontal: ({ className }: any) => (
    <span data-testid="icon-more" className={className} />
  ),
  RefreshCw: ({ className }: any) => (
    <span data-testid="icon-refresh" className={className} />
  ),
  X: ({ className }: any) => <span data-testid="icon-x" className={className} />,
}));

const runningJob: BulkJobProgress = {
  id: "bulk-1",
  action: "addToQueue",
  total: 120,
  completed: 37,
  failed: 0,
  tracksQueued: 300,
  status: "running",
};

describe("BulkProgressButton", () => {
  const cancelBulkAction = vi.fn();

  const setStore = (bulkJob: BulkJobProgress | null) => {
    const state = { bulkJob, cancelBulkAction };
    (useStore as any).mockImplementation((selector?: (s: any) => unknown) =>
      selector ? selector(state) : state,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the menu trigger when idle", () => {
    setStore(null);
    const onToggleMenu = vi.fn();
    render(<BulkProgressButton onToggleMenu={onToggleMenu} />);

    expect(screen.getByTestId("icon-more")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-progress")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(onToggleMenu).toHaveBeenCalledTimes(1);
  });

  it("renders live progress and a cancel affordance while a job runs", () => {
    setStore(runningJob);
    render(<BulkProgressButton onToggleMenu={vi.fn()} />);

    expect(screen.getByTestId("bulk-progress")).toBeInTheDocument();
    expect(screen.getByText("37/120")).toBeInTheDocument();
    expect(screen.getByTestId("icon-refresh")).toBeInTheDocument();
    expect(screen.getByTestId("icon-x")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-more")).not.toBeInTheDocument();
  });

  it("cancels the job instead of opening the menu while running", () => {
    setStore(runningJob);
    const onToggleMenu = vi.fn();
    render(<BulkProgressButton onToggleMenu={onToggleMenu} />);

    fireEvent.click(screen.getByTestId("bulk-progress"));

    expect(cancelBulkAction).toHaveBeenCalledTimes(1);
    expect(onToggleMenu).not.toHaveBeenCalled();
  });

  it("describes the action as stopping, since queued tracks are kept", () => {
    setStore(runningJob);
    render(<BulkProgressButton onToggleMenu={vi.fn()} />);

    expect(screen.getByTestId("bulk-progress").getAttribute("title")).toContain(
      "Stop adding",
    );
  });

  it("honours a caller-supplied class so each view keeps its styling", () => {
    setStore(null);
    render(
      <BulkProgressButton onToggleMenu={vi.fn()} className="artistMore" />,
    );
    expect(screen.getByRole("button").className).toContain("artistMore");
  });

  it("uses the caller's title when idle", () => {
    setStore(null);
    render(<BulkProgressButton onToggleMenu={vi.fn()} title="More options" />);
    expect(screen.getByTitle("More options")).toBeInTheDocument();
  });
});
