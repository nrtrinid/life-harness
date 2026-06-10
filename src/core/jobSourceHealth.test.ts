import { describe, expect, it } from "vitest";

import {
  buildSourceHealthStats,
  formatSourceHealthLabel,
  getJobSourceHealth,
  SOURCE_HEALTH_STALE_DAYS
} from "./jobSourceHealth";
import type { JobSource, JobSourceRunResult } from "./types";

const source: JobSource = {
  id: "source-1",
  name: "Test Source",
  url: "https://example.com/jobs",
  kind: "workday",
  enabled: true,
  cadence: "manual"
};

const now = new Date("2026-06-09T12:00:00.000Z");

function run(
  partial: Partial<JobSourceRunResult> & Pick<JobSourceRunResult, "fetchedAt">
): JobSourceRunResult {
  return {
    sourceId: source.id,
    createdCandidateIds: [],
    skippedDuplicates: 0,
    errors: [],
    message: "ok",
    ...partial
  };
}

describe("jobSourceHealth", () => {
  it("returns never_run when no runs exist", () => {
    expect(getJobSourceHealth(source, [], [], now)).toBe("never_run");
  });

  it("returns healthy when latest run created candidates", () => {
    const health = getJobSourceHealth(
      source,
      [run({ fetchedAt: "2026-06-08T12:00:00.000Z", createdCandidateIds: ["c1"] })],
      [],
      now
    );
    expect(health).toBe("healthy");
  });

  it("returns weak_pass when latest run succeeded with zero candidates", () => {
    const health = getJobSourceHealth(
      source,
      [run({ fetchedAt: "2026-06-08T12:00:00.000Z" })],
      [],
      now
    );
    expect(health).toBe("weak_pass");
  });

  it("returns error when latest run has errors", () => {
    const health = getJobSourceHealth(
      source,
      [run({ fetchedAt: "2026-06-08T12:00:00.000Z", errors: ["fetch failed"] })],
      [],
      now
    );
    expect(health).toBe("error");
  });

  it("returns stale when latest candidate-producing run is older than threshold", () => {
    const staleAt = new Date(now.getTime() - (SOURCE_HEALTH_STALE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const health = getJobSourceHealth(
      source,
      [
        run({
          fetchedAt: staleAt.toISOString(),
          createdCandidateIds: ["c1"]
        })
      ],
      [],
      now
    );
    expect(health).toBe("stale");
  });

  it("uses newest run by fetchedAt, not array position", () => {
    const health = getJobSourceHealth(
      source,
      [
        run({ fetchedAt: "2026-06-01T12:00:00.000Z", createdCandidateIds: ["old"] }),
        run({ fetchedAt: "2026-06-08T12:00:00.000Z", errors: ["latest failed"] })
      ],
      [],
      now
    );
    expect(health).toBe("error");
  });

  it("builds health stats counts", () => {
    const sources: JobSource[] = [
      source,
      { ...source, id: "source-2", kind: "greenhouse" },
      { ...source, id: "source-3" }
    ];
    const runs: JobSourceRunResult[] = [
      run({ sourceId: "source-1", fetchedAt: "2026-06-08T12:00:00.000Z", createdCandidateIds: ["c1"] }),
      run({ sourceId: "source-2", fetchedAt: "2026-06-08T12:00:00.000Z" }),
      run({ sourceId: "source-3", fetchedAt: "2026-06-08T12:00:00.000Z", errors: ["x"] })
    ];
    const stats = buildSourceHealthStats(sources, runs, [], now);
    expect(stats.healthy).toBe(1);
    expect(stats.weakPass).toBe(1);
    expect(stats.error).toBe(1);
    expect(stats.neverRun).toBe(0);
    expect(stats.candidateProducingWorkdaySources).toBe(1);
  });

  it("formats health labels", () => {
    expect(formatSourceHealthLabel("weak_pass")).toBe("Weak-pass");
  });
});
