import { describe, expect, it } from "vitest";

import { seedJobSources } from "../data/seedJobScout";
import {
  buildRunAllSummary,
  buildSourceScheduleStats,
  formatRunBatchNotice,
  getDueJobSources,
  getHealthyJobSources,
  getRunnableJobSources,
  getSourceDueBadge,
  isJobSourceDue,
  type SourceRunOutcome
} from "./jobSourceSchedule";
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

describe("isJobSourceDue", () => {
  it("treats daily source as due when never run", () => {
    expect(isJobSourceDue(fixtureSource({ lastRunAt: undefined }), NOW)).toBe(true);
  });

  it("treats daily source as not due if run today", () => {
    expect(
      isJobSourceDue(fixtureSource({ lastRunAt: "2026-06-09T08:00:00.000Z" }), NOW)
    ).toBe(false);
  });

  it("treats weekly source as due after 7+ days", () => {
    expect(
      isJobSourceDue(
        fixtureSource({ cadence: "weekly", lastRunAt: "2026-06-01T08:00:00.000Z" }),
        NOW
      )
    ).toBe(true);
  });

  it("treats daily source as due when lastRunAt is invalid", () => {
    expect(isJobSourceDue(fixtureSource({ lastRunAt: "not-a-date" }), NOW)).toBe(true);
  });

  it("excludes manual cadence from due", () => {
    expect(isJobSourceDue(fixtureSource({ cadence: "manual" }), NOW)).toBe(false);
  });

  it("excludes company_careers from due", () => {
    expect(
      isJobSourceDue(
        fixtureSource({ kind: "company_careers", url: "https://careers.example.com/" }),
        NOW
      )
    ).toBe(false);
  });
});

describe("getDueJobSources and getRunnableJobSources", () => {
  it("excludes manual cadence from due list", () => {
    const sources = [
      fixtureSource({ id: "daily", cadence: "daily", lastRunAt: undefined }),
      fixtureSource({ id: "manual", cadence: "manual", lastRunAt: undefined })
    ];
    const due = getDueJobSources(sources, NOW);
    expect(due.map((source) => source.id)).toEqual(["daily"]);
  });

  it("includes manual cadence in runnable when enabled", () => {
    const sources = [
      fixtureSource({ id: "manual", cadence: "manual" }),
      fixtureSource({ id: "disabled", enabled: false })
    ];
    const runnable = getRunnableJobSources(sources);
    expect(runnable.map((source) => source.id)).toEqual(["manual"]);
  });

  it("excludes disabled and unsupported sources from runnable", () => {
    const runnable = getRunnableJobSources(seedJobSources);
    expect(runnable.every((source) => source.enabled)).toBe(true);
    expect(runnable.some((source) => source.kind === "company_careers")).toBe(false);
  });
});

describe("getSourceDueBadge", () => {
  it("returns manual_only for manual runnable source", () => {
    expect(getSourceDueBadge(fixtureSource({ cadence: "manual" }), NOW)).toBe("manual_only");
  });

  it("returns unsupported for company careers", () => {
    expect(
      getSourceDueBadge(
        fixtureSource({ kind: "company_careers", url: "https://careers.example.com/" }),
        NOW
      )
    ).toBe("unsupported");
  });
});

describe("buildSourceScheduleStats", () => {
  it("counts due, runnable, success, and failure", () => {
    const sources = [
      fixtureSource({ id: "due", lastRunAt: undefined }),
      fixtureSource({ id: "not-due", lastRunAt: "2026-06-09T08:00:00.000Z" }),
      fixtureSource({ id: "manual", cadence: "manual" })
    ];
    const runs: JobSourceRunResult[] = [
      {
        sourceId: "due",
        fetchedAt: "2026-06-09T10:00:00.000Z",
        createdCandidateIds: ["c1"],
        skippedDuplicates: 0,
        errors: [],
        message: "ok"
      },
      {
        sourceId: "due",
        fetchedAt: "2026-06-08T10:00:00.000Z",
        createdCandidateIds: [],
        skippedDuplicates: 0,
        errors: ["failed"],
        message: "failed"
      }
    ];

    const stats = buildSourceScheduleStats(sources, runs, NOW);
    expect(stats.sourcesConfigured).toBe(3);
    expect(stats.enabledSources).toBe(3);
    expect(stats.runnableSources).toBe(3);
    expect(stats.dueSources).toBe(1);
    expect(stats.successfulRuns).toBe(1);
    expect(stats.failedRuns).toBe(1);
    expect(stats.lastRunAt).toBe("2026-06-09T10:00:00.000Z");
  });
});

describe("buildRunAllSummary and formatRunBatchNotice", () => {
  it("totals created candidates, errors, and duplicates", () => {
    const outcomes: SourceRunOutcome[] = [
      {
        sourceId: "a",
        sourceName: "A",
        ok: true,
        createdCandidates: 2,
        skippedDuplicates: 1,
        errors: [],
        message: "ok"
      },
      {
        sourceId: "b",
        sourceName: "B",
        ok: false,
        createdCandidates: 0,
        skippedDuplicates: 0,
        errors: ["fetch failed"],
        message: "fetch failed"
      }
    ];

    const summary = buildRunAllSummary(outcomes);
    expect(summary.totalSources).toBe(2);
    expect(summary.successfulSources).toBe(1);
    expect(summary.failedSources).toBe(1);
    expect(summary.createdCandidates).toBe(2);
    expect(summary.skippedDuplicates).toBe(1);
    expect(summary.errors).toEqual(["fetch failed"]);
  });

  it("formats a human-readable batch notice", () => {
    const notice = formatRunBatchNotice(
      buildRunAllSummary([
        {
          sourceId: "a",
          sourceName: "A",
          ok: true,
          createdCandidates: 5,
          skippedDuplicates: 2,
          errors: [],
          message: "ok"
        },
        {
          sourceId: "b",
          sourceName: "B",
          ok: false,
          createdCandidates: 0,
          skippedDuplicates: 0,
          errors: ["err"],
          message: "err"
        }
      ])
    );
    expect(notice).toContain("Ran 2 sources");
    expect(notice).toContain("1 produced matches");
    expect(notice).toContain("1 failed");
    expect(notice).toContain("5 new candidates");
    expect(notice).toContain("2 duplicates skipped");
  });

  it("counts weak-pass separately from produced matches", () => {
    const outcomes: SourceRunOutcome[] = [
      {
        sourceId: "a",
        sourceName: "A",
        ok: true,
        weakPass: true,
        createdCandidates: 0,
        skippedDuplicates: 0,
        errors: [],
        message: "weak"
      },
      {
        sourceId: "b",
        sourceName: "B",
        ok: true,
        createdCandidates: 2,
        skippedDuplicates: 0,
        errors: [],
        message: "ok"
      }
    ];
    const summary = buildRunAllSummary(outcomes);
    expect(summary.weakPassSources).toBe(1);
    expect(summary.successfulSources).toBe(1);
    const notice = formatRunBatchNotice(summary);
    expect(notice).toContain("weak-pass");
  });
});

describe("getHealthyJobSources", () => {
  it("includes healthy, stale, and never_run but excludes weak_pass", () => {
    const sources = [
      fixtureSource({ id: "healthy", lastRunAt: "2026-06-09T08:00:00.000Z" }),
      fixtureSource({ id: "never" }),
      fixtureSource({ id: "weak", lastRunAt: "2026-06-09T08:00:00.000Z" })
    ];
    const runs: JobSourceRunResult[] = [
      {
        sourceId: "healthy",
        fetchedAt: "2026-06-09T08:00:00.000Z",
        createdCandidateIds: ["c1"],
        skippedDuplicates: 0,
        errors: [],
        message: "ok"
      },
      {
        sourceId: "weak",
        fetchedAt: "2026-06-09T08:00:00.000Z",
        createdCandidateIds: [],
        skippedDuplicates: 0,
        errors: [],
        message: "zero"
      }
    ];
    const healthy = getHealthyJobSources(sources, runs, [], NOW);
    expect(healthy.map((item) => item.id).sort()).toEqual(["healthy", "never"]);
  });
});
