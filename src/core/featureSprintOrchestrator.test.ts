import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import { normalizeData } from "./stateHydration";
import {
  advanceFeatureSprintStep,
  approveFeatureSpecForPlan,
  buildFeatureReviewVerdictFenceDraft,
  buildFeatureScopingPacket,
  describeReviewVerdictImportFailure,
  FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS,
  buildFeatureStepImplementationPacket,
  buildFeatureStepLocalizationPacket,
  buildFeatureStepPromptAuditPacket,
  buildFeatureStepReviewPacket,
  canRunFeatureSprintImplementation,
  completeFeatureSprintPlan,
  createFeatureSprintPlanForCard,
  deleteFeatureSprintPlan,
  getActiveFeatureSprintPlanForCard,
  getFeatureSprintPlansForCard,
  hasStepPromptAudit,
  hasStepImplementationProof,
  hasStepPromptLocalization,
  importFeaturePromptAuditFromText,
  importFeaturePromptLocalizationFromText,
  importFeatureReviewVerdictFromText,
  importFeatureSprintPlanFromText,
  isFeatureSpecApproved,
  normalizeImplementationProofForStep,
  parseFeaturePromptCritiqueBlock,
  parseFeaturePromptLocalizationBlock,
  parseFeatureReviewVerdictBlock,
  parseFeatureSprintPlanBlock,
  resolveStepImplementationPrompt,
  saveFeatureSpecForCard,
  stripFeatureSprintBlocks,
  updateFeatureSprintPlan,
  updateFeatureSprintStep
} from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { FeatureSprintVerificationResult } from "./featureSprintRunner";
import type { LifeCard } from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");
const FIXED_NOW_ISO = FIXED_NOW.toISOString();

function verificationResult(
  input: Pick<FeatureSprintVerificationResult, "command" | "status"> &
    Partial<FeatureSprintVerificationResult>
): FeatureSprintVerificationResult {
  return {
    startedAt: FIXED_NOW_ISO,
    completedAt: FIXED_NOW_ISO,
    ...input
  };
}

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

  it("includes rough spec and scoping instructions when provided", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", {
      now: FIXED_NOW,
      roughSpec: "Build a safe worktree cleanup button."
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain("## Untrusted: User-provided rough spec");
    expect(result.markdown).toContain("## Scoping instructions");
    expect(result.markdown).toContain("Build a safe worktree cleanup button.");
    expect(result.markdown).toContain(
      "Use the untrusted rough-spec block above as primary intent evidence"
    );
  });

  it("trims whitespace from rough spec before inserting", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", {
      now: FIXED_NOW,
      roughSpec: "   Build X   "
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain("Build X");
    expect(result.markdown).not.toContain("   Build X   ");
  });

  it("omits rough spec sections when roughSpec is whitespace only", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", {
      now: FIXED_NOW,
      roughSpec: "   "
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).not.toContain("## Untrusted: User-provided rough spec");
    expect(result.markdown).not.toContain("## Scoping instructions");
  });

  it("caps rough spec and notes truncation", () => {
    const longSpec = "x".repeat(FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS + 50);
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", {
      now: FIXED_NOW,
      roughSpec: longSpec
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).toContain("(truncated)");
    expect(result.markdown).not.toContain("x".repeat(FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS + 1));
  });

  it("places rough spec before existing context", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", {
      now: FIXED_NOW,
      roughSpec: "Build feature intake."
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const roughIndex = result.markdown.indexOf("## Untrusted: User-provided rough spec");
    const contextIndex = result.markdown.indexOf("## Existing context");
    expect(roughIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeGreaterThan(roughIndex);
  });

  it("preserves key scoping sections when rough spec is empty", () => {
    const result = buildFeatureScopingPacket(baseData(), "card-build-test", { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.markdown).not.toContain("## Untrusted: User-provided rough spec");
    expect(result.markdown).not.toContain("## Scoping instructions");
    expect(result.markdown).toContain("# Feature Scoping Packet");
    expect(result.markdown).toContain("## Card summary");
    expect(result.markdown).toContain("feature-sprint-plan");
  });

  it("does not mutate data when building scoping packet with rough spec", () => {
    const data = baseData();
    const before = JSON.stringify(data);
    buildFeatureScopingPacket(data, "card-build-test", {
      now: FIXED_NOW,
      roughSpec: "Build feature intake."
    });
    expect(JSON.stringify(data)).toBe(before);
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

  it("describes review import failures for common Codex output shapes", () => {
    expect(describeReviewVerdictImportFailure("")).toContain("Load latest review output");
    expect(describeReviewVerdictImportFailure('"followUps": []')).toContain("JSON fragment");
    expect(describeReviewVerdictImportFailure("needs_changes\n\nFindings here")).toContain("Wrap as verdict block");
  });

  it("wraps prose review output into a feature-review-verdict fence draft", () => {
    const wrapped = buildFeatureReviewVerdictFenceDraft(
      "needs_changes\n\n1. Fix latestSpecUpdate scoping."
    );
    expect(wrapped).toContain("```feature-review-verdict");
    expect(parseFeatureReviewVerdictBlock(wrapped ?? "")?.status).toBe("needs_changes");
    expect(parseFeatureReviewVerdictBlock(wrapped ?? "")?.verdict).toContain("Fix latestSpecUpdate");
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

  describe("Phase A feature spec", () => {
    it("saves feature spec and creates planning shell when no plan exists", () => {
      const result = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Build web architect mode.", source: "chatgpt_web" },
        FIXED_NOW
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(result.state, "card-build-test");
      expect(plan?.status).toBe("planning");
      expect(plan?.featureSpec?.body).toBe("Build web architect mode.");
      expect(plan?.featureSpec?.source).toBe("chatgpt_web");
      expect(plan?.automationPhase).toBe("spec_unapproved");
      expect(isFeatureSpecApproved(plan)).toBe(false);
    });

    it("approves persisted feature spec", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Approved spec body." },
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

      const plan = getActiveFeatureSprintPlanForCard(approved.state, "card-build-test");
      expect(plan?.featureSpec?.approvedAt).toBe(FIXED_NOW.toISOString());
      expect(plan?.featureSpec?.approvedBy).toBe("user");
      expect(plan?.automationPhase).toBe("spec_approved");
      expect(isFeatureSpecApproved(plan)).toBe(true);
    });

    it("preserves approval on identical re-save", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Same body.", source: "manual" },
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

      const resaved = saveFeatureSpecForCard(
        approved.state,
        "card-build-test",
        { body: "Same body.", source: "manual" },
        FIXED_NOW
      );
      expect(resaved.ok).toBe(true);
      if (!resaved.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(resaved.state, "card-build-test");
      expect(plan?.featureSpec?.approvedAt).toBe(FIXED_NOW.toISOString());
      expect(plan?.automationPhase).toBe("spec_approved");
    });

    it("clears approval when body changes", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Original body." },
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

      const changed = saveFeatureSpecForCard(
        approved.state,
        "card-build-test",
        { body: "Changed body." },
        FIXED_NOW
      );
      expect(changed.ok).toBe(true);
      if (!changed.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(changed.state, "card-build-test");
      expect(plan?.featureSpec?.approvedAt).toBeUndefined();
      expect(plan?.automationPhase).toBe("spec_unapproved");
    });

    it("clears approval when source changes", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Stable body.", source: "chatgpt_web" },
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

      const resourced = saveFeatureSpecForCard(
        approved.state,
        "card-build-test",
        { body: "Stable body.", source: "manual" },
        FIXED_NOW
      );
      expect(resourced.ok).toBe(true);
      if (!resourced.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(resourced.state, "card-build-test");
      expect(plan?.featureSpec?.approvedAt).toBeUndefined();
      expect(plan?.featureSpec?.source).toBe("manual");
    });

    it("preserves feature spec on plan import", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Persist through import." },
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

      const imported = importFeatureSprintPlanFromText(
        approved.state,
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      expect(plan?.featureSpec?.body).toBe("Persist through import.");
      expect(plan?.featureSpec?.approvedAt).toBe(FIXED_NOW.toISOString());
      expect(plan?.automationPhase).toBe("spec_approved");
      expect(plan?.steps).toHaveLength(2);
    });

    it("gates implementation when persisted spec is unapproved", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Needs approval." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const imported = importFeatureSprintPlanFromText(
        saved.state,
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      expect(canRunFeatureSprintImplementation(plan)).toBe(false);

      const approved = approveFeatureSpecForPlan(imported.state, imported.planId!, FIXED_NOW);
      expect(approved.ok).toBe(true);
      if (!approved.ok) {
        return;
      }

      const approvedPlan = getActiveFeatureSprintPlanForCard(approved.state, "card-build-test");
      expect(canRunFeatureSprintImplementation(approvedPlan)).toBe(true);
    });

    it("allows implementation when no persisted spec exists", () => {
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
      expect(canRunFeatureSprintImplementation(plan)).toBe(true);
    });

    it("includes draft spec in scoping packet and approved spec in implementation packet", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Draft spec for scoping." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const draftPacket = buildFeatureScopingPacket(saved.state, "card-build-test", { now: FIXED_NOW });
      expect(draftPacket.ok).toBe(true);
      if (!draftPacket.ok) {
        return;
      }
      expect(draftPacket.markdown).toContain("## Draft feature spec (not yet approved)");
      expect(draftPacket.markdown).toContain("Draft spec for scoping.");
      expect(draftPacket.markdown).not.toContain("## Approved feature spec (source of truth)");

      const imported = importFeatureSprintPlanFromText(
        saved.state,
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const unapprovedImpl = buildFeatureStepImplementationPacket(imported.state, imported.planId!);
      expect(unapprovedImpl.ok).toBe(true);
      if (!unapprovedImpl.ok) {
        return;
      }
      expect(unapprovedImpl.markdown).not.toContain("## Approved feature spec (source of truth)");

      const approved = approveFeatureSpecForPlan(imported.state, imported.planId!, FIXED_NOW);
      expect(approved.ok).toBe(true);
      if (!approved.ok) {
        return;
      }

      const approvedScoping = buildFeatureScopingPacket(approved.state, "card-build-test", {
        now: FIXED_NOW
      });
      expect(approvedScoping.ok).toBe(true);
      if (!approvedScoping.ok) {
        return;
      }
      expect(approvedScoping.markdown).toContain("## Approved feature spec (source of truth)");

      const approvedImpl = buildFeatureStepImplementationPacket(approved.state, imported.planId!);
      expect(approvedImpl.ok).toBe(true);
      if (!approvedImpl.ok) {
        return;
      }
      expect(approvedImpl.markdown).toContain("## Approved feature spec (source of truth)");

      const approvedReview = buildFeatureStepReviewPacket(
        approved.state,
        imported.planId!,
        undefined,
        "Changed files."
      );
      expect(approvedReview.ok).toBe(true);
      if (!approvedReview.ok) {
        return;
      }
      expect(approvedReview.markdown).toContain("## Approved feature spec (source of truth)");
    });
  });

  describe("Phase B1 prompt localization", () => {
    const SAMPLE_LOCALIZATION_BLOCK = `
Here is localization.

\`\`\`feature-prompt-localization
{
  "likelyFiles": ["src/core/featureSprintOrchestrator.ts"],
  "existingHelpers": ["buildFeatureStepImplementationPacket"],
  "testsToRun": ["npm test -- featureSprintOrchestrator"],
  "risks": ["Plan re-import regenerates step IDs"],
  "revisedImplementationPrompt": "Implement localization import only."
}
\`\`\`
`;

    it("builds localization packet with read-only boundaries", () => {
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

      const result = buildFeatureStepLocalizationPacket(imported.state, imported.planId!, undefined, {
        now: FIXED_NOW
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.markdown).toContain("Do **not** implement");
      expect(result.markdown).toContain("Do **not** edit files");
      expect(result.markdown).toContain("feature-prompt-localization");
      expect(result.markdown).toContain("life-harness");
    });

    it("parses and imports localization onto current step", () => {
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

      const before = JSON.stringify(imported.state);
      buildFeatureStepLocalizationPacket(imported.state, imported.planId!);
      expect(JSON.stringify(imported.state)).toBe(before);

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

      const plan = getActiveFeatureSprintPlanForCard(localized.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(hasStepPromptLocalization(step)).toBe(true);
      expect(step?.promptLocalization?.likelyFiles).toContain("src/core/featureSprintOrchestrator.ts");
      expect(plan?.automationPhase).toBe("localizing");
      expect(step?.suggestedPrompt).toBe(plan?.steps[0]?.suggestedPrompt);
    });

    it("rejects invalid localization import", () => {
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

      const result = importFeaturePromptLocalizationFromText(
        imported.state,
        imported.planId!,
        "no fence",
        undefined,
        FIXED_NOW
      );
      expect(result.ok).toBe(false);
    });

    it("caps rawOutput and revisedImplementationPrompt on import", () => {
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

      const longPrompt = "p".repeat(FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS + 100);
      const text = `\`\`\`feature-prompt-localization\n${JSON.stringify({
        likelyFiles: [],
        existingHelpers: [],
        testsToRun: [],
        risks: [],
        revisedImplementationPrompt: longPrompt
      })}\n\`\`\``;

      const result = importFeaturePromptLocalizationFromText(
        imported.state,
        imported.planId!,
        text,
        undefined,
        FIXED_NOW
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(result.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(step?.promptLocalization?.revisedImplementationPrompt).toHaveLength(
        FEATURE_SCOPING_ROUGH_SPEC_MAX_CHARS
      );
    });

    it("does not inject localization into implementation packet", () => {
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

      const impl = buildFeatureStepImplementationPacket(localized.state, imported.planId!);
      expect(impl.ok).toBe(true);
      if (!impl.ok) {
        return;
      }
      expect(impl.markdown).not.toContain("Implement localization import only.");
    });

    it("resets localizing phase on advance to spec_approved when spec approved", () => {
      const saved = saveFeatureSpecForCard(
        baseData(),
        "card-build-test",
        { body: "Spec body." },
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

      const imported = importFeatureSprintPlanFromText(
        approved.state,
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

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

      const plan = getActiveFeatureSprintPlanForCard(localized.state, "card-build-test");
      expect(plan?.automationPhase).toBe("localizing");

      const advanced = advanceFeatureSprintStep(
        localized.state,
        imported.planId!,
        plan!.currentStepId!,
        FIXED_NOW
      );
      expect(advanced.ok).toBe(true);
      if (!advanced.ok) {
        return;
      }

      const nextPlan = getActiveFeatureSprintPlanForCard(advanced.state, "card-build-test");
      expect(nextPlan?.automationPhase).toBe("spec_approved");
    });

    it("strips localization fence from display text", () => {
      const stripped = stripFeatureSprintBlocks(SAMPLE_LOCALIZATION_BLOCK);
      expect(stripped).not.toContain("feature-prompt-localization");
      expect(parseFeaturePromptLocalizationBlock(SAMPLE_LOCALIZATION_BLOCK)?.revisedImplementationPrompt).toBe(
        "Implement localization import only."
      );
    });
  });

  describe("Phase B2 prompt audit", () => {
    const SAMPLE_LOCALIZATION_BLOCK = `
\`\`\`feature-prompt-localization
{
  "likelyFiles": ["src/core/featureSprintOrchestrator.ts"],
  "existingHelpers": ["buildFeatureStepImplementationPacket"],
  "testsToRun": ["npm test -- featureSprintOrchestrator"],
  "risks": ["Scope creep"],
  "revisedImplementationPrompt": "LOCALIZED-ONLY-PROMPT-XYZ"
}
\`\`\`
`;

    const SAMPLE_CRITIQUE_BLOCK = `
\`\`\`feature-prompt-critique
{
  "verdict": "ready",
  "risks": ["Missing edge case"],
  "requiredPromptChanges": ["Add file list"],
  "finalImplementationPrompt": "AUDITED-FINAL-PROMPT-ABC",
  "mustCheckFiles": ["src/core/featureSprintOrchestrator.ts"],
  "verificationCommands": ["npm test -- featureSprintOrchestrator"]
}
\`\`\`
`;

    function importPlanWithStep() {
      const imported = importFeatureSprintPlanFromText(
        baseData(),
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
      expect(imported.ok).toBe(true);
      return imported;
    }

    it("resolveStepImplementationPrompt prefers audit then suggested then goal", () => {
      expect(
        resolveStepImplementationPrompt({
          id: "s1",
          title: "Core",
          goal: "Step goal",
          status: "ready",
          acceptanceCriteria: ["x"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString(),
          suggestedPrompt: "Suggested seed",
          promptAudit: {
            rawOutput: "raw",
            verdict: "ready",
            risks: [],
            requiredPromptChanges: [],
            finalImplementationPrompt: "Audited final",
            mustCheckFiles: [],
            verificationCommands: [],
            createdAt: FIXED_NOW.toISOString(),
            updatedAt: FIXED_NOW.toISOString()
          }
        })
      ).toBe("Audited final");

      expect(
        resolveStepImplementationPrompt({
          id: "s1",
          title: "Core",
          goal: "Step goal",
          status: "ready",
          acceptanceCriteria: ["x"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString(),
          suggestedPrompt: "Suggested seed"
        })
      ).toBe("Suggested seed");

      expect(
        resolveStepImplementationPrompt({
          id: "s1",
          title: "Core",
          goal: "Step goal",
          status: "ready",
          acceptanceCriteria: ["x"],
          createdAt: FIXED_NOW.toISOString(),
          updatedAt: FIXED_NOW.toISOString()
        })
      ).toBe("Step goal");
    });

    it("implementation packet excludes localization prompt when promptAudit absent", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

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

      const impl = buildFeatureStepImplementationPacket(localized.state, imported.planId!);
      expect(impl.ok).toBe(true);
      if (!impl.ok) {
        return;
      }
      expect(impl.markdown).not.toContain("LOCALIZED-ONLY-PROMPT-XYZ");
      expect(impl.markdown).toContain("Implement core module");
    });

    it("builds prompt audit packet with localization context", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

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

      const before = JSON.stringify(localized.state);
      const packet = buildFeatureStepPromptAuditPacket(localized.state, imported.planId!, undefined, {
        now: FIXED_NOW
      });
      expect(JSON.stringify(localized.state)).toBe(before);
      expect(packet.ok).toBe(true);
      if (!packet.ok) {
        return;
      }
      expect(packet.markdown).toContain("feature-prompt-critique");
      expect(packet.markdown).toContain("LOCALIZED-ONLY-PROMPT-XYZ");
      expect(packet.markdown).toContain("Do **not** implement");
    });

    it("imports prompt audit and promotes into implementation packet", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

      const audited = importFeaturePromptAuditFromText(
        imported.state,
        imported.planId!,
        SAMPLE_CRITIQUE_BLOCK,
        undefined,
        FIXED_NOW
      );
      expect(audited.ok).toBe(true);
      if (!audited.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(audited.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(hasStepPromptAudit(step)).toBe(true);
      expect(plan?.automationPhase).toBe("prompt_auditing");
      expect(step?.suggestedPrompt).toBe("Implement core module");

      const impl = buildFeatureStepImplementationPacket(audited.state, imported.planId!);
      expect(impl.ok).toBe(true);
      if (!impl.ok) {
        return;
      }
      expect(impl.markdown).toContain("Implementation prompt (audited)");
      expect(impl.markdown).toContain("AUDITED-FINAL-PROMPT-ABC");
      expect(impl.markdown).toContain("npm test -- featureSprintOrchestrator");
    });

    it("imports tighten_first without blocking semantics in storage", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

      const text = `\`\`\`feature-prompt-critique\n${JSON.stringify({
        verdict: "tighten_first",
        risks: ["Risk"],
        requiredPromptChanges: ["Tighten scope"],
        finalImplementationPrompt: "Safer audited prompt.",
        mustCheckFiles: [],
        verificationCommands: []
      })}\n\`\`\``;

      const result = importFeaturePromptAuditFromText(
        imported.state,
        imported.planId!,
        text,
        undefined,
        FIXED_NOW
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(result.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(step?.promptAudit?.verdict).toBe("tighten_first");
      expect(canRunFeatureSprintImplementation(plan)).toBe(true);
    });

    it("clears promptAudit when localization rawOutput changes on re-import", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

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

      const audited = importFeaturePromptAuditFromText(
        localized.state,
        imported.planId!,
        SAMPLE_CRITIQUE_BLOCK,
        undefined,
        FIXED_NOW
      );
      expect(audited.ok).toBe(true);
      if (!audited.ok) {
        return;
      }

      const changedLocalization = importFeaturePromptLocalizationFromText(
        audited.state,
        imported.planId!,
        SAMPLE_LOCALIZATION_BLOCK.replace("LOCALIZED-ONLY-PROMPT-XYZ", "LOCALIZED-CHANGED-PROMPT"),
        undefined,
        FIXED_NOW
      );
      expect(changedLocalization.ok).toBe(true);
      if (!changedLocalization.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(changedLocalization.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(step?.promptLocalization?.revisedImplementationPrompt).toContain("LOCALIZED-CHANGED-PROMPT");
      expect(step?.promptAudit).toBeUndefined();
    });

    it("preserves promptAudit when localization rawOutput unchanged on re-import", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

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

      const audited = importFeaturePromptAuditFromText(
        localized.state,
        imported.planId!,
        SAMPLE_CRITIQUE_BLOCK,
        undefined,
        FIXED_NOW
      );
      expect(audited.ok).toBe(true);
      if (!audited.ok) {
        return;
      }

      const relocalized = importFeaturePromptLocalizationFromText(
        audited.state,
        imported.planId!,
        SAMPLE_LOCALIZATION_BLOCK,
        undefined,
        FIXED_NOW
      );
      expect(relocalized.ok).toBe(true);
      if (!relocalized.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(relocalized.state, "card-build-test");
      const step = plan?.steps.find((item) => item.id === plan.currentStepId);
      expect(hasStepPromptAudit(step)).toBe(true);
    });

    it("resets prompt_auditing phase on advance", () => {
      const imported = importPlanWithStep();
      if (!imported.ok) {
        return;
      }

      const audited = importFeaturePromptAuditFromText(
        imported.state,
        imported.planId!,
        SAMPLE_CRITIQUE_BLOCK,
        undefined,
        FIXED_NOW
      );
      expect(audited.ok).toBe(true);
      if (!audited.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(audited.state, "card-build-test");
      const advanced = advanceFeatureSprintStep(
        audited.state,
        imported.planId!,
        plan!.currentStepId!,
        FIXED_NOW
      );
      expect(advanced.ok).toBe(true);
      if (!advanced.ok) {
        return;
      }

      const nextPlan = getActiveFeatureSprintPlanForCard(advanced.state, "card-build-test");
      expect(nextPlan?.automationPhase).toBeUndefined();
    });

    it("strips critique fence from display text", () => {
      const stripped = stripFeatureSprintBlocks(SAMPLE_CRITIQUE_BLOCK);
      expect(stripped).not.toContain("feature-prompt-critique");
      expect(parseFeaturePromptCritiqueBlock(SAMPLE_CRITIQUE_BLOCK)?.finalImplementationPrompt).toBe(
        "AUDITED-FINAL-PROMPT-ABC"
      );
    });
  });

  describe("Phase B4 implementation proof", () => {
    function importPlanWithStep() {
      return importFeatureSprintPlanFromText(
        baseData(),
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
    }

    function fixtureImplementationRun(
      planId: string,
      stepId: string,
      overrides: Partial<LifeHarnessData["featureSprintRunnerRuns"][number]> = {}
    ) {
      return {
        id: "run-impl-b4",
        profile: "codex_implementation" as const,
        status: "succeeded" as const,
        cardId: "card-build-test",
        planId,
        stepId,
        changedFiles: ["src/core/featureSprintOrchestrator.ts"],
        diffStat: "1 file changed, 10 insertions(+)",
        gitStatus: "M src/core/featureSprintOrchestrator.ts",
        verificationResults: [
          verificationResult({ command: "npm test -- featureSprintOrchestrator", status: "passed" })
        ],
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString(),
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
        ...overrides
      };
    }

    it("requires saved output before normalizing proof", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const result = normalizeImplementationProofForStep(imported.state, imported.planId!, undefined, FIXED_NOW);
      expect(result).toEqual({ ok: false, error: "Save agent output before normalizing proof." });
    });

    it("normalizes proof, stores runnerEvidence, and sets proof_normalizing phase", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      expect(stepId).toBeTruthy();
      if (!stepId) {
        return;
      }

      const withRun: LifeHarnessData = {
        ...imported.state,
        featureSprintRunnerRuns: [fixtureImplementationRun(imported.planId!, stepId)]
      };

      const saved = updateFeatureSprintStep(
        withRun,
        imported.planId!,
        stepId,
        {
          outputSummary: `
Changed files
- src/core/featureSprintOrchestrator.ts

## Verification
- command: npm test -- featureSprintOrchestrator
`
        },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const normalized = normalizeImplementationProofForStep(saved.state, imported.planId!, stepId, FIXED_NOW);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) {
        return;
      }

      const nextPlan = getActiveFeatureSprintPlanForCard(normalized.state, "card-build-test");
      const step = nextPlan?.steps.find((item) => item.id === stepId);
      expect(hasStepImplementationProof(step)).toBe(true);
      expect(step?.implementationProof?.sourceRunnerRunId).toBe("run-impl-b4");
      expect(step?.implementationProof?.runnerEvidence?.diffStat).toContain("1 file changed");
      expect(nextPlan?.automationPhase).toBe("proof_normalizing");
    });

    it("includes failed implementation run as evidence and risk", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const withFailedRun: LifeHarnessData = {
        ...imported.state,
        featureSprintRunnerRuns: [
          fixtureImplementationRun(imported.planId!, stepId, {
            status: "failed",
            error: "Tests failed",
            verificationResults: [
              verificationResult({ command: "npm test", status: "failed", error: "boom" })
            ]
          })
        ]
      };

      const saved = updateFeatureSprintStep(
        withFailedRun,
        imported.planId!,
        stepId,
        { outputSummary: "Implementation attempt with failures." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const normalized = normalizeImplementationProofForStep(saved.state, imported.planId!, stepId, FIXED_NOW);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) {
        return;
      }

      const step = getActiveFeatureSprintPlanForCard(normalized.state, "card-build-test")?.steps.find(
        (item) => item.id === stepId
      );
      expect(step?.implementationProof?.verificationResult).toBe("fail");
      expect(step?.implementationProof?.knownRisks.some((risk) => risk.includes("failed"))).toBe(true);
      expect(step?.implementationProof?.sourceRunnerRunId).toBe("run-impl-b4");
    });

    it("clears stale proof when saved output changes", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        imported.state,
        imported.planId!,
        stepId,
        { outputSummary: "First saved output." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const normalized = normalizeImplementationProofForStep(saved.state, imported.planId!, stepId, FIXED_NOW);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) {
        return;
      }

      const changed = updateFeatureSprintStep(
        normalized.state,
        imported.planId!,
        stepId,
        { outputSummary: "Updated saved output." },
        FIXED_NOW
      );
      expect(changed.ok).toBe(true);
      if (!changed.ok) {
        return;
      }

      const step = getActiveFeatureSprintPlanForCard(changed.state, "card-build-test")?.steps.find(
        (item) => item.id === stepId
      );
      expect(step?.implementationProof).toBeUndefined();
    });

    it("enriches review packet with normalized proof and prompt source", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        imported.state,
        imported.planId!,
        stepId,
        { outputSummary: "Changed orchestrator core and tests." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const normalized = normalizeImplementationProofForStep(saved.state, imported.planId!, stepId, FIXED_NOW);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) {
        return;
      }

      const packet = buildFeatureStepReviewPacket(normalized.state, imported.planId!, stepId);
      expect(packet.ok).toBe(true);
      if (!packet.ok) {
        return;
      }

      expect(packet.markdown).toContain("## Normalized implementation proof");
      expect(packet.markdown).toContain("Normalized proof: included");
      expect(packet.markdown).toContain("## Implementation prompt");
      expect(packet.markdown).toContain("feature-review-verdict");
    });

    it("builds review packet without proof when not normalized", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        imported.state,
        imported.planId!,
        stepId,
        { outputSummary: "Saved without normalizing proof." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const packet = buildFeatureStepReviewPacket(saved.state, imported.planId!, stepId);
      expect(packet.ok).toBe(true);
      if (!packet.ok) {
        return;
      }

      expect(packet.markdown).toContain("Normalized proof: not generated");
      expect(packet.markdown).toContain("Saved without normalizing proof.");
    });

    it("clears proof_normalizing phase on review verdict import (B6)", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const savedSpec = saveFeatureSpecForCard(
        imported.state,
        "card-build-test",
        { body: "Approved spec." },
        FIXED_NOW
      );
      expect(savedSpec.ok).toBe(true);
      if (!savedSpec.ok) {
        return;
      }

      const approved = approveFeatureSpecForPlan(savedSpec.state, imported.planId!, FIXED_NOW);
      expect(approved.ok).toBe(true);
      if (!approved.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(approved.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        approved.state,
        imported.planId!,
        stepId,
        { outputSummary: "Done slice." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const normalized = normalizeImplementationProofForStep(saved.state, imported.planId!, stepId, FIXED_NOW);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) {
        return;
      }

      expect(getActiveFeatureSprintPlanForCard(normalized.state, "card-build-test")?.automationPhase).toBe(
        "proof_normalizing"
      );

      const reviewText = `\`\`\`feature-review-verdict\n${JSON.stringify({
        status: "accepted",
        verdict: "Looks good.",
        nextPrompt: "Next slice",
        followUps: []
      })}\n\`\`\``;

      const verdict = importFeatureReviewVerdictFromText(
        normalized.state,
        imported.planId!,
        reviewText,
        stepId,
        FIXED_NOW
      );
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) {
        return;
      }

      const afterImport = getActiveFeatureSprintPlanForCard(verdict.state, "card-build-test");
      expect(afterImport?.automationPhase).toBeUndefined();

      const advanced = advanceFeatureSprintStep(verdict.state, imported.planId!, stepId, FIXED_NOW);
      expect(advanced.ok).toBe(true);
      if (!advanced.ok) {
        return;
      }

      const nextPlan = getActiveFeatureSprintPlanForCard(advanced.state, "card-build-test");
      expect(nextPlan?.automationPhase).toBeUndefined();
    });

    it("keeps feature-review-verdict import schema unchanged", () => {
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
      expect(parsed).toEqual({
        status: "accepted",
        verdict: "Looks good.",
        nextPrompt: "Polish UI",
        followUps: ["Add docs"]
      });
    });
  });

  describe("Phase B5 review runner integration", () => {
    function importPlanWithStep() {
      return importFeatureSprintPlanFromText(
        baseData(),
        "card-build-test",
        SAMPLE_PLAN_BLOCK,
        FIXED_NOW
      );
    }

    it("buildFeatureStepReviewPacket includes normalized proof for runner path", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        imported.state,
        imported.planId!,
        stepId,
        { outputSummary: "Changed orchestrator core." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const withProof = updateFeatureSprintStep(
        saved.state,
        imported.planId!,
        stepId,
        {
          implementationProof: {
            rawOutput: "Changed orchestrator core.",
            filesChanged: ["src/core/featureSprintOrchestrator.ts"],
            behaviorChanged: ["See raw implementation output."],
            testsRun: ["npm test -- featureSprintOrchestrator"],
            testsNotRun: [],
            verificationResult: "pass",
            knownRisks: [],
            suggestedReviewFocus: ["Review scope"],
            createdAt: FIXED_NOW.toISOString(),
            updatedAt: FIXED_NOW.toISOString()
          }
        },
        FIXED_NOW
      );
      expect(withProof.ok).toBe(true);
      if (!withProof.ok) {
        return;
      }

      const packet = buildFeatureStepReviewPacket(withProof.state, imported.planId!, stepId);
      expect(packet.ok).toBe(true);
      if (!packet.ok) {
        return;
      }

      expect(packet.markdown).toContain("Normalized proof: included");
      expect(packet.markdown).toContain("## Implementation prompt");
      expect(packet.markdown).toContain("feature-review-verdict");
    });

    it("buildFeatureStepReviewPacket works without normalized proof for runner path", () => {
      const imported = importPlanWithStep();
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const plan = getActiveFeatureSprintPlanForCard(imported.state, "card-build-test");
      const stepId = plan?.currentStepId;
      if (!stepId) {
        return;
      }

      const saved = updateFeatureSprintStep(
        imported.state,
        imported.planId!,
        stepId,
        { outputSummary: "Saved without normalizing proof." },
        FIXED_NOW
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) {
        return;
      }

      const packet = buildFeatureStepReviewPacket(saved.state, imported.planId!, stepId);
      expect(packet.ok).toBe(true);
      if (!packet.ok) {
        return;
      }

      expect(packet.markdown).toContain("Normalized proof: not generated");
      expect(packet.markdown).toContain("Saved without normalizing proof.");
    });
  });
});
