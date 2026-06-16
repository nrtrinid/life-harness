import { createSeedState } from "../data/createSeedState";
import { approveFeatureSpecForPlan, saveFeatureSpecForCard } from "../core/featureSprintOrchestrator";
import type { LifeHarnessData } from "../core/lifeHarnessData";
import type { LifeCard } from "../core/types";
import {
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT,
  FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT
} from "./featureSprintDogfoodFixtures";

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID = "card-build-test";

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_FIXED_NOW = "2026-06-09T12:00:00.000Z";

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SINGLE_STEP_PLAN_BLOCK = `
Here is the plan.

\`\`\`feature-sprint-plan
{
  "title": "Living spec loop",
  "goal": "Close one slice at a time",
  "acceptanceCriteria": ["Slices can be adopted"],
  "nonGoals": [],
  "constraints": [],
  "steps": [
    {
      "title": "Core module",
      "goal": "Add orchestrator core",
      "acceptanceCriteria": ["CRUD helpers exist"]
    }
  ]
}
\`\`\`
`;

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_SPEC_UPDATE_OUTPUT = `\`\`\`feature-spec-update
{
  "revisedSpec": "Revised spec after Core module.",
  "changelog": ["Core module complete"],
  "completedSliceSummary": "Core module landed.",
  "remainingWork": ["Telemetry"],
  "nextSlice": {
    "title": "Telemetry",
    "goal": "Add basic event logging hooks",
    "acceptanceCriteria": ["One new Backroom action is logged"],
    "nonGoals": ["Backend orchestration"],
    "riskTier": "normal"
  },
  "featureComplete": false
}
\`\`\``;

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_NEXT_SLICE_TITLE = "Telemetry";

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_IMPLEMENTATION_OUTPUT =
  FEATURE_SPRINT_DOGFOOD_MOCK_IMPLEMENTATION_OUTPUT;

export const FEATURE_SPRINT_NEXT_SLICE_ADOPTION_MOCK_REVIEW_OUTPUT =
  FEATURE_SPRINT_DOGFOOD_MOCK_REVIEW_OUTPUT;

function fixtureCard(): LifeCard {
  return {
    id: FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID,
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Dogfood next slice adoption.",
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
 * Playwright imports a single-step plan so advancing leaves no ready step, enabling adoption.
 */
export function createFeatureSprintNextSliceAdoptionDogfoodState(
  now = new Date(FEATURE_SPRINT_NEXT_SLICE_ADOPTION_FIXED_NOW)
): LifeHarnessData {
  const saved = saveFeatureSpecForCard(
    {
      ...createSeedState(now.toISOString()),
      cards: [fixtureCard()],
      projects: [
        {
          id: "project-dogfood-1",
          cardId: FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID,
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
    FEATURE_SPRINT_NEXT_SLICE_ADOPTION_DOGFOOD_CARD_ID,
    { body: "Approved initial spec for next slice adoption dogfood." },
    now
  );
  if (!saved.ok) {
    throw new Error(saved.error);
  }

  const approved = approveFeatureSpecForPlan(saved.state, saved.planId!, now);
  if (!approved.ok) {
    throw new Error(approved.error);
  }

  return approved.state;
}

