import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { normalizeData } from "./stateHydration";
import {
  advanceFeatureSprintStep,
  buildFeatureScopingPacket,
  buildFeatureStepImplementationPacket,
  buildFeatureStepReviewPacket,
  completeFeatureSprintPlan,
  createFeatureSprintPlanForCard,
  deleteFeatureSprintPlan,
  getActiveFeatureSprintPlanForCard,
  getFeatureSprintPlansForCard,
  importFeatureReviewVerdictFromText,
  importFeatureSprintPlanFromText,
  parseFeatureReviewVerdictBlock,
  parseFeatureSprintPlanBlock,
  stripFeatureSprintBlocks,
  updateFeatureSprintPlan,
  updateFeatureSprintStep
} from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { LifeCard } from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add feature sprint orchestrator.",
    doneForNow: "Orchestrator drafted.",
    doLane: "Wire orchestrator core.",
    improveLane: "Do not add execution bridge.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW.toISOString()),
    cards: [fixtureCard()],
    projects: [
      {
        id: "project-1",
        cardId: "card-build-test",
        name: "life-harness",
        repoPath: "C:/Users/me/Projects/life-harness",
        branch: "main",
        docs: ["docs/01_final_design_doc.md"],
        likelyFiles: ["src/core/featureSprintOrchestrator.ts"],
        verificationCommands: ["npm run typecheck", "npm test -- featureSprintOrchestrator"],
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString()
      }
    ],
    ...overrides
  };
}

const SAMPLE_PLAN_BLOCK = `
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

describe("normalizeData", () => {
  it("defaults featureSprintPlans to empty array", () => {
    const normalized = normalizeData({
      cards: [],
      dailyState: createSeedState().dailyState
    });
    expect(normalized.featureSprintPlans).toEqual([]);
  });
});

describe("featureSprintOrchestrator", () => {
  it("creates a plan for a card", () => {
    const result = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-build-test",
        title: "Feature Sprint",
        goal: "Ship orchestrator",
        acceptanceCriteria: ["Core exists"],
        steps: [
          {
            title: "Core",
            goal: "Add module",
            acceptanceCriteria: ["Tests pass"]
          }
        ]
      },
      FIXED_NOW
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const plan = getActiveFeatureSprintPlanForCard(result.state, "card-build-test");
    expect(plan?.title).toBe("Feature Sprint");
    expect(plan?.status).toBe("in_progress");
    expect(plan?.steps).toHaveLength(1);
    expect(plan?.projectId).toBe("project-1");
  });

  it("rejects missing card", () => {
    const result = createFeatureSprintPlanForCard(baseData(), {
      cardId: "missing",
      title: "X",
      goal: "Y",
      acceptanceCriteria: ["Z"]
    });
    expect(result).toEqual({ ok: false, error: "Card not found: missing" });
  });

  it("rejects S3 card", () => {
    const data = baseData({
      cards: [fixtureCard({ id: "card-s3", sensitivity: "S3" })]
    });
    const result = createFeatureSprintPlanForCard(data, {
      cardId: "card-s3",
      title: "X",
      goal: "Y",
      acceptanceCriteria: ["Z"]
    });
    expect(result).toEqual({
      ok: false,
      error: "S3 cards cannot use feature sprint orchestration."
    });
  });

  it("updates plan and step", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-build-test",
        title: "Feature Sprint",
        goal: "Ship orchestrator",
        acceptanceCriteria: ["Core exists"]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const plan = getActiveFeatureSprintPlanForCard(created.state, "card-build-test");
    expect(plan).toBeDefined();
    if (!plan) {
      return;
    }

    const updatedPlan = updateFeatureSprintPlan(
      created.state,
      plan.id,
      { whyNow: "Now is the time" },
      FIXED_NOW
    );
    expect(updatedPlan.ok).toBe(true);
    if (!updatedPlan.ok) {
      return;
    }

    const withStep = updateFeatureSprintPlan(updatedPlan.state, plan.id, {
      steps: [
        {
          id: "step-1",
          title: "Core",
          goal: "Add module",
          status: "ready",
          acceptanceCriteria: ["Tests pass"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        }
      ],
      currentStepId: "step-1"
    }, FIXED_NOW);
    expect(withStep.ok).toBe(true);
    if (!withStep.ok) {
      return;
    }

    const stepUpdated = updateFeatureSprintStep(
      withStep.state,
      plan.id,
      "step-1",
      { outputSummary: "Implemented core" },
      FIXED_NOW
    );
    expect(stepUpdated.ok).toBe(true);
    const active = getActiveFeatureSprintPlanForCard(stepUpdated.ok ? stepUpdated.state : withStep.state, "card-build-test");
    expect(active?.steps[0].status).toBe("sent");
    expect(active?.steps[0].outputSummary).toBe("Implemented core");
  });

  it("advances step and moves current step id", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
    expect(plan?.currentStepId).toBe(plan?.steps[0].id);

    const advanced = advanceFeatureSprintStep(
      imported.state,
      imported.planId,
      plan!.steps[0].id,
      FIXED_NOW
    );
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) {
      return;
    }

    const nextPlan = getActiveFeatureSprintPlanForCard(advanced.state, "card-build-test");
    expect(nextPlan?.steps[0].status).toBe("done");
    expect(nextPlan?.currentStepId).toBe(nextPlan?.steps[1].id);
    expect(nextPlan?.steps[1].status).toBe("ready");
  });

  it("completes plan idempotently without duplicate proof", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const first = completeFeatureSprintPlan(imported.state, imported.planId, {}, FIXED_NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const proofCount = first.state.proofItems.length;
    const logCount = first.state.logs.length;
    const plan = first.state.featureSprintPlans.find((item) => item.id === imported.planId);
    expect(plan?.evidenceProofItemId).toBeTruthy();

    const second = completeFeatureSprintPlan(first.state, imported.planId, {}, FIXED_NOW);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.state.proofItems).toHaveLength(proofCount);
    expect(second.state.logs).toHaveLength(logCount);
    expect(
      second.state.featureSprintPlans.find((item) => item.id === imported.planId)?.evidenceProofItemId
    ).toBe(plan?.evidenceProofItemId);
  });

  it("deletes plan and scopes plans by card", () => {
    const created = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-build-test",
        title: "Feature Sprint",
        goal: "Ship orchestrator",
        acceptanceCriteria: ["Core exists"]
      },
      FIXED_NOW
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(getFeatureSprintPlansForCard(created.state, "card-build-test")).toHaveLength(1);
    const deleted = deleteFeatureSprintPlan(created.state, created.planId);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      return;
    }
    expect(getFeatureSprintPlansForCard(deleted.state, "card-build-test")).toHaveLength(0);
  });

  it("builds scoping packet with card and project context", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain("Momentum Board v0.1");
    expect(result.markdown).toContain("life-harness");
    expect(result.markdown).toContain("feature-sprint-plan");
  });

  it("builds implementation packet with step and verification commands", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
    const result = buildFeatureStepImplementationPacket(imported.state, imported.planId);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain(plan?.steps[0].title ?? "");
    expect(result.markdown).toContain("npm test -- featureSprintOrchestrator");
  });

  it("builds review packet with agent output", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const result = buildFeatureStepReviewPacket(
      imported.state,
      imported.planId,
      undefined,
      "Changed orchestrator core and tests."
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain("Changed orchestrator core and tests.");
    expect(result.markdown).toContain("feature-review-verdict");
  });

  it("parses valid plan block and rejects invalid/incomplete blocks", () => {
    expect(parseFeatureSprintPlanBlock(SAMPLE_PLAN_BLOCK)?.title).toBe(
      "Feature Sprint Orchestrator"
    );
    expect(parseFeatureSprintPlanBlock("no fence here")).toBeUndefined();
    expect(
      parseFeatureSprintPlanBlock(
        '```feature-sprint-plan\n{"title":"Only title"}\n```'
      )
    ).toBeUndefined();
  });

  it("parses review verdict and imports it onto current step", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const reviewText = `
\`\`\`feature-review-verdict
{
  "status": "accepted",
  "verdict": "Looks good.",
  "nextPrompt": "Polish UI",
  "followUps": ["Add docs"]
}
\`\`\`
`;
    const parsed = parseFeatureReviewVerdictBlock(reviewText);
    expect(parsed?.status).toBe("accepted");

    const verdict = importFeatureReviewVerdictFromText(
      imported.state,
      imported.planId,
      reviewText,
      undefined,
      FIXED_NOW
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) {
      return;
    }

    const plan = getActiveFeatureSprintPlanForCard(verdict.state, "card-build-test");
    expect(plan?.latestReviewStatus).toBe("accepted");
    expect(plan?.steps[0].suggestedPrompt).toBe("Polish UI");
    expect(plan?.steps[0].reviewVerdict).toContain("Follow-ups:");
  });

  it("replaces active plan on import while preserving plan id", () => {
    const first = importFeatureSprintPlanFromText(
      baseData(),
      "card-build-test",
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = importFeatureSprintPlanFromText(
      first.state,
      "card-build-test",
      SAMPLE_PLAN_BLOCK.replace("Feature Sprint Orchestrator", "Feature Sprint Orchestrator v2"),
      FIXED_NOW
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.planId).toBe(first.planId);
    const plan = getActiveFeatureSprintPlanForCard(second.state, "card-build-test");
    expect(plan?.title).toBe("Feature Sprint Orchestrator v2");
    expect(getFeatureSprintPlansForCard(second.state, "card-build-test")).toHaveLength(1);
  });

  it("strips feature sprint blocks from display text", () => {
    const stripped = stripFeatureSprintBlocks(SAMPLE_PLAN_BLOCK);
    expect(stripped).not.toContain("feature-sprint-plan");
    expect(stripped).toContain("Here is the plan.");
  });
});
