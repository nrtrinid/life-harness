import { getFollowUpsDue } from "./career";
import {
  buildJobFindingsCounts,
  getBestJobCandidateToReview,
  getLatestJobSourceRun
} from "./jobFindings";
import {
  deriveBatchRunnerLifecycle,
  deriveSourceLifecycle,
  summarizeLastRunOutcome
} from "./jobRunnerLifecycle";
import { buildSourceHealthStats, getJobSourceHealth } from "./jobSourceHealth";
import { getRunnableJobSources } from "./jobSourceSchedule";
import { buildApplicationResumeReadiness } from "./resumeReadiness";
import type { CareerSourcePackV1 } from "./careerSourcePack";
import type {
  JobCandidate,
  JobSource,
  JobSourceRunResult,
  LifeCard,
  ResumeModule
} from "./types";

export type CareerMorningMoveKind =
  | "batch_running"
  | "run_due_sources"
  | "run_enabled_sources"
  | "review_candidates"
  | "open_application"
  | "improve_resume"
  | "paste_job"
  | "maintain";

export type CareerMorningBatchHandler = "run_due" | "run_all_enabled";

export interface CareerMorningLoopBatchProgress {
  current: number;
  total: number;
  sourceName: string;
}

export interface CareerMorningLoopStatus {
  dueSourceCount: number;
  failedSourceCount: number;
  staleSourceCount: number;
  waitingCandidateCount: number;
  readyApplicationCount: number;
  needsResumeCount: number;
  resumeReadinessLine?: string;
}

export interface CareerMorningLoopMove {
  kind: CareerMorningMoveKind;
  title: string;
  why: string;
  ctaLabel: string;
  href?: string;
  batchHandler?: CareerMorningBatchHandler;
  disabled?: boolean;
  cardId?: string;
  candidateId?: string;
}

export interface CareerMorningLoopSummary {
  status: CareerMorningLoopStatus;
  nextMove: CareerMorningLoopMove;
  statusStrip: string;
  supportingLines: string[];
}

export interface CareerMorningLoopInput {
  jobCandidates: JobCandidate[];
  cards: LifeCard[];
  jobSources: JobSource[];
  jobSourceRuns: JobSourceRunResult[];
  resumeModules: ResumeModule[];
  careerSourcePack?: CareerSourcePackV1;
  now: Date;
  isBatchRunning?: boolean;
  batchRunProgress?: CareerMorningLoopBatchProgress | null;
}

interface ApplicationReadinessSummary {
  card: LifeCard;
  readiness: ReturnType<typeof buildApplicationResumeReadiness>;
}

function enabledSources(sources: JobSource[]): JobSource[] {
  return sources.filter((source) => source.enabled);
}

function inMotionApplicationCards(cards: LifeCard[]): LifeCard[] {
  return cards.filter(
    (card) =>
      card.careerApplication &&
      (card.state === "inbox" || card.state === "active" || card.state === "waiting")
  );
}

function buildApplicationSummaries(input: CareerMorningLoopInput): ApplicationReadinessSummary[] {
  return inMotionApplicationCards(input.cards).map((card) => {
    const linkedCandidate = card.careerApplication?.jobCandidateId
      ? input.jobCandidates.find((candidate) => candidate.id === card.careerApplication?.jobCandidateId)
      : undefined;
    return {
      card,
      readiness: buildApplicationResumeReadiness({
        card,
        resumeModules: input.resumeModules,
        jobCandidate: linkedCandidate,
        careerSourcePack: input.careerSourcePack
      })
    };
  });
}

function countFailedEnabledSources(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date,
  isBatchRunning?: boolean
): number {
  return enabledSources(sources).filter(
    (source) =>
      deriveSourceLifecycle({ source, runs, candidates, now, isBatchRunning }).phase === "failed"
  ).length;
}

function countStaleEnabledSources(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date
): number {
  return enabledSources(sources).filter(
    (source) => getJobSourceHealth(source, runs, candidates, now) === "stale"
  ).length;
}

function countFailedRunnableSources(
  sources: JobSource[],
  runs: JobSourceRunResult[],
  candidates: JobCandidate[],
  now: Date,
  isBatchRunning?: boolean
): number {
  return getRunnableJobSources(sources).filter(
    (source) =>
      deriveSourceLifecycle({ source, runs, candidates, now, isBatchRunning }).phase === "failed"
  ).length;
}

function formatBatchRunningWhy(
  batchRunProgress: CareerMorningLoopBatchProgress | null | undefined,
  fallback: string
): string {
  if (!batchRunProgress) {
    return fallback;
  }
  return `Fetching matches — ${batchRunProgress.sourceName} (${batchRunProgress.current}/${batchRunProgress.total}). Hang tight.`;
}

function formatStatusStrip(status: CareerMorningLoopStatus): string {
  const parts: string[] = [];
  if (status.dueSourceCount > 0) {
    parts.push(
      `${status.dueSourceCount} source${status.dueSourceCount === 1 ? "" : "s"} due`
    );
  }
  if (status.failedSourceCount > 0) {
    parts.push(
      `${status.failedSourceCount} source${status.failedSourceCount === 1 ? "" : "s"} failed`
    );
  }
  if (status.staleSourceCount > 0) {
    parts.push(
      `${status.staleSourceCount} source${status.staleSourceCount === 1 ? "" : "s"} stale`
    );
  }
  if (status.waitingCandidateCount > 0) {
    parts.push(
      `${status.waitingCandidateCount} to review`
    );
  }
  if (status.readyApplicationCount > 0) {
    parts.push(
      `${status.readyApplicationCount} ready to export`
    );
  }
  if (status.needsResumeCount > 0) {
    parts.push(
      `${status.needsResumeCount} need resume patch`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "All quiet";
}

function formatResumeReadinessLine(ready: number, needsPatch: number): string | undefined {
  if (ready === 0 && needsPatch === 0) {
    return undefined;
  }
  const parts: string[] = [];
  if (ready > 0) {
    parts.push(`${ready} ready`);
  }
  if (needsPatch > 0) {
    parts.push(`${needsPatch} need${needsPatch === 1 ? "s" : ""} a patch`);
  }
  return parts.join(" · ");
}

function formatMorningLoopLastRunLine(
  run: JobSourceRunResult,
  sources: JobSource[]
): string {
  const summary = summarizeLastRunOutcome(run, sources);
  const createdCount = run.createdCandidateIds.length;
  const matchLabel = createdCount === 1 ? "match" : "matches";
  if (run.errors.length === 0) {
    return `Last fetch: ${createdCount} new ${matchLabel}`;
  }
  return `Last fetch: ${summary.detailLine}`;
}

function buildSupportingLines(
  input: CareerMorningLoopInput,
  applicationSummaries: ApplicationReadinessSummary[],
  readyCount: number
): string[] {
  const lines: string[] = [];
  const enabled = enabledSources(input.jobSources);
  const latestRun = getLatestJobSourceRun(input.jobSourceRuns);

  if (latestRun) {
    lines.push(formatMorningLoopLastRunLine(latestRun, input.jobSources));
  }

  if (enabled.length > 0) {
    const health = buildSourceHealthStats(enabled, input.jobSourceRuns, input.jobCandidates, input.now);
    const healthParts: string[] = [];
    if (health.healthy > 0) {
      healthParts.push(`${health.healthy} healthy`);
    }
    if (health.stale > 0) {
      healthParts.push(`${health.stale} stale`);
    }
    if (health.error > 0) {
      healthParts.push(`${health.error} error`);
    }
    if (healthParts.length > 0) {
      lines.push(`Sources: ${healthParts.join(" · ")}`);
    }
  }

  if (applicationSummaries.length > 0) {
    lines.push(
      `${applicationSummaries.length} in motion · ${readyCount} ready to export`
    );
  }

  for (const summary of applicationSummaries) {
    const proofWarning = summary.readiness.warnings.find(
      (warning) => warning.category === "missing_proof"
    );
    if (proofWarning) {
      lines.push(proofWarning.message);
      break;
    }
  }

  return lines.slice(0, 3);
}

function deriveNextMove(
  input: CareerMorningLoopInput,
  batchLifecycle: ReturnType<typeof deriveBatchRunnerLifecycle>,
  applicationSummaries: ApplicationReadinessSummary[],
  failedRunnableCount: number
): CareerMorningLoopMove {
  const isBatchRunning = input.isBatchRunning ?? false;

  if (isBatchRunning) {
    return {
      kind: "batch_running",
      title: "Sources are running",
      why: formatBatchRunningWhy(input.batchRunProgress, batchLifecycle.batchRunningLabel),
      ctaLabel: "Running…",
      disabled: true
    };
  }

  if (batchLifecycle.dueCount > 0) {
    return {
      kind: "run_due_sources",
      title: batchLifecycle.primaryPanelTitle,
      why: "Run what's due, then skim any new matches.",
      ctaLabel: "Run due sources",
      batchHandler: "run_due"
    };
  }

  if (failedRunnableCount > 0 && batchLifecycle.runnableCount > 0) {
    return {
      kind: "run_enabled_sources",
      title: "Run enabled sources",
      why: "A source failed last time. Run the enabled set again and see what comes back.",
      ctaLabel: "Run enabled sources",
      batchHandler: "run_all_enabled"
    };
  }

  const bestCandidate = getBestJobCandidateToReview(input.jobCandidates);
  if (bestCandidate) {
    return {
      kind: "review_candidates",
      title: `${bestCandidate.company} — ${bestCandidate.roleTitle}`,
      why: "Pick a resume angle or pass — one decision is enough for today.",
      ctaLabel: "Open review queue",
      href: "/job-candidates",
      candidateId: bestCandidate.id
    };
  }

  const followUpsDue = getFollowUpsDue(input.cards, input.now);
  const firstFollowUp = followUpsDue[0];
  if (firstFollowUp) {
    return {
      kind: "open_application",
      title: firstFollowUp.title,
      why: "Follow-up is due — one small outside-world touch keeps momentum.",
      ctaLabel: "Open follow-up",
      href: `/card/${firstFollowUp.id}`,
      cardId: firstFollowUp.id
    };
  }

  const readyApplication = applicationSummaries.find(
    (summary) => summary.readiness.status === "ready_to_export"
  );
  if (readyApplication) {
    return {
      kind: "open_application",
      title: readyApplication.card.title,
      why: readyApplication.readiness.nextTinyResumeAction,
      ctaLabel: "Open and export resume",
      href: `/card/${readyApplication.card.id}`,
      cardId: readyApplication.card.id
    };
  }

  const needsResume = applicationSummaries.find(
    (summary) =>
      summary.readiness.status === "blocked" || summary.readiness.status === "needs_patch"
  );
  if (needsResume) {
    return {
      kind: "improve_resume",
      title: needsResume.card.title,
      why: needsResume.readiness.nextTinyResumeAction,
      ctaLabel: "Fix resume blockers",
      href: `/card/${needsResume.card.id}`,
      cardId: needsResume.card.id
    };
  }

  const hasRunnableSources = batchLifecycle.runnableCount > 0;
  const hasInMotionApplications = applicationSummaries.length > 0;
  const hasWaitingCandidates = buildJobFindingsCounts(input.jobCandidates).waiting > 0;

  if (!hasWaitingCandidates && !hasInMotionApplications && !hasRunnableSources) {
    return {
      kind: "paste_job",
      title: "Paste one job posting",
      why: "Paste one posting to start the review queue — sources can wait.",
      ctaLabel: "Paste a job",
      href: "/candidate-intake"
    };
  }

  return {
    kind: "maintain",
    title: "You're caught up for now",
    why: "Nothing urgent right now. Check back when a source is due or a match lands.",
    ctaLabel: "All clear"
  };
}

export function buildCareerMorningLoop(input: CareerMorningLoopInput): CareerMorningLoopSummary {
  const isBatchRunning = input.isBatchRunning ?? false;
  const enabled = enabledSources(input.jobSources);
  const batchLifecycle = deriveBatchRunnerLifecycle(
    input.jobSources,
    input.jobSourceRuns,
    input.jobCandidates,
    input.now,
    { isBatchRunning }
  );
  const applicationSummaries = buildApplicationSummaries(input);
  const readyApplicationCount = applicationSummaries.filter(
    (summary) => summary.readiness.status === "ready_to_export"
  ).length;
  const needsResumeCount = applicationSummaries.filter(
    (summary) =>
      summary.readiness.status === "blocked" || summary.readiness.status === "needs_patch"
  ).length;
  const failedSourceCount = countFailedEnabledSources(
    input.jobSources,
    input.jobSourceRuns,
    input.jobCandidates,
    input.now,
    isBatchRunning
  );
  const staleSourceCount = countStaleEnabledSources(
    input.jobSources,
    input.jobSourceRuns,
    input.jobCandidates,
    input.now
  );
  const waitingCandidateCount = buildJobFindingsCounts(input.jobCandidates).waiting;
  const failedRunnableCount = countFailedRunnableSources(
    input.jobSources,
    input.jobSourceRuns,
    input.jobCandidates,
    input.now,
    isBatchRunning
  );

  const status: CareerMorningLoopStatus = {
    dueSourceCount: batchLifecycle.dueCount,
    failedSourceCount,
    staleSourceCount,
    waitingCandidateCount,
    readyApplicationCount,
    needsResumeCount,
    resumeReadinessLine: formatResumeReadinessLine(readyApplicationCount, needsResumeCount)
  };

  const nextMove = deriveNextMove(input, batchLifecycle, applicationSummaries, failedRunnableCount);
  const supportingLines = buildSupportingLines(input, applicationSummaries, readyApplicationCount);

  return {
    status,
    nextMove,
    statusStrip: formatStatusStrip(status),
    supportingLines
  };
}
