import { describe, expect, it, vi } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildFeatureSprintRunnerJobRequest,
  executeFeatureSprintRunnerJob,
  getFeatureSprintRunnerJobStagingTarget,
  isHumanOnlyFeatureSprintRunnerJobAction,
  prepareFeatureSprintRunnerJob,
  resolveFeatureSprintNextJobButtonLabel,
  resolveFeatureSprintNextJobButtonMode,
  resolveRunnerProfileForJob
} from "./featureSprintRunnerJob";
import type { FeatureSprintNextJob } from "./featureSprintCurrentSlice";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintPlan, HarnessFeatureSprintStep, LifeCard } from "./types";

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
    nextTinyAction: "Add runner job bridge.",
    doneForNow: "Bridge drafted.",
    doLane: "Wire runner job core.",
    improveLane: "Do not add autonomy.",
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
    title: "Core module",
    goal: "Add orchestrator core",
    status: "ready",
    acceptanceCriteria: ["CRUD helpers exist"],
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
    title: "Feature Sprint Orchestrator",
    goal: "Manual feature orchestration loop",
    status: "in_progress",
    acceptanceCriteria: ["Plans import from fenced JSON"],
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
        cardId: CARD_ID,
        name: "life-harness",
        repoPath: "C:/Users/me/Projects/life-harness",
        branch: "main",
        docs: ["docs/01_final_design_doc.md"],
        likelyFiles: ["src/core/featureSprintOrchestrator.ts"],
        verificationCommands: ["npm test"],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW
      }
    ],
    ...overrides
  };
}

function reviewJob(overrides: Partial<FeatureSprintNextJob> = {}): FeatureSprintNextJob {
  return {
    label: "Run review",
    role: "reviewer",
    providerOptions: ["chatgpt", "codex", "manual"],
    action: "copy_review",
    expectedOutputFence: "feature-review-verdict",
    requiresHumanApproval: false,
    requiresHumanImport: false,
    canMutateRepo: false,
    checklist: ["Copy review packet."],
    phase: "reviewing",
    ...overrides
  };
}

describe("featureSprintRunnerJob", () => {
  it("blocks human gate actions from prepare", () => {
    const result = prepareFeatureSprintRunnerJob(
      baseData({
        featureSprintPlans: [
          fixturePlan({
            featureSpec: {
              body: "Unapproved spec",
              source: "chatgpt_web",
              updatedAt: FIXED_NOW
            }
          })
        ]
      }),
      CARD_ID,
      { runnerHealth: "available", preferredAgent: "codex" }
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("human_required");
    expect(isHumanOnlyFeatureSprintRunnerJobAction("advance_slice")).toBe(true);
    expect(isHumanOnlyFeatureSprintRunnerJobAction("import_spec_update")).toBe(false);
  });

  it("builds runner request from next job with input packet", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          currentSlice: {
            id: "slice-1",
            title: "Core module",
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
              outputSummary: "Implemented.",
              implementationProof: {
                rawOutput: "Implemented.",
                filesChanged: ["src/core/foo.ts"],
                behaviorChanged: ["Changed"],
                testsRun: ["npm test"],
                testsNotRun: [],
                verificationResult: "pass",
                knownRisks: [],
                suggestedReviewFocus: ["Behavior"],
                createdAt: FIXED_NOW,
                updatedAt: FIXED_NOW
              }
            })
          ]
        })
      ]
    });

    const built = buildFeatureSprintRunnerJobRequest(data, CARD_ID, reviewJob(), {
      runnerHealth: "available",
      preferredAgent: "codex",
      agentOutput: "Implemented."
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.inputPacket.length).toBeGreaterThan(100);
    expect(built.request.expectedOutputFence).toBe("feature-review-verdict");
    expect(built.request.runnerProfile).toBe("codex_review");
  });

  it("falls back to manual provider when runner health is unavailable", () => {
    const built = buildFeatureSprintRunnerJobRequest(
      baseData({ featureSprintPlans: [fixturePlan()] }),
      CARD_ID,
      {
        label: "Run scoping",
        role: "architect",
        providerOptions: ["chatgpt", "codex", "manual"],
        action: "run_scoping",
        expectedOutputFence: "feature-sprint-plan",
        requiresHumanImport: true,
        requiresHumanApproval: false,
        canMutateRepo: false,
        checklist: []
      },
      { runnerHealth: "unavailable", preferredAgent: "codex" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.provider).toBe("manual");
    expect(built.request.runnerProfile).toBeUndefined();
  });

  it("marks implementation job as repo-mutating only with runner profile", () => {
    const built = buildFeatureSprintRunnerJobRequest(
      baseData({ featureSprintPlans: [fixturePlan()] }),
      CARD_ID,
      {
        label: "Run implementation",
        role: "implementer",
        providerOptions: ["cursor", "codex", "manual"],
        action: "copy_implementation",
        requiresHumanApproval: false,
        requiresHumanImport: false,
        canMutateRepo: true,
        checklist: []
      },
      { runnerHealth: "available", preferredAgent: "cursor" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.canMutateRepo).toBe(true);
    expect(built.request.runnerProfile).toBe("cursor_implementation");
    expect(built.request.worktree?.enabled).toBe(true);
  });

  it("prepares import_spec_update packet without importing", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          featureSpec: {
            body: "Living spec",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW,
            approvedAt: FIXED_NOW,
            approvedBy: "user"
          },
          steps: [
            fixtureStep({
              reviewStatus: "accepted",
              outputSummary: "Shipped slice"
            })
          ],
          currentSlice: {
            id: "slice-1",
            title: "Core module",
            status: "active",
            phase: "spec_updating",
            source: "planned_step",
            linkedStepId: STEP_ID,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          }
        })
      ]
    });

    const job: FeatureSprintNextJob = {
      label: "Import spec update",
      role: "spec_updater",
      providerOptions: ["chatgpt", "manual"],
      action: "import_spec_update",
      expectedOutputFence: "feature-spec-update",
      requiresHumanImport: true,
      requiresHumanApproval: false,
      canMutateRepo: false,
      checklist: ["Paste architect spec update, then import."],
      phase: "spec_updating"
    };

    const prepared = prepareFeatureSprintRunnerJob(data, CARD_ID, {
      runnerHealth: "available"
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.request.action).toBe("import_spec_update");
    expect(prepared.request.inputPacket).toContain("feature-spec-update");

    const built = buildFeatureSprintRunnerJobRequest(data, CARD_ID, job, {
      runnerHealth: "available"
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.inputPacket).toContain("feature-spec-update");
    expect(built.request.provider).toBe("manual");
    expect(getFeatureSprintRunnerJobStagingTarget("import_spec_update")).toBe("spec_update");
  });

  it("executeFeatureSprintRunnerJob returns output only", async () => {
    const runPacket = vi.fn(async () => ({
      ok: true,
      profile: "codex_review" as const,
      outputText: "```feature-review-verdict\n{}\n```",
      startedAt: FIXED_NOW,
      completedAt: FIXED_NOW
    }));

    const result = await executeFeatureSprintRunnerJob(
      {
        cardId: CARD_ID,
        planId: PLAN_ID,
        stepId: STEP_ID,
        action: "copy_review",
        role: "reviewer",
        provider: "codex",
        inputPacket: "review packet",
        runnerProfile: "codex_review",
        canMutateRepo: false,
        requiresHumanImport: true,
        requiresHumanApproval: false,
        expectedOutputFence: "feature-review-verdict"
      },
      { runPacket }
    );

    expect(result.ok).toBe(true);
    expect(result.outputText).toContain("feature-review-verdict");
    expect(runPacket).toHaveBeenCalledOnce();
    expect("stagedForImport" in result).toBe(false);
  });

  it("resolves button labels by mode", () => {
    expect(resolveFeatureSprintNextJobButtonLabel("runner")).toBe("Run next job");
    expect(resolveFeatureSprintNextJobButtonLabel("manual")).toBe("Prepare next job");
    expect(resolveFeatureSprintNextJobButtonLabel("human_gate")).toBe("Show next gate");
  });

  it("resolves button mode for review job when runner is available", () => {
    const mode = resolveFeatureSprintNextJobButtonMode(reviewJob(), {
      preferredAgent: "codex",
      runnerHealth: "available"
    });
    expect(mode).toBe("runner");
  });

  it("maps prompt audit profile for codex only", () => {
    expect(resolveRunnerProfileForJob("codex", "copy_prompt_audit")).toBe("codex_prompt_audit");
    expect(resolveRunnerProfileForJob("cursor", "copy_prompt_audit")).toBeUndefined();
  });
});
