import {
  canRunJobSource,
  countFailedSourceRuns,
  countSuccessfulManualSourceRuns
} from "./jobSourceRunner";
import type { JobSource, JobSourceRunResult } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SourceDueBadge = "due" | "not_due" | "manual_only" | "unsupported" | "disabled";

export interface SourceRunOutcome {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  createdCandidates: number;
  skippedDuplicates: number;
  errors: string[];
  message: string;
  runnerUnreachable?: boolean;
}

export interface RunBatchSummary {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  createdCandidates: number;
  skippedDuplicates: number;
  errors: string[];
  runnerUnreachable: boolean;
  outcomes: SourceRunOutcome[];
}

export interface SourceScheduleStats {
  sourcesConfigured: number;
  enabledSources: number;
  runnableSources: number;
  dueSources: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunAt?: string;
  nextDueAt?: string;
}

/**
 * Manual cadence rules:
 * - excluded from Run Due (getDueJobSources)
 * - included in Run All Enabled if runnable (getRunnableJobSources)
 * - still runnable via single Run Source (canRunJobSource)
 */
export function getSourceRunIntervalDays(source: JobSource): number | null {
  switch (source.cadence) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    default:
      return null;
  }
}

export function isRunnableJobSource(source: JobSource): boolean {
  return canRunJobSource(source).ok;
}

export function getRunnableJobSources(sources: JobSource[]): JobSource[] {
  return sources.filter((source) => source.enabled && isRunnableJobSource(source));
}

function parseLastRunAt(lastRunAt: string | undefined): Date | undefined {
  if (!lastRunAt) {
    return undefined;
  }
  const parsed = new Date(lastRunAt);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function daysSince(isoTimestamp: string, now: Date): number {
  const touched = new Date(isoTimestamp).getTime();
  return (now.getTime() - touched) / MS_PER_DAY;
}

export function isJobSourceDue(source: JobSource, now: Date): boolean {
  if (!source.enabled) {
    return false;
  }
  if (!isRunnableJobSource(source)) {
    return false;
  }
  if (source.cadence === "manual") {
    return false;
  }

  const intervalDays = getSourceRunIntervalDays(source);
  if (intervalDays === null) {
    return false;
  }

  const lastRun = parseLastRunAt(source.lastRunAt);
  if (!lastRun) {
    return true;
  }

  return daysSince(lastRun.toISOString(), now) >= intervalDays;
}

export function getDueJobSources(sources: JobSource[], now: Date): JobSource[] {
  return sources.filter(
    (source) =>
      source.cadence !== "manual" &&
      getSourceRunIntervalDays(source) !== null &&
      isJobSourceDue(source, now)
  );
}

export function getSourceDueBadge(source: JobSource, now: Date): SourceDueBadge {
  if (!source.enabled) {
    return "disabled";
  }
  if (!isRunnableJobSource(source)) {
    return "unsupported";
  }
  if (source.cadence === "manual") {
    return "manual_only";
  }
  return isJobSourceDue(source, now) ? "due" : "not_due";
}

export function getNextDueAt(source: JobSource, now: Date): string | undefined {
  const intervalDays = getSourceRunIntervalDays(source);
  if (intervalDays === null || !source.enabled || !isRunnableJobSource(source)) {
    return undefined;
  }

  const lastRun = parseLastRunAt(source.lastRunAt);
  const base = lastRun ?? now;
  const next = new Date(base.getTime() + intervalDays * MS_PER_DAY);
  return next.toISOString();
}

export function buildSourceScheduleStats(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  now: Date
): SourceScheduleStats {
  const runnable = getRunnableJobSources(sources);
  const due = getDueJobSources(sources, now);
  const lastRunAt = runs[0]?.fetchedAt;

  let nextDueAt: string | undefined;
  for (const source of due) {
    const candidate = getNextDueAt(source, now);
    if (!candidate) {
      continue;
    }
    if (!nextDueAt || candidate < nextDueAt) {
      nextDueAt = candidate;
    }
  }

  if (!nextDueAt) {
    for (const source of runnable) {
      if (source.cadence === "manual") {
        continue;
      }
      const candidate = getNextDueAt(source, now);
      if (!candidate) {
        continue;
      }
      if (!nextDueAt || candidate < nextDueAt) {
        nextDueAt = candidate;
      }
    }
  }

  return {
    sourcesConfigured: sources.length,
    enabledSources: sources.filter((source) => source.enabled).length,
    runnableSources: runnable.length,
    dueSources: due.length,
    successfulRuns: countSuccessfulManualSourceRuns(runs),
    failedRuns: countFailedSourceRuns(runs),
    lastRunAt,
    nextDueAt
  };
}

export function buildRunAllSummary(outcomes: SourceRunOutcome[]): RunBatchSummary {
  const successfulSources = outcomes.filter((outcome) => outcome.ok).length;
  const failedSources = outcomes.filter((outcome) => !outcome.ok).length;
  const createdCandidates = outcomes.reduce(
    (total, outcome) => total + outcome.createdCandidates,
    0
  );
  const skippedDuplicates = outcomes.reduce(
    (total, outcome) => total + outcome.skippedDuplicates,
    0
  );
  const errors = outcomes.flatMap((outcome) => outcome.errors);

  return {
    totalSources: outcomes.length,
    successfulSources,
    failedSources,
    createdCandidates,
    skippedDuplicates,
    errors,
    runnerUnreachable: outcomes.some((outcome) => outcome.runnerUnreachable),
    outcomes
  };
}

export function formatRunBatchNotice(summary: RunBatchSummary): string {
  if (summary.totalSources === 0) {
    return "No sources were run.";
  }

  const parts = [
    `Ran ${summary.totalSources} source${summary.totalSources === 1 ? "" : "s"}`,
    `${summary.successfulSources} successful`,
    `${summary.failedSources} failed`,
    `${summary.createdCandidates} new candidate${summary.createdCandidates === 1 ? "" : "s"}`,
    `${summary.skippedDuplicates} duplicate${summary.skippedDuplicates === 1 ? "" : "s"} skipped`
  ];

  if (summary.runnerUnreachable) {
    return `${parts.join(", ")}. Runner stopped — start it with npm run scout:runner.`;
  }

  return `${parts.join(", ")}.`;
}

export const SOURCE_DUE_BADGE_LABELS: Record<SourceDueBadge, string> = {
  due: "Due",
  not_due: "Not due",
  manual_only: "Manual only",
  unsupported: "Unsupported",
  disabled: "Disabled"
};
