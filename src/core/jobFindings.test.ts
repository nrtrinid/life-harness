import { describe, expect, it } from "vitest";

import {
  buildJobFindingsCounts,
  buildJobFindingsSummary,
  formatJobRunFinding,
  getBestJobCandidateToReview
} from "./jobFindings";
import type { JobCandidate, JobSource, JobSourceRunResult } from "./types";

function candidate(partial: Partial<JobCandidate> & Pick<JobCandidate, "id">): JobCandidate {
  return {
    id: partial.id,
    company: partial.company ?? "Acme",
    roleTitle: partial.roleTitle ?? "Engineer",
    description: partial.description ?? "Build useful software.",
    roleType: partial.roleType ?? "software",
    discoveredAt: partial.discoveredAt ?? "2026-06-10T12:00:00.000Z",
    origin: partial.origin ?? "source_fetch",
    status: partial.status ?? "new",
    fitScore: partial.fitScore ?? 70,
    fitLabel: partial.fitLabel,
    fitReasons: partial.fitReasons ?? ["Good TypeScript match"],
    gaps: partial.gaps ?? ["Confirm domain fit"],
    matchedSkills: partial.matchedSkills,
    missingSignals: partial.missingSignals,
    recommendedResumeAngle: partial.recommendedResumeAngle,
    suggestedResumeModuleIds: partial.suggestedResumeModuleIds ?? [],
    nextTinyAction: partial.nextTinyAction ?? "Read the posting and choose resume angle.",
    sourceId: partial.sourceId,
    sourceUrl: partial.sourceUrl,
    location: partial.location,
    applicationCardId: partial.applicationCardId
  };
}

function source(partial: Partial<JobSource> & Pick<JobSource, "id">): JobSource {
  return {
    id: partial.id,
    name: partial.name ?? "Acme Careers",
    url: partial.url ?? "https://example.com/jobs.json",
    kind: partial.kind ?? "greenhouse",
    enabled: partial.enabled ?? true,
    cadence: partial.cadence ?? "manual",
    runStatus: partial.runStatus ?? "idle",
    maxResults: partial.maxResults ?? 25,
    lastCheckedAt: partial.lastCheckedAt,
    notes: partial.notes,
    lastRunAt: partial.lastRunAt,
    lastRunMessage: partial.lastRunMessage,
    lastFetchedCount: partial.lastFetchedCount,
    adapterNotes: partial.adapterNotes,
    requestConfig: partial.requestConfig
  };
}

function run(partial: Partial<JobSourceRunResult> & Pick<JobSourceRunResult, "sourceId">): JobSourceRunResult {
  return {
    sourceId: partial.sourceId,
    fetchedAt: partial.fetchedAt ?? "2026-06-10T12:00:00.000Z",
    createdCandidateIds: partial.createdCandidateIds ?? [],
    skippedDuplicates: partial.skippedDuplicates ?? 0,
    errors: partial.errors ?? [],
    message: partial.message ?? "Run complete.",
    pagesFetched: partial.pagesFetched,
    paginationStoppedReason: partial.paginationStoppedReason
  };
}

describe("job findings", () => {
  it("picks new candidates before saved candidates", () => {
    const best = getBestJobCandidateToReview([
      candidate({ id: "saved-high", status: "saved", fitScore: 99 }),
      candidate({ id: "new-lower", status: "new", fitScore: 60 })
    ]);

    expect(best?.id).toBe("new-lower");
  });

  it("sorts review candidates by fit score and newest discovery time", () => {
    const bestByFit = getBestJobCandidateToReview([
      candidate({ id: "older", fitScore: 80, discoveredAt: "2026-06-09T12:00:00.000Z" }),
      candidate({ id: "newer", fitScore: 80, discoveredAt: "2026-06-10T12:00:00.000Z" }),
      candidate({ id: "highest", fitScore: 90, discoveredAt: "2026-06-08T12:00:00.000Z" })
    ]);

    expect(bestByFit?.id).toBe("highest");

    const bestByDate = getBestJobCandidateToReview([
      candidate({ id: "older", fitScore: 80, discoveredAt: "2026-06-09T12:00:00.000Z" }),
      candidate({ id: "newer", fitScore: 80, discoveredAt: "2026-06-10T12:00:00.000Z" })
    ]);

    expect(bestByDate?.id).toBe("newer");
  });

  it("counts queue status and origin buckets", () => {
    const counts = buildJobFindingsCounts([
      candidate({ id: "new-fetched", status: "new", origin: "source_fetch" }),
      candidate({ id: "saved-manual", status: "saved", origin: "manual" }),
      candidate({ id: "dismissed", status: "dismissed", origin: "source_fetch" }),
      candidate({ id: "card", status: "card_created", origin: "source_fetch" })
    ]);

    expect(counts).toMatchObject({
      total: 4,
      waiting: 2,
      new: 1,
      saved: 1,
      dismissed: 1,
      cardCreated: 1,
      fetchedWaiting: 1,
      manualWaiting: 1,
      newFetched: 1,
      savedManual: 1
    });
  });

  it("reports latest source run counts", () => {
    const summary = buildJobFindingsSummary(
      [],
      [source({ id: "source-1", name: "Acme" })],
      [
        run({
          sourceId: "source-1",
          fetchedAt: "2026-06-09T12:00:00.000Z",
          createdCandidateIds: ["old"],
          skippedDuplicates: 0
        }),
        run({
          sourceId: "source-1",
          fetchedAt: "2026-06-10T12:00:00.000Z",
          createdCandidateIds: ["a", "b"],
          skippedDuplicates: 3,
          errors: ["One page failed"]
        })
      ],
      new Date("2026-06-10T13:00:00.000Z")
    );

    expect(summary.latestRun).toMatchObject({
      sourceName: "Acme",
      createdCandidates: 2,
      skippedDuplicates: 3,
      errorCount: 1
    });
    expect(summary.latestRun ? formatJobRunFinding(summary.latestRun) : "").toBe(
      "2 new - 3 duplicates - 1 error"
    );
  });

  it("returns source and paste fallbacks when no candidates are reviewable", () => {
    const sourceFallback = buildJobFindingsSummary(
      [],
      [source({ id: "source-1" })],
      [],
      new Date("2026-06-10T13:00:00.000Z")
    );

    expect(sourceFallback.nextMove.kind).toBe("run_sources");

    const pasteFallback = buildJobFindingsSummary(
      [],
      [source({ id: "manual", kind: "company_careers" })],
      [],
      new Date("2026-06-10T13:00:00.000Z")
    );

    expect(pasteFallback.nextMove.kind).toBe("paste_candidate");
  });

  it("routes next moves to Jobs board tabs", () => {
    const review = buildJobFindingsSummary(
      [candidate({ id: "c1", status: "new" })],
      [],
      [],
      new Date("2026-06-10T13:00:00.000Z")
    );
    expect(review.nextMove.targetRoute).toBe("/career?tab=review");

    const sources = buildJobFindingsSummary(
      [],
      [source({ id: "source-1" })],
      [],
      new Date("2026-06-10T13:00:00.000Z")
    );
    expect(sources.nextMove.targetRoute).toBe("/career?tab=find");

    const paste = buildJobFindingsSummary(
      [],
      [source({ id: "manual", kind: "company_careers" })],
      [],
      new Date("2026-06-10T13:00:00.000Z")
    );
    expect(paste.nextMove.targetRoute).toBe("/career?tab=find&add=1");
  });
});
