import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildFeatureSprintWorkbenchSummary,
  classifyActiveFeatureSprintPlan,
  isNeedsPlanningCard
} from "./featureSprintWorkbench";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintPlan, HarnessFeatureSprintStep, LifeCard } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add feature sprint workbench.",
    doneForNow: "Workbench drafted.",
    doLane: "Wire workbench screen.",
    improveLane: "Do not add execution bridge.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function fixtureStep(overrides: Partial<HarnessFeatureSprintStep> = {}): HarnessFeatureSprintStep {
  return {
    id: "step-1",
    title: "Core module",
    goal: "Add workbench core",
    status: "ready",
    acceptanceCriteria: ["Tests pass"],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function fixturePlan(overrides: Partial<HarnessFeatureSprintPlan> = {}): HarnessFeatureSprintPlan {
  const step = fixtureStep();
  return {
    id: "plan-1",
    cardId: "card-build-test",
    projectId: "project-1",
    title: "Feature Sprint Workbench",
    goal: "Dashboard over feature sprints",
    status: "in_progress",
    acceptanceCriteria: ["Workbench exists"],
    nonGoals: [],
    constraints: [],
    steps: [step],
    currentStepId: step.id,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW),
    cards: [fixtureCard()],
    projects: [
      {
        id: "project-1",
        cardId: "card-build-test",
        name: "life-harness",
        repoPath: "C:/Users/me/Projects/life-harness",
        branch: "main",
        docs: ["docs/01_final_design_doc.md"],
        likelyFiles: ["src/core/featureSprintWorkbench.ts"],
        verificationCommands: ["npm run typecheck", "npm test -- featureSprintWorkbench"],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW
      }
    ],
    featureSprintPlans: [],
    ...overrides
  };
}

describe("featureSprintWorkbench helpers", () => {
  it("classifies active plans into mutually exclusive buckets", () => {
    expect(
      classifyActiveFeatureSprintPlan(
        fixturePlan({ steps: [fixtureStep({ status: "ready" })], currentStepId: "step-1" })
      )
    ).toBe("readyToImplement");

    expect(
      classifyActiveFeatureSprintPlan(
        fixturePlan({ steps: [fixtureStep({ status: "sent" })], currentStepId: "step-1" })
      )
    ).toBe("awaitingAgentOutput");

    expect(
      classifyActiveFeatureSprintPlan(
        fixturePlan({
          steps: [fixtureStep({ status: "reviewing", outputSummary: "Shipped core." })],
          currentStepId: "step-1"
        })
      )
    ).toBe("needsReview");

    expect(
      classifyActiveFeatureSprintPlan(
        fixturePlan({
          steps: [
            fixtureStep({
              status: "reviewing",
              outputSummary: "Shipped core.",
              reviewStatus: "accepted"
            })
          ],
          currentStepId: "step-1"
        })
      )
    ).toBe("readyToAdvance");

    expect(classifyActiveFeatureSprintPlan(fixturePlan({ status: "done" }))).toBe(null);
  });

  it("needsPlanning requires no active plan", () => {
    const data = baseData();
    const card = fixtureCard();
    expect(isNeedsPlanningCard(data, card)).toBe(true);

    const withActive = baseData({
      featureSprintPlans: [fixturePlan({ status: "in_progress" })]
    });
    expect(isNeedsPlanningCard(withActive, card)).toBe(false);
  });
});

describe("buildFeatureSprintWorkbenchSummary", () => {
  it("returns empty sections for empty data", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({ cards: [], projects: [], featureSprintPlans: [] })
    );

    expect(summary.needsPlanning).toEqual([]);
    expect(summary.readyToImplement).toEqual([]);
    expect(summary.awaitingAgentOutput).toEqual([]);
    expect(summary.needsReview).toEqual([]);
    expect(summary.readyToAdvance).toEqual([]);
    expect(summary.recentlyCompleted).toEqual([]);
  });

  it("puts project-backed card with no active plan in needsPlanning", () => {
    const summary = buildFeatureSprintWorkbenchSummary(baseData());
    expect(summary.needsPlanning).toHaveLength(1);
    expect(summary.needsPlanning[0]?.cardId).toBe("card-build-test");
    expect(summary.needsPlanning[0]?.hasProjectMetadata).toBe(true);
  });

  it("excludes card with active plan from needsPlanning", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({ featureSprintPlans: [fixturePlan({ status: "in_progress" })] })
    );
    expect(summary.needsPlanning).toEqual([]);
    expect(summary.readyToImplement).toHaveLength(1);
  });

  it("allows needsPlanning when only done or parked plans exist", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            id: "plan-done",
            status: "done",
            completedAt: "2026-06-08T12:00:00.000Z",
            updatedAt: "2026-06-08T12:00:00.000Z"
          }),
          fixturePlan({
            id: "plan-parked",
            status: "parked",
            updatedAt: "2026-06-07T12:00:00.000Z"
          })
        ]
      })
    );

    expect(summary.needsPlanning).toHaveLength(1);
    expect(summary.recentlyCompleted).toHaveLength(1);
    expect(summary.recentlyCompleted[0]?.planId).toBe("plan-done");
  });

  it("excludes card without project metadata from needsPlanning", () => {
    const summary = buildFeatureSprintWorkbenchSummary(baseData({ projects: [] }));
    expect(summary.needsPlanning).toEqual([]);
  });

  it("excludes S3 cards from needsPlanning and plan rows", () => {
    const s3Card = fixtureCard({ id: "card-s3", sensitivity: "S3" });
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        cards: [fixtureCard(), s3Card],
        featureSprintPlans: [
          fixturePlan({ cardId: "card-s3", id: "plan-s3" }),
          fixturePlan({ id: "plan-active" })
        ]
      })
    );

    expect(summary.needsPlanning.every((row) => row.cardId !== "card-s3")).toBe(true);
    expect(summary.readyToImplement.every((row) => row.cardId !== "card-s3")).toBe(true);
  });

  it("puts ready current step in readyToImplement", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            steps: [fixtureStep({ status: "ready" })],
            currentStepId: "step-1"
          })
        ]
      })
    );

    expect(summary.readyToImplement).toHaveLength(1);
    expect(summary.readyToImplement[0]?.currentStepStatus).toBe("ready");
  });

  it("puts sent step without output in awaitingAgentOutput", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            steps: [fixtureStep({ status: "sent" })],
            currentStepId: "step-1"
          })
        ]
      })
    );

    expect(summary.awaitingAgentOutput).toHaveLength(1);
    expect(summary.readyToImplement).toEqual([]);
  });

  it("puts step with output and no review in needsReview", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            steps: [fixtureStep({ status: "reviewing", outputSummary: "Core shipped." })],
            currentStepId: "step-1"
          })
        ]
      })
    );

    expect(summary.needsReview).toHaveLength(1);
    expect(summary.readyToAdvance).toEqual([]);
  });

  it("puts accepted review in readyToAdvance", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            steps: [
              fixtureStep({
                status: "reviewing",
                outputSummary: "Core shipped.",
                reviewStatus: "accepted"
              })
            ],
            currentStepId: "step-1"
          })
        ]
      })
    );

    expect(summary.readyToAdvance).toHaveLength(1);
    expect(summary.needsReview).toEqual([]);
  });

  it("puts done plans in recentlyCompleted newest first", () => {
    const summary = buildFeatureSprintWorkbenchSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            id: "plan-old",
            title: "Alpha",
            status: "done",
            completedAt: "2026-06-07T12:00:00.000Z",
            updatedAt: "2026-06-07T12:00:00.000Z"
          }),
          fixturePlan({
            id: "plan-new",
            title: "Beta",
            status: "done",
            completedAt: "2026-06-09T12:00:00.000Z",
            updatedAt: "2026-06-09T12:00:00.000Z",
            evidenceProofItemId: "proof-1",
            evidenceLogId: "log-1"
          })
        ]
      })
    );

    expect(summary.recentlyCompleted).toHaveLength(2);
    expect(summary.recentlyCompleted[0]?.planId).toBe("plan-new");
    expect(summary.recentlyCompleted[0]?.evidenceProofItemId).toBe("proof-1");
    expect(summary.recentlyCompleted[1]?.planId).toBe("plan-old");
  });

  it("keeps deterministic ordering with title tie-break", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          id: "plan-b",
          title: "Bravo",
          updatedAt: "2026-06-09T12:00:00.000Z",
          steps: [fixtureStep({ status: "ready" })],
          currentStepId: "step-1"
        }),
        fixturePlan({
          id: "plan-a",
          title: "Alpha",
          updatedAt: "2026-06-09T12:00:00.000Z",
          steps: [fixtureStep({ id: "step-2", status: "ready" })],
          currentStepId: "step-2"
        })
      ]
    });

    const first = buildFeatureSprintWorkbenchSummary(data);
    const second = buildFeatureSprintWorkbenchSummary(data);

    expect(first.readyToImplement.map((row) => row.planId)).toEqual(
      second.readyToImplement.map((row) => row.planId)
    );
    expect(first.readyToImplement.map((row) => row.planId)).toEqual(["plan-a", "plan-b"]);
  });
});
