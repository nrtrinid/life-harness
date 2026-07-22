import { describe, expect, it } from "vitest";

import { applyFeatureSprintLegalAction } from "./featureSprintApplyLegalAction";
import { createMockKernelSprintSeed } from "./featureSprintKernelDogfood";
import { buildApplyInputFromPresentation } from "./featureSprintManualKernelBridge";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import { hasStepPromptLocalization } from "./featureSprintOrchestrator";
import { resolvePlanStateRevision } from "./featureSprintTaskContract";
import type { LifeHarnessData } from "./lifeHarnessData";

const SAMPLE_LOCALIZATION_BLOCK = `
\`\`\`feature-prompt-localization
{
  "likelyFiles": ["src/core/featureSprintNextLegalAction.ts"],
  "existingHelpers": ["getNextFeatureSprintLegalAction"],
  "testsToRun": ["npm test -- featureSprintApplyLegalAction"],
  "risks": ["Stale action rejection"],
  "revisedImplementationPrompt": "Apply localization through kernel."
}
\`\`\`
`;

function advanceSeedThroughAdopt(state: LifeHarnessData, planId: string) {
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

function stateExpectingSaveLocalization(seed: ReturnType<typeof createMockKernelSprintSeed>) {
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
  expect(launched.state.featureSprintPlans[0]?.automationPhase).toBe("localizing");
  const saveNext = getNextFeatureSprintLegalAction(launched.state, seed.planId);
  expect("action" in saveNext && saveNext.action).toBe("save_localization");
  return { state: launched.state, saveNext, launchRevision: resolvePlanStateRevision(launched.state.featureSprintPlans[0]!) };
}

describe("applyFeatureSprintLegalAction save_localization", () => {
  it("applies valid localization and advances next legal action", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext, launchRevision } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const applied = applyFeatureSprintLegalAction(state, {
      planId: seed.planId,
      actionId: saveNext.actionId,
      stateRevision: saveNext.stateRevision,
      expectedAction: "save_localization",
      artifact: {
        type: "localization",
        planId: seed.planId,
        taskId: seed.taskId,
        frozenSpecRevision: 1,
        text: SAMPLE_LOCALIZATION_BLOCK
      }
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const plan = applied.state.featureSprintPlans.find((item) => item.id === seed.planId)!;
    const step = plan.steps.find((item) => item.id === plan.currentStepId);
    expect(hasStepPromptLocalization(step)).toBe(true);
    expect(resolvePlanStateRevision(plan)).toBe(launchRevision + 1);
    expect("action" in applied.next && applied.next.action).not.toBe("save_localization");
  });

  it("records exactly one applied audit entry", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const beforeAudit = state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    const applied = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(saveNext, {
      type: "localization",
      planId: seed.planId,
      taskId: seed.taskId,
      frozenSpecRevision: 1,
      text: SAMPLE_LOCALIZATION_BLOCK
    }));
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const afterAudit = applied.state.featureSprintPlans[0]?.actionAuditLog?.length ?? 0;
    expect(afterAudit).toBe(beforeAudit + 1);
    expect(applied.audit.result).toBe("applied");
    expect(applied.audit.action).toBe("save_localization");
  });

  it("rejects malformed localization artifact", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const rejected = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(saveNext, {
      type: "localization",
      planId: seed.planId,
      taskId: seed.taskId,
      frozenSpecRevision: 1,
      text: "not a localization fence"
    }));
    expect(rejected.ok).toBe(false);
  });

  it("rejects frozen spec revision mismatch", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const rejected = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(saveNext, {
      type: "localization",
      planId: seed.planId,
      taskId: seed.taskId,
      frozenSpecRevision: 99,
      text: SAMPLE_LOCALIZATION_BLOCK
    }));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toContain("revision");
    }
  });

  it("rejects wrong task id", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const rejected = applyFeatureSprintLegalAction(state, buildApplyInputFromPresentation(saveNext, {
      type: "localization",
      planId: seed.planId,
      taskId: "wrong-task",
      frozenSpecRevision: 1,
      text: SAMPLE_LOCALIZATION_BLOCK
    }));
    expect(rejected.ok).toBe(false);
  });

  it("rejects replay with stale action identity after successful apply", () => {
    const seed = createMockKernelSprintSeed({});
    const { state, saveNext } = stateExpectingSaveLocalization(seed);
    if (!("action" in saveNext)) {
      return;
    }
    const artifact = {
      type: "localization" as const,
      planId: seed.planId,
      taskId: seed.taskId,
      frozenSpecRevision: 1,
      text: SAMPLE_LOCALIZATION_BLOCK
    };
    const applied = applyFeatureSprintLegalAction(
      state,
      buildApplyInputFromPresentation(saveNext, artifact)
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const replay = applyFeatureSprintLegalAction(
      applied.state,
      buildApplyInputFromPresentation(saveNext, artifact)
    );
    expect(replay.ok).toBe(false);
  });
});
