import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  advanceFeatureSprintStep,
  adoptNextSliceProposalForPlan,
  approveFeatureSpecForPlan,
  importFeaturePromptLocalizationFromText,
  importFeatureSprintPlanFromText,
  saveFeatureSpecForCard
} from "./featureSprintOrchestrator";
import {
  buildNextFeatureSprintJob,
  deriveCurrentSliceFromLegacyPlan,
  inferSlicePhaseFromLegacyState,
  mapFeatureSprintNextJobToDogfoodAction,
  resolveFeatureSprintCurrentSlice
} from "./featureSprintCurrentSlice";
import { buildFeatureSprintRunnerJobRequest } from "./featureSprintRunnerJob";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintStep,
  LifeCard
} from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");
const FIXED_NOW_ISO = FIXED_NOW.toISOString();
const CARD_ID = "card-build-test";

function fixtureCard(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: CARD_ID,
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Add feature sprint current slice.",
    doneForNow: "Slice drafted.",
    doLane: "Wire slice core.",
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
    goal: "Add orchestrator core",
    status: "ready",
    acceptanceCriteria: ["CRUD helpers exist"],
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
    ...overrides
  };
}

function fixturePlan(overrides: Partial<HarnessFeatureSprintPlan> = {}): HarnessFeatureSprintPlan {
  const step = fixtureStep();
  return {
    id: "plan-1",
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
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
    ...overrides
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW_ISO),
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
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    ],
    ...overrides
  };
}

const SAMPLE_PLAN_BLOCK = `
\`\`\`feature-sprint-plan
{
  "title": "Feature Sprint Orchestrator",
  "goal": "Manual feature orchestration loop",
  "acceptanceCriteria": ["Plans import from fenced JSON"],
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

const SAMPLE_LOCALIZATION_BLOCK = `
\`\`\`feature-prompt-localization
{
  "revisedImplementationPrompt": "Implement with repo context",
  "likelyFiles": ["src/core/featureSprintOrchestrator.ts"]
}
\`\`\`
`;

describe("featureSprintCurrentSlice", () => {
  it("derives valid phase and job from legacy plan without persisted currentSlice", () => {
    const plan = fixturePlan();
    const step = plan.steps[0]!;
    const slice = deriveCurrentSliceFromLegacyPlan(plan, step);
    expect(slice?.phase).toBe("ready");

    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.action).toBe("copy_localization");
    expect(job?.phase).toBe("ready");
  });

  it("ready phase prefers approve_spec over localization or implementation", () => {
    const plan = fixturePlan({
      featureSpec: {
        body: "Spec body",
        source: "chatgpt_web",
        updatedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.action).toBe("approve_spec");
    expect(job?.requiresHumanApproval).toBe(true);
  });

  it("ready phase suggests copy_localization when spec approved and localization missing", () => {
    const plan = fixturePlan({
      featureSpec: {
        body: "Spec body",
        source: "chatgpt_web",
        updatedAt: FIXED_NOW_ISO,
        approvedAt: FIXED_NOW_ISO,
        approvedBy: "user"
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.action).toBe("copy_localization");
    expect(inferSlicePhaseFromLegacyState(plan, plan.steps[0])).toBe("ready");
  });

  it("moves to prompt_auditing after localization import without entering localizing on copy", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      CARD_ID,
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const beforeImport = getActivePlan(imported.state);
    expect(beforeImport?.currentSlice?.phase).toBe("ready");

    const localized = importFeaturePromptLocalizationFromText(
      imported.state,
      imported.planId!,
      SAMPLE_LOCALIZATION_BLOCK,
      undefined,
      FIXED_NOW
    );
    expect(localized.ok).toBe(true);
    if (!localized.ok) {
      return;
    }

    const plan = getActivePlan(localized.state);
    expect(plan?.currentSlice?.phase).toBe("prompt_auditing");
    expect(plan?.currentSlice?.phase).not.toBe("localizing");
  });

  it("sets typed expectedOutputFence on import jobs", () => {
    const plan = fixturePlan({
      currentSlice: {
        id: "slice-1",
        title: "Core module",
        status: "active",
        phase: "prompt_auditing",
        source: "planned_step",
        linkedStepId: "step-1",
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.expectedOutputFence).toBe("feature-prompt-critique");
    expect(job?.requiresHumanImport).toBe(true);
    expect(job?.canMutateRepo).toBe(false);
  });

  it("adopt creates source adopted_next_slice", () => {
    const plan = fixturePlan({
      currentStepId: undefined,
      status: "reviewing",
      steps: [{ ...fixtureStep(), status: "done" }],
      nextSliceProposal: {
        title: "Next slice",
        goal: "Continue",
        acceptanceCriteria: ["Done"],
        proposedAt: FIXED_NOW_ISO
      }
    });
    const adopted = adoptNextSliceProposalForPlan(baseData({ featureSprintPlans: [plan] }), plan.id, FIXED_NOW);
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) {
      return;
    }
    const nextPlan = adopted.state.featureSprintPlans.find((item) => item.id === plan.id);
    expect(nextPlan?.currentSlice?.source).toBe("adopted_next_slice");
    expect(nextPlan?.currentSlice?.phase).toBe("ready");
  });

  it("advance marks slice done and creates next ready slice", () => {
    const step1 = fixtureStep({ id: "step-1", status: "done", reviewStatus: "accepted" });
    const step2 = fixtureStep({ id: "step-2", title: "UI", status: "ready" });
    const plan = fixturePlan({
      steps: [step1, step2],
      currentStepId: "step-1",
      currentSlice: {
        id: "slice-1",
        title: "Core module",
        status: "active",
        phase: "ready_to_advance",
        source: "planned_step",
        linkedStepId: "step-1",
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    });
    const advanced = advanceFeatureSprintStep(
      baseData({ featureSprintPlans: [plan] }),
      plan.id,
      "step-1",
      FIXED_NOW
    );
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) {
      return;
    }
    const nextPlan = advanced.state.featureSprintPlans.find((item) => item.id === plan.id);
    expect(nextPlan?.currentStepId).toBe("step-2");
    expect(nextPlan?.currentSlice?.phase).toBe("ready");
    expect(nextPlan?.currentSlice?.linkedStepId).toBe("step-2");
    expect(nextPlan?.currentSlice?.title).toBe("UI");
  });

  it("returns adopt_next_slice when proposal exists and no current step", () => {
    const plan = fixturePlan({
      currentStepId: undefined,
      status: "reviewing",
      steps: [{ ...fixtureStep(), status: "done" }],
      nextSliceProposal: {
        title: "Next slice",
        goal: "Continue",
        acceptanceCriteria: ["Done"],
        proposedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.action).toBe("adopt_next_slice");
  });

  it("maps import localization fence to dogfood manual action", () => {
    const mapped = mapFeatureSprintNextJobToDogfoodAction({
      label: "Import localization",
      role: "localizer",
      providerOptions: ["manual"],
      action: "import_localization",
      expectedOutputFence: "feature-prompt-localization",
      requiresHumanApproval: false,
      requiresHumanImport: true,
      canMutateRepo: false,
      checklist: ["Paste localization output, then import."]
    });
    expect(mapped.kind).toBe("manual");
  });

  it("builds runner job request from phased next job", () => {
    const plan = fixturePlan({
      currentSlice: {
        id: "slice-1",
        title: "Core module",
        status: "active",
        phase: "implementing",
        source: "planned_step",
        linkedStepId: "step-1",
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      { runnerHealth: "available" }
    );
    expect(job?.action).toBe("copy_implementation");

    const built = buildFeatureSprintRunnerJobRequest(
      baseData({ featureSprintPlans: [plan] }),
      CARD_ID,
      job!,
      { runnerHealth: "available", preferredAgent: "codex" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.inputPacket.length).toBeGreaterThan(50);
    expect(built.request.runnerProfile).toBe("codex_implementation");
  });

  it("persists currentSlice phase through approve spec on imported plan", () => {
    const imported = importFeatureSprintPlanFromText(
      baseData(),
      CARD_ID,
      SAMPLE_PLAN_BLOCK,
      FIXED_NOW
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const saved = saveFeatureSpecForCard(
      imported.state,
      CARD_ID,
      { body: "Initial spec", source: "chatgpt_web" },
      FIXED_NOW
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      return;
    }

    const approved = approveFeatureSpecForPlan(saved.state, saved.planId!, FIXED_NOW);
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }

    const plan = approved.state.featureSprintPlans.find((item) => item.id === saved.planId);
    expect(plan?.currentSlice?.phase).toBe("ready");
    expect(resolveFeatureSprintCurrentSlice(plan)?.phase).toBe("ready");
  });

  it("localizing with failed localization run retries copy_localization", () => {
    const plan = fixturePlan({
      featureSpec: {
        body: "Spec body",
        source: "chatgpt_web",
        updatedAt: FIXED_NOW_ISO,
        approvedAt: FIXED_NOW_ISO,
        approvedBy: "user"
      },
      currentSlice: {
        id: "slice-1",
        title: "Core module",
        status: "active",
        phase: "localizing",
        source: "planned_step",
        linkedStepId: "step-1",
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({
        featureSprintPlans: [plan],
        featureSprintRunnerRuns: [
          {
            id: "run-loc-failed",
            profile: "cursor_localization",
            status: "failed",
            cardId: CARD_ID,
            planId: plan.id,
            stepId: "step-1",
            nextJobAction: "copy_localization",
            nextJobLifecycleStatus: "failed",
            startedAt: FIXED_NOW_ISO,
            createdAt: FIXED_NOW_ISO,
            updatedAt: FIXED_NOW_ISO
          }
        ]
      }),
      CARD_ID,
      { runnerHealth: "available", runnerAgent: "cursor" }
    );
    expect(job?.action).toBe("copy_localization");
    expect(job?.phase).toBe("localizing");
  });

  it("localizing with staged localization output suggests import_localization", () => {
    const plan = fixturePlan({
      featureSpec: {
        body: "Spec body",
        source: "chatgpt_web",
        updatedAt: FIXED_NOW_ISO,
        approvedAt: FIXED_NOW_ISO,
        approvedBy: "user"
      },
      currentSlice: {
        id: "slice-1",
        title: "Core module",
        status: "active",
        phase: "localizing",
        source: "planned_step",
        linkedStepId: "step-1",
        createdAt: FIXED_NOW_ISO,
        updatedAt: FIXED_NOW_ISO
      }
    });
    const job = buildNextFeatureSprintJob(
      baseData({
        featureSprintPlans: [plan],
        featureSprintRunnerRuns: [
          {
            id: "run-loc-staged",
            profile: "cursor_localization",
            status: "succeeded",
            cardId: CARD_ID,
            planId: plan.id,
            stepId: "step-1",
            outputText: SAMPLE_LOCALIZATION_BLOCK,
            nextJobAction: "copy_localization",
            nextJobLifecycleStatus: "staged",
            stagedAt: FIXED_NOW_ISO,
            startedAt: FIXED_NOW_ISO,
            createdAt: FIXED_NOW_ISO,
            updatedAt: FIXED_NOW_ISO
          }
        ]
      }),
      CARD_ID,
      { runnerHealth: "available", runnerAgent: "cursor" }
    );
    expect(job?.action).toBe("import_localization");
  });
});

function getActivePlan(data: LifeHarnessData): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((item) => item.cardId === CARD_ID);
}
