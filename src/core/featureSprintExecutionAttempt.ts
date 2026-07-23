import type { LifeHarnessData } from "./lifeHarnessData";
import { createId, nowIso } from "./ids";
import type {
  FeatureSprintRunnerAttemptBinding,
  FeatureSprintRunnerProfile,
  FeatureSprintRunnerResponse
} from "./featureSprintRunner";
import type {
  HarnessFeatureSprintExecutionAttempt,
  HarnessFeatureSprintExecutionAttemptStatus
} from "./types";

export const MAX_FEATURE_SPRINT_EXECUTION_ATTEMPTS = 40;

export const OPEN_FEATURE_SPRINT_ATTEMPT_STATUSES: readonly HarnessFeatureSprintExecutionAttemptStatus[] =
  [
    "claimed",
    "launching",
    "running",
    "response_received",
    "failed",
    "ambiguous"
  ] as const;

export type FeatureSprintAttemptBinding = FeatureSprintRunnerAttemptBinding;

export type ClaimFeatureSprintExecutionAttemptInput = FeatureSprintAttemptBinding & {
  now?: string;
  attemptId?: string;
};

export type ClaimFeatureSprintExecutionAttemptResult =
  | {
      ok: true;
      state: LifeHarnessData;
      attempt: HarnessFeatureSprintExecutionAttempt;
    }
  | { ok: false; error: string; existingAttempt?: HarnessFeatureSprintExecutionAttempt };

function isOpenStatus(status: HarnessFeatureSprintExecutionAttemptStatus): boolean {
  return (OPEN_FEATURE_SPRINT_ATTEMPT_STATUSES as readonly string[]).includes(status);
}

export function listFeatureSprintExecutionAttempts(
  data: LifeHarnessData
): HarnessFeatureSprintExecutionAttempt[] {
  return data.featureSprintExecutionAttempts ?? [];
}

export function getFeatureSprintExecutionAttempt(
  data: LifeHarnessData,
  attemptId: string
): HarnessFeatureSprintExecutionAttempt | undefined {
  return listFeatureSprintExecutionAttempts(data).find((row) => row.attemptId === attemptId);
}

export function getOpenFeatureSprintExecutionAttemptForPlan(
  data: LifeHarnessData,
  planId: string
): HarnessFeatureSprintExecutionAttempt | undefined {
  return listFeatureSprintExecutionAttempts(data).find(
    (row) => row.planId === planId && isOpenStatus(row.status)
  );
}

export function getOpenFeatureSprintExecutionAttemptForAction(
  data: LifeHarnessData,
  planId: string,
  actionId: string
): HarnessFeatureSprintExecutionAttempt | undefined {
  return listFeatureSprintExecutionAttempts(data).find(
    (row) => row.planId === planId && row.actionId === actionId && isOpenStatus(row.status)
  );
}

function replaceAttempt(
  data: LifeHarnessData,
  attempt: HarnessFeatureSprintExecutionAttempt
): LifeHarnessData {
  const existing = listFeatureSprintExecutionAttempts(data);
  const without = existing.filter((row) => row.attemptId !== attempt.attemptId);
  const next = [attempt, ...without].slice(0, MAX_FEATURE_SPRINT_EXECUTION_ATTEMPTS);
  return { ...data, featureSprintExecutionAttempts: next };
}

export function claimFeatureSprintExecutionAttempt(
  data: LifeHarnessData,
  input: ClaimFeatureSprintExecutionAttemptInput
): ClaimFeatureSprintExecutionAttemptResult {
  const planId = input.planId.trim();
  const actionId = input.actionId.trim();
  if (!planId || !actionId) {
    return { ok: false, error: "planId and actionId are required to claim an attempt." };
  }
  if (!Number.isFinite(input.stateRevision) || input.stateRevision < 0) {
    return { ok: false, error: "stateRevision must be a non-negative number." };
  }

  const openForAction = getOpenFeatureSprintExecutionAttemptForAction(data, planId, actionId);
  if (openForAction) {
    return {
      ok: false,
      error: "An open execution attempt already exists for this legal action.",
      existingAttempt: openForAction
    };
  }

  const openForPlan = getOpenFeatureSprintExecutionAttemptForPlan(data, planId);
  if (openForPlan) {
    return {
      ok: false,
      error: "An open execution attempt already exists for this plan.",
      existingAttempt: openForPlan
    };
  }

  const timestamp = input.now ?? nowIso();
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    attemptId: input.attemptId?.trim() || createId("fs_attempt"),
    planId,
    actionId,
    stateRevision: Math.floor(input.stateRevision),
    profile: input.profile,
    status: "claimed",
    claimedAt: timestamp,
    updatedAt: timestamp,
    cardId: input.cardId?.trim() || undefined,
    stepId: input.stepId?.trim() || undefined,
    taskId: input.taskId?.trim() || undefined,
    phase: input.phase?.trim() || undefined,
    clarifiedSpecRevision:
      input.clarifiedSpecRevision !== undefined && Number.isFinite(input.clarifiedSpecRevision)
        ? Math.floor(input.clarifiedSpecRevision)
        : undefined
  };

  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function markFeatureSprintExecutionAttemptLaunching(
  data: LifeHarnessData,
  attemptId: string,
  now = nowIso()
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status !== "claimed" && existing.status !== "launching") {
    return { ok: false, error: `Cannot mark launching from status ${existing.status}.` };
  }
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: "launching",
    launchedAt: existing.launchedAt ?? now,
    updatedAt: now
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function markFeatureSprintExecutionAttemptRunning(
  data: LifeHarnessData,
  attemptId: string,
  now = nowIso()
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (
    existing.status !== "claimed" &&
    existing.status !== "launching" &&
    existing.status !== "running"
  ) {
    return { ok: false, error: `Cannot mark running from status ${existing.status}.` };
  }
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: "running",
    launchedAt: existing.launchedAt ?? now,
    updatedAt: now
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function attachFeatureSprintExecutionAttemptResponse(
  data: LifeHarnessData,
  attemptId: string,
  response: FeatureSprintRunnerResponse,
  options: { runnerRunId?: string; now?: string } = {}
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status === "reconciled" || existing.status === "abandoned") {
    return { ok: false, error: `Cannot attach response to ${existing.status} attempt.` };
  }

  const now = options.now ?? nowIso();
  const ambiguousTransport = isAmbiguousTransportFailure(response);
  const ambiguousInterrupted =
    !response.ok &&
    typeof response.error === "string" &&
    /not respawned/i.test(response.error);
  const ambiguous = ambiguousTransport || ambiguousInterrupted;
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: response.ok ? "response_received" : ambiguous ? "ambiguous" : "failed",
    responseReceivedAt: response.ok ? now : existing.responseReceivedAt ?? (ambiguous ? undefined : now),
    updatedAt: now,
    runnerRunId: options.runnerRunId ?? response.runId ?? existing.runnerRunId,
    result: ambiguousTransport ? existing.result : response,
    failure: response.ok
      ? undefined
      : {
          message: response.error ?? response.diagnosticMessage ?? "Runner attempt failed.",
          failureClass: response.failureClass,
          terminationReason: response.terminationReason
        }
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

/**
 * Client-synthesized transport failures lack runner envelope fields.
 * Treat as ambiguous so the user must Check status instead of abandon+retry while a provider may still run.
 */
export function isAmbiguousTransportFailure(response: FeatureSprintRunnerResponse): boolean {
  if (response.ok) {
    return false;
  }
  if (response.runId || response.terminationReason || response.resultUsability || response.failureClass) {
    return false;
  }
  return true;
}

export function markFeatureSprintExecutionAttemptAmbiguous(
  data: LifeHarnessData,
  attemptId: string,
  reason: string,
  now = nowIso()
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status === "reconciled" || existing.status === "abandoned") {
    return { ok: false, error: `Cannot mark ${existing.status} attempt ambiguous.` };
  }
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: "ambiguous",
    updatedAt: now,
    failure: {
      message: reason,
      failureClass: existing.failure?.failureClass,
      terminationReason: existing.failure?.terminationReason
    }
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function abandonFeatureSprintExecutionAttempt(
  data: LifeHarnessData,
  attemptId: string,
  now = nowIso()
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status === "reconciled") {
    return { ok: false, error: "Reconciled attempts cannot be abandoned." };
  }
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: "abandoned",
    abandonedAt: now,
    updatedAt: now
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function reconcileFeatureSprintExecutionAttempt(
  data: LifeHarnessData,
  attemptId: string,
  now = nowIso()
): { ok: true; state: LifeHarnessData; attempt: HarnessFeatureSprintExecutionAttempt } | { ok: false; error: string } {
  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status !== "response_received") {
    return {
      ok: false,
      error: "Only attempts with a persisted response can be reconciled."
    };
  }
  const attempt: HarnessFeatureSprintExecutionAttempt = {
    ...existing,
    status: "reconciled",
    reconciledAt: now,
    updatedAt: now
  };
  return { ok: true, state: replaceAttempt(data, attempt), attempt };
}

export function buildAttemptBindingFromAttempt(
  attempt: HarnessFeatureSprintExecutionAttempt
): FeatureSprintAttemptBinding {
  return {
    planId: attempt.planId,
    actionId: attempt.actionId,
    stateRevision: attempt.stateRevision,
    profile: attempt.profile,
    cardId: attempt.cardId,
    stepId: attempt.stepId,
    taskId: attempt.taskId,
    phase: attempt.phase,
    clarifiedSpecRevision: attempt.clarifiedSpecRevision
  };
}
