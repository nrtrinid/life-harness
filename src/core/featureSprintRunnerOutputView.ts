import {
  FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX,
  isDiffTextTruncated,
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

  safetyNotes: string[];
};

function buildSafetyNotes(profile: FeatureSprintRunnerProfile): string[] {
  if (profile === "codex_implementation") {
    return [
      "This run used an isolated worktree.",
      "No commit, merge, or push is performed by Life Harness.",
      "Save agent output is still manual.",
      "Verification failures do not auto-reject; review the output."
    ];
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
    safetyNotes: buildSafetyNotes(run.profile)
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
