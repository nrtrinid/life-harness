import { createSeedState } from "../data/createSeedState";
import {
  approveFeatureSpecForPlan,
  importFeatureSprintPlanFromText,
  saveFeatureSpecForCard,
  updateFeatureSprintStep
} from "../core/featureSprintOrchestrator";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import type { LifeCard } from "../core/types";

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID = "card-build-test";

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_FIXED_NOW = "2026-06-09T12:00:00.000Z";

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_PLAN_BLOCK = `
Here is the plan.

\`\`\`feature-sprint-plan
{
  "title": "Feature Sprint Orchestrator",
  "goal": "Manual feature orchestration loop",
  "whyNow": "Solo builder OS needs gates",
  "acceptanceCriteria": ["Plans import from fenced JSON"],
  "nonGoals": ["CLI runner"],
  "constraints": ["Core logic stays pure"],
  "steps": [
    {
      "title": "Core module",
      "goal": "Add orchestrator core",
      "acceptanceCriteria": ["CRUD helpers exist"],
      "suggestedPrompt": "Implement core module"
    },
    {
      "title": "UI",
      "goal": "Backroom section",
      "acceptanceCriteria": ["Buttons copy packets"]
    }
  ]
}
\`\`\`
`;

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT = `\`\`\`feature-spec-update
{
  "revisedSpec": "Revised spec after step 1.",
  "changelog": ["Step 1 complete"],
  "completedSliceSummary": "Core module landed.",
  "remainingWork": ["UI"],
  "nextSlice": {
    "title": "UI",
    "goal": "Backroom section",
    "acceptanceCriteria": ["Buttons copy packets"],
    "nonGoals": ["New automation"],
    "riskTier": "normal"
  },
  "featureComplete": false
}
\`\`\``;

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_COMPLETED_SLICE_SUMMARY =
  "Core module landed.";

export const FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_NEXT_SLICE_TITLE = "UI";

function fixtureCard(): LifeCard {
  return {
    id: FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Dogfood spec update import.",
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
 * Deterministic harness state: active plan, approved spec, current step review accepted.
 * Ready for GPT spec-update paste + manual import in Backroom.
 */
export function createFeatureSprintSpecUpdateDogfoodState(
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
    { body: "Approved initial spec." },
    now
  );
  if (!saved.ok) {
    throw new Error(saved.error);
  }

  const approved = approveFeatureSpecForPlan(saved.state, saved.planId!, now);
  if (!approved.ok) {
    throw new Error(approved.error);
  }

  const imported = importFeatureSprintPlanFromText(
    approved.state,
    FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_CARD_ID,
    FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_PLAN_BLOCK,
    now
  );
  if (!imported.ok) {
    throw new Error(imported.error);
  }

  const plan = imported.state.featureSprintPlans.find((item) => item.id === imported.planId);
  const stepId = plan?.currentStepId;
  if (!stepId || !imported.planId) {
    throw new Error("Dogfood seed missing current step.");
  }

  const reviewed = updateFeatureSprintStep(
    imported.state,
    imported.planId,
    stepId,
    { reviewStatus: "accepted", reviewVerdict: "Accepted.", status: "reviewing" },
    now
  );
  if (!reviewed.ok) {
    throw new Error(reviewed.error);
  }

  return reviewed.state;
}
