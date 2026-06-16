import { createSeedState } from "../data/createSeedState";
import {
  approveFeatureSpecForPlan,
  getActiveFeatureSprintPlanForCard,
  isFeatureSpecApproved,
  saveFeatureSpecForCard
} from "../core/featureSprintOrchestrator";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import type { LifeCard } from "../core/types";
import {
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_FIXED_NOW
} from "./featureSprintSpecUpdateSeed";

export {
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID as FEATURE_SPRINT_FULL_LOOP_DOGFOOD_CARD_ID,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_PLAN_BLOCK as FEATURE_SPRINT_FULL_LOOP_DOGFOOD_PLAN_BLOCK,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT as FEATURE_SPRINT_FULL_LOOP_DOGFOOD_SPEC_UPDATE_OUTPUT,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY as FEATURE_SPRINT_FULL_LOOP_DOGFOOD_COMPLETED_SLICE_SUMMARY,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE as FEATURE_SPRINT_FULL_LOOP_DOGFOOD_NEXT_SLICE_TITLE
} from "./featureSprintSpecUpdateSeed";

export {
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT
} from "./featureSprintDogfoodFixtures";

function fixtureCard(): LifeCard {
  return {
    id: FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Dogfood full mock conductor loop.",
    doneForNow: "Seed ready.",
    doLane: "Wire dogfood harness.",
    improveLane: "Do not add automation.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

/**
 * Deterministic harness state: project metadata + approved feature spec on a planning shell.
 * Playwright fills import textareas with fenced mock outputs (no runner / no real agents).
 */
export function createFeatureSprintFullLoopDogfoodState(
  now = new Date(FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_FIXED_NOW)
): LifeHarnessData {
  const saved = saveFeatureSpecForCard(
    {
      ...createSeedState(now.toISOString()),
      cards: [fixtureCard()],
      projects: [
        {
          id: "project-dogfood-1",
          cardId: FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
          name: "life-harness",
          repoPath: "C:/Users/me/Projects/life-harness",
          branch: "main",
          docs: ["docs/01_final_design_doc.md"],
          likelyFiles: ["src/core/featureSprintOrchestrator.ts"],
          verificationCommands: ["npm run typecheck"],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      ]
    },
    FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
    { body: "Approved initial spec for full-loop dogfood." },
    now
  );
  if (!saved.ok) {
    throw new Error(saved.error);
  }

  const approved = approveFeatureSpecForPlan(saved.state, saved.planId!, now);
  if (!approved.ok) {
    throw new Error(approved.error);
  }

  const plan = getActiveFeatureSprintPlanForCard(
    approved.state,
    FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID
  );
  if (!plan || plan.steps.length > 0 || plan.status !== "planning") {
    throw new Error("Full-loop dogfood seed must be a planning shell without imported steps.");
  }
  if (!isFeatureSpecApproved(plan)) {
    throw new Error("Full-loop dogfood seed requires an approved feature spec.");
  }

  return approved.state;
}
