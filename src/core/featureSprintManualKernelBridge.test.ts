import { describe, expect, it } from "vitest";

import { applyFeatureSprintLegalAction } from "./featureSprintApplyLegalAction";
import {
  createMockKernelSprintSeed,
  defaultHappyPathScript,
  reviewFence,
  runMockFeatureSprintKernelLoop
} from "./featureSprintKernelDogfood";
import {
  adoptSavedFeatureSpecAsClarifiedDraft,
  applyClarificationAnswersForPlan,
  buildApplyInputFromPresentation,
  buildClarificationAnswersArtifactForPlan,
  buildClarifiedSpecDraftArtifactFromSavedFeatureSpec,
  buildImplementationProofArtifactForStep,
  buildLocalizationArtifactForStep,
  buildReviewVerdictArtifactForStep,
  canTriggerFeatureSprintAction,
  classifyFeatureSprintLegalAction,
  evaluateAdoptSavedFeatureSpecAsClarifiedDraft,
  guardKernelManagedLegacyControl,
  isKernelDelegatedRunnerLaunchAllowed,
  isKernelManagedFeatureSprintPlan,
  isKernelManagedPromptAuditLaunchAllowed,
  listOpenClarificationQuestionsForPresentation,
  presentFeatureSprintNextLegalAction,
  validateFeatureSprintLegalActionTrigger
} from "./featureSprintManualKernelBridge";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import { resolvePlanStateRevision } from "./featureSprintTaskContract";
import type { LifeHarnessData } from "./lifeHarnessData";
import {
  hasStepPromptLocalization,
  importFeaturePromptLocalizationFromText,
  updateFeatureSprintStep
} from "./featureSprintOrchestrator";

const SAMPLE_LOCALIZATION_BLOCK = `
\`\`\`feature-prompt-localization
{
  "likelyFiles": ["src/core/featureSprintNextLegalAction.ts"],
  "existingHelpers": ["getNextFeatureSprintLegalAction"],
  "testsToRun": ["npm test -- featureSprintManualKernelBridge"],
  "risks": ["Stale action rejection"],
  "revisedImplementationPrompt": "Implement localization kernel routing."
}
\`\`\`
`;

function stateExpectingSaveLocalization(seed: ReturnType<typeof createMockKernelSprintSeed>): {
  state: LifeHarnessData;
  saveNext: ReturnType<typeof getNextFeatureSprintLegalAction>;
} {
  let state = advanceSeedThroughAdopt(seed.state, seed.planId);
  const plan = state.featureSprintPlans.find((item) => item.id === seed.planId)!;
  const target = plan.executionTarget ?? {
    sprintId: "sprint-1",
    storyId: "story-1",
    taskId: seed.taskId,
    phase: "localize" as const
  };
  state = {
    ...state,
    featureSprintPlans: state.featureSprintPlans.map((item) =>
      item.id === seed.planId
        ? {
            ...item,
            executionTarget: { ...target, phase: "localize" }
          }
        : item
    )
  };
  const launch = getNextFeatureSprintLegalAction(state, seed.planId);
  expect("action" in launch && launch.action).toBe("launch_localization");
  if (!("action" in launch)) {
    throw new Error("expected launch_localization");
  }
  const launched = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
  expect(launched.ok).toBe(true);
  if (!launched.ok) {
    throw new Error("expected launch_localization apply");
  }
  const saveNext = getNextFeatureSprintLegalAction(launched.state, seed.planId);
  expect("action" in saveNext && saveNext.action).toBe("save_localization");
  return { state: launched.state, saveNext };
}

function advanceSeedThroughAdopt(state: Parameters<typeof getNextFeatureSprintLegalAction>[0], planId: string) {
  let working = state;
  for (let i = 0; i < 8; i += 1) {
    const next = getNextFeatureSprintLegalAction(working, planId);
    if (!("action" in next)) {
      break;
    }
    if (next.action === "launch_implementation" || next.action === "human_hold") {
      break;
    }
    const applied = applyFeatureSprintLegalAction(working, buildApplyInputFromPresentation(next));
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      break;
    }
    working = applied.state;
  }
  return working;
}

function manualTriggerApply(
  state: Parameters<typeof applyFeatureSprintLegalAction>[0],
  planId: string
) {
  const next = getNextFeatureSprintLegalAction(state, planId);
  if (!("action" in next)) {
    throw new Error("expected legal action");
  }
  const validation = validateFeatureSprintLegalActionTrigger(state, {
    planId,
    actionId: next.actionId,
    stateRevision: next.stateRevision,
    expectedAction: next.action
  });
  expect(validation.ok).toBe(true);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(validation.next));
}

describe("featureSprintManualKernelBridge read-only adapter", () => {
  it("returns approve_spec for frozen-ready kernel seed after clarifications path", () => {
    const seed = createMockKernelSprintSeed({});
    const presentation = presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    expect(presentation.mode).toBe("kernel_managed");
    expect(presentation.next?.action).toBe("approve_spec");
    expect(classifyFeatureSprintLegalAction("approve_spec")).toBe("state_only");
  });

  it("surfaces human hold with typed reason", () => {
    const seed = createMockKernelSprintSeed({ riskTier: "risky" });
    let state = seed.state;
    for (let i = 0; i < 12; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        break;
      }
      if (next.action === "human_hold") {
        const presentation = presentFeatureSprintNextLegalAction(state, seed.planId);
        expect(presentation.next?.holdReason).toBeDefined();
        expect(presentation.canTrigger).toBe(false);
        return;
      }
      const applied = manualTriggerApply(state, seed.planId);
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
    }
    expect.fail("expected human hold for risky task without approval");
  });

  it("shows terminal completion without triggering", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1)
    });
    expect(result.terminalAction).toBe("terminal_complete");
    const presentation = presentFeatureSprintNextLegalAction(result.state, seed.planId);
    expect(presentation.next?.action).toBe("terminal_complete");
    expect(presentation.canTrigger).toBe(false);
    expect(presentation.requiresExternalWorker).toBe(false);
  });

  it("keeps legacy plans non-destructive", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    const legacyState = {
      ...seed.state,
      featureSprintPlans: [{ ...plan, clarifiedSpec: undefined, clarifiedSpecHistory: undefined }]
    };
    const presentation = presentFeatureSprintNextLegalAction(legacyState, seed.planId);
    expect(presentation.mode).toBe("legacy_manual");
    expect(presentation.next).toBeNull();
    expect(isKernelManagedFeatureSprintPlan(plan)).toBe(true);
    expect(isKernelManagedFeatureSprintPlan(legacyState.featureSprintPlans[0]!)).toBe(false);
  });
});

describe("featureSprintManualKernelBridge stale protection", () => {
  it("rejects stale revision on trigger validation", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next).toBe(true);
    if (!("action" in next)) {
      return;
    }
    const stale = validateFeatureSprintLegalActionTrigger(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision + 1,
      expectedAction: next.action
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toBe("stale_action");
    }
  });

  it("rejects action id mismatch", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next).toBe(true);
    if (!("action" in next)) {
      return;
    }
    const mismatch = validateFeatureSprintLegalActionTrigger(seed.state, {
      planId: seed.planId,
      actionId: `${next.actionId}-wrong`,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error).toContain("Action id mismatch");
    }
  });

  it("rejects stale worker proof apply after revision advances", () => {
    const seed = createMockKernelSprintSeed({});
    let state = advanceSeedThroughAdopt(seed.state, seed.planId);

    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch && launch.action).toBe("launch_implementation");
    if (!("action" in launch)) {
      return;
    }
    const launched = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
    expect(launched.ok).toBe(true);
    if (!launched.ok) {
      return;
    }
    state = launched.state;

    const staleApply = applyFeatureSprintLegalAction(state, {
      planId: seed.planId,
      actionId: launch.actionId,
      stateRevision: launch.stateRevision,
      expectedAction: "save_implementation_proof",
      artifact: {
        type: "implementation_proof",
        planId: seed.planId,
        taskId: seed.taskId,
        frozenSpecRevision: 1,
        changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
        rawOutput: "stale",
        verificationResult: "pass"
      }
    });
    expect(staleApply.ok).toBe(false);
    if (!staleApply.ok) {
      expect(staleApply.error).toBe("stale_action");
    }
  });
});

describe("featureSprintManualKernelBridge state-only apply path", () => {
  it("walks approve → freeze → adopt → advance → complete via explicit triggers", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1),
      maxSteps: 30
    });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.action)).toContain("approve_spec");
    expect(result.steps.map((step) => step.action)).toContain("freeze_spec");
    expect(result.steps.map((step) => step.action)).toContain("adopt_sprint_map");
    expect(result.steps.map((step) => step.action)).toContain("advance_task");
    expect(result.steps.map((step) => step.action)).toContain("complete_sprint");
    expect(result.terminalAction).toBe("terminal_complete");
  });
});

describe("featureSprintManualKernelBridge proof and verdict bridge", () => {
  it("rejects wrong-task proof artifact", () => {
    const seed = createMockKernelSprintSeed({});
    let state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const launched = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
    expect(launched.ok).toBe(true);
    if (!launched.ok) {
      return;
    }
    state = launched.state;
    const stepId = state.featureSprintPlans[0]?.currentStepId ?? "step-kernel-1";
    const withOutput = updateFeatureSprintStep(
      state,
      seed.planId,
      stepId,
      { outputSummary: "implementation complete", status: "sent" },
      new Date("2026-07-22T12:00:00.000Z")
    );
    expect(withOutput.ok).toBe(true);
    if (!withOutput.ok || !withOutput.state) {
      return;
    }
    state = withOutput.state;

    const saveNext = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in saveNext && saveNext.action).toBe("save_implementation_proof");
    if (!("action" in saveNext)) {
      return;
    }

    const badProof = applyFeatureSprintLegalAction(
      state,
      buildApplyInputFromPresentation(saveNext, {
        type: "implementation_proof",
        planId: seed.planId,
        taskId: "wrong-task",
        frozenSpecRevision: 1,
        changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
        rawOutput: "x",
        verificationResult: "pass"
      })
    );
    expect(badProof.ok).toBe(false);
  });

  it("rejects failed verification proof", () => {
    const seed = createMockKernelSprintSeed({});
    let state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const launched = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
    expect(launched.ok).toBe(true);
    if (!launched.ok) {
      return;
    }
    state = launched.state;
    const stepId = state.featureSprintPlans[0]?.currentStepId ?? "step-kernel-1";
    const withOutput = updateFeatureSprintStep(
      state,
      seed.planId,
      stepId,
      { outputSummary: "failed run", status: "sent" },
      new Date("2026-07-22T12:00:00.000Z")
    );
    expect(withOutput.ok).toBe(true);
    if (!withOutput.ok || !withOutput.state) {
      return;
    }
    const artifact = buildImplementationProofArtifactForStep(
      {
        ...withOutput.state,
        featureSprintRunnerRuns: [
          {
            id: "run-fail",
            cardId: seed.cardId,
            planId: seed.planId,
            stepId,
            profile: "codex_implementation",
            status: "failed",
            startedAt: "2026-07-22T12:00:00.000Z",
            createdAt: "2026-07-22T12:00:00.000Z",
            updatedAt: "2026-07-22T12:00:00.000Z"
          }
        ]
      },
      seed.planId,
      stepId
    );
    expect(artifact.ok).toBe(false);
    if (!artifact.ok) {
      expect(artifact.holdReason).toBe("verification_failed");
    }
  });

  it("builds review verdict artifact from loop state with proof present", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1),
      maxSteps: 16
    });
    expect(result.steps.some((step) => step.action === "save_implementation_proof")).toBe(true);
    const stepId = result.state.featureSprintPlans[0]?.currentStepId;
    const verdictArtifact = buildReviewVerdictArtifactForStep(
      result.state,
      seed.planId,
      reviewFence("accepted", "Looks good."),
      stepId
    );
    expect(verdictArtifact.ok).toBe(true);
  });
});

describe("featureSprintManualKernelBridge worker delegation semantics", () => {
  it("classifies implementation and review as worker launches", () => {
    expect(classifyFeatureSprintLegalAction("launch_implementation")).toBe("worker_launch");
    expect(classifyFeatureSprintLegalAction("launch_review")).toBe("worker_launch");
    expect(classifyFeatureSprintLegalAction("approve_spec")).toBe("state_only");
  });

  it("does not treat presentation as launch (read-only)", () => {
    const seed = createMockKernelSprintSeed({});
    const beforeRuns = seed.state.featureSprintRunnerRuns.length;
    presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    expect(seed.state.featureSprintRunnerRuns.length).toBe(beforeRuns);
  });

  it("blocks stale launch validation before apply", () => {
    const seed = createMockKernelSprintSeed({});
    const state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const stale = validateFeatureSprintLegalActionTrigger(state, {
      planId: seed.planId,
      actionId: launch.actionId,
      stateRevision: launch.stateRevision - 1,
      expectedAction: launch.action
    });
    expect(stale.ok).toBe(false);
  });
});

describe("featureSprintManualKernelBridge kernel-managed legacy gating", () => {
  const controls = [
    "launch_implementation",
    "launch_review",
    "advance_task",
    "complete_sprint",
    "adopt_sprint_map",
    "select_execution_target",
    "mutate_sprint_map"
  ] as const;

  it("blocks legacy controls for kernel-managed plans", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    for (const control of controls) {
      const guard = guardKernelManagedLegacyControl(plan, control);
      expect(guard.mode).toBe("kernel_blocked");
    }
  });

  it("allows legacy controls for plans without clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const legacyPlan = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined
    };
    expect(guardKernelManagedLegacyControl(legacyPlan, "launch_implementation").mode).toBe(
      "legacy_manual"
    );
    expect(isKernelDelegatedRunnerLaunchAllowed(legacyPlan, false)).toBe(true);
  });

  it("requires kernel delegation flag for kernel-managed runner launch", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    expect(isKernelDelegatedRunnerLaunchAllowed(plan, false)).toBe(false);
    expect(isKernelDelegatedRunnerLaunchAllowed(plan, true)).toBe(true);
  });

  it("rejects stale implementation launch via canTriggerFeatureSprintAction", () => {
    const seed = createMockKernelSprintSeed({});
    const state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const stale = canTriggerFeatureSprintAction(state, {
      planId: seed.planId,
      expectedActions: ["launch_implementation", "launch_correction"],
      actionId: launch.actionId,
      stateRevision: launch.stateRevision - 1
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect("mode" in stale).toBe(false);
    expect(stale.error).toBe("stale_action");
  });

  it("rejects legacy implementation control when kernel expects review", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (let i = 0; i < 20; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        break;
      }
      if (next.action === "launch_review") {
        const blocked = canTriggerFeatureSprintAction(state, {
          planId: seed.planId,
          expectedActions: ["launch_implementation", "launch_correction"]
        });
        expect(blocked.ok).toBe(false);
        if (!blocked.ok && !("mode" in blocked)) {
          expect(blocked.error).toContain("launch_review");
        }
        return;
      }
      const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(next));
      if (!applied.ok) {
        break;
      }
      state = applied.state;
    }
  });

  it("rejects stale review launch via canTriggerFeatureSprintAction", () => {
    const seed = createMockKernelSprintSeed({});
    const progressed = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1),
      maxSteps: 40
    });
    const reviewIndex = progressed.steps.findIndex((step) => step.action === "launch_review");
    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    const beforeReview = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1),
      maxSteps: reviewIndex
    });
    const state = beforeReview.state;
    const reviewLaunch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in reviewLaunch && reviewLaunch.action).toBe("launch_review");
    if (!("action" in reviewLaunch)) {
      return;
    }
    const stale = canTriggerFeatureSprintAction(state, {
      planId: seed.planId,
      expectedActions: ["launch_review"],
      actionId: reviewLaunch.actionId,
      stateRevision: reviewLaunch.stateRevision - 1
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect("mode" in stale).toBe(false);
    expect(stale.error).toBe("stale_action");
  });
});

describe("featureSprintManualKernelBridge worker launch semantics", () => {
  it("records launch intent once without implying provider success", () => {
    const seed = createMockKernelSprintSeed({});
    let state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const beforeAudit = state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    state = applied.state;
    const afterAudit = state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    expect(afterAudit).toBe(beforeAudit + 1);
    const last = state.featureSprintPlans[0]?.actionAuditLog?.[afterAudit - 1];
    expect(last?.result).toBe("applied");
    expect(last?.action).toBe("launch_implementation");
    expect(isKernelDelegatedRunnerLaunchAllowed(state.featureSprintPlans[0]!, true)).toBe(true);
    expect(isKernelDelegatedRunnerLaunchAllowed(state.featureSprintPlans[0]!, false)).toBe(false);
  });
});

describe("featureSprintManualKernelBridge unsupported artifact actions", () => {
  it("does not mark request_clarification as panel-triggerable", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    const presentation = presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    expect(presentation.next?.action).toBe("request_clarification");
    expect(presentation.canTrigger).toBe(false);
    expect(presentation.artifactInputHint).toContain("clarification answers");
  });

  it("routes proof and verdict to dedicated controls", () => {
    const seed = createMockKernelSprintSeed({});
    let state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const launched = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(launch));
    expect(launched.ok).toBe(true);
    if (!launched.ok) {
      return;
    }
    state = launched.state;
    const stepId = state.featureSprintPlans[0]?.currentStepId ?? "step-kernel-1";
    const withOutput = updateFeatureSprintStep(
      state,
      seed.planId,
      stepId,
      { outputSummary: "implementation complete", status: "sent" },
      new Date("2026-07-22T12:00:00.000Z")
    );
    expect(withOutput.ok).toBe(true);
    if (!withOutput.ok || !withOutput.state) {
      return;
    }
    state = withOutput.state;
    const proofPresentation = presentFeatureSprintNextLegalAction(state, seed.planId);
    expect(proofPresentation.next?.action).toBe("save_implementation_proof");
    expect(proofPresentation.canTrigger).toBe(false);
    expect(proofPresentation.artifactInputHint).toContain("Normalize");
  });
});

describe("featureSprintManualKernelBridge telemetry", () => {
  it("does not persist recommendation telemetry from presentation alone", () => {
    const seed = createMockKernelSprintSeed({});
    const before = seed.state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    const after = seed.state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    expect(after).toBe(before);
  });

  it("records applied audit on manual state-only trigger", () => {
    const seed = createMockKernelSprintSeed({});
    const applied = manualTriggerApply(seed.state, seed.planId);
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const plan = applied.state.featureSprintPlans.find((item) => item.id === seed.planId)!;
    expect(plan.actionAuditLog?.some((row) => row.result === "applied")).toBe(true);
    expect(plan.actionAuditLog?.some((row) => row.result === "recommended")).toBe(false);
  });

  it("records rejection audit without revision bump for stale trigger via apply", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next).toBe(true);
    if (!("action" in next)) {
      return;
    }
    const rejected = applyFeatureSprintLegalAction(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision + 1,
      expectedAction: next.action
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.audit) {
      return;
    }
    expect(rejected.audit.result).toBe("rejected");
  });
});

describe("manual kernel bridge dogfood", () => {
  it("blocks legacy launch, runs delegated launch once, and blocks legacy advance", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    expect(guardKernelManagedLegacyControl(plan, "launch_implementation").mode).toBe("kernel_blocked");
    expect(isKernelDelegatedRunnerLaunchAllowed(plan, false)).toBe(false);

    let state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch && launch.action).toBe("launch_implementation");
    if (!("action" in launch)) {
      return;
    }

    const validation = validateFeatureSprintLegalActionTrigger(state, {
      planId: seed.planId,
      actionId: launch.actionId,
      stateRevision: launch.stateRevision,
      expectedAction: launch.action
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }
    expect(isKernelDelegatedRunnerLaunchAllowed(plan, true)).toBe(true);

    const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(validation.next));
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    state = applied.state;
    expect(guardKernelManagedLegacyControl(applied.state.featureSprintPlans[0], "advance_task").mode).toBe(
      "kernel_blocked"
    );

    const stale = validateFeatureSprintLegalActionTrigger(state, {
      planId: seed.planId,
      actionId: launch.actionId,
      stateRevision: launch.stateRevision,
      expectedAction: launch.action
    });
    expect(stale.ok).toBe(false);
  });

  it("keeps legacy manual mode for plans without clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const legacyPlan = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined,
      clarifiedSpecHistory: undefined
    };
    expect(isKernelManagedFeatureSprintPlan(legacyPlan)).toBe(false);
    expect(guardKernelManagedLegacyControl(legacyPlan, "launch_implementation").mode).toBe("legacy_manual");
    const presentation = presentFeatureSprintNextLegalAction(
      {
        ...seed.state,
        featureSprintPlans: [legacyPlan]
      },
      seed.planId
    );
    expect(presentation.mode).toBe("legacy_manual");
  });
});

describe("featureSprintManualKernelBridge localization kernel routing", () => {
  it("keeps legacy localization import available for plans without clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const stepId = "step-kernel-1";
    const legacyPlan = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined,
      clarifiedSpecHistory: undefined,
      currentStepId: stepId,
      steps: [
        {
          id: stepId,
          title: "Kernel step",
          goal: "Localize",
          status: "ready" as const,
          acceptanceCriteria: ["done"],
          createdAt: "2026-07-22T12:00:00.000Z",
          updatedAt: "2026-07-22T12:00:00.000Z"
        }
      ]
    };
    const legacyState = {
      ...seed.state,
      featureSprintPlans: [legacyPlan]
    };
    const artifact = buildLocalizationArtifactForStep(
      legacyState,
      seed.planId,
      SAMPLE_LOCALIZATION_BLOCK,
      stepId
    );
    expect(artifact.ok).toBe(false);
    const imported = importFeaturePromptLocalizationFromText(
      legacyState,
      seed.planId,
      SAMPLE_LOCALIZATION_BLOCK,
      stepId
    );
    expect(imported.ok).toBe(true);
  });

  it("requires save_localization for kernel-managed localization import", () => {
    const seed = createMockKernelSprintSeed({});
    const { saveNext } = stateExpectingSaveLocalization(seed);
    expect("action" in saveNext && saveNext.action).toBe("save_localization");
    const presentation = presentFeatureSprintNextLegalAction(
      stateExpectingSaveLocalization(seed).state,
      seed.planId
    );
    expect(presentation.next?.action).toBe("save_localization");
    expect(presentation.canTrigger).toBe(false);
  });

  it("applies valid localization through the kernel once", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const beforeAudit = state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    const artifact = buildLocalizationArtifactForStep(
      state,
      seed.planId,
      SAMPLE_LOCALIZATION_BLOCK
    );
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) {
      return;
    }
    const applied = applyFeatureSprintLegalAction(
      state,
      buildApplyInputFromPresentation(saveNext, artifact.artifact)
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const plan = applied.state.featureSprintPlans.find((item) => item.id === seed.planId)!;
    const step = plan.steps.find((item) => item.id === plan.currentStepId);
    expect(hasStepPromptLocalization(step)).toBe(true);
    const afterAudit = plan.actionAuditLog?.length ?? 0;
    expect(afterAudit).toBe(beforeAudit + 1);
    expect(plan.actionAuditLog?.[afterAudit - 1]?.result).toBe("applied");
    expect(plan.actionAuditLog?.[afterAudit - 1]?.action).toBe("save_localization");
    const next = getNextFeatureSprintLegalAction(applied.state, seed.planId);
    expect("action" in next && next.action).not.toBe("save_localization");
  });

  it("rejects stale localization revision", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const artifact = buildLocalizationArtifactForStep(
      state,
      seed.planId,
      SAMPLE_LOCALIZATION_BLOCK
    );
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) {
      return;
    }
    const stale = applyFeatureSprintLegalAction(state, {
      planId: seed.planId,
      actionId: saveNext.actionId,
      stateRevision: saveNext.stateRevision - 1,
      expectedAction: "save_localization",
      artifact: artifact.artifact
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toBe("stale_action");
    }
  });

  it("rejects stale localization action id", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const stale = validateFeatureSprintLegalActionTrigger(state, {
      planId: seed.planId,
      actionId: `${saveNext.actionId}-wrong`,
      stateRevision: saveNext.stateRevision,
      expectedAction: "save_localization"
    });
    expect(stale.ok).toBe(false);
  });

  it("rejects localization when another legal action is expected", () => {
    const seed = createMockKernelSprintSeed({});
    const state = advanceSeedThroughAdopt(seed.state, seed.planId);
    const launch = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in launch).toBe(true);
    if (!("action" in launch)) {
      return;
    }
    const blocked = canTriggerFeatureSprintAction(state, {
      planId: seed.planId,
      expectedActions: ["save_localization"]
    });
    expect(blocked.ok).toBe(false);
  });

  it("rejects malformed localization artifact", () => {
    const seed = createMockKernelSprintSeed({});
    const { state } = stateExpectingSaveLocalization(seed);
    const artifact = buildLocalizationArtifactForStep(state, seed.planId, "not a fence");
    expect(artifact.ok).toBe(false);
  });

  it("rejects re-trigger after successful localization apply", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const artifact = buildLocalizationArtifactForStep(
      state,
      seed.planId,
      SAMPLE_LOCALIZATION_BLOCK
    );
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) {
      return;
    }
    const applied = applyFeatureSprintLegalAction(
      state,
      buildApplyInputFromPresentation(saveNext, artifact.artifact)
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const replay = applyFeatureSprintLegalAction(
      applied.state,
      buildApplyInputFromPresentation(saveNext, artifact.artifact)
    );
    expect(replay.ok).toBe(false);
  });
});

describe("featureSprintManualKernelBridge control gating helpers", () => {
  it("blocks adopt-next-slice and approve-spec controls for kernel-managed plans", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    expect(guardKernelManagedLegacyControl(plan, "adopt_next_slice").mode).toBe("kernel_blocked");
    expect(guardKernelManagedLegacyControl(plan, "approve_legacy_feature_spec").mode).toBe(
      "kernel_blocked"
    );
    expect(guardKernelManagedLegacyControl(plan, "select_execution_target").mode).toBe(
      "kernel_blocked"
    );
  });

  it("keeps legacy controls available for plans without clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const legacyPlan = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined
    };
    expect(guardKernelManagedLegacyControl(legacyPlan, "adopt_next_slice").mode).toBe("legacy_manual");
    expect(isKernelManagedPromptAuditLaunchAllowed(legacyPlan)).toBe(true);
  });
});

describe("featureSprintManualKernelBridge prompt audit policy", () => {
  it("rejects kernel-managed prompt-audit worker launch", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0]!;
    expect(isKernelManagedPromptAuditLaunchAllowed(plan)).toBe(false);
    expect(guardKernelManagedLegacyControl(plan, "launch_prompt_audit").mode).toBe("kernel_blocked");
  });

  it("allows legacy prompt-audit launch for plans without clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const legacyPlan = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined
    };
    expect(isKernelManagedPromptAuditLaunchAllowed(legacyPlan)).toBe(true);
  });
});

const SAVED_SPEC_BODY =
  "On an active Feature Sprint plan, add an explicit Backroom control that adopts the saved feature specification as a draft clarifiedSpec.";

function legacyPlanWithSavedFeatureSpec(seed: ReturnType<typeof createMockKernelSprintSeed>) {
  const plan = {
    ...seed.state.featureSprintPlans[0]!,
    clarifiedSpec: undefined,
    clarifiedSpecHistory: undefined,
    featureSpec: {
      body: SAVED_SPEC_BODY,
      source: "manual" as const,
      updatedAt: "2026-07-22T12:00:00.000Z"
    }
  };
  return {
    plan,
    state: {
      ...seed.state,
      featureSprintPlans: [plan]
    } satisfies LifeHarnessData
  };
}

describe("adoptSavedFeatureSpecAsClarifiedDraft", () => {
  it("adopts a saved feature specification into a draft clarifiedSpec", () => {
    const seed = createMockKernelSprintSeed({});
    const { plan, state } = legacyPlanWithSavedFeatureSpec(seed);
    expect(isKernelManagedFeatureSprintPlan(plan)).toBe(false);
    expect(evaluateAdoptSavedFeatureSpecAsClarifiedDraft(plan).available).toBe(true);

    const beforePresentation = presentFeatureSprintNextLegalAction(state, seed.planId);
    expect(beforePresentation.mode).toBe("legacy_manual");

    const adopted = adoptSavedFeatureSpecAsClarifiedDraft(state, seed.planId);
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) {
      return;
    }
    expect(isKernelManagedFeatureSprintPlan(adopted.plan)).toBe(true);
    expect(adopted.plan.clarifiedSpec?.status).toBe("draft");
    expect(adopted.plan.clarifiedSpec?.objective).toBe(SAVED_SPEC_BODY);
    expect(adopted.plan.clarifiedSpec?.userIntent).toBe(SAVED_SPEC_BODY);
    expect(adopted.plan.clarifiedSpec?.acceptanceCriteria).toEqual([SAVED_SPEC_BODY]);
    expect(adopted.plan.clarifiedSpec?.status).not.toBe("approved");
    expect(adopted.plan.clarifiedSpec?.status).not.toBe("frozen");
    expect(adopted.plan.clarifiedSpec?.approvedAt).toBeUndefined();
    expect(adopted.plan.clarifiedSpec?.frozenAt).toBeUndefined();

    const presentation = presentFeatureSprintNextLegalAction(adopted.state, seed.planId);
    expect(presentation.mode).toBe("kernel_managed");
    expect(presentation.next?.action).toBe("approve_spec");
    expect(guardKernelManagedLegacyControl(adopted.plan, "launch_implementation").mode).toBe(
      "kernel_blocked"
    );
  });

  it("does not adopt from presentation alone", () => {
    const seed = createMockKernelSprintSeed({});
    const { state } = legacyPlanWithSavedFeatureSpec(seed);
    presentFeatureSprintNextLegalAction(state, seed.planId);
    const plan = state.featureSprintPlans[0]!;
    expect(plan.clarifiedSpec).toBeUndefined();
    expect(isKernelManagedFeatureSprintPlan(plan)).toBe(false);
  });

  it("rejects missing or empty saved feature specification without mutating", () => {
    const seed = createMockKernelSprintSeed({});
    const bare = {
      ...seed.state.featureSprintPlans[0]!,
      clarifiedSpec: undefined,
      clarifiedSpecHistory: undefined,
      featureSpec: undefined
    };
    const empty = {
      ...bare,
      featureSpec: { body: "   ", source: "manual" as const, updatedAt: "2026-07-22T12:00:00.000Z" }
    };
    const bareState = { ...seed.state, featureSprintPlans: [bare] };
    const emptyState = { ...seed.state, featureSprintPlans: [empty] };

    expect(evaluateAdoptSavedFeatureSpecAsClarifiedDraft(bare).available).toBe(false);
    expect(buildClarifiedSpecDraftArtifactFromSavedFeatureSpec(bare).ok).toBe(false);
    expect(adoptSavedFeatureSpecAsClarifiedDraft(bareState, seed.planId).ok).toBe(false);
    expect(bareState.featureSprintPlans[0]?.clarifiedSpec).toBeUndefined();

    expect(adoptSavedFeatureSpecAsClarifiedDraft(emptyState, seed.planId).ok).toBe(false);
    expect(emptyState.featureSprintPlans[0]?.clarifiedSpec).toBeUndefined();
  });

  it("rejects frozen and approved overwrite while allowing explicit draft replacement", () => {
    const seed = createMockKernelSprintSeed({});
    // Freeze the seed plan via legal actions, then attach a saved featureSpec for adopt attempt.
    let state = seed.state;
    for (const expected of ["approve_spec", "freeze_spec"] as const) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      expect("action" in next && next.action).toBe(expected);
      if (!("action" in next)) {
        return;
      }
      const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(next));
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
    }
    const frozenPlan = {
      ...state.featureSprintPlans[0]!,
      featureSpec: {
        body: SAVED_SPEC_BODY,
        source: "manual" as const,
        updatedAt: "2026-07-22T12:00:00.000Z"
      }
    };
    expect(evaluateAdoptSavedFeatureSpecAsClarifiedDraft(frozenPlan).available).toBe(false);
    expect(
      adoptSavedFeatureSpecAsClarifiedDraft(
        { ...state, featureSprintPlans: [frozenPlan] },
        seed.planId
      ).ok
    ).toBe(false);

    const approvedState = {
      ...seed.state,
      featureSprintPlans: [
        {
          ...seed.state.featureSprintPlans[0]!,
          clarifiedSpec: {
            ...seed.state.featureSprintPlans[0]!.clarifiedSpec!,
            status: "approved" as const,
            approvedAt: "2026-07-22T12:00:00.000Z"
          },
          featureSpec: {
            body: SAVED_SPEC_BODY,
            source: "manual" as const,
            updatedAt: "2026-07-22T12:00:00.000Z"
          }
        }
      ]
    };
    expect(evaluateAdoptSavedFeatureSpecAsClarifiedDraft(approvedState.featureSprintPlans[0]).available).toBe(
      false
    );
    expect(adoptSavedFeatureSpecAsClarifiedDraft(approvedState, seed.planId).ok).toBe(false);

    const { state: legacyState } = legacyPlanWithSavedFeatureSpec(seed);
    const first = adoptSavedFeatureSpecAsClarifiedDraft(legacyState, seed.planId);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const replacedBody = `${SAVED_SPEC_BODY} (revised)`;
    const withNewBody = {
      ...first.state,
      featureSprintPlans: [
        {
          ...first.plan,
          featureSpec: {
            body: replacedBody,
            source: "manual" as const,
            updatedAt: "2026-07-22T13:00:00.000Z"
          }
        }
      ]
    };
    const second = adoptSavedFeatureSpecAsClarifiedDraft(withNewBody, seed.planId);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.plan.clarifiedSpec?.objective).toBe(replacedBody);
    expect(second.plan.clarifiedSpec?.status).toBe("draft");
  });

  it("re-reads current state and leaves unrelated plans unchanged", () => {
    const seed = createMockKernelSprintSeed({});
    const { plan, state } = legacyPlanWithSavedFeatureSpec(seed);
    const otherPlan = {
      ...plan,
      id: "plan-other",
      clarifiedSpec: undefined,
      featureSpec: {
        body: "Other plan body",
        source: "manual" as const,
        updatedAt: "2026-07-22T12:00:00.000Z"
      }
    };
    const multi = {
      ...state,
      featureSprintPlans: [plan, otherPlan]
    };
    const adopted = adoptSavedFeatureSpecAsClarifiedDraft(multi, seed.planId);
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) {
      return;
    }
    expect(adopted.state.featureSprintPlans.find((item) => item.id === "plan-other")?.clarifiedSpec).toBeUndefined();
    expect(
      isKernelManagedFeatureSprintPlan(
        adopted.state.featureSprintPlans.find((item) => item.id === seed.planId)!
      )
    ).toBe(true);

    const protectedState = {
      ...multi,
      featureSprintPlans: [
        {
          ...plan,
          clarifiedSpec: {
            ...seed.state.featureSprintPlans[0]!.clarifiedSpec!,
            status: "frozen" as const,
            frozenAt: "2026-07-22T12:00:00.000Z"
          },
          featureSpec: plan.featureSpec
        },
        otherPlan
      ]
    };
    const blocked = adoptSavedFeatureSpecAsClarifiedDraft(protectedState, seed.planId);
    expect(blocked.ok).toBe(false);
    expect(protectedState.featureSprintPlans[0]?.clarifiedSpec?.status).toBe("frozen");
  });

  it("keeps legacy controls until adoption and does not launch workers", () => {
    const seed = createMockKernelSprintSeed({});
    const { plan, state } = legacyPlanWithSavedFeatureSpec(seed);
    expect(guardKernelManagedLegacyControl(plan, "launch_implementation").mode).toBe("legacy_manual");
    const adopted = adoptSavedFeatureSpecAsClarifiedDraft(state, seed.planId);
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) {
      return;
    }
    expect(adopted.next.action).toBe("approve_spec");
    expect(adopted.next.action).not.toBe("launch_implementation");
    expect(adopted.next.action).not.toBe("freeze_spec");
  });
});

describe("applyClarificationAnswersForPlan", () => {
  it("presents open required questions for request_clarification only", () => {
    const openSeed = createMockKernelSprintSeed({ withOpenClarification: true });
    const openPresentation = presentFeatureSprintNextLegalAction(openSeed.state, openSeed.planId);
    expect(openPresentation.next?.action).toBe("request_clarification");
    expect(openPresentation.canTrigger).toBe(false);
    const questions = listOpenClarificationQuestionsForPresentation(openSeed.state.featureSprintPlans[0]);
    expect(questions).toEqual([
      expect.objectContaining({ id: "q1", required: true })
    ]);

    const closedSeed = createMockKernelSprintSeed({});
    expect(presentFeatureSprintNextLegalAction(closedSeed.state, closedSeed.planId).next?.action).toBe(
      "approve_spec"
    );
    expect(listOpenClarificationQuestionsForPresentation(closedSeed.state.featureSprintPlans[0])).toEqual(
      []
    );
  });

  it("rejects empty, whitespace, unknown, and duplicate answers without mutating", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("request_clarification");
    if (!("action" in next)) {
      return;
    }
    const beforeRevision = resolvePlanStateRevision(seed.state.featureSprintPlans[0]!);

    const empty = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      answers: [{ questionId: "q1", answer: "" }]
    });
    expect(empty.ok).toBe(false);

    const whitespace = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      answers: [{ questionId: "q1", answer: "   " }]
    });
    expect(whitespace.ok).toBe(false);

    const unknown = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      answers: [
        { questionId: "q1", answer: "Yes" },
        { questionId: "unknown", answer: "Nope" }
      ]
    });
    expect(unknown.ok).toBe(false);

    const duplicate = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      answers: [
        { questionId: "q1", answer: "Yes" },
        { questionId: "q1", answer: "Also yes" }
      ]
    });
    expect(duplicate.ok).toBe(false);

    expect(resolvePlanStateRevision(seed.state.featureSprintPlans[0]!)).toBe(beforeRevision);
    expect(seed.state.featureSprintPlans[0]?.clarifiedSpec?.clarificationQuestions[0]?.status).toBe(
      "open"
    );
  });

  it("applies valid answers and advances to approve_spec without approving or freezing", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("request_clarification");
    if (!("action" in next)) {
      return;
    }
    const applied = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      answers: [{ questionId: "q1", answer: "Yes, src/core only." }]
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.plan.clarifiedSpec?.status).toBe("draft");
    expect(applied.plan.clarifiedSpec?.approvedAt).toBeUndefined();
    expect(applied.plan.clarifiedSpec?.frozenAt).toBeUndefined();
    expect(applied.next.action).toBe("approve_spec");
    expect(applied.stateRevision).toBeGreaterThan(next.stateRevision);
    expect(
      presentFeatureSprintNextLegalAction(applied.state, seed.planId).next?.action
    ).toBe("approve_spec");
  });

  it("rejects stale envelopes after revision advances", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    const stale = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in stale && stale.action).toBe("request_clarification");
    if (!("action" in stale)) {
      return;
    }
    const first = applyClarificationAnswersForPlan(seed.state, {
      planId: seed.planId,
      actionId: stale.actionId,
      stateRevision: stale.stateRevision,
      answers: [{ questionId: "q1", answer: "Answered once." }]
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const retry = applyClarificationAnswersForPlan(first.state, {
      planId: seed.planId,
      actionId: stale.actionId,
      stateRevision: stale.stateRevision,
      answers: [{ questionId: "q1", answer: "Stale retry." }]
    });
    expect(retry.ok).toBe(false);
    expect(first.plan.clarifiedSpec?.clarificationQuestions[0]?.answer).toBe("Answered once.");
  });

  it("does not apply from presentation alone and keeps proof/verdict paths intact", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    presentFeatureSprintNextLegalAction(seed.state, seed.planId);
    expect(seed.state.featureSprintPlans[0]?.clarifiedSpec?.clarificationQuestions[0]?.status).toBe(
      "open"
    );

    const built = buildClarificationAnswersArtifactForPlan(seed.state, {
      planId: seed.planId,
      actionId: "wrong",
      stateRevision: 999,
      answers: [{ questionId: "q1", answer: "Nope" }]
    });
    expect(built.ok).toBe(false);

    const happy = createMockKernelSprintSeed({});
    expect(classifyFeatureSprintLegalAction("save_implementation_proof")).toBe("artifact_required");
    expect(classifyFeatureSprintLegalAction("import_review_verdict")).toBe("artifact_required");
    expect(presentFeatureSprintNextLegalAction(happy.state, happy.planId).mode).toBe("kernel_managed");
  });
});
