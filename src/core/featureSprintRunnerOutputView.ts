import {
  FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX,
  formatRunnerResultUsabilityLabel,
  isDiffTextTruncated,
  isImplementationProfile,
  summarizeVerificationResults,
  type FeatureSprintRunnerProfile
} from "./featureSprintRunner";
import { FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX } from "./featureSprintRunnerHistory";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintRunnerRun } from "./types";

export const FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_NOTICE = `Diff truncated at ${FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX.toLocaleString()} characters.`;
export const FEATURE_SPRINT_RUNNER_OUTPUT_TRUNCATION_NOTICE = `Output truncated at ${FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX.toLocaleString()} characters.`;
export const FEATURE_SPRINT_RUNNER_DIFF_FALLBACK_MESSAGE =
  "Full diff was not captured; see changed files and worktree.";

export type FeatureSprintRunnerOutputView = {
  runId: string;
  profile: FeatureSprintRunnerProfile;
  status: string;
  cardId?: string;
  planId?: string;
  stepId?: string;
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  mapPhase?: string;
  startedAt: string;
  completedAt?: string;
  importedAt?: string;

  worktreePath?: string;
  branchName?: string;

  outputText?: string;
  outputExcerpt?: string;
  outputTruncated: boolean;

  gitStatus?: string;
  diffStat?: string;
  diffText?: string;
  diffTruncated: boolean;
  showDiffFallback: boolean;
  changedFiles: string[];

  verificationSummary: string;
  verificationResults: {
    command: string;
    status: string;
    error?: string;
    stderrExcerpt?: string;
    stdoutExcerpt?: string;
  }[];
  verificationFailures: {
    command: string;
    error?: string;
    stderrExcerpt?: string;
    stdoutExcerpt?: string;
  }[];

  terminationReason?: string;
  failureClass?: string;
  resultUsability?: string;
  timedOut?: boolean;
  cancelled?: boolean;
  diagnosticMessage?: string;
  usabilityLabel?: string;

  worktreeCleanedAt?: string;
  worktreeCleanupStatus?: string;
  worktreeCleanupMessage?: string;
  canCleanWorktree: boolean;

  safetyNotes: string[];
};

export const FEATURE_SPRINT_WORKTREE_CLEANUP_HELPER =
  "Normal cleanup checks safety first. Worktrees with changes require Force clean after inspection.";

export const FEATURE_SPRINT_WORKTREE_FORCE_CLEAN_HELPER =
  "Force clean deletes uncommitted worktree changes. Inspect output/diff first.";

function buildSafetyNotes(
  profile: FeatureSprintRunnerProfile,
  cleanedAt?: string
): string[] {
  if (isImplementationProfile(profile)) {
    const notes = [
      "This run used an isolated worktree.",
      "No commit, merge, or push is performed by Life Harness.",
      "Save agent output is still manual.",
      "Verification failures do not auto-reject; review the output."
    ];
    if (cleanedAt) {
      notes.push("Worktree was cleaned; history/output remains in Life Harness.");
    } else {
      notes.push("Inspect and save/review before cleaning the worktree.");
    }
    return notes;
  }

  return ["Runner output is advisory only.", "Import and save steps remain manual."];
}

function mapRun(run: HarnessFeatureSprintRunnerRun): FeatureSprintRunnerOutputView {
  const changedFiles = run.changedFiles ?? [];
  const diffText = run.diffText?.trim() || undefined;
  const outputText = run.outputText?.trim() || undefined;

  return {
    runId: run.id,
    profile: run.profile,
    status: run.status,
    cardId: run.cardId,
    planId: run.planId,
    stepId: run.stepId,
    sprintId: run.sprintId,
    storyId: run.storyId,
    taskId: run.taskId,
    mapPhase: run.mapPhase,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    importedAt: run.importedAt,
    worktreePath: run.worktreePath,
    branchName: run.branchName,
    outputText,
    outputExcerpt: run.outputExcerpt,
    outputTruncated: outputText?.length === FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX,
    gitStatus: run.gitStatus,
    diffStat: run.diffStat,
    diffText,
    diffTruncated: isDiffTextTruncated(diffText),
    showDiffFallback: changedFiles.length > 0 && !diffText,
    changedFiles,
    verificationSummary: summarizeVerificationResults(run.verificationResults),
    verificationResults: (run.verificationResults ?? []).map((row) => ({
      command: row.command,
      status: row.status,
      error: row.error,
      stderrExcerpt: row.stderrExcerpt,
      stdoutExcerpt: row.stdoutExcerpt
    })),
    verificationFailures: (run.verificationResults ?? [])
      .filter((row) => row.status === "failed")
      .map((row) => ({
        command: row.command,
        error: row.error,
        stderrExcerpt: row.stderrExcerpt,
        stdoutExcerpt: row.stdoutExcerpt
      })),
    terminationReason: run.terminationReason,
    failureClass: run.failureClass,
    resultUsability: run.resultUsability,
    timedOut: run.timedOut,
    cancelled: run.cancelled,
    diagnosticMessage: run.diagnosticMessage,
    usabilityLabel: formatRunnerResultUsabilityLabel(run),
    worktreeCleanedAt: run.worktreeCleanedAt,
    worktreeCleanupStatus: run.worktreeCleanupStatus,
    worktreeCleanupMessage: run.worktreeCleanupMessage,
    canCleanWorktree:
      isImplementationProfile(run.profile) &&
      Boolean(run.worktreePath?.trim()) &&
      !run.worktreeCleanedAt,
    safetyNotes: buildSafetyNotes(run.profile, run.worktreeCleanedAt)
  };
}

export function buildFeatureSprintRunnerOutputView(
  data: LifeHarnessData,
  runId: string
): FeatureSprintRunnerOutputView | undefined {
  const run = data.featureSprintRunnerRuns.find((item) => item.id === runId);
  if (!run) {
    return undefined;
  }

  return mapRun(run);
}
