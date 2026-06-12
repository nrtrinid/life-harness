import { shouldIncludeCard } from "./contextPacketRedaction";
import {
  capGitMetadataFields,
  capVerificationResults,
  type FeatureSprintRunnerProfile,
  type FeatureSprintRunnerResponse
} from "./featureSprintRunner";
import { createId, nowIso } from "./ids";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintRunnerRunStatus
} from "./types";

export const FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX = 50_000;
export const FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_EXCERPT_MAX = 280;

export type FeatureSprintRunnerRunResult =
  | { ok: true; state: LifeHarnessData; runId: string }
  | { ok: false; error: string; safetyBlocked?: boolean };

export type FeatureSprintRunnerRunCreateInput = {
  profile: FeatureSprintRunnerProfile;
  cardId?: string;
  planId?: string;
  stepId?: string;
  repoPath?: string;
  commandPreview?: string;
  startedAt?: string;
};

export type FeatureSprintRunnerRunImportMarkFilter = {
  cardId: string;
  profile: FeatureSprintRunnerProfile;
  planId?: string;
  stepId?: string;
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildStoredOutputFields(outputText?: string): {
  outputText?: string;
  outputExcerpt?: string;
} {
  if (!outputText) {
    return {};
  }

  const capped =
    outputText.length > FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX
      ? outputText.slice(0, FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX)
      : outputText;
  const excerpt =
    capped.length > FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_EXCERPT_MAX
      ? `${capped.slice(0, FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_EXCERPT_MAX)}…`
      : capped;

  return { outputText: capped, outputExcerpt: excerpt };
}

export function isFeatureSprintRunnerHistorySafetyBlocked(
  result: FeatureSprintRunnerRunResult
): boolean {
  return !result.ok && result.safetyBlocked === true;
}

function validateCreateInput(
  data: LifeHarnessData,
  input: FeatureSprintRunnerRunCreateInput
): { ok: true } | { ok: false; error: string; safetyBlocked: boolean } {
  if (input.cardId) {
    const card = data.cards.find((item) => item.id === input.cardId);
    if (!card) {
      return {
        ok: false,
        error: `Card not found: ${input.cardId}`,
        safetyBlocked: true
      };
    }
    if (!shouldIncludeCard(card)) {
      return {
        ok: false,
        error: "S3 cards cannot use feature sprint runner history.",
        safetyBlocked: true
      };
    }
  }

  if (input.planId) {
    const plan = data.featureSprintPlans.find((item) => item.id === input.planId);
    if (!plan) {
      return {
        ok: false,
        error: `Plan not found: ${input.planId}`,
        safetyBlocked: true
      };
    }
    if (input.cardId && plan.cardId !== input.cardId) {
      return {
        ok: false,
        error: `Plan does not belong to card: ${input.planId}`,
        safetyBlocked: true
      };
    }
    if (input.stepId) {
      const step = plan.steps.find((item) => item.id === input.stepId);
      if (!step) {
        return {
          ok: false,
          error: `Step not found: ${input.stepId}`,
          safetyBlocked: true
        };
      }
    }
  } else if (input.stepId) {
    return {
      ok: false,
      error: "stepId requires planId.",
      safetyBlocked: true
    };
  }

  return { ok: true };
}

function sortRunsNewestFirst(
  runs: HarnessFeatureSprintRunnerRun[]
): HarnessFeatureSprintRunnerRun[] {
  return [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function getFeatureSprintRunnerRunsForCard(
  data: LifeHarnessData,
  cardId: string,
  limit = 5
): HarnessFeatureSprintRunnerRun[] {
  return sortRunsNewestFirst(data.featureSprintRunnerRuns.filter((run) => run.cardId === cardId)).slice(
    0,
    limit
  );
}

export function getFeatureSprintRunnerRunsForPlan(
  data: LifeHarnessData,
  planId: string,
  limit = 5
): HarnessFeatureSprintRunnerRun[] {
  return sortRunsNewestFirst(data.featureSprintRunnerRuns.filter((run) => run.planId === planId)).slice(
    0,
    limit
  );
}

export function createFeatureSprintRunnerRun(
  data: LifeHarnessData,
  input: FeatureSprintRunnerRunCreateInput,
  now: string = nowIso()
): FeatureSprintRunnerRunResult {
  const validation = validateCreateInput(data, input);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      safetyBlocked: validation.safetyBlocked
    };
  }

  const startedAt = input.startedAt ?? now;
  const run: HarnessFeatureSprintRunnerRun = {
    id: createId("feature_runner_run"),
    profile: input.profile,
    status: "running",
    cardId: input.cardId,
    planId: input.planId,
    stepId: input.stepId,
    repoPath: cleanOptional(input.repoPath),
    commandPreview: cleanOptional(input.commandPreview),
    startedAt,
    createdAt: now,
    updatedAt: now
  };

  return {
    ok: true,
    runId: run.id,
    state: {
      ...data,
      featureSprintRunnerRuns: [run, ...data.featureSprintRunnerRuns]
    }
  };
}

export function completeFeatureSprintRunnerRun(
  data: LifeHarnessData,
  runId: string,
  response: FeatureSprintRunnerResponse,
  now: string = nowIso()
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  const existing = data.featureSprintRunnerRuns.find((run) => run.id === runId);
  if (!existing) {
    return { ok: false, error: `Runner run not found: ${runId}` };
  }

  const status: HarnessFeatureSprintRunnerRunStatus = response.ok ? "succeeded" : "failed";
  const outputFields = response.ok ? buildStoredOutputFields(response.outputText) : {};
  const metadata = capGitMetadataFields(response);

  const updated: HarnessFeatureSprintRunnerRun = {
    ...existing,
    status,
    commandPreview: cleanOptional(response.commandPreview) ?? existing.commandPreview,
    exitCode: response.exitCode,
    error: cleanOptional(response.error),
    ...outputFields,
    worktreePath: cleanOptional(metadata.worktreePath),
    branchName: cleanOptional(metadata.branchName),
    gitStatus: cleanOptional(metadata.gitStatus),
    diffStat: cleanOptional(metadata.diffStat),
    changedFiles: metadata.changedFiles,
    diffText: cleanOptional(metadata.diffText),
    verificationResults: capVerificationResults(metadata.verificationResults),
    completedAt: response.completedAt,
    updatedAt: now
  };

  return {
    ok: true,
    state: {
      ...data,
      featureSprintRunnerRuns: data.featureSprintRunnerRuns.map((run) =>
        run.id === runId ? updated : run
      )
    }
  };
}

export function markFeatureSprintRunnerRunImported(
  data: LifeHarnessData,
  runId: string,
  now: string = nowIso()
): { ok: true; state: LifeHarnessData } | { ok: false; error: string } {
  const existing = data.featureSprintRunnerRuns.find((run) => run.id === runId);
  if (!existing) {
    return { ok: false, error: `Runner run not found: ${runId}` };
  }

  const updated: HarnessFeatureSprintRunnerRun = {
    ...existing,
    importedAt: now,
    updatedAt: now
  };

  return {
    ok: true,
    state: {
      ...data,
      featureSprintRunnerRuns: data.featureSprintRunnerRuns.map((run) =>
        run.id === runId ? updated : run
      )
    }
  };
}

function matchesImportMarkFilter(
  run: HarnessFeatureSprintRunnerRun,
  filter: FeatureSprintRunnerRunImportMarkFilter
): boolean {
  if (run.cardId !== filter.cardId) {
    return false;
  }
  if (run.profile !== filter.profile) {
    return false;
  }
  if (filter.planId !== undefined && run.planId !== filter.planId) {
    return false;
  }
  if (filter.stepId !== undefined && run.stepId !== filter.stepId) {
    return false;
  }
  return true;
}

export function markMostRecentFeatureSprintRunnerRunImported(
  data: LifeHarnessData,
  filter: FeatureSprintRunnerRunImportMarkFilter,
  now: string = nowIso()
): { ok: true; state: LifeHarnessData; runId?: string } | { ok: false; error: string } {
  const candidate = sortRunsNewestFirst(data.featureSprintRunnerRuns).find(
    (run) =>
      matchesImportMarkFilter(run, filter) &&
      run.status === "succeeded" &&
      !run.importedAt
  );

  if (!candidate) {
    return { ok: true, state: data };
  }

  const marked = markFeatureSprintRunnerRunImported(data, candidate.id, now);
  if (!marked.ok) {
    return marked;
  }

  return { ok: true, state: marked.state, runId: candidate.id };
}

export function deleteFeatureSprintRunnerRun(
  data: LifeHarnessData,
  runId: string
): LifeHarnessData {
  return {
    ...data,
    featureSprintRunnerRuns: data.featureSprintRunnerRuns.filter((run) => run.id !== runId)
  };
}
