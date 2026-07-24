import { describe, expect, it } from "vitest";

import { applyFeatureSprintLegalAction } from "./featureSprintApplyLegalAction";
import {
  attachFeatureSprintExecutionAttemptResponse,
  claimFeatureSprintExecutionAttempt,
  markFeatureSprintExecutionAttemptAmbiguous,
  markFeatureSprintExecutionAttemptRunning
} from "./featureSprintExecutionAttempt";
import {
  buildApplyInputFromPresentation,
  buildImplementationProofArtifactForStep
} from "./featureSprintManualKernelBridge";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import {
  applyRecoveredFeatureSprintRunnerStatus,
  findRunnerHistoryForExecutionAttempt,
  shouldPreserveRecoveredRunnerSuccess,
  shouldPreserveSucceededRunnerHistory
} from "./featureSprintRecoveredRunnerStatus";
import type { FeatureSprintRunnerResponse } from "./featureSprintRunner";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun
} from "./featureSprintRunnerHistory";
import type { LifeHarnessData } from "./lifeHarnessData";
import {
  createDurableLaunchReadyDogfoodState,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID
} from "../dogfood/featureSprintDurableLaunchSeed";

function okRecoveredResponse(
  overrides: Partial<FeatureSprintRunnerResponse> = {}
): FeatureSprintRunnerResponse {
  const startedAt = "2026-07-23T12:00:01.000Z";
  return {
    ok: true,
    profile: "codex_implementation",
    runnerMode: "mock",
    outputText: "Mock implementation completed inside an isolated worktree.",
    startedAt,
    completedAt: "2026-07-23T12:00:02.000Z",
    runId: "runner-envelope-1",
    terminationReason: "completed",
    failureClass: "none",
    resultUsability: "usable",
    changedFiles: [".life-harness/mock-implementation-result.md"],
    verificationResults: [
      {
        command: "node --version",
        status: "passed",
        exitCode: 0,
        startedAt,
        completedAt: "2026-07-23T12:00:02.000Z",
        stdoutExcerpt: "v22.0.0"
      }
    ],
    ...overrides
  };
}

function transportLossFailure(): FeatureSprintRunnerResponse {
  return {
    ok: false,
    profile: "codex_implementation",
    error: "Network request failed",
    startedAt: "2026-07-23T12:00:01.000Z",
    completedAt: "2026-07-23T12:00:01.500Z"
  };
}

function seedTransportLossState(): {
  state: LifeHarnessData;
  attemptId: string;
  historyRunId: string;
  planId: string;
  stepId: string;
  cardId: string;
} {
  const seed = createDurableLaunchReadyDogfoodState({
    repoPath: "C:/tmp/life-harness-transport-loss"
  });
  let state = seed.state;
  const next = getNextFeatureSprintLegalAction(state, seed.planId);
  expect("action" in next && next.action).toBe("launch_implementation");
  if (!("action" in next)) {
    throw new Error("expected launch_implementation");
  }

  const claimed = claimFeatureSprintExecutionAttempt(state, {
    planId: seed.planId,
    actionId: next.actionId,
    stateRevision: next.stateRevision,
    profile: "codex_implementation",
    cardId: seed.cardId,
    taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
    phase: "implement",
    now: "2026-07-23T12:00:00.000Z"
  });
  expect(claimed.ok).toBe(true);
  if (!claimed.ok) {
    throw new Error(claimed.error);
  }
  state = claimed.state;

  // Match production: apply launch intent so the implement step/history binding exists.
  const launchApplied = applyFeatureSprintLegalAction(
    state,
    buildApplyInputFromPresentation(next)
  );
  expect(launchApplied.ok).toBe(true);
  if (!launchApplied.ok) {
    throw new Error(launchApplied.error);
  }
  state = launchApplied.state;

  const stepId = state.featureSprintPlans.find((p) => p.id === seed.planId)?.currentStepId;
  expect(stepId).toBeTruthy();

  const history = createFeatureSprintRunnerRun(state, {
    profile: "codex_implementation",
    cardId: seed.cardId,
    planId: seed.planId,
    stepId,
    taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
    mapPhase: "implement",
    startedAt: "2026-07-23T12:00:00.500Z"
  });
  expect(history.ok).toBe(true);
  if (!history.ok) {
    throw new Error(history.error);
  }
  state = history.state;

  const running = markFeatureSprintExecutionAttemptRunning(state, claimed.attempt.attemptId);
  expect(running.ok).toBe(true);
  if (!running.ok) {
    throw new Error(running.error);
  }
  state = running.state;

  const failedHistory = completeFeatureSprintRunnerRun(
    state,
    history.runId,
    transportLossFailure(),
    "2026-07-23T12:00:01.500Z"
  );
  expect(failedHistory.ok).toBe(true);
  if (!failedHistory.ok) {
    throw new Error(failedHistory.error);
  }
  state = failedHistory.state;

  const attached = attachFeatureSprintExecutionAttemptResponse(
    state,
    claimed.attempt.attemptId,
    transportLossFailure(),
    { now: "2026-07-23T12:00:01.500Z" }
  );
  expect(attached.ok).toBe(true);
  if (!attached.ok) {
    throw new Error(attached.error);
  }
  let attempt = { ...attached.attempt, historyRunId: history.runId };
  state = {
    ...attached.state,
    featureSprintExecutionAttempts: (attached.state.featureSprintExecutionAttempts ?? []).map((row) =>
      row.attemptId === attempt.attemptId ? attempt : row
    )
  };
  const ambiguous = markFeatureSprintExecutionAttemptAmbiguous(
    state,
    attempt.attemptId,
    "Original POST response lost after runner may have started."
  );
  expect(ambiguous.ok).toBe(true);
  if (!ambiguous.ok) {
    throw new Error(ambiguous.error);
  }
  attempt = { ...ambiguous.attempt, historyRunId: history.runId, stepId: stepId! };
  state = {
    ...ambiguous.state,
    featureSprintExecutionAttempts: (ambiguous.state.featureSprintExecutionAttempts ?? []).map((row) =>
      row.attemptId === attempt.attemptId ? attempt : row
    )
  };

  expect(state.featureSprintRunnerRuns.find((run) => run.id === history.runId)?.status).toBe(
    "failed"
  );
  expect(attempt.status).toBe("ambiguous");

  return {
    state,
    attemptId: attempt.attemptId,
    historyRunId: history.runId,
    planId: seed.planId,
    stepId: stepId!,
    cardId: seed.cardId
  };
}

describe("applyRecoveredFeatureSprintRunnerStatus", () => {
  it("repairs failed local history from journaled success without duplicating rows", () => {
    const { state, attemptId, historyRunId } = seedTransportLossState();
    const recovered = okRecoveredResponse();

    const first = applyRecoveredFeatureSprintRunnerStatus(state, {
      attemptId,
      statusAttemptId: attemptId,
      result: recovered,
      runnerRunId: recovered.runId,
      now: "2026-07-23T12:00:03.000Z"
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error);
    }

    expect(first.attempt.status).toBe("response_received");
    expect(first.attempt.result?.ok).toBe(true);
    expect(first.attempt.result?.changedFiles).toEqual(recovered.changedFiles);
    expect(first.historyRunId).toBe(historyRunId);
    expect(first.historyRepaired).toBe(true);
    expect(first.historyCreated).toBe(false);
    expect(first.transportLossRepaired).toBe(true);
    expect(first.state.featureSprintRunnerRuns.filter((run) => run.id === historyRunId)).toHaveLength(
      1
    );

    const repaired = first.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId);
    expect(repaired?.status).toBe("succeeded");
    expect(repaired?.changedFiles).toEqual(recovered.changedFiles);
    expect(repaired?.verificationResults?.[0]?.status).toBe("passed");

    const second = applyRecoveredFeatureSprintRunnerStatus(first.state, {
      attemptId,
      statusAttemptId: attemptId,
      result: recovered,
      runnerRunId: recovered.runId,
      now: "2026-07-23T12:00:04.000Z"
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(second.error);
    }
    expect(second.historyRunId).toBe(historyRunId);
    expect(second.historyCreated).toBe(false);
    expect(second.transportLossRepaired).toBe(false);
    expect(second.state.featureSprintRunnerRuns).toHaveLength(first.state.featureSprintRunnerRuns.length);
    expect(
      second.state.featureSprintRunnerRuns.filter((run) => run.id === historyRunId)
    ).toHaveLength(1);
    expect(second.attempt.result?.changedFiles).toEqual(recovered.changedFiles);
  });

  it("fails closed on mismatched attempt identity and does not mutate history", () => {
    const { state, attemptId, historyRunId } = seedTransportLossState();
    const before = JSON.stringify(state.featureSprintRunnerRuns);

    const mismatch = applyRecoveredFeatureSprintRunnerStatus(state, {
      attemptId,
      statusAttemptId: "other-attempt",
      result: okRecoveredResponse(),
      now: "2026-07-23T12:00:03.000Z"
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) {
      throw new Error("expected mismatch");
    }
    expect(mismatch.identityConflict).toBe(true);
    expect(JSON.stringify(state.featureSprintRunnerRuns)).toBe(before);
    expect(state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.status).toBe(
      "failed"
    );
  });

  it("does not manufacture success evidence from non-success recovered status", () => {
    const { state, attemptId, historyRunId } = seedTransportLossState();
    const failed = applyRecoveredFeatureSprintRunnerStatus(state, {
      attemptId,
      statusAttemptId: attemptId,
      result: {
        ok: false,
        profile: "codex_implementation",
        error: "agent failed",
        runId: "runner-envelope-failed",
        terminationReason: "agent_nonzero_exit",
        failureClass: "agent",
        resultUsability: "unusable",
        startedAt: "2026-07-23T12:00:01.000Z",
        completedAt: "2026-07-23T12:00:02.000Z",
        changedFiles: [".life-harness/should-not-count-as-success.md"]
      },
      now: "2026-07-23T12:00:03.000Z"
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) {
      throw new Error(failed.error);
    }
    expect(failed.attempt.status).toBe("failed");
    expect(failed.transportLossRepaired).toBe(false);
    const row = failed.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId);
    expect(row?.status).toBe("failed");
    expect(failed.attempt.result?.ok).toBe(false);
    expect(failed.attempt.status).not.toBe("response_received");
  });

  it("supports proof normalization to launch_review after transport-loss repair", () => {
    const { state, attemptId, historyRunId, planId, stepId } = seedTransportLossState();
    const recovered = okRecoveredResponse();
    const repaired = applyRecoveredFeatureSprintRunnerStatus(state, {
      attemptId,
      statusAttemptId: attemptId,
      result: recovered,
      runnerRunId: recovered.runId,
      now: "2026-07-23T12:00:03.000Z"
    });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      throw new Error(repaired.error);
    }

    const history = findRunnerHistoryForExecutionAttempt(repaired.state, repaired.attempt);
    expect(history?.id).toBe(historyRunId);
    expect(history?.status).toBe("succeeded");

    const working: LifeHarnessData = {
      ...repaired.state,
      featureSprintPlans: repaired.state.featureSprintPlans.map((item) =>
        item.id === FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID
          ? {
              ...item,
              steps: item.steps.map((step) =>
                step.id === stepId
                  ? {
                      ...step,
                      status: "sent" as const,
                      outputSummary: recovered.outputText
                    }
                  : step
              )
            }
          : item
      )
    };

    const legal = getNextFeatureSprintLegalAction(working, planId);
    if (!("action" in legal) || legal.action !== "save_implementation_proof") {
      throw new Error(`expected save_implementation_proof, got ${JSON.stringify(legal)}`);
    }

    const artifact = buildImplementationProofArtifactForStep(working, planId, stepId);
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) {
      throw new Error(artifact.error);
    }
    expect(artifact.artifact.changedFiles.length).toBeGreaterThan(0);
    expect(artifact.artifact.verificationResult).toBe("pass");

    const applied = applyFeatureSprintLegalAction(
      working,
      buildApplyInputFromPresentation(legal, artifact.artifact)
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      throw new Error(applied.error);
    }

    const after = getNextFeatureSprintLegalAction(applied.state, planId);
    expect("action" in after && after.action).toBe("launch_review");
  });

  it("preserves recovered success against a later ambiguous transport failure", () => {
    const { state, attemptId, historyRunId } = seedTransportLossState();
    const recovered = okRecoveredResponse();
    const repaired = applyRecoveredFeatureSprintRunnerStatus(state, {
      attemptId,
      statusAttemptId: attemptId,
      result: recovered,
      runnerRunId: recovered.runId,
      now: "2026-07-23T12:00:03.000Z"
    });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      throw new Error(repaired.error);
    }

    expect(shouldPreserveRecoveredRunnerSuccess(repaired.attempt, transportLossFailure())).toBe(
      true
    );
    expect(
      shouldPreserveSucceededRunnerHistory(
        repaired.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId),
        transportLossFailure()
      )
    ).toBe(true);
    expect(shouldPreserveRecoveredRunnerSuccess(repaired.attempt, recovered)).toBe(false);
  });

  describe("history lookup fail-closed policy", () => {
    function withAttemptHistoryRunId(
      state: LifeHarnessData,
      attemptId: string,
      historyRunId: string | undefined
    ): LifeHarnessData {
      return {
        ...state,
        featureSprintExecutionAttempts: (state.featureSprintExecutionAttempts ?? []).map((row) =>
          row.attemptId === attemptId ? { ...row, historyRunId } : row
        )
      };
    }

    function snapshotHistory(state: LifeHarnessData): string {
      return JSON.stringify(state.featureSprintRunnerRuns);
    }

    it("repairs only the exact historyRunId when two similar rows exist", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      const other = createFeatureSprintRunnerRun(state, {
        profile: "codex_implementation",
        cardId,
        planId,
        stepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        startedAt: "2026-07-23T11:00:00.000Z"
      });
      expect(other.ok).toBe(true);
      if (!other.ok) {
        throw new Error(other.error);
      }
      const withOther = completeFeatureSprintRunnerRun(
        other.state,
        other.runId,
        transportLossFailure(),
        "2026-07-23T11:00:01.000Z"
      );
      expect(withOther.ok).toBe(true);
      if (!withOther.ok) {
        throw new Error(withOther.error);
      }

      const recovered = okRecoveredResponse({
        changedFiles: [".life-harness/exact-id-target.md"]
      });
      const result = applyRecoveredFeatureSprintRunnerStatus(withOther.state, {
        attemptId,
        statusAttemptId: attemptId,
        result: recovered,
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyRunId).toBe(historyRunId);
      const target = result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId);
      const untouched = result.state.featureSprintRunnerRuns.find((run) => run.id === other.runId);
      expect(target?.status).toBe("succeeded");
      expect(target?.changedFiles).toEqual([".life-harness/exact-id-target.md"]);
      expect(untouched?.status).toBe("failed");
      expect(untouched?.changedFiles).toBeUndefined();
    });

    it("fails closed on incompatible exact historyRunId without fallback mutation", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      const foreignId = "history-foreign-incompatible";
      const poisoned: LifeHarnessData = {
        ...withAttemptHistoryRunId(state, attemptId, foreignId),
        featureSprintRunnerRuns: [
          {
            id: foreignId,
            profile: "codex_implementation",
            status: "running",
            cardId,
            planId: "plan-other",
            stepId,
            taskId: "task-other",
            mapPhase: "implement",
            startedAt: "2026-07-23T11:00:00.000Z",
            createdAt: "2026-07-23T11:00:00.000Z",
            updatedAt: "2026-07-23T11:00:00.000Z"
          },
          ...state.featureSprintRunnerRuns
        ]
      };
      const before = snapshotHistory(poisoned);

      const result = applyRecoveredFeatureSprintRunnerStatus(poisoned, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse(),
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyRepaired).toBe(false);
      expect(result.historyCreated).toBe(false);
      expect(result.historyRepairSkipped).toBe("incompatible_history_run_id");
      expect(snapshotHistory(result.state)).toBe(before);
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.status).toBe(
        "failed"
      );
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === foreignId)?.status).toBe(
        "running"
      );
      expect(result.attempt.result?.ok).toBe(true);
      expect(result.attempt.historyRunId).toBe(foreignId);
      expect(planId).toBeTruthy();
    });

    it("repairs the unique unfinished fallback and leaves a prior succeeded row alone", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      const prior = createFeatureSprintRunnerRun(state, {
        profile: "codex_implementation",
        cardId,
        planId,
        stepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        startedAt: "2026-07-23T10:00:00.000Z"
      });
      expect(prior.ok).toBe(true);
      if (!prior.ok) {
        throw new Error(prior.error);
      }
      const priorSucceeded = completeFeatureSprintRunnerRun(
        prior.state,
        prior.runId,
        okRecoveredResponse({
          runId: "prior-envelope",
          changedFiles: [".life-harness/prior-succeeded.md"]
        }),
        "2026-07-23T10:00:02.000Z"
      );
      expect(priorSucceeded.ok).toBe(true);
      if (!priorSucceeded.ok) {
        throw new Error(priorSucceeded.error);
      }

      const withoutHistoryId = withAttemptHistoryRunId(priorSucceeded.state, attemptId, undefined);
      const recovered = okRecoveredResponse({
        changedFiles: [".life-harness/current-attempt.md"]
      });
      const result = applyRecoveredFeatureSprintRunnerStatus(withoutHistoryId, {
        attemptId,
        statusAttemptId: attemptId,
        result: recovered,
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyRepaired).toBe(true);
      expect(result.historyCreated).toBe(false);
      expect(result.historyRunId).toBe(historyRunId);
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.changedFiles
      ).toEqual([".life-harness/current-attempt.md"]);
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === prior.runId)?.changedFiles
      ).toEqual([".life-harness/prior-succeeded.md"]);
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === prior.runId)?.status).toBe(
        "succeeded"
      );
    });

    it("skips repair when multiple unfinished fallback candidates exist", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      const second = createFeatureSprintRunnerRun(state, {
        profile: "codex_implementation",
        cardId,
        planId,
        stepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        startedAt: "2026-07-23T11:30:00.000Z"
      });
      expect(second.ok).toBe(true);
      if (!second.ok) {
        throw new Error(second.error);
      }
      const secondFailed = completeFeatureSprintRunnerRun(
        second.state,
        second.runId,
        transportLossFailure(),
        "2026-07-23T11:30:01.000Z"
      );
      expect(secondFailed.ok).toBe(true);
      if (!secondFailed.ok) {
        throw new Error(secondFailed.error);
      }

      const withoutHistoryId = withAttemptHistoryRunId(secondFailed.state, attemptId, undefined);
      const before = snapshotHistory(withoutHistoryId);
      const result = applyRecoveredFeatureSprintRunnerStatus(withoutHistoryId, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse(),
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyRepairSkipped).toBe("ambiguous_history_match");
      expect(result.historyRepaired).toBe(false);
      expect(result.historyCreated).toBe(false);
      expect(snapshotHistory(result.state)).toBe(before);
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.status).toBe(
        "failed"
      );
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === second.runId)?.status).toBe(
        "failed"
      );
      expect(result.attempt.result?.ok).toBe(true);
    });

    it("does not overwrite a prior succeeded-only row; reconstructs when identity is sufficient", () => {
      const { state, attemptId, planId, stepId, cardId } = seedTransportLossState();
      const currentFailed = state.featureSprintRunnerRuns.find(
        (run) => run.status === "failed" && run.planId === planId
      );
      expect(currentFailed).toBeTruthy();

      // Remove unfinished rows; leave only a prior succeeded row for the same plan/step.
      const priorOnlyRuns = state.featureSprintRunnerRuns
        .filter((run) => run.id !== currentFailed!.id)
        .concat([]);
      const prior = createFeatureSprintRunnerRun(
        { ...state, featureSprintRunnerRuns: priorOnlyRuns },
        {
          profile: "codex_implementation",
          cardId,
          planId,
          stepId,
          taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
          mapPhase: "implement",
          startedAt: "2026-07-23T09:00:00.000Z"
        }
      );
      expect(prior.ok).toBe(true);
      if (!prior.ok) {
        throw new Error(prior.error);
      }
      const priorSucceeded = completeFeatureSprintRunnerRun(
        prior.state,
        prior.runId,
        okRecoveredResponse({
          runId: "old-envelope",
          changedFiles: [".life-harness/old-only.md"]
        }),
        "2026-07-23T09:00:02.000Z"
      );
      expect(priorSucceeded.ok).toBe(true);
      if (!priorSucceeded.ok) {
        throw new Error(priorSucceeded.error);
      }

      const withoutHistoryId = withAttemptHistoryRunId(priorSucceeded.state, attemptId, undefined);
      const beforePrior = priorSucceeded.state.featureSprintRunnerRuns.find(
        (run) => run.id === prior.runId
      );
      const result = applyRecoveredFeatureSprintRunnerStatus(withoutHistoryId, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse({
          changedFiles: [".life-harness/reconstructed.md"]
        }),
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyCreated).toBe(true);
      expect(result.historyRepaired).toBe(true);
      expect(result.historyRunId).toBeTruthy();
      expect(result.historyRunId).not.toBe(prior.runId);
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === prior.runId)?.changedFiles
      ).toEqual(beforePrior?.changedFiles);
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === result.historyRunId)?.changedFiles
      ).toEqual([".life-harness/reconstructed.md"]);

      const second = applyRecoveredFeatureSprintRunnerStatus(result.state, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse({
          changedFiles: [".life-harness/reconstructed.md"]
        }),
        now: "2026-07-23T12:00:04.000Z"
      });
      expect(second.ok).toBe(true);
      if (!second.ok) {
        throw new Error(second.error);
      }
      expect(second.historyRunId).toBe(result.historyRunId);
      expect(second.historyCreated).toBe(false);
      expect(second.state.featureSprintRunnerRuns).toHaveLength(result.state.featureSprintRunnerRuns.length);
    });

    it("does not select a row that differs by taskId when historyRunId is absent", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      // Make the current unfinished row task-mismatched, and add a different-task failed row.
      const remapped = {
        ...state,
        featureSprintRunnerRuns: state.featureSprintRunnerRuns.map((run) =>
          run.id === historyRunId ? { ...run, taskId: "task-other" } : run
        )
      };
      const otherTask = createFeatureSprintRunnerRun(remapped, {
        profile: "codex_implementation",
        cardId,
        planId,
        stepId,
        taskId: "task-other-2",
        mapPhase: "implement",
        startedAt: "2026-07-23T11:00:00.000Z"
      });
      expect(otherTask.ok).toBe(true);
      if (!otherTask.ok) {
        throw new Error(otherTask.error);
      }
      const otherFailed = completeFeatureSprintRunnerRun(
        otherTask.state,
        otherTask.runId,
        transportLossFailure(),
        "2026-07-23T11:00:01.000Z"
      );
      expect(otherFailed.ok).toBe(true);
      if (!otherFailed.ok) {
        throw new Error(otherFailed.error);
      }

      const withoutHistoryId = withAttemptHistoryRunId(otherFailed.state, attemptId, undefined);
      const before = snapshotHistory(withoutHistoryId);
      const result = applyRecoveredFeatureSprintRunnerStatus(withoutHistoryId, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse({
          changedFiles: [".life-harness/should-not-attach.md"]
        }),
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      // No compatible unfinished row (taskId mismatch) → reconstruct a new compatible row.
      expect(result.historyCreated).toBe(true);
      expect(snapshotHistory(result.state)).not.toBe(before);
      expect(result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.status).toBe(
        "failed"
      );
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.changedFiles
      ).toBeUndefined();
    });

    it("does not select a row that differs by mapPhase/phase when historyRunId is absent", () => {
      const { state, attemptId, historyRunId, planId, stepId, cardId } = seedTransportLossState();
      const remapped = {
        ...state,
        featureSprintRunnerRuns: state.featureSprintRunnerRuns.map((run) =>
          run.id === historyRunId ? { ...run, mapPhase: "review" as const } : run
        )
      };
      const withoutHistoryId = withAttemptHistoryRunId(remapped, attemptId, undefined);
      const beforeFailed = withoutHistoryId.featureSprintRunnerRuns.find((run) => run.id === historyRunId);
      const result = applyRecoveredFeatureSprintRunnerStatus(withoutHistoryId, {
        attemptId,
        statusAttemptId: attemptId,
        result: okRecoveredResponse({
          changedFiles: [".life-harness/phase-separated.md"]
        }),
        now: "2026-07-23T12:00:03.000Z"
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.historyCreated).toBe(true);
      expect(result.historyRunId).not.toBe(historyRunId);
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.mapPhase
      ).toBe("review");
      expect(
        result.state.featureSprintRunnerRuns.find((run) => run.id === historyRunId)?.status
      ).toBe(beforeFailed?.status);
    });
  });
});
