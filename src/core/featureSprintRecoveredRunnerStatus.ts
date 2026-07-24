import {
  attachFeatureSprintExecutionAttemptResponse,
  getFeatureSprintExecutionAttempt,
  isAmbiguousTransportFailure
} from "./featureSprintExecutionAttempt";
import type {
  FeatureSprintRunnerAttemptBinding,
  FeatureSprintRunnerResponse
} from "./featureSprintRunner";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun
} from "./featureSprintRunnerHistory";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintExecutionAttempt,
  HarnessFeatureSprintRunnerRun
} from "./types";

export function featureSprintAttemptBindingsEqual(
  a: FeatureSprintRunnerAttemptBinding,
  b: FeatureSprintRunnerAttemptBinding
): boolean {
  return (
    a.planId === b.planId &&
    a.actionId === b.actionId &&
    a.stateRevision === b.stateRevision &&
    a.profile === b.profile &&
    (a.cardId ?? "") === (b.cardId ?? "") &&
    (a.stepId ?? "") === (b.stepId ?? "") &&
    (a.taskId ?? "") === (b.taskId ?? "") &&
    (a.phase ?? "") === (b.phase ?? "") &&
    (a.clarifiedSpecRevision ?? null) === (b.clarifiedSpecRevision ?? null)
  );
}

/**
 * When the original POST later fails as transport loss, do not clobber a journaled
 * success already recovered via Check runner status.
 */
export function shouldPreserveRecoveredRunnerSuccess(
  attempt: HarnessFeatureSprintExecutionAttempt | undefined,
  response: FeatureSprintRunnerResponse
): boolean {
  if (!attempt || !isAmbiguousTransportFailure(response)) {
    return false;
  }
  return attempt.status === "response_received" && attempt.result?.ok === true;
}

export function shouldPreserveSucceededRunnerHistory(
  run: HarnessFeatureSprintRunnerRun | undefined,
  response: FeatureSprintRunnerResponse
): boolean {
  if (!run || !isAmbiguousTransportFailure(response)) {
    return false;
  }
  return run.status === "succeeded";
}

/**
 * Shared operation identity between durable attempts and app runner-history rows.
 * History has no attemptId/actionId/stateRevision; phase maps to mapPhase.
 *
 * Exact-ID validation: reject only when both sides present and disagree
 * (a linked historyRunId must not be discarded merely for sparse optional fields).
 *
 * Fallback matching: when the attempt constrains a field, the candidate must carry
 * the same value (missing on the row does not match).
 */
export function historyConflictsWithAttempt(
  run: HarnessFeatureSprintRunnerRun,
  attempt: HarnessFeatureSprintExecutionAttempt
): boolean {
  if (run.profile !== attempt.profile) {
    return true;
  }
  if (attempt.planId && run.planId && run.planId !== attempt.planId) {
    return true;
  }
  if (attempt.stepId && run.stepId && run.stepId !== attempt.stepId) {
    return true;
  }
  if (attempt.cardId && run.cardId && run.cardId !== attempt.cardId) {
    return true;
  }
  if (attempt.taskId && run.taskId && run.taskId !== attempt.taskId) {
    return true;
  }
  if (attempt.phase && run.mapPhase && run.mapPhase !== attempt.phase) {
    return true;
  }
  return false;
}

export function isHistoryCompatibleWithAttempt(
  run: HarnessFeatureSprintRunnerRun,
  attempt: HarnessFeatureSprintExecutionAttempt
): boolean {
  return !historyConflictsWithAttempt(run, attempt);
}

function matchesFallbackOperationIdentity(
  run: HarnessFeatureSprintRunnerRun,
  attempt: HarnessFeatureSprintExecutionAttempt
): boolean {
  if (run.profile !== attempt.profile) {
    return false;
  }
  if (attempt.planId && run.planId !== attempt.planId) {
    return false;
  }
  if (attempt.stepId && run.stepId !== attempt.stepId) {
    return false;
  }
  if (attempt.cardId && run.cardId !== attempt.cardId) {
    return false;
  }
  if (attempt.taskId && run.taskId !== attempt.taskId) {
    return false;
  }
  if (attempt.phase && run.mapPhase !== attempt.phase) {
    return false;
  }
  return true;
}

export type RunnerHistoryLookupResult =
  | { status: "found"; run: HarnessFeatureSprintRunnerRun; via: "historyRunId" | "fallback" }
  | { status: "ambiguous"; reason: "ambiguous_history_match" }
  | { status: "incompatible_history_run_id" }
  | { status: "missing" };

function collectUnfinishedFallbackCandidates(
  runs: HarnessFeatureSprintRunnerRun[],
  attempt: HarnessFeatureSprintExecutionAttempt
): HarnessFeatureSprintRunnerRun[] {
  return runs.filter((run) => {
    if (run.status !== "running" && run.status !== "failed") {
      return false;
    }
    return matchesFallbackOperationIdentity(run, attempt);
  });
}

/**
 * Locate the app runner-history row for a durable attempt.
 * Prefer validated historyRunId; otherwise require a unique unfinished compatible row.
 * Never resolves ambiguity by newest-row ordering.
 */
export function resolveRunnerHistoryForExecutionAttempt(
  data: LifeHarnessData,
  attempt: HarnessFeatureSprintExecutionAttempt
): RunnerHistoryLookupResult {
  const runs = data.featureSprintRunnerRuns ?? [];

  if (attempt.historyRunId) {
    const byId = runs.find((run) => run.id === attempt.historyRunId);
    if (byId) {
      if (historyConflictsWithAttempt(byId, attempt)) {
        return { status: "incompatible_history_run_id" };
      }
      return { status: "found", run: byId, via: "historyRunId" };
    }
    // Exact id absent from collection — fall through to unfinished candidates only.
  }

  const candidates = collectUnfinishedFallbackCandidates(runs, attempt);
  if (candidates.length === 1) {
    return { status: "found", run: candidates[0]!, via: "fallback" };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", reason: "ambiguous_history_match" };
  }
  return { status: "missing" };
}

/** Convenience for callers that only need a uniquely resolved row (exact or unique unfinished). */
export function findRunnerHistoryForExecutionAttempt(
  data: LifeHarnessData,
  attempt: HarnessFeatureSprintExecutionAttempt
): HarnessFeatureSprintRunnerRun | undefined {
  const resolved = resolveRunnerHistoryForExecutionAttempt(data, attempt);
  return resolved.status === "found" ? resolved.run : undefined;
}

export type ApplyRecoveredFeatureSprintRunnerStatusInput = {
  /** Local open attempt id the UI is recovering. */
  attemptId: string;
  /** attemptId returned by GET /feature-sprint/attempts/:id */
  statusAttemptId: string;
  result: FeatureSprintRunnerResponse;
  runnerRunId?: string;
  now?: string;
};

export type ApplyRecoveredFeatureSprintRunnerStatusResult =
  | {
      ok: true;
      state: LifeHarnessData;
      attempt: HarnessFeatureSprintExecutionAttempt;
      historyRunId?: string;
      historyRepaired: boolean;
      historyCreated: boolean;
      transportLossRepaired: boolean;
      historyRepairSkipped?: string;
    }
  | { ok: false; error: string; identityConflict?: boolean };

function skipHistoryRepair(
  state: LifeHarnessData,
  attempt: HarnessFeatureSprintExecutionAttempt,
  reason: string
): ApplyRecoveredFeatureSprintRunnerStatusResult {
  return {
    ok: true,
    state,
    attempt,
    historyRunId: attempt.historyRunId,
    historyRepaired: false,
    historyCreated: false,
    transportLossRepaired: false,
    historyRepairSkipped: reason
  };
}

/**
 * Attach a journaled runner status result to the durable attempt and repair the
 * matching local runner-history row when identity matches.
 *
 * Journal success supersedes a prior local transport-failure history status.
 * Does not POST, spawn, or create a new attempt id.
 */
export function applyRecoveredFeatureSprintRunnerStatus(
  data: LifeHarnessData,
  input: ApplyRecoveredFeatureSprintRunnerStatusInput
): ApplyRecoveredFeatureSprintRunnerStatusResult {
  const attemptId = input.attemptId.trim();
  const statusAttemptId = input.statusAttemptId.trim();
  if (!attemptId || !statusAttemptId) {
    return { ok: false, error: "attemptId is required." };
  }
  if (attemptId !== statusAttemptId) {
    return {
      ok: false,
      error: "Recovered status attemptId does not match the open local attempt.",
      identityConflict: true
    };
  }

  const existing = getFeatureSprintExecutionAttempt(data, attemptId);
  if (!existing) {
    return { ok: false, error: "Execution attempt not found." };
  }
  if (existing.status === "reconciled" || existing.status === "abandoned") {
    return { ok: false, error: `Cannot recover status onto ${existing.status} attempt.` };
  }

  const result = input.result;
  // Identity is validated via statusAttemptId ↔ local attemptId above.
  // Runner result envelopes do not carry attemptBinding; fail-closed on status id mismatch only.

  const attached = attachFeatureSprintExecutionAttemptResponse(data, attemptId, result, {
    runnerRunId: input.runnerRunId ?? result.runId,
    now: input.now
  });
  if (!attached.ok) {
    return attached;
  }

  let nextState = attached.state;
  let nextAttempt = attached.attempt;
  let historyRunId = nextAttempt.historyRunId;
  let historyRepaired = false;
  let historyCreated = false;
  let transportLossRepaired = false;

  const lookup = resolveRunnerHistoryForExecutionAttempt(nextState, nextAttempt);

  if (lookup.status === "incompatible_history_run_id") {
    return skipHistoryRepair(nextState, nextAttempt, "incompatible_history_run_id");
  }
  if (lookup.status === "ambiguous") {
    return skipHistoryRepair(nextState, nextAttempt, "ambiguous_history_match");
  }

  if (lookup.status === "found") {
    const priorHistory = lookup.run;
    const priorStatus = priorHistory.status;
    historyRunId = priorHistory.id;
    const completed = completeFeatureSprintRunnerRun(
      nextState,
      priorHistory.id,
      result,
      input.now
    );
    if (!completed.ok) {
      return { ok: false, error: completed.error };
    }
    nextState = completed.state;
    historyRepaired = true;
    transportLossRepaired =
      result.ok === true && (priorStatus === "failed" || priorStatus === "running");
  } else if (result.ok) {
    // Reconstruct only when we have enough identity and no safe existing row was found.
    if (!nextAttempt.cardId || !nextAttempt.planId || !nextAttempt.stepId) {
      return skipHistoryRepair(
        nextState,
        nextAttempt,
        "No matching runner-history row and insufficient identity to reconstruct safely."
      );
    }
    const created = createFeatureSprintRunnerRun(nextState, {
      profile: nextAttempt.profile,
      cardId: nextAttempt.cardId,
      planId: nextAttempt.planId,
      stepId: nextAttempt.stepId,
      taskId: nextAttempt.taskId,
      mapPhase:
        nextAttempt.phase === "localize" ||
        nextAttempt.phase === "implement" ||
        nextAttempt.phase === "review"
          ? nextAttempt.phase
          : undefined,
      repoPath: undefined,
      startedAt: result.startedAt ?? input.now
    });
    if (!created.ok) {
      return { ok: false, error: created.error };
    }
    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      result,
      input.now
    );
    if (!completed.ok) {
      return { ok: false, error: completed.error };
    }
    nextState = completed.state;
    historyRunId = created.runId;
    historyCreated = true;
    historyRepaired = true;
    transportLossRepaired = true;
  }

  if (historyRunId && nextAttempt.historyRunId !== historyRunId) {
    nextAttempt = { ...nextAttempt, historyRunId };
    nextState = {
      ...nextState,
      featureSprintExecutionAttempts: (nextState.featureSprintExecutionAttempts ?? []).map((row) =>
        row.attemptId === attemptId ? nextAttempt : row
      )
    };
  }

  return {
    ok: true,
    state: nextState,
    attempt: nextAttempt,
    historyRunId,
    historyRepaired,
    historyCreated,
    transportLossRepaired
  };
}
