import { describe, expect, it } from "vitest";

import {
  getActiveFeatureSprintPlanForCard,
  hasApprovedSpecUpdateForStep,
  hasPersistedFeatureSpec,
  importFeatureReviewVerdictFromText,
  importFeatureSprintPlanFromText,
  importFeatureSpecUpdateFromText,
  isFeatureSpecApproved,
  updateFeatureSprintStep
} from "../core/featureSprintOrchestrator";
import {
  createFeatureSprintFullLoopDogfoodState,
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK,
  FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT
} from "./featureSprintFullLoopSeed";

describe("createFeatureSprintFullLoopDogfoodState", () => {
  it("builds an approved spec planning shell ready for fenced plan import", () => {
    const seeded = createFeatureSprintFullLoopDogfoodState();
    const plan = getActiveFeatureSprintPlanForCard(seeded, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);
    expect(plan?.status).toBe("planning");
    expect(plan?.steps).toHaveLength(0);
    expect(plan?.currentStepId).toBeUndefined();
    expect(hasPersistedFeatureSpec(plan)).toBe(true);
    expect(isFeatureSpecApproved(plan)).toBe(true);

    const imported = importFeatureSprintPlanFromText(
      seeded,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const active = getActiveFeatureSprintPlanForCard(
      imported.state,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID
    );
    expect(active?.status).toBe("in_progress");
    expect(active?.steps[0]?.title).toBe("Core module");
    expect(active?.currentStepId).toBe(active?.steps[0]?.id);
    expect(isFeatureSpecApproved(active)).toBe(true);
  });

  it("supports fixture-only conductor imports through spec update", () => {
    let state = createFeatureSprintFullLoopDogfoodState();
    const imported = importFeatureSprintPlanFromText(
      state,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    state = imported.state;
    const plan = getActiveFeatureSprintPlanForCard(state, FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID);
    const stepId = plan?.currentStepId;
    if (!plan || !stepId) {
      throw new Error("Missing plan step.");
    }

    const saved = updateFeatureSprintStep(state, plan.id, stepId, {
      outputSummary: FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
      status: "sent"
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      return;
    }
    state = saved.state;

    const reviewed = importFeatureReviewVerdictFromText(
      state,
      plan.id,
      FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT,
      stepId
    );
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) {
      return;
    }
    state = reviewed.state;

    const specUpdated = importFeatureSpecUpdateFromText(
      state,
      plan.id,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT,
      stepId
    );
    expect(specUpdated.ok).toBe(true);
    if (!specUpdated.ok) {
      return;
    }
    const updatedPlan = getActiveFeatureSprintPlanForCard(
      specUpdated.state,
      FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID
    );
    const updatedStep = updatedPlan?.steps.find((item) => item.id === stepId);
    expect(hasPersistedFeatureSpec(updatedPlan)).toBe(true);
    expect(isFeatureSpecApproved(updatedPlan)).toBe(false);
    expect(hasApprovedSpecUpdateForStep(updatedPlan, updatedStep)).toBe(false);
  });
});
