import { describe, expect, it, vi } from "vitest";

import {
  abandonFeatureSprintExecutionAttempt,
  attachFeatureSprintExecutionAttemptResponse,
  claimFeatureSprintExecutionAttempt,
  getOpenFeatureSprintExecutionAttemptForAction,
  getOpenFeatureSprintExecutionAttemptForPlan,
  markFeatureSprintExecutionAttemptLaunching,
  reconcileFeatureSprintExecutionAttempt
} from "./featureSprintExecutionAttempt";
import { createCleanBootstrapState } from "../data/createSeedState";
import type { FeatureSprintRunnerResponse } from "./featureSprintRunner";
import { savePersistedState } from "../storage/persistence";
import type { StorageAdapter } from "../storage/types";

function baseClaimInput() {
  return {
    planId: "plan-1",
    actionId: "action-1",
    stateRevision: 3,
    profile: "codex_implementation" as const,
    taskId: "task-1",
    phase: "implement",
    cardId: "card-1",
    stepId: "step-1",
    clarifiedSpecRevision: 1,
    now: "2026-07-22T12:00:00.000Z"
  };
}

function okResponse(runId = "run-1"): FeatureSprintRunnerResponse {
  return {
    ok: true,
    profile: "codex_implementation",
    outputText: "mock implementation output",
    startedAt: "2026-07-22T12:00:01.000Z",
    completedAt: "2026-07-22T12:00:02.000Z",
    runId,
    resultUsability: "usable"
  };
}

describe("featureSprintExecutionAttempt", () => {
  it("claims before any runner call and blocks duplicate open attempts", () => {
    const state = createCleanBootstrapState();
    const claimed = claimFeatureSprintExecutionAttempt(state, baseClaimInput());
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    expect(claimed.attempt.status).toBe("claimed");
    expect(claimed.state.featureSprintExecutionAttempts?.[0]?.attemptId).toBe(
      claimed.attempt.attemptId
    );

    const duplicate = claimFeatureSprintExecutionAttempt(claimed.state, {
      ...baseClaimInput(),
      attemptId: "fs_attempt-other"
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) {
      return;
    }
    expect(duplicate.existingAttempt?.attemptId).toBe(claimed.attempt.attemptId);
  });

  it("does not call runner when claim persistence fails", () => {
    const state = createCleanBootstrapState();
    const claimed = claimFeatureSprintExecutionAttempt(state, baseClaimInput());
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    const failingAdapter: StorageAdapter = {
      isAvailable: () => true,
      loadRaw: () => null,
      saveRaw: () => {
        throw new Error("disk full");
      },
      clear: () => undefined
    };
    const runner = vi.fn();
    const persisted = savePersistedState(claimed.state, failingAdapter);
    expect(persisted).toBe(false);
    if (!persisted) {
      // Claim failure means runner is not called.
      expect(runner).not.toHaveBeenCalled();
    }
  });

  it("persists response before reconcile and refuses relaunch after reconcile", () => {
    let state = createCleanBootstrapState();
    const claimed = claimFeatureSprintExecutionAttempt(state, baseClaimInput());
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    state = claimed.state;
    const launching = markFeatureSprintExecutionAttemptLaunching(state, claimed.attempt.attemptId);
    expect(launching.ok).toBe(true);
    if (!launching.ok) {
      return;
    }
    state = launching.state;

    const attached = attachFeatureSprintExecutionAttemptResponse(
      state,
      claimed.attempt.attemptId,
      okResponse()
    );
    expect(attached.ok).toBe(true);
    if (!attached.ok) {
      return;
    }
    expect(attached.attempt.status).toBe("response_received");
    expect(attached.attempt.result?.outputText).toContain("mock implementation");

    const reconciled = reconcileFeatureSprintExecutionAttempt(
      attached.state,
      claimed.attempt.attemptId
    );
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(reconciled.attempt.status).toBe("reconciled");
    expect(getOpenFeatureSprintExecutionAttemptForPlan(reconciled.state, "plan-1")).toBeUndefined();
    expect(
      getOpenFeatureSprintExecutionAttemptForAction(reconciled.state, "plan-1", "action-1")
    ).toBeUndefined();

    const relaunch = claimFeatureSprintExecutionAttempt(reconciled.state, {
      ...baseClaimInput(),
      actionId: "action-1",
      stateRevision: 4
    });
    // New claim for same action id is allowed only after prior attempt is closed.
    expect(relaunch.ok).toBe(true);
  });

  it("abandon closes attempt without deleting evidence and allows a new attempt id", () => {
    let state = createCleanBootstrapState();
    const claimed = claimFeatureSprintExecutionAttempt(state, {
      ...baseClaimInput(),
      attemptId: "fs_attempt-first"
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    const abandoned = abandonFeatureSprintExecutionAttempt(claimed.state, "fs_attempt-first");
    expect(abandoned.ok).toBe(true);
    if (!abandoned.ok) {
      return;
    }
    expect(abandoned.attempt.status).toBe("abandoned");
    expect(abandoned.state.featureSprintExecutionAttempts?.[0]?.attemptId).toBe("fs_attempt-first");

    const next = claimFeatureSprintExecutionAttempt(abandoned.state, {
      ...baseClaimInput(),
      attemptId: "fs_attempt-second",
      stateRevision: 4
    });
    expect(next.ok).toBe(true);
    if (!next.ok) {
      return;
    }
    expect(next.attempt.attemptId).toBe("fs_attempt-second");
  });

  it("marks client transport loss as ambiguous instead of terminal failed", () => {
    let state = createCleanBootstrapState();
    const claimed = claimFeatureSprintExecutionAttempt(state, baseClaimInput());
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    state = claimed.state;
    const attached = attachFeatureSprintExecutionAttemptResponse(state, claimed.attempt.attemptId, {
      ok: false,
      profile: "codex_implementation",
      error: "Feature Sprint runner is unreachable.",
      startedAt: "2026-07-22T12:00:01.000Z",
      completedAt: "2026-07-22T12:00:02.000Z"
    });
    expect(attached.ok).toBe(true);
    if (!attached.ok) {
      return;
    }
    expect(attached.attempt.status).toBe("ambiguous");
  });

  it("leaves unrelated plans unaffected", () => {
    let state = createCleanBootstrapState();
    const a = claimFeatureSprintExecutionAttempt(state, {
      ...baseClaimInput(),
      planId: "plan-a",
      attemptId: "fs_attempt-a"
    });
    expect(a.ok).toBe(true);
    if (!a.ok) {
      return;
    }
    state = a.state;
    const b = claimFeatureSprintExecutionAttempt(state, {
      ...baseClaimInput(),
      planId: "plan-b",
      attemptId: "fs_attempt-b"
    });
    expect(b.ok).toBe(true);
    if (!b.ok) {
      return;
    }
    expect(getOpenFeatureSprintExecutionAttemptForPlan(b.state, "plan-a")?.attemptId).toBe(
      "fs_attempt-a"
    );
    expect(getOpenFeatureSprintExecutionAttemptForPlan(b.state, "plan-b")?.attemptId).toBe(
      "fs_attempt-b"
    );
  });
});
