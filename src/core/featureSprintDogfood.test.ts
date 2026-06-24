import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  createFeatureSprintSpecUpdateDogfoodState,
  FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT
} from "../dogfood/featureSprintSpecUpdateSeed";
import { importFeatureSpecUpdateFromText } from "./featureSprintOrchestrator";
import {
  buildFeatureSprintDogfoodSummary,
  type FeatureSprintDogfoodNextAction
} from "./featureSprintDogfood";
import type { FeatureSprintRunnerProfile } from "./featureSprintRunner";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintStep,
  LifeCard
} from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";
const CARD_ID = "card-build-test";
const PLAN_ID = "plan-1";
const STEP_ID = "step-1";

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: CARD_ID,
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add feature sprint dogfood checklist.",
    doneForNow: "Checklist drafted.",
    doLane: "Wire pure readiness builder.",
    improveLane: "Do not add new automation power.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: [],
    ...overrides
  };
}

function fixtureStep(overrides: Partial<HarnessFeatureSprintStep> = {}): HarnessFeatureSprintStep {
  return {
    id: STEP_ID,
    title: "Core checklist",
    goal: "Add dogfood summary builder",
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
    id: PLAN_ID,
    cardId: CARD_ID,
    projectId: "project-1",
    title: "Feature Sprint Dogfood Checklist",
    goal: "Make the builder loop easier to test",
    status: "in_progress",
    acceptanceCriteria: ["Checklist exists"],
    nonGoals: [],
    constraints: [],
    steps: [step],
    currentStepId: step.id,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function fixtureRun(
  profile: FeatureSprintRunnerProfile,
  overrides: Partial<HarnessFeatureSprintRunnerRun> = {}
): HarnessFeatureSprintRunnerRun {
  return {
    id: `run-${profile}`,
    profile,
    status: "succeeded",
    cardId: CARD_ID,
    planId: profile === "codex_scoping" ? undefined : PLAN_ID,
    stepId: profile === "codex_scoping" ? undefined : STEP_ID,
    outputText: "Runner output",
    outputExcerpt: "Runner output",
    startedAt: FIXED_NOW,
    completedAt: FIXED_NOW,
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
        cardId: CARD_ID,
        name: "life-harness",
        repoPath: "C:/Users/me/Projects/life-harness",
        branch: "main",
        docs: ["docs/01_final_design_doc.md"],
        likelyFiles: ["src/core/featureSprintDogfood.ts"],
        verificationCommands: ["npm run typecheck", "npm test -- featureSprintDogfood"],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW
      }
    ],
    featureSprintPlans: [],
    featureSprintRunnerRuns: [],
    ...overrides
  };
}

function nextKind(data: LifeHarnessData, runnerHealth: "unknown" | "available" | "unavailable" = "available"): FeatureSprintDogfoodNextAction["kind"] {
  return buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth }).nextAction.kind;
}

describe("buildFeatureSprintDogfoodSummary", () => {
  it("returns blocked not-ready summary for missing card", () => {
    const summary = buildFeatureSprintDogfoodSummary(baseData({ cards: [] }), CARD_ID);
    expect(summary.overallStatus).toBe("not_ready");
    expect(summary.cardTitle).toBe("Missing card");
    expect(summary.nextAction.kind).toBe("manual");
    expect(summary.checks[0]?.status).toBe("blocked");
  });

  it("blocks S3/redacted cards", () => {
    const summary = buildFeatureSprintDogfoodSummary(
      baseData({ cards: [fixtureCard({ sensitivity: "S3" })] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(summary.overallStatus).toBe("not_ready");
    expect(summary.nextAction.kind).toBe("manual");
    expect(summary.checks.find((check) => check.id === "card")?.status).toBe("blocked");
  });

  it("points cards without project metadata to add_project_metadata", () => {
    expect(nextKind(baseData({ projects: [] }))).toBe("add_project_metadata");
  });

  it("points cards without repo path to add_project_metadata", () => {
    const data = baseData({
      projects: [
        {
          id: "project-1",
          cardId: CARD_ID,
          name: "life-harness",
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW
        }
      ]
    });
    expect(nextKind(data)).toBe("add_project_metadata");
  });

  it("warns but does not block when verification commands are missing", () => {
    const data = baseData({
      projects: [
        {
          id: "project-1",
          cardId: CARD_ID,
          name: "life-harness",
          repoPath: "C:/repo",
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW
        }
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    expect(summary.nextAction.kind).toBe("run_scoping");
    expect(summary.checks.find((check) => check.id === "verification_commands")?.status).toBe("warning");
  });

  it("points project-backed cards with unknown runner to check_runner", () => {
    expect(nextKind(baseData(), "unknown")).toBe("check_runner");
  });

  it("warns when runner is unavailable but keeps loop in progress", () => {
    const data = baseData({
      featureSprintPlans: [fixturePlan()]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "unavailable" });
    expect(summary.nextAction.kind).toBe("check_runner");
    expect(summary.overallStatus).toBe("in_progress");
    expect(summary.checks.find((check) => check.id === "runner_health")?.status).toBe("warning");
  });

  it("uses cursor agent in run_review next action detail", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          steps: [
            {
              ...fixtureStep(),
              outputSummary: "Implemented slice.",
              implementationProof: {
                rawOutput: "Implemented slice.",
                normalizedAt: FIXED_NOW,
                verificationResult: {
                  command: "npm test",
                  status: "passed",
                  startedAt: FIXED_NOW,
                  completedAt: FIXED_NOW
                },
                filesChanged: ["src/core/featureSprintDogfood.ts"]
              },
              reviewStatus: undefined
            }
          ]
        })
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, {
      runnerHealth: "available",
      runnerAgent: "cursor"
    });
    expect(summary.nextAction.kind).toBe("run_review");
    expect(summary.nextAction.label).toContain("Cursor");
  });

  it("points project-backed cards with available runner and no plan to run_scoping", () => {
    expect(nextKind(baseData(), "available")).toBe("run_scoping");
  });

  it("points unimported scoping output to import_plan", () => {
    const data = baseData({
      featureSprintRunnerRuns: [fixtureRun("codex_scoping")]
    });
    expect(nextKind(data)).toBe("import_plan");
  });

  it("points ready plan step with no localization to copy_localization job", () => {
    const summary = buildFeatureSprintDogfoodSummary(
      baseData({
        featureSprintPlans: [fixturePlan()]
      }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(summary.nextJob?.action).toBe("copy_localization");
    expect(summary.nextAction.kind).toBe("manual");
  });

  it("matches nextJob action for phased plan with persisted currentSlice", () => {
    const summary = buildFeatureSprintDogfoodSummary(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            currentSlice: {
              id: "slice-1",
              title: "Core checklist",
              status: "active",
              phase: "implementing",
              source: "planned_step",
              linkedStepId: STEP_ID,
              createdAt: FIXED_NOW,
              updatedAt: FIXED_NOW
            }
          })
        ]
      }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(summary.nextJob?.action).toBe("copy_implementation");
    expect(summary.nextAction.kind).toBe("run_implementation");
    expect(summary.currentSlicePhase).toBe("implementing");
  });

  it("legacy seed without persisted slice still returns valid next action", () => {
    const summary = buildFeatureSprintDogfoodSummary(
      baseData({ featureSprintPlans: [fixturePlan()] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(summary.nextAction.label.length).toBeGreaterThan(0);
    expect(summary.nextJob?.phase).toBe("ready");
  });

  it("points unapproved persisted spec to approve_feature_spec before run_implementation", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          featureSpec: {
            body: "ChatGPT web spec.",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW
          },
          automationPhase: "spec_unapproved"
        })
      ]
    });
    expect(nextKind(data)).toBe("approve_feature_spec");
  });

  it("allows copy_implementation after approved spec when localization exists", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          featureSpec: {
            body: "Approved spec.",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW,
            approvedAt: FIXED_NOW,
            approvedBy: "user"
          },
          automationPhase: "spec_approved",
          currentSlice: {
            id: "slice-1",
            title: "Core checklist",
            status: "active",
            phase: "ready",
            source: "planned_step",
            linkedStepId: STEP_ID,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          },
          steps: [
            fixtureStep({
              promptLocalization: {
                revisedImplementationPrompt: "Localized prompt",
                likelyFiles: ["src/core/featureSprintDogfood.ts"],
                rawOutput: "localization",
                updatedAt: FIXED_NOW
              }
            })
          ]
        })
      ]
    });
    expect(nextKind(data)).toBe("run_implementation");
  });

  it("points implementation output awaiting save to save_agent_output", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          currentSlice: {
            id: "slice-1",
            title: "Core checklist",
            status: "active",
            phase: "implementing",
            source: "planned_step",
            linkedStepId: STEP_ID,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          }
        })
      ],
      featureSprintRunnerRuns: [
        fixtureRun("codex_implementation", {
          worktreePath: "C:/tmp/worktree",
          changedFiles: ["src/core/featureSprintDogfood.ts"],
          diffStat: "1 file changed"
        })
      ]
    });
    expect(nextKind(data)).toBe("save_agent_output");
  });

  it("points saved output without review to normalize proof first", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          steps: [fixtureStep({ status: "sent", outputSummary: "Implemented core." })]
        })
      ]
    });
    expect(nextKind(data)).toBe("save_agent_output");
  });

  it("warns when proof is not normalized but does not block review", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          steps: [fixtureStep({ status: "sent", outputSummary: "Implemented core." })]
        })
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    expect(summary.checks.find((check) => check.id === "step_implementation_proof")).toMatchObject({
      status: "warning"
    });
    expect(summary.checks.find((check) => check.id === "advance_gate")?.status).toBe("missing");
    expect(nextKind(data)).toBe("save_agent_output");
  });

  it("marks implementation proof ready when normalized", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          steps: [
            fixtureStep({
              status: "sent",
              outputSummary: "Implemented core.",
              implementationProof: {
                rawOutput: "Implemented core.",
                filesChanged: ["src/core/foo.ts"],
                behaviorChanged: ["See raw implementation output."],
                testsRun: ["npm test"],
                testsNotRun: [],
                verificationResult: "pass",
                knownRisks: [],
                suggestedReviewFocus: ["Confirm behavior matches step acceptance criteria."],
                createdAt: FIXED_NOW,
                updatedAt: FIXED_NOW
              }
            })
          ]
        })
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    expect(summary.checks.find((check) => check.id === "step_implementation_proof")).toMatchObject({
      status: "ready"
    });
  });

  it("points review output awaiting import to import_review", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          currentSlice: {
            id: "slice-1",
            title: "Core checklist",
            status: "active",
            phase: "reviewing",
            source: "planned_step",
            linkedStepId: STEP_ID,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          },
          steps: [
            fixtureStep({
              status: "sent",
              outputSummary: "Implemented core.",
              implementationProof: {
                rawOutput: "Implemented core.",
                filesChanged: ["src/core/foo.ts"],
                behaviorChanged: ["See raw implementation output."],
                testsRun: ["npm test"],
                testsNotRun: [],
                verificationResult: "pass",
                knownRisks: [],
                suggestedReviewFocus: ["Confirm behavior matches step acceptance criteria."],
                createdAt: FIXED_NOW,
                updatedAt: FIXED_NOW
              }
            })
          ]
        })
      ],
      featureSprintRunnerRuns: [fixtureRun("codex_review")]
    });
    expect(nextKind(data)).toBe("import_review");
  });

  it("points accepted review to advance_step", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          steps: [
            fixtureStep({
              status: "reviewing",
              outputSummary: "Implemented core.",
              reviewStatus: "accepted",
              reviewVerdict: "Looks good."
            })
          ]
        })
      ]
    });
    expect(nextKind(data)).toBe("advance_step");
  });

  it("points adoptable next slice proposal to adopt_next_slice", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          status: "reviewing",
          currentStepId: undefined,
          steps: [fixtureStep({ status: "done", completedAt: FIXED_NOW })],
          nextSliceProposal: {
            title: "UI",
            goal: "Backroom section",
            acceptanceCriteria: ["Buttons copy packets"],
            nonGoals: []
          }
        })
      ]
    });
    expect(nextKind(data)).toBe("adopt_next_slice");
  });

  it("points accepted review with unapproved spec update to approve revised feature spec", () => {
    const seed = createFeatureSprintSpecUpdateDogfoodState(new Date(FIXED_NOW));
    const plan = seed.featureSprintPlans[0];
    const stepId = plan?.currentStepId;
    if (!plan || !stepId) {
      throw new Error("Missing dogfood plan step.");
    }
    const updated = importFeatureSpecUpdateFromText(
      seed,
      plan.id,
      FEATURE_SPRINT_SPEC_UPDATE_DOGFOOD_GPT_OUTPUT,
      stepId,
      new Date(FIXED_NOW)
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    const summary = buildFeatureSprintDogfoodSummary(updated.state, CARD_ID, {
      runnerHealth: "available"
    });
    expect(summary.nextAction).toMatchObject({
      kind: "approve_feature_spec",
      label: "Approve revised feature spec"
    });
    expect(summary.nextAction.detail).toContain("Approve revised spec");
    expect(summary.checks.find((check) => check.id === "advance_gate")?.status).toBe("warning");
  });

  it("points reviewing plan without current step to complete_feature", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          status: "reviewing",
          currentStepId: undefined,
          steps: [fixtureStep({ status: "done", completedAt: FIXED_NOW })]
        })
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    expect(summary.nextAction.kind).toBe("complete_feature");
    expect(summary.overallStatus).toBe("in_progress");
  });

  it("points all-steps-done plan to complete_feature", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          currentStepId: undefined,
          steps: [fixtureStep({ status: "done", completedAt: FIXED_NOW })]
        })
      ]
    });
    expect(nextKind(data)).toBe("complete_feature");
  });

  it("points completed plan with proof to inspect_proof", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          status: "done",
          currentStepId: undefined,
          steps: [fixtureStep({ status: "done", completedAt: FIXED_NOW })],
          evidenceLogId: "log-1",
          evidenceProofItemId: "proof-1"
        })
      ]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID);
    expect(summary.overallStatus).toBe("complete");
    expect(summary.nextAction.kind).toBe("inspect_proof");
  });

  it("keeps checklist order deterministic", () => {
    const data = baseData({
      featureSprintPlans: [fixturePlan()],
      featureSprintRunnerRuns: [fixtureRun("codex_implementation")]
    });
    const summary = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    expect(summary.checks.map((check) => check.id)).toEqual([
      "card",
      "project",
      "repo_path",
      "verification_commands",
      "runner_health",
      "active_plan",
      "feature_spec",
      "feature_spec_approval",
      "current_step",
      "step_localization",
      "step_prompt_audit",
      "implementation_run",
      "implementation_metadata",
      "verification_results",
      "step_output",
      "step_implementation_proof",
      "review_output",
      "review_verdict",
      "advance_gate",
      "completion_proof"
    ]);
  });

  it("is deterministic and does not mutate state", () => {
    const data = baseData({
      featureSprintPlans: [fixturePlan()],
      featureSprintRunnerRuns: [fixtureRun("codex_implementation")]
    });
    const before = JSON.stringify(data);
    const first = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });
    const second = buildFeatureSprintDogfoodSummary(data, CARD_ID, { runnerHealth: "available" });

    expect(second).toEqual(first);
    expect(JSON.stringify(data)).toBe(before);
  });
});
