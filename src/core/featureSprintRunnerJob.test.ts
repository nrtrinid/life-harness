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
  resolveFeatureSprintRunnerProvider,
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
    expect(resolveFeatureSprintNextJobButtonLabel("automated_review")).toBe("Run automated review");
    expect(resolveFeatureSprintNextJobButtonLabel("automated_review", { deepseekMode: "mock" })).toBe(
      "Run automated review (mock)"
    );
    expect(resolveFeatureSprintNextJobButtonLabel("automated_prompt_audit")).toBe(
      "Run automated prompt audit"
    );
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

  it("resolves localization profiles without requiring codex install", () => {
    expect(resolveRunnerProfileForJob("cursor", "copy_localization")).toBe("cursor_localization");
    expect(resolveRunnerProfileForJob("local", "copy_localization")).toBe("codex_localization");
    expect(resolveRunnerProfileForJob("manual", "copy_localization")).toBeUndefined();
    expect(resolveRunnerProfileForJob("chatgpt", "copy_localization")).toBeUndefined();
  });

  it("resolveRunnerJobStartPhase maps copy_localization to localizing", async () => {
    const { resolveRunnerJobStartPhase } = await import("./featureSprintRunnerJob");
    expect(resolveRunnerJobStartPhase("copy_localization")).toBe("localizing");
  });

  it("executeFeatureSprintRunnerJob calls onStarted before runPacket and onFailed on error", async () => {
    const order: string[] = [];
    const runPacket = vi.fn(async () => ({
      ok: false,
      profile: "cursor_localization" as const,
      error: "boom",
      startedAt: FIXED_NOW,
      completedAt: FIXED_NOW
    }));

    const result = await executeFeatureSprintRunnerJob(
      {
        cardId: CARD_ID,
        planId: PLAN_ID,
        stepId: STEP_ID,
        action: "copy_localization",
        role: "localizer",
        provider: "cursor",
        inputPacket: "localization packet",
        runnerProfile: "cursor_localization",
        canMutateRepo: false,
        requiresHumanImport: true,
        requiresHumanApproval: false,
        expectedOutputFence: "feature-prompt-localization"
      },
      {
        runPacket,
        onStarted: async () => {
          order.push("started");
        },
        onFailed: async () => {
          order.push("failed");
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(result.lifecycleStatus).toBe("failed");
    expect(order).toEqual(["started", "failed"]);
    expect(runPacket).toHaveBeenCalledOnce();
  });

  it("copy_localization becomes runner mode when cursor health is available", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          featureSpec: {
            body: "Spec body",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW,
            approvedAt: FIXED_NOW,
            approvedBy: "user"
          }
        })
      ]
    });
    const prepared = prepareFeatureSprintRunnerJob(data, CARD_ID, {
      runnerHealth: "available",
      preferredAgent: "cursor"
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.request.runnerProfile).toBe("cursor_localization");
    const mode = resolveFeatureSprintNextJobButtonMode(prepared.job, {
      preferredAgent: "cursor",
      runnerHealth: "available"
    });
    expect(mode).toBe("runner");
  });

  it("resolves deepseek only for copy_review when explicitly preferred and configured", () => {
    const mockConfig = { available: true, mode: "mock" as const, liveSafe: false };
    const job = reviewJob({ providerOptions: ["chatgpt", "codex", "manual", "deepseek"] });

    expect(
      resolveFeatureSprintRunnerProvider(job, {
        preferredProvider: "deepseek",
        deepseekConfig: mockConfig
      })
    ).toBe("deepseek");

    expect(
      resolveFeatureSprintRunnerProvider(job, {
        preferredAgent: "codex",
        runnerHealth: "available",
        deepseekConfig: mockConfig
      })
    ).toBe("codex");
  });

  it("never resolves deepseek for implementation or localization", () => {
    const mockConfig = { available: true, mode: "mock" as const, liveSafe: false };
    const implJob: FeatureSprintNextJob = {
      label: "Run implementation",
      role: "implementer",
      providerOptions: ["cursor", "codex", "manual", "local", "deepseek"],
      action: "copy_implementation",
      requiresHumanApproval: false,
      requiresHumanImport: false,
      canMutateRepo: true,
      checklist: []
    };

    expect(
      resolveFeatureSprintRunnerProvider(implJob, {
        preferredProvider: "deepseek",
        deepseekConfig: mockConfig
      })
    ).toBe("manual");

    expect(resolveRunnerProfileForJob("deepseek", "copy_review")).toBeUndefined();
  });

  it("unconfigured deepseek falls back to manual review paths", () => {
    const job = reviewJob({ providerOptions: ["chatgpt", "codex", "manual", "deepseek"] });
    expect(
      resolveFeatureSprintRunnerProvider(job, {
        preferredProvider: "deepseek",
        deepseekConfig: { available: false, mode: "unconfigured" }
      })
    ).toBe("manual");
  });

  it("builds automated review packet when provider is deepseek", () => {
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
          featureSpec: {
            body: "Approved spec",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW,
            approvedAt: FIXED_NOW,
            approvedBy: "user"
          }
        })
      ]
    });
    const job = reviewJob({ providerOptions: ["chatgpt", "codex", "manual", "deepseek"] });
    const built = buildFeatureSprintRunnerJobRequest(data, CARD_ID, job, {
      preferredProvider: "deepseek",
      deepseekConfig: { available: true, mode: "mock" }
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.provider).toBe("deepseek");
    expect(built.request.inputPacket).toContain("feature-automated-review-verdict");
    expect(built.request.runnerProfile).toBeUndefined();
  });

  it("resolves automated_review button mode for deepseek copy_review", () => {
    const mode = resolveFeatureSprintNextJobButtonMode(
      reviewJob({ providerOptions: ["chatgpt", "codex", "manual", "deepseek"] }),
      {
        preferredProvider: "deepseek",
        deepseekConfig: { available: true, mode: "mock" }
      }
    );
    expect(mode).toBe("automated_review");
  });

  it("resolves deepseek for copy_prompt_audit only when explicitly preferred", () => {
    const mockConfig = { available: true, mode: "mock" as const, liveSafe: false };
    const auditJob: FeatureSprintNextJob = {
      label: "Run prompt audit",
      role: "prompt_auditor",
      providerOptions: ["chatgpt", "codex", "manual", "deepseek"],
      action: "copy_prompt_audit",
      requiresHumanApproval: false,
      requiresHumanImport: false,
      canMutateRepo: false,
      checklist: []
    };

    expect(
      resolveFeatureSprintRunnerProvider(auditJob, {
        preferredProvider: "deepseek",
        deepseekConfig: mockConfig
      })
    ).toBe("deepseek");

    expect(
      resolveFeatureSprintRunnerProvider(auditJob, {
        preferredAgent: "codex",
        runnerHealth: "available",
        deepseekConfig: mockConfig
      })
    ).toBe("codex");
  });

  it("builds automated prompt audit packet when provider is deepseek", () => {
    const data = baseData({
      featureSprintPlans: [
        fixturePlan({
          currentSlice: {
            id: "slice-1",
            title: "Core module",
            status: "active",
            phase: "prompt_auditing",
            source: "planned_step",
            linkedStepId: STEP_ID,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW
          },
          featureSpec: {
            body: "Approved spec",
            source: "chatgpt_web",
            updatedAt: FIXED_NOW,
            approvedAt: FIXED_NOW,
            approvedBy: "user"
          }
        })
      ]
    });
    const job: FeatureSprintNextJob = {
      label: "Run prompt audit",
      role: "prompt_auditor",
      providerOptions: ["chatgpt", "codex", "manual", "deepseek"],
      action: "copy_prompt_audit",
      requiresHumanApproval: false,
      requiresHumanImport: false,
      canMutateRepo: false,
      checklist: []
    };
    const built = buildFeatureSprintRunnerJobRequest(data, CARD_ID, job, {
      preferredProvider: "deepseek",
      deepseekConfig: { available: true, mode: "mock" },
      proposedCursorPrompt: "Implement bounded slice. Run npm test."
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.provider).toBe("deepseek");
    expect(built.request.inputPacket).toContain("feature-automated-prompt-critique");
    expect(built.request.runnerProfile).toBeUndefined();
  });

  it("resolves automated_prompt_audit button mode for deepseek copy_prompt_audit", () => {
    const mode = resolveFeatureSprintNextJobButtonMode(
      {
        label: "Run prompt audit",
        role: "prompt_auditor",
        providerOptions: ["chatgpt", "codex", "manual", "deepseek"],
        action: "copy_prompt_audit",
        requiresHumanApproval: false,
        requiresHumanImport: false,
        canMutateRepo: false,
        checklist: []
      },
      {
        preferredProvider: "deepseek",
        deepseekConfig: { available: true, mode: "mock" }
      }
    );
    expect(mode).toBe("automated_prompt_audit");
    expect(resolveFeatureSprintNextJobButtonLabel("automated_prompt_audit", { deepseekMode: "mock" })).toBe(
      "Run automated prompt audit (mock)"
    );
  });
});
