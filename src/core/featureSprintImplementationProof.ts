import {
  FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX,
  FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX,
  isImplementationProfile
} from "./featureSprintRunner";
import { parseWorkerOutputFreeTextSections, normalizeWorkerOutputEvidenceRecord } from "./featureSprintWorkerOutput";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintStep,
  HarnessFeatureSprintStepImplementationProof,
  HarnessFeatureSprintStepImplementationProofRunnerEvidence,
  HarnessFeatureSprintVerificationProofResult,
  HarnessFeatureSprintWorkerOutputEvidence
} from "./types";

export const FEATURE_SPRINT_REVIEW_PACKET_MAX_FILES = 20;
export const FEATURE_SPRINT_REVIEW_PACKET_MAX_BULLETS = 12;
export const FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX = 4_000;
export const FEATURE_SPRINT_PROOF_VERIFICATION_SUMMARY_MAX = 5;

const DEFAULT_BEHAVIOR_CHANGED = ["See raw implementation output."];

function cleanStringList(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function capText(value: string | undefined, max: number): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}\n[truncated]`;
}

export function resolveLatestImplementationRunForStep(
  data: LifeHarnessData,
  planId: string,
  stepId: string
): HarnessFeatureSprintRunnerRun | undefined {
  return [...data.featureSprintRunnerRuns]
    .filter(
      (run) =>
        run.planId === planId &&
        run.stepId === stepId &&
        isImplementationProfile(run.profile) &&
        (run.status === "succeeded" || run.status === "failed")
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

export type ManualImplementationOutputSections = {
  filesChanged: string[];
  testsRun: string[];
  parseIncomplete: boolean;
};

export function parseManualImplementationOutputSections(
  rawOutput: string
): ManualImplementationOutputSections {
  const sections = parseWorkerOutputFreeTextSections(rawOutput);
  const filesChanged = sections.changedFiles;
  const testsRun = [...new Set([...sections.testsRun, ...sections.verificationCommands])];
  const parseIncomplete =
    filesChanged.length === 0 && testsRun.length === 0 && rawOutput.trim().length > 0;

  return { filesChanged, testsRun, parseIncomplete };
}

export function summarizeVerificationProofResult(
  run: HarnessFeatureSprintRunnerRun | undefined
): HarnessFeatureSprintVerificationProofResult {
  if (!run) {
    return "not_run";
  }

  if (run.status === "failed") {
    return "fail";
  }

  const results = run.verificationResults ?? [];
  if (results.length === 0) {
    return "not_run";
  }

  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const skipped = results.filter((item) => item.status === "skipped").length;

  if (failed > 0) {
    return "fail";
  }
  if (passed > 0 && skipped > 0) {
    return "partial";
  }
  if (passed > 0) {
    return "pass";
  }
  if (skipped > 0) {
    return "partial";
  }

  return "not_run";
}

export function buildRunnerEvidenceSnapshot(
  run: HarnessFeatureSprintRunnerRun | undefined
): HarnessFeatureSprintStepImplementationProofRunnerEvidence | undefined {
  if (!run) {
    return undefined;
  }

  const verificationSummary = (run.verificationResults ?? [])
    .slice(0, FEATURE_SPRINT_PROOF_VERIFICATION_SUMMARY_MAX)
    .map((item) => {
      const parts = [`${item.command}: ${item.status}`];
      if (item.error?.trim()) {
        parts.push(item.error.trim());
      }
      return parts.join(" — ");
    });

  const snapshot: HarnessFeatureSprintStepImplementationProofRunnerEvidence = {
    diffStat: capText(run.diffStat, FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX),
    gitStatus: capText(run.gitStatus, FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX),
    verificationSummary: verificationSummary.length > 0 ? verificationSummary : undefined,
    sprintId: run.sprintId,
    storyId: run.storyId,
    taskId: run.taskId,
    mapPhase: run.mapPhase
  };

  if (
    !snapshot.diffStat &&
    !snapshot.gitStatus &&
    !snapshot.verificationSummary?.length &&
    !snapshot.sprintId &&
    !snapshot.storyId &&
    !snapshot.taskId &&
    !snapshot.mapPhase
  ) {
    return undefined;
  }

  return snapshot;
}

export type BuildImplementationProofInput = {
  rawOutput: string;
  step: HarnessFeatureSprintStep;
  projectVerificationCommands: string[];
  matchingRun?: HarnessFeatureSprintRunnerRun;
  timestamp: string;
  existingProof?: HarnessFeatureSprintStepImplementationProof;
  workerOutputEvidence?: HarnessFeatureSprintWorkerOutputEvidence;
};

export function buildImplementationProofFromSources(
  input: BuildImplementationProofInput
): HarnessFeatureSprintStepImplementationProof {
  const rawOutput = input.rawOutput.trim();
  const manual = parseManualImplementationOutputSections(rawOutput);
  const worker = input.workerOutputEvidence ?? input.step.workerOutputEvidence;
  const run = input.matchingRun;

  let filesChanged = cleanStringList(run?.changedFiles);
  if (filesChanged.length === 0 && input.existingProof?.filesChanged?.length) {
    filesChanged = cleanStringList(input.existingProof.filesChanged);
  }
  if (filesChanged.length === 0) {
    filesChanged = cleanStringList(worker?.changedFiles);
  }
  if (filesChanged.length === 0) {
    filesChanged = manual.filesChanged;
  }

  let testsRun = cleanStringList(
    (run?.verificationResults ?? [])
      .filter((item) => item.status === "passed")
      .map((item) => item.command)
  );
  if (testsRun.length === 0 && input.existingProof?.testsRun?.length) {
    testsRun = cleanStringList(input.existingProof.testsRun);
  }
  if (testsRun.length === 0) {
    testsRun = cleanStringList([
      ...(worker?.testsRun ?? []),
      ...(worker?.verificationCommands ?? [])
    ]);
  }
  if (testsRun.length === 0) {
    testsRun = manual.testsRun;
  }

  const projectCommands = cleanStringList(input.projectVerificationCommands);
  const testsNotRun = projectCommands.filter((command) => !testsRun.includes(command));
  const verificationResult = summarizeVerificationProofResult(run);

  const knownRisks = cleanStringList(input.step.promptAudit?.risks);
  if (run?.status === "failed") {
    knownRisks.push(
      run.error?.trim()
        ? `Latest implementation runner run failed: ${run.error.trim()}`
        : "Latest implementation runner run failed."
    );
  }
  if (!run) {
    knownRisks.push("No matching implementation runner run for this step.");
  }
  if (manual.parseIncomplete && filesChanged.length === 0 && testsRun.length === 0) {
    knownRisks.push("Manual output parsing may be incomplete.");
  }
  if (verificationResult === "not_run" && projectCommands.length > 0) {
    knownRisks.push("Verification was not run or not captured.");
  }
  knownRisks.push(
    ...(worker?.warnings ?? []),
    ...(worker?.risks ?? []),
    ...(worker?.knownLimitations ?? []),
    ...(worker?.scopeNotes ?? [])
  );

  const behaviorChanged =
    input.existingProof?.behaviorChanged?.length &&
    input.existingProof.behaviorChanged.some(
      (item) => item.trim() && item !== DEFAULT_BEHAVIOR_CHANGED[0]
    )
      ? cleanStringList(input.existingProof.behaviorChanged)
      : worker?.summary?.trim()
        ? [worker.summary.trim()]
        : DEFAULT_BEHAVIOR_CHANGED;

  const suggestedReviewFocus = [...input.step.acceptanceCriteria];
  if (input.step.promptAudit?.verdict === "tighten_first") {
    suggestedReviewFocus.push("Prompt audit was tighten_first — confirm scope stayed bounded.");
  }
  if (filesChanged.length > 0) {
    suggestedReviewFocus.push(`Review ${filesChanged.length} changed file(s) for scope creep.`);
  }
  if (worker?.withinScope === false) {
    suggestedReviewFocus.push("Worker reported possible scope drift or incomplete work.");
  }
  if (suggestedReviewFocus.length === 0) {
    suggestedReviewFocus.push("Confirm behavior matches step acceptance criteria.");
  }

  const createdAt = input.existingProof?.createdAt ?? input.timestamp;
  const runnerEvidence = buildRunnerEvidenceSnapshot(run);
  const workerDiffStat = worker?.diffStat?.trim();
  const mergedRunnerEvidence =
    runnerEvidence || workerDiffStat
      ? {
          ...runnerEvidence,
          diffStat: runnerEvidence?.diffStat ?? workerDiffStat
        }
      : undefined;

  const workerOutputEvidence = worker
    ? {
        ...worker,
        rawOutput: worker.rawOutput.trim() || rawOutput
      }
    : undefined;

  return {
    rawOutput,
    filesChanged,
    behaviorChanged,
    testsRun,
    testsNotRun: testsNotRun.length > 0 ? testsNotRun : projectCommands,
    verificationResult,
    knownRisks: [...new Set(knownRisks.map((item) => item.trim()).filter(Boolean))],
    suggestedReviewFocus: [...new Set(suggestedReviewFocus)],
    sourceRunnerRunId: run?.id,
    runnerEvidence: mergedRunnerEvidence,
    workerOutputEvidence,
    createdAt,
    updatedAt: input.timestamp
  };
}

export function capStringListForReviewPacket(
  items: string[],
  maxItems: number
): { lines: string[]; truncated: boolean } {
  const cleaned = cleanStringList(items);
  if (cleaned.length <= maxItems) {
    return { lines: cleaned, truncated: false };
  }
  return {
    lines: [...cleaned.slice(0, maxItems), `… and ${cleaned.length - maxItems} more`],
    truncated: true
  };
}

export function capRawOutputExcerptForReviewPacket(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (trimmed.length <= FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, FEATURE_SPRINT_REVIEW_PACKET_RAW_EXCERPT_MAX)}\n\n[raw output truncated for review packet]`;
}

export function normalizeImplementationProofRecord(
  proof: HarnessFeatureSprintStepImplementationProof | undefined
): HarnessFeatureSprintStepImplementationProof | undefined {
  if (!proof?.rawOutput?.trim()) {
    return undefined;
  }

  return {
    ...proof,
    rawOutput: proof.rawOutput.trim(),
    filesChanged: cleanStringList(proof.filesChanged),
    behaviorChanged: cleanStringList(proof.behaviorChanged),
    testsRun: cleanStringList(proof.testsRun),
    testsNotRun: cleanStringList(proof.testsNotRun),
    knownRisks: cleanStringList(proof.knownRisks),
    suggestedReviewFocus: cleanStringList(proof.suggestedReviewFocus),
    runnerEvidence: proof.runnerEvidence
      ? {
          diffStat: capText(proof.runnerEvidence.diffStat, FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX),
          gitStatus: capText(proof.runnerEvidence.gitStatus, FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX),
          verificationSummary: cleanStringList(proof.runnerEvidence.verificationSummary).slice(
            0,
            FEATURE_SPRINT_PROOF_VERIFICATION_SUMMARY_MAX
          )
        }
      : undefined,
    workerOutputEvidence: proof.workerOutputEvidence
      ? normalizeWorkerOutputEvidenceRecord(proof.workerOutputEvidence)
      : undefined
  };
}
