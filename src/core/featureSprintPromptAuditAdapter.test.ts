import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildFeatureSprintAutomatedPromptAuditPacket,
  buildMockAutomatedPromptCritique,
  formatAutomatedPromptCritiqueForImportStaging,
  parseFeatureAutomatedPromptCritiqueBlock,
  validateFeatureSprintAutomatedPromptCritique
} from "./featureSprintPromptAuditAdapter";
import { parseFeaturePromptCritiqueBlock } from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintPlan, HarnessFeatureSprintStep, LifeCard } from "./types";

const FIXED_NOW = "2026-06-09T12:00:00.000Z";
const CARD_ID = "card-build-test";

function fixtureCard(): LifeCard {
  return {
    id: CARD_ID,
    title: "Momentum Board",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship prompt audit adapter.",
    nextTinyAction: "Add automated prompt audit.",
    doneForNow: "Adapter drafted.",
    doLane: "Wire audit.",
    improveLane: "No autonomy.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

function fixtureStep(overrides: Partial<HarnessFeatureSprintStep> = {}): HarnessFeatureSprintStep {
  return {
    id: "step-1",
    title: "Core module",
    goal: "Add orchestrator core",
    status: "ready",
    acceptanceCriteria: ["CRUD helpers exist"],
    suggestedPrompt: "Implement bounded slice with npm test verification.",
    promptLocalization: {
      rawOutput: "localized",
      revisedImplementationPrompt: "LOCALIZED bounded slice prompt",
      likelyFiles: ["src/core/featureSprintOrchestrator.ts"],
      existingHelpers: ["buildFeatureStepImplementationPacket"],
      testsToRun: ["npm test"],
      risks: [],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW
    },
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
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
    nonGoals: ["Auto-import"],
    constraints: [],
    steps: [step],
    currentStepId: step.id,
    featureSpec: {
      body: "Approved living spec body",
      source: "chatgpt_web",
      updatedAt: FIXED_NOW,
      approvedAt: FIXED_NOW,
      approvedBy: "user"
    },
    currentSlice: {
      id: "slice-1",
      title: "Core module",
      status: "active",
      phase: "prompt_auditing",
      source: "planned_step",
      linkedStepId: step.id,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW
    },
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides
  };
}

function baseData(): LifeHarnessData {
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
        docs: [],
        likelyFiles: [],
        verificationCommands: ["npm test"],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW
      }
    ],
    featureSprintPlans: [fixturePlan()]
  };
}

describe("featureSprintPromptAuditAdapter", () => {
  it("builds automated prompt audit packet with guardrails and proposed prompt", () => {
    const packet = buildFeatureSprintAutomatedPromptAuditPacket(baseData(), CARD_ID, {
      proposedCursorPrompt: "Implement bounded slice only. Run npm test."
    });
    expect(packet.ok).toBe(true);
    if (!packet.ok) {
      return;
    }
    expect(packet.markdown).toContain("Automated Prompt Audit Packet");
    expect(packet.markdown).toContain("Global guardrails");
    expect(packet.markdown).toContain("feature-automated-prompt-critique");
    expect(packet.markdown).toContain("npm test");
  });

  it("mock critique returns needs_changes when prompt missing", () => {
    const critique = buildMockAutomatedPromptCritique(
      { cardId: CARD_ID, promptMarkdown: "No worker input yet." },
      { hasProposedPrompt: false }
    );
    expect(critique.verdict).toBe("needs_changes");
  });

  it("mock critique returns blocked on stop signals", () => {
    const critique = buildMockAutomatedPromptCritique(
      {
        cardId: CARD_ID,
        promptMarkdown: "Implement with database migration and docker deploy.",
        proposedCursorPrompt: "Implement with database migration and docker deploy."
      },
      { hasProposedPrompt: true, hasVerificationMarkers: true }
    );
    expect(critique.verdict).toBe("blocked");
  });

  it("mock critique returns approved for bounded prompt with verification", () => {
    const critique = buildMockAutomatedPromptCritique({
      cardId: CARD_ID,
      promptMarkdown: "Implement bounded slice only. Run npm test verification.",
      proposedCursorPrompt: "Implement bounded slice only. Run npm test verification."
    });
    expect(critique.verdict).toBe("approved");
    expect(critique.revisedCursorPrompt).toBeTruthy();
  });

  it("rejects approved critique with scopeDrift", () => {
    const result = validateFeatureSprintAutomatedPromptCritique({
      verdict: "approved",
      confidence: "high",
      summary: "Looks good",
      scopeDrift: true,
      promptRisks: [],
      missingContext: [],
      missingVerification: [],
      riskyFiles: [],
      requiredPromptEdits: []
    });
    expect(result.ok).toBe(false);
  });

  it("rejects high-confidence approved with risky files", () => {
    const result = validateFeatureSprintAutomatedPromptCritique({
      verdict: "approved",
      confidence: "high",
      summary: "Looks good",
      scopeDrift: false,
      promptRisks: [],
      missingContext: [],
      missingVerification: [],
      riskyFiles: ["db/migrations/001.sql"],
      requiredPromptEdits: []
    });
    expect(result.ok).toBe(false);
  });

  it("staging output passes parseFeaturePromptCritiqueBlock", () => {
    const staged = formatAutomatedPromptCritiqueForImportStaging(
      {
        verdict: "approved",
        confidence: "medium",
        summary: "Prompt is bounded.",
        scopeDrift: false,
        promptRisks: [],
        missingContext: [],
        missingVerification: [],
        riskyFiles: [],
        requiredPromptEdits: [],
        revisedCursorPrompt: "Implement only this slice. Run npm test."
      },
      { fallbackPrompt: "Fallback prompt" }
    );
    expect(staged.ok).toBe(true);
    if (!staged.ok) {
      return;
    }
    const parsed = parseFeaturePromptCritiqueBlock(staged.markdown);
    expect(parsed?.verdict).toBe("ready");
    expect(parsed?.finalImplementationPrompt).toContain("this slice");
  });

  it("maps blocked to tighten_first import status", () => {
    const staged = formatAutomatedPromptCritiqueForImportStaging(
      {
        verdict: "blocked",
        confidence: "high",
        summary: "Blocked for risky migration.",
        scopeDrift: true,
        promptRisks: ["database writes"],
        missingContext: [],
        missingVerification: [],
        riskyFiles: ["db/migrations/001.sql"],
        requiredPromptEdits: ["Remove migration from slice"],
        humanEscalationReason: "Database migration out of scope"
      },
      { fallbackPrompt: "Do not run yet." }
    );
    expect(staged.ok).toBe(true);
    if (!staged.ok) {
      return;
    }
    expect(parseFeaturePromptCritiqueBlock(staged.markdown)?.verdict).toBe("tighten_first");
  });

  it("rejects malformed automated critique fence", () => {
    expect(
      parseFeatureAutomatedPromptCritiqueBlock("```feature-automated-prompt-critique\n{bad\n```")
    ).toBeUndefined();
  });
});
