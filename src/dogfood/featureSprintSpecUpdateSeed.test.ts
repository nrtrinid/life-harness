import { describe, expect, it } from "vitest";

import {
  advanceFeatureSprintStep,
  canRunFeatureSprintImplementation,
  getActiveFeatureSprintPlanForCard,
  hasApprovedSpecUpdateForStep,
  importFeatureSpecUpdateFromText
} from "../core/featureSprintOrchestrator";
import {
  createFeatureSprintSpecUpdateDogfoodState,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE
} from "./featureSprintSpecUpdateSeed";

describe("createFeatureSprintSpecUpdateDogfoodState", () => {
  it("builds a reviewed step that still blocks advance until spec update is imported and approved", () => {
    const seeded = createFeatureSprintSpecUpdateDogfoodState();
    const plan = getActiveFeatureSprintPlanForCard(seeded, FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID);
    const step = plan?.steps.find((item) => item.id === plan.currentStepId);
    expect(plan).toBeTruthy();
    expect(step?.reviewStatus).toBe("accepted");
    expect(canRunFeatureSprintImplementation(plan)).toBe(true);

    const blocked = advanceFeatureSprintStep(seeded, plan!.id, plan!.currentStepId!);
    expect(blocked.ok).toBe(false);

    const imported = importFeatureSpecUpdateFromText(
      seeded,
      plan!.id,
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT,
      plan!.currentStepId
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const updatedPlan = getActiveFeatureSprintPlanForCard(
      imported.state,
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID
    );
    const updatedStep = updatedPlan?.steps.find((item) => item.id === updatedPlan.currentStepId);
    expect(updatedPlan?.latestSpecUpdate?.completedSliceSummary).toBe(
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY
    );
    expect(updatedPlan?.nextSliceProposal?.title).toBe(
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE
    );
    expect(canRunFeatureSprintImplementation(updatedPlan)).toBe(false);
    expect(hasApprovedSpecUpdateForStep(updatedPlan, updatedStep)).toBe(false);
    expect(advanceFeatureSprintStep(imported.state, plan!.id, plan!.currentStepId!).ok).toBe(false);
  });
});
