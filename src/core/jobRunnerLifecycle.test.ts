import { describe, expect, it } from "vitest";

import {
  deriveBatchRunnerLifecycle,
  deriveSourceLifecycle,
  formatLastRunDetailLine,
  formatPaginationStoppedReason,
  summarizeLastRunOutcome
} from "./jobRunnerLifecycle";
import { SOURCE_HEALTH_STALE_DAYS } from "./jobSourceHealth";
import type { JobSource, JobSourceRunResult } from "./types";

const NOW = new Date("2026-06-09T12:00:00.000Z");

function fixtureSource(overrides: Partial<JobSource> = {}): JobSource {
  return {
    id: "source-test",
    name: "Test Source",
    url: "/fixtures/sample-greenhouse.json",
    kind: "greenhouse",
    enabled: true,
    cadence: "daily",
    maxResults: 25,
    runStatus: "idle",
    ...overrides
  };
}

function fixtureRun(
  partial: Partial<JobSourceRunResult> & Pick<JobSourceRunResult, "fetchedAt">
): JobSourceRunResult {
  return {
    sourceId: "source-test",
    createdCandidateIds: [],
    skippedDuplicates: 0,
    errors: [],
    message: "ok",
    ...partial
  };
}

describe("deriveSourceLifecycle", () => {
  it("returns idle for a never-run manual source", () => {
    const view = deriveSourceLifecycle({
      source: fixtureSource({ cadence: "manual" }),
      runs: [],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("idle");
    expect(view.statusLine).toContain("Never run");
    expect(view.canRunSingle).toBe(true);
  });

  it("returns running when source runStatus is running", () => {
    const view = deriveSourceLifecycle({
      source: fixtureSource({ runStatus: "running", lastRunMessage: "Running..." }),
      runs: [],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("running");
    expect(view.statusLine).toBe("Running...");
    expect(view.canRunSingle).toBe(false);
  });

  it("returns succeeded after a successful run", () => {
    const view = deriveSourceLifecycle({
      source: fixtureSource({
        runStatus: "success",
        lastRunMessage: "Fetched 2 candidates.",
        lastRunAt: "2026-06-09T08:00:00.000Z"
      }),
      runs: [
        fixtureRun({
          fetchedAt: "2026-06-08T12:00:00.000Z",
          createdCandidateIds: ["c1", "c2"]
        })
      ],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("succeeded");
    expect(view.statusLine).toBe("Fetched 2 candidates.");
  });

  it("returns failed when latest run has errors", () => {
    const view = deriveSourceLifecycle({
      source: fixtureSource({ runStatus: "error", lastRunMessage: "Fetch failed." }),
      runs: [fixtureRun({ fetchedAt: "2026-06-08T12:00:00.000Z", errors: ["HTTP 500"] })],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("failed");
    expect(view.statusLine).toBe("Fetch failed.");
  });

  it("returns stale when latest candidate-producing run is older than threshold", () => {
    const staleAt = new Date(NOW.getTime() - (SOURCE_HEALTH_STALE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const view = deriveSourceLifecycle({
      source: fixtureSource({ runStatus: "success" }),
      runs: [
        fixtureRun({
          fetchedAt: staleAt.toISOString(),
          createdCandidateIds: ["c1"]
        })
      ],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("stale");
    expect(view.statusLine).toContain("Stale");
  });

  it("returns due for a runnable daily source that has never run", () => {
    const view = deriveSourceLifecycle({
      source: fixtureSource({ lastRunAt: undefined }),
      runs: [],
      candidates: [],
      now: NOW
    });

    expect(view.phase).toBe("due");
    expect(view.statusLine).toContain("Due");
  });
});

describe("deriveBatchRunnerLifecycle", () => {
  it("selects run due sources when due sources exist", () => {
    const sources = [
      fixtureSource({ id: "due", lastRunAt: undefined }),
      fixtureSource({ id: "manual", cadence: "manual" })
    ];
    const view = deriveBatchRunnerLifecycle(sources, [], [], NOW);

    expect(view.action).toBe("run_due_sources");
    expect(view.actionLabel).toBe("Run due sources");
    expect(view.dueCount).toBe(1);
    expect(view.canRunDue).toBe(true);
  });

  it("selects no runnable sources when nothing is enabled", () => {
    const sources = [fixtureSource({ enabled: false })];
    const view = deriveBatchRunnerLifecycle(sources, [], [], NOW);

    expect(view.action).toBe("no_runnable_sources");
    expect(view.enabledRunEmptyMessage).toBe("No enabled runnable sources.");
    expect(view.canRunAll).toBe(false);
  });

  it("preserves empty batch messages", () => {
    const view = deriveBatchRunnerLifecycle([], [], [], NOW);
    expect(view.dueRunEmptyMessage).toBe("No due sources to run.");
    expect(view.enabledRunEmptyMessage).toBe("No enabled runnable sources.");
    expect(view.healthyRunEmptyMessage).toBe("No healthy runnable sources.");
  });

  it("prefers run healthy sources when no due sources and healthy feeds exist", () => {
    const sources = [fixtureSource({ id: "healthy", cadence: "manual" })];
    const runs = [
      {
        sourceId: "healthy",
        fetchedAt: "2026-06-09T08:00:00.000Z",
        createdCandidateIds: ["c1"],
        skippedDuplicates: 0,
        errors: [],
        message: "ok"
      }
    ];
    const view = deriveBatchRunnerLifecycle(sources, runs, [], NOW);
    expect(view.action).toBe("run_healthy_sources");
    expect(view.actionLabel).toBe("Run healthy sources");
    expect(view.canRunHealthy).toBe(true);
  });
});

describe("summarizeLastRunOutcome", () => {
  it("summarizes a successful run with candidate counts", () => {
    const summary = summarizeLastRunOutcome(
      fixtureRun({
        fetchedAt: "2026-06-08T12:00:00.000Z",
        createdCandidateIds: ["c1", "c2"],
        skippedDuplicates: 1,
        message: "Fetched 2 candidates."
      }),
      [fixtureSource()]
    );

    expect(summary.ok).toBe(true);
    expect(summary.detailLine).toContain("2 new");
    expect(summary.detailLine).toContain("1 duplicate");
  });

  it("includes pagination stopped reason in the detail line", () => {
    const summary = summarizeLastRunOutcome(
      fixtureRun({
        fetchedAt: "2026-06-08T12:00:00.000Z",
        paginationStoppedReason: "max_pages"
      }),
      [fixtureSource()]
    );

    expect(formatPaginationStoppedReason("max_pages")).toContain("page limit");
    expect(formatLastRunDetailLine(summary)).toContain("Pagination stopped: page limit");
  });
});
