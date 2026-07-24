import { describe, expect, it } from "vitest";

import {
  applyFeatureSprintLegalAction
} from "../../core/featureSprintApplyLegalAction";
import {
  attachFeatureSprintExecutionAttemptResponse,
  claimFeatureSprintExecutionAttempt,
  markFeatureSprintExecutionAttemptRunning
} from "../../core/featureSprintExecutionAttempt";
import {
  buildImplementationProofArtifactForStep,
  buildApplyInputFromPresentation
} from "../../core/featureSprintManualKernelBridge";
import { getNextFeatureSprintLegalAction } from "../../core/featureSprintNextLegalAction";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun
} from "../../core/featureSprintRunnerHistory";
import type { FeatureSprintRunnerResponse } from "../../core/featureSprintRunner";
import type { LifeHarnessData } from "../../core/lifeHarnessData";
import {
  createDurableLaunchReadyDogfoodState,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID,
  FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID
} from "../../dogfood/featureSprintDurableLaunchSeed";

/**
 * Mirrors LifeHarnessState runner-history wrappers: optionally sync stateRef before a
 * subsequent same-tick durable attempt transition reads it.
 */
function createRunnerHistoryViaRef(
  stateRef: { current: LifeHarnessData },
  input: Parameters<typeof createFeatureSprintRunnerRun>[1],
  syncRef: boolean
) {
  const result = createFeatureSprintRunnerRun(stateRef.current, input);
  if (!result.ok) {
    return result;
  }
  if (syncRef) {
    stateRef.current = result.state;
  }
  return result;
}

function completeRunnerHistoryViaRef(
  stateRef: { current: LifeHarnessData },
  runId: string,
  response: FeatureSprintRunnerResponse,
  syncRef: boolean
) {
  const result = completeFeatureSprintRunnerRun(stateRef.current, runId, response);
  if (!result.ok) {
    return result;
  }
  if (syncRef) {
    stateRef.current = result.state;
  }
  return result;
}

function mockSucceededImplementationResponse(
  startedAt: string
): FeatureSprintRunnerResponse {
  return {
    ok: true,
    profile: "codex_implementation",
    runnerMode: "mock",
    outputText: "Mock implementation completed inside an isolated worktree.",
    startedAt,
    completedAt: new Date().toISOString(),
    runId: "runner-run-mock-1",
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
        completedAt: new Date().toISOString(),
        stdoutExcerpt: "v24.11.1"
      }
    ]
  };
}

describe("runner-history stateRef sync (durable launch same-tick)", () => {
  it("without sync, mark-running erases a just-created history row (pre-fix regression)", () => {
    const seed = createDurableLaunchReadyDogfoodState({ repoPath: process.cwd() });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("launch_implementation");
    if (!("action" in next)) {
      return;
    }

    const claimed = claimFeatureSprintExecutionAttempt(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      profile: "codex_implementation",
      cardId: seed.cardId,
      taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
      phase: "implement"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    const stateRef = { current: claimed.state };
    const created = createRunnerHistoryViaRef(
      stateRef,
      {
        profile: "codex_implementation",
        cardId: seed.cardId,
        planId: seed.planId,
        stepId: claimed.state.featureSprintPlans.find((p) => p.id === seed.planId)?.currentStepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        repoPath: process.cwd()
      },
      false
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.state.featureSprintRunnerRuns.some((run) => run.id === created.runId)).toBe(true);
    // Stale ref still lacks the row — same as the pre-fix wrapper.
    expect(stateRef.current.featureSprintRunnerRuns.some((run) => run.id === created.runId)).toBe(
      false
    );

    const running = markFeatureSprintExecutionAttemptRunning(
      stateRef.current,
      claimed.attempt.attemptId
    );
    expect(running.ok).toBe(true);
    if (!running.ok) {
      return;
    }
    stateRef.current = running.state;
    expect(stateRef.current.featureSprintRunnerRuns.some((run) => run.id === created.runId)).toBe(
      false
    );
  });

  it("with sync, create then mark-running keeps the history row", () => {
    const seed = createDurableLaunchReadyDogfoodState({ repoPath: process.cwd() });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("launch_implementation");
    if (!("action" in next)) {
      return;
    }

    const claimed = claimFeatureSprintExecutionAttempt(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      profile: "codex_implementation",
      cardId: seed.cardId,
      taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
      phase: "implement"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    const stateRef = { current: claimed.state };
    const stepId = claimed.state.featureSprintPlans.find((p) => p.id === seed.planId)?.currentStepId;
    const created = createRunnerHistoryViaRef(
      stateRef,
      {
        profile: "codex_implementation",
        cardId: seed.cardId,
        planId: seed.planId,
        stepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        repoPath: process.cwd()
      },
      true
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const running = markFeatureSprintExecutionAttemptRunning(
      stateRef.current,
      claimed.attempt.attemptId
    );
    expect(running.ok).toBe(true);
    if (!running.ok) {
      return;
    }
    stateRef.current = running.state;

    const preserved = stateRef.current.featureSprintRunnerRuns.find((run) => run.id === created.runId);
    expect(preserved).toBeDefined();
    expect(preserved?.status).toBe("running");
    expect(preserved?.id).toBe(created.runId);
  });

  it("with sync, complete then attach keeps completed evidence for proof", () => {
    const seed = createDurableLaunchReadyDogfoodState({ repoPath: process.cwd() });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    if (!("action" in next)) {
      throw new Error("expected launch_implementation");
    }

    const claimed = claimFeatureSprintExecutionAttempt(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      profile: "codex_implementation",
      cardId: seed.cardId,
      taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
      phase: "implement"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    const stateRef = { current: claimed.state };

    // Match UI order: apply launch intent, then create history, then mark running.
    const launchApplied = applyFeatureSprintLegalAction(
      stateRef.current,
      buildApplyInputFromPresentation(next)
    );
    expect(launchApplied.ok).toBe(true);
    if (!launchApplied.ok) {
      return;
    }
    stateRef.current = launchApplied.state;

    const stepId = stateRef.current.featureSprintPlans.find((p) => p.id === seed.planId)
      ?.currentStepId;
    expect(stepId).toBeTruthy();

    const created = createRunnerHistoryViaRef(
      stateRef,
      {
        profile: "codex_implementation",
        cardId: seed.cardId,
        planId: seed.planId,
        stepId,
        taskId: FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_TASK_ID,
        mapPhase: "implement",
        repoPath: process.cwd()
      },
      true
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const running = markFeatureSprintExecutionAttemptRunning(
      stateRef.current,
      claimed.attempt.attemptId
    );
    expect(running.ok).toBe(true);
    if (!running.ok) {
      return;
    }
    stateRef.current = running.state;

    const startedAt = new Date().toISOString();
    const response = mockSucceededImplementationResponse(startedAt);
    const completed = completeRunnerHistoryViaRef(stateRef, created.runId, response, true);
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const attached = attachFeatureSprintExecutionAttemptResponse(
      stateRef.current,
      claimed.attempt.attemptId,
      response,
      { runnerRunId: response.runId }
    );
    expect(attached.ok).toBe(true);
    if (!attached.ok) {
      return;
    }
    stateRef.current = attached.state;

    const history = stateRef.current.featureSprintRunnerRuns.find((run) => run.id === created.runId);
    expect(history?.status).toBe("succeeded");
    expect(history?.changedFiles).toEqual([".life-harness/mock-implementation-result.md"]);
    expect(history?.verificationResults?.[0]?.status).toBe("passed");
    expect(history?.stepId).toBe(stepId);

    const working: LifeHarnessData = {
      ...stateRef.current,
      featureSprintPlans: stateRef.current.featureSprintPlans.map((item) =>
        item.id === FEATURE_SPRINT_DURABLE_LAUNCH_DOGFOOD_PLAN_ID
          ? {
              ...item,
              steps: item.steps.map((step) =>
                step.id === stepId
                  ? {
                      ...step,
                      status: "sent" as const,
                      outputSummary: response.outputText
                    }
                  : step
              )
            }
          : item
      )
    };

    const legal = getNextFeatureSprintLegalAction(working, seed.planId);
    if (!("action" in legal) || legal.action !== "save_implementation_proof") {
      throw new Error(`expected save_implementation_proof, got ${JSON.stringify(legal)}`);
    }

    const artifact = buildImplementationProofArtifactForStep(working, seed.planId, stepId!);
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) {
      return;
    }
    expect(artifact.artifact.changedFiles.length).toBeGreaterThan(0);
    expect(artifact.artifact.verificationResult).toBe("pass");

    const applied = applyFeatureSprintLegalAction(
      working,
      buildApplyInputFromPresentation(legal, artifact.artifact)
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const after = getNextFeatureSprintLegalAction(applied.state, seed.planId);
    expect("action" in after && after.action).toBe("launch_review");
  });
});
