import type { JobCandidate, JobSource, JobSourceHealth, JobSourceRunResult } from "./types";

export const SOURCE_HEALTH_STALE_DAYS = 14;
export const NORTHROP_WORKDAY_CXS_URL =
  "https://ngc.wd1.myworkdayjobs.com/wday/cxs/ngc/Northrop_Grumman_External_Site/jobs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatSourceHealthLabel(health: JobSourceHealth): string {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "weak_pass":
      return "Weak-pass";
    case "error":
      return "Error";
    case "stale":
      return "Stale";
    case "never_run":
      return "Never run";
  }
}

export function getRunsForSource(
  sourceId: string,
  runs: JobSourceRunResult[]
): JobSourceRunResult[] {
  return runs
    .filter((run) => run.sourceId === sourceId)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}

export function getLatestRunForSource(
  sourceId: string,
  runs: JobSourceRunResult[]
): JobSourceRunResult | undefined {
  return getRunsForSource(sourceId, runs)[0];
}

function daysBetween(olderIso: string, now: Date): number {
  const older = new Date(olderIso).getTime();
  return (now.getTime() - older) / MS_PER_DAY;
}

export function isNorthropWorkdayEndpointSource(source: JobSource): boolean {
  return (
    source.kind === "workday" &&
    source.url.trim().toLowerCase() === NORTHROP_WORKDAY_CXS_URL.toLowerCase()
  );
}

export function getJobSourceHealth(
  source: JobSource,
  runs: JobSourceRunResult[],
  _candidates: JobCandidate[],
  now: Date
): JobSourceHealth {
  const sourceRuns = getRunsForSource(source.id, runs);
  if (sourceRuns.length === 0) {
    return "never_run";
  }

  const latestRun = sourceRuns[0]!;
  if (latestRun.errors.length > 0) {
    return "error";
  }
  if (latestRun.createdCandidateIds.length === 0) {
    return "weak_pass";
  }
  if (daysBetween(latestRun.fetchedAt, now) > SOURCE_HEALTH_STALE_DAYS) {
    return "stale";
  }
  return "healthy";
}

export interface SourceHealthStats {
  healthy: number;
  weakPass: number;
  error: number;
  stale: number;
  neverRun: number;
  candidateProducingWorkdaySources: number;
  weakPassWorkdaySources: number;
  northropHealthy: boolean;
}

export function buildSourceHealthStats(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date
): SourceHealthStats {
  const counts: SourceHealthStats = {
    healthy: 0,
    weakPass: 0,
    error: 0,
    stale: 0,
    neverRun: 0,
    candidateProducingWorkdaySources: 0,
    weakPassWorkdaySources: 0,
    northropHealthy: false
  };

  for (const source of sources) {
    const health = getJobSourceHealth(source, runs, candidates, now);
    switch (health) {
      case "healthy":
        counts.healthy += 1;
        if (source.kind === "workday") {
          counts.candidateProducingWorkdaySources += 1;
        }
        if (isNorthropWorkdayEndpointSource(source)) {
          counts.northropHealthy = true;
        }
        break;
      case "weak_pass":
        counts.weakPass += 1;
        if (source.kind === "workday") {
          counts.weakPassWorkdaySources += 1;
        }
        break;
      case "error":
        counts.error += 1;
        break;
      case "stale":
        counts.stale += 1;
        if (source.kind === "workday") {
          counts.candidateProducingWorkdaySources += 1;
        }
        break;
      case "never_run":
        counts.neverRun += 1;
        break;
    }
  }

  return counts;
}

export function buildSourceHealthBriefingLines(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date
): string[] {
  const stats = buildSourceHealthStats(sources, runs, candidates, now);
  const lines: string[] = [];
  if (stats.weakPassWorkdaySources > 0) {
    lines.push(
      `${stats.weakPassWorkdaySources} Workday source${stats.weakPassWorkdaySources === 1 ? "" : "s"} need endpoint capture.`
    );
  }
  if (stats.northropHealthy) {
    lines.push("Northrop Workday endpoint is candidate-producing.");
  }
  return lines;
}

export const WORKDAY_WEAK_PASS_HEALTH_HINT =
  "Recognized Workday source, but no candidate payload found. Endpoint capture or endpoint template may be needed.";
