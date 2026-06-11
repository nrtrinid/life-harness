import { getDueJobSources, getRunnableJobSources } from "./jobSourceSchedule";
import type { JobCandidate, JobSource, JobSourceRunResult } from "./types";

export interface JobFindingsCounts {
  total: number;
  waiting: number;
  new: number;
  saved: number;
  dismissed: number;
  cardCreated: number;
  fetchedWaiting: number;
  manualWaiting: number;
  newFetched: number;
  savedManual: number;
}

export interface JobRunFinding {
  sourceId: string;
  sourceName: string;
  fetchedAt: string;
  createdCandidates: number;
  skippedDuplicates: number;
  errorCount: number;
  message: string;
}

export type JobFindingsNextMove =
  | {
      kind: "review_candidate";
      title: string;
      body: string;
      ctaLabel: "Open Queue";
      targetRoute: "/job-candidates";
      candidate: JobCandidate;
      sourceName?: string;
    }
  | {
      kind: "run_sources";
      title: string;
      body: string;
      ctaLabel: "Open Sources";
      targetRoute: "/job-sources";
    }
  | {
      kind: "paste_candidate";
      title: string;
      body: string;
      ctaLabel: "Paste Job";
      targetRoute: "/candidate-intake";
    };

export interface JobFindingsSummary {
  counts: JobFindingsCounts;
  dueSources: number;
  runnableSources: number;
  latestRun?: JobRunFinding;
  bestCandidate?: JobCandidate;
  nextMove: JobFindingsNextMove;
}

function isReviewableCandidate(candidate: JobCandidate): boolean {
  return candidate.status === "new" || candidate.status === "saved";
}

function timestampValue(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function compareJobCandidatesForReview(a: JobCandidate, b: JobCandidate): number {
  const statusRank = (candidate: JobCandidate) => (candidate.status === "new" ? 0 : 1);
  const statusDelta = statusRank(a) - statusRank(b);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  const fitDelta = b.fitScore - a.fitScore;
  if (fitDelta !== 0) {
    return fitDelta;
  }

  return timestampValue(b.discoveredAt) - timestampValue(a.discoveredAt);
}

export function getBestJobCandidateToReview(candidates: JobCandidate[]): JobCandidate | undefined {
  return candidates.filter(isReviewableCandidate).sort(compareJobCandidatesForReview)[0];
}

export function buildJobFindingsCounts(candidates: JobCandidate[]): JobFindingsCounts {
  const waiting = candidates.filter(isReviewableCandidate);

  return {
    total: candidates.length,
    waiting: waiting.length,
    new: candidates.filter((candidate) => candidate.status === "new").length,
    saved: candidates.filter((candidate) => candidate.status === "saved").length,
    dismissed: candidates.filter((candidate) => candidate.status === "dismissed").length,
    cardCreated: candidates.filter((candidate) => candidate.status === "card_created").length,
    fetchedWaiting: waiting.filter((candidate) => candidate.origin === "source_fetch").length,
    manualWaiting: waiting.filter((candidate) => candidate.origin === "manual").length,
    newFetched: candidates.filter(
      (candidate) => candidate.status === "new" && candidate.origin === "source_fetch"
    ).length,
    savedManual: candidates.filter(
      (candidate) => candidate.status === "saved" && candidate.origin === "manual"
    ).length
  };
}

export function getLatestJobSourceRun(
  runs: JobSourceRunResult[],
  sourceId?: string
): JobSourceRunResult | undefined {
  return runs
    .filter((run) => !sourceId || run.sourceId === sourceId)
    .sort((a, b) => timestampValue(b.fetchedAt) - timestampValue(a.fetchedAt))[0];
}

export function buildJobRunFinding(
  run: JobSourceRunResult,
  sources: JobSource[]
): JobRunFinding {
  const source = sources.find((item) => item.id === run.sourceId);

  return {
    sourceId: run.sourceId,
    sourceName: source?.name ?? "Unknown source",
    fetchedAt: run.fetchedAt,
    createdCandidates: run.createdCandidateIds.length,
    skippedDuplicates: run.skippedDuplicates,
    errorCount: run.errors.length,
    message: run.message
  };
}

export function formatJobRunFinding(run: JobRunFinding): string {
  return `${run.createdCandidates} new - ${run.skippedDuplicates} duplicate${
    run.skippedDuplicates === 1 ? "" : "s"
  } - ${run.errorCount} error${run.errorCount === 1 ? "" : "s"}`;
}

export function buildJobFindingsSummary(
  candidates: JobCandidate[],
  sources: JobSource[],
  runs: JobSourceRunResult[],
  now: Date
): JobFindingsSummary {
  const counts = buildJobFindingsCounts(candidates);
  const dueSources = getDueJobSources(sources, now).length;
  const runnableSources = getRunnableJobSources(sources).length;
  const latestRun = getLatestJobSourceRun(runs);
  const bestCandidate = getBestJobCandidateToReview(candidates);

  if (bestCandidate) {
    const source = sources.find((item) => item.id === bestCandidate.sourceId);
    return {
      counts,
      dueSources,
      runnableSources,
      latestRun: latestRun ? buildJobRunFinding(latestRun, sources) : undefined,
      bestCandidate,
      nextMove: {
        kind: "review_candidate",
        title: `${bestCandidate.company} - ${bestCandidate.roleTitle}`,
        body: bestCandidate.nextTinyAction,
        ctaLabel: "Open Queue",
        targetRoute: "/job-candidates",
        candidate: bestCandidate,
        sourceName: source?.name
      }
    };
  }

  if (dueSources > 0 || runnableSources > 0) {
    return {
      counts,
      dueSources,
      runnableSources,
      latestRun: latestRun ? buildJobRunFinding(latestRun, sources) : undefined,
      nextMove: {
        kind: "run_sources",
        title: dueSources > 0 ? "Run due job sources" : "Run one approved source",
        body:
          dueSources > 0
            ? `${dueSources} source${dueSources === 1 ? "" : "s"} due. Find fresh matches, then review one.`
            : "No candidates are waiting. Run an approved source, then review one match.",
        ctaLabel: "Open Sources",
        targetRoute: "/job-sources"
      }
    };
  }

  return {
    counts,
    dueSources,
    runnableSources,
    latestRun: latestRun ? buildJobRunFinding(latestRun, sources) : undefined,
    nextMove: {
      kind: "paste_candidate",
      title: "Paste one job",
      body: "No runnable sources yet. Paste a posting manually or set up one approved source.",
      ctaLabel: "Paste Job",
      targetRoute: "/candidate-intake"
    }
  };
}
