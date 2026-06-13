import { formatJobRunFinding, buildJobRunFinding } from "./jobFindings";
import { getJobSourceHealth, getLatestRunForSource } from "./jobSourceHealth";
import type { PaginationStoppedReason } from "./jobSourcePagination";
import { canRunJobSource } from "./jobSourceRunner";
import {
  getDueJobSources,
  getHealthyJobSources,
  getRunnableJobSources,
  getSourceDueBadge,
  isJobSourceDue,
  type SourceDueBadge
} from "./jobSourceSchedule";
import type {
  JobCandidate,
  JobSource,
  JobSourceHealth,
  JobSourceRunResult
} from "./types";

export type SourceLifecyclePhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "stale"
  | "due";

export type BatchRunnerAction =
  | "run_due_sources"
  | "run_healthy_sources"
  | "run_enabled_sources"
  | "retry_failed_source"
  | "no_runnable_sources";

export interface DeriveSourceLifecycleInput {
  source: JobSource;
  runs: JobSourceRunResult[];
  candidates: JobCandidate[];
  now: Date;
  isBatchRunning?: boolean;
  activelyRunningSourceId?: string | null;
}

export interface SourceLifecycleView {
  phase: SourceLifecyclePhase;
  statusLine: string;
  health: JobSourceHealth;
  dueBadge: SourceDueBadge;
  canRunSingle: boolean;
  runBlockedReason?: string;
}

export interface BatchRunnerLifecycleView {
  action: BatchRunnerAction;
  actionLabel: string;
  batchRunningLabel: string;
  dueRunEmptyMessage: string;
  enabledRunEmptyMessage: string;
  healthyRunEmptyMessage: string;
  dueCount: number;
  runnableCount: number;
  healthyCount: number;
  canRunDue: boolean;
  canRunHealthy: boolean;
  canRunAll: boolean;
  primaryPanelTitle: string;
  primaryPanelReason: string;
}

export interface LastRunSummary {
  ok: boolean;
  message: string;
  detailLine: string;
  paginationStoppedReason?: PaginationStoppedReason;
}

const DUE_RUN_EMPTY_MESSAGE = "No due sources to run.";
const ENABLED_RUN_EMPTY_MESSAGE = "No enabled runnable sources.";
const HEALTHY_RUN_EMPTY_MESSAGE = "No healthy runnable sources.";

function isSourceRunning(
  source: JobSource,
  isBatchRunning?: boolean,
  activelyRunningSourceId?: string | null
): boolean {
  return (
    source.runStatus === "running" ||
    (isBatchRunning === true && activelyRunningSourceId === source.id)
  );
}

function isSourceFailed(source: JobSource, runs: JobSourceRunResult[]): boolean {
  if (source.runStatus === "error") {
    return true;
  }
  const latestRun = getLatestRunForSource(source.id, runs);
  return (latestRun?.errors.length ?? 0) > 0;
}

function buildSourceStatusLine(
  phase: SourceLifecyclePhase,
  health: JobSourceHealth,
  source: JobSource
): string {
  switch (phase) {
    case "running":
      return source.lastRunMessage ?? "Running…";
    case "failed":
      return source.lastRunMessage ?? "Last run failed.";
    case "stale":
      return "Stale — run again to refresh matches.";
    case "due":
      return "Due for scheduled run.";
    case "succeeded":
      return source.lastRunMessage ?? "Last run succeeded.";
    case "idle":
    default:
      switch (health) {
        case "never_run":
          return "Never run.";
        case "weak_pass":
          return "Last run completed with no new candidates.";
        case "healthy":
          return "Healthy — recent run produced candidates.";
        case "error":
          return "Last run reported errors.";
        case "stale":
          return "Stale — run again to refresh matches.";
      }
  }
}

export function deriveSourceLifecycle(input: DeriveSourceLifecycleInput): SourceLifecycleView {
  const { source, runs, candidates, now, isBatchRunning, activelyRunningSourceId } = input;
  const health = getJobSourceHealth(source, runs, candidates, now);
  const dueBadge = getSourceDueBadge(source, now);
  const guard = canRunJobSource(source);

  let phase: SourceLifecyclePhase = "idle";

  if (isSourceRunning(source, isBatchRunning, activelyRunningSourceId)) {
    phase = "running";
  } else if (isSourceFailed(source, runs)) {
    phase = "failed";
  } else if (health === "stale") {
    phase = "stale";
  } else if (guard.ok && isJobSourceDue(source, now)) {
    phase = "due";
  } else if (source.runStatus === "success") {
    phase = "succeeded";
  }

  return {
    phase,
    statusLine: buildSourceStatusLine(phase, health, source),
    health,
    dueBadge,
    canRunSingle: guard.ok && phase !== "running",
    runBlockedReason: guard.ok ? undefined : guard.reason
  };
}

export function deriveBatchRunnerLifecycle(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date,
  options?: { isBatchRunning?: boolean }
): BatchRunnerLifecycleView {
  const isBatchRunning = options?.isBatchRunning ?? false;
  const dueSources = getDueJobSources(sources, now);
  const runnableSources = getRunnableJobSources(sources);
  const healthySources = getHealthyJobSources(sources, runs, candidates, now);
  const dueCount = dueSources.length;
  const runnableCount = runnableSources.length;
  const healthyCount = healthySources.length;
  const canRunDue = !isBatchRunning && dueCount > 0;
  const canRunHealthy = !isBatchRunning && healthyCount > 0;
  const canRunAll = !isBatchRunning && runnableCount > 0;

  const failedRunnableCount = runnableSources.filter(
    (source) =>
      deriveSourceLifecycle({ source, runs, candidates, now, isBatchRunning }).phase === "failed"
  ).length;

  let action: BatchRunnerAction = "no_runnable_sources";
  if (dueCount > 0) {
    action = "run_due_sources";
  } else if (healthyCount > 0) {
    action = "run_healthy_sources";
  } else if (runnableCount > 0) {
    action = failedRunnableCount > 0 ? "retry_failed_source" : "run_enabled_sources";
  }

  const actionLabel =
    action === "run_due_sources"
      ? "Run due sources"
      : action === "run_healthy_sources"
        ? "Run healthy sources"
        : action === "retry_failed_source"
          ? "Retry failed sources"
          : action === "run_enabled_sources"
            ? "Run all enabled"
            : "No runnable sources";

  const primaryPanelTitle = canRunDue
    ? `${dueCount} source${dueCount === 1 ? "" : "s"} due`
    : canRunHealthy
      ? `Run ${healthyCount} healthy source${healthyCount === 1 ? "" : "s"}`
      : canRunAll
        ? "Run enabled job sources"
        : "Paste one job posting";

  const primaryPanelReason = canRunDue
    ? "Refresh the due sources, then review any new matches before tinkering with setup."
    : canRunHealthy
      ? "Run sources that produced matches before — skip weak-pass and error sources."
      : canRunAll
        ? action === "retry_failed_source"
          ? "Some enabled sources failed last time. Retry them, then review any new matches."
          : "No source is due, but enabled sources can still bring in fresh options."
        : "Sources are quiet. Manual paste is the fastest way to create one review decision.";

  return {
    action,
    actionLabel,
    batchRunningLabel: "Running batch…",
    dueRunEmptyMessage: DUE_RUN_EMPTY_MESSAGE,
    enabledRunEmptyMessage: ENABLED_RUN_EMPTY_MESSAGE,
    healthyRunEmptyMessage: HEALTHY_RUN_EMPTY_MESSAGE,
    dueCount,
    runnableCount,
    healthyCount,
    canRunDue,
    canRunHealthy,
    canRunAll,
    primaryPanelTitle,
    primaryPanelReason
  };
}

export function formatPaginationStoppedReason(reason: PaginationStoppedReason): string {
  switch (reason) {
    case "fewer_than_limit":
      return "Pagination stopped: fewer results than page limit";
    case "zero_postings":
      return "Pagination stopped: zero postings";
    case "max_pages":
      return "Pagination stopped: page limit";
    case "max_results":
      return "Pagination stopped: result limit";
    case "fetch_error":
      return "Pagination stopped: fetch error";
  }
}

export function summarizeLastRunOutcome(
  run: JobSourceRunResult,
  sources: JobSource[] = []
): LastRunSummary {
  const finding = buildJobRunFinding(run, sources);
  const ok = run.errors.length === 0;
  const paginationStoppedReason = run.paginationStoppedReason as PaginationStoppedReason | undefined;

  return {
    ok,
    message: run.message,
    detailLine: formatLastRunDetailLine({
      ok,
      message: run.message,
      detailLine: formatJobRunFinding(finding),
      paginationStoppedReason
    }),
    paginationStoppedReason
  };
}

export function formatLastRunDetailLine(summary: LastRunSummary): string {
  if (!summary.paginationStoppedReason) {
    return summary.detailLine;
  }
  return `${summary.detailLine} · ${formatPaginationStoppedReason(summary.paginationStoppedReason)}`;
}
