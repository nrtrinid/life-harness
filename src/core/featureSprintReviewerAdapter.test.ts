import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildFeatureSprintAutomatedReviewPacket,
  buildMockAutomatedReviewVerdict,
  detectFeatureSprintAutomatedReviewStopSignals,
  formatAutomatedReviewForImportStaging,
  parseFeatureAutomatedReviewVerdictBlock,
  validateFeatureSprintAutomatedReviewVerdict
} from "./featureSprintReviewerAdapter";
import { parseFeatureReviewVerdictBlock } from "./featureSprintOrchestrator";
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
    whyItMatters: "Ship review adapter.",
    nextTinyAction: "Add automated review.",
    doneForNow: "Adapter drafted.",
    doLane: "Wire review.",
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
    status: "sent",
    acceptanceCriteria: ["CRUD helpers exist"],
    outputSummary: "Implemented core helpers.",
    implementationProof: {
      rawOutput: "Implemented core helpers.",
      filesChanged: ["src/core/featureSprintOrchestrator.ts"],
      behaviorChanged: ["Added review adapter"],
      testsRun: ["npm test"],
      testsNotRun: [],
      verificationResult: "pass",
      knownRisks: [],
      suggestedReviewFocus: ["Behavior"],
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
      phase: "reviewing",
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

describe("featureSprintReviewerAdapter", () => {
  it("builds automated review packet with spec, slice, and proof context", () => {
    const packet = buildFeatureSprintAutomatedReviewPacket(baseData(), CARD_ID);
    expect(packet.ok).toBe(true);
    if (!packet.ok) {
      return;
    }
    expect(packet.markdown).toContain("Automated Review Packet");
    expect(packet.markdown).toContain("Approved living spec body");
    expect(packet.markdown).toContain("reviewing");
    expect(packet.markdown).toContain("feature-automated-review-verdict");
    expect(packet.markdown).toContain("Normalized implementation proof");
  });

  it("detects stop signals from risky evidence", () => {
    const signals = detectFeatureSprintAutomatedReviewStopSignals({
      changedFiles: ["db/migrations/001_add_users.sql"],
      proofText: "Updated scheduler cadence and docker deploy script"
    });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((item) => item.includes("database") || item.includes("docker"))).toBe(true);
  });

  it("mock review returns needs_changes when proof missing", () => {
    const verdict = buildMockAutomatedReviewVerdict(
      { cardId: CARD_ID, promptMarkdown: "No implementation output here." },
      { hasProof: false }
    );
    expect(verdict.verdict).toBe("needs_changes");
  });

  it("mock review returns stop when stop signals present", () => {
    const verdict = buildMockAutomatedReviewVerdict(
      {
        cardId: CARD_ID,
        promptMarkdown: "Implemented with migration and docker deploy changes."
      },
      { hasProof: true, stopSignals: ["database writes", "docker/deployment"] }
    );
    expect(verdict.verdict).toBe("stop");
  });

  it("rejects accepted verdict with scopeDrift", () => {
    const result = validateFeatureSprintAutomatedReviewVerdict({
      verdict: "accepted",
      confidence: "high",
      summary: "Looks good",
      scopeDrift: true,
      missingTests: [],
      riskyChanges: [],
      requiredChanges: [],
      completedSliceItems: [],
      remainingSpecItems: []
    });
    expect(result.ok).toBe(false);
  });

  it("rejects nextCursorPrompt for non-accepted verdict", () => {
    const result = validateFeatureSprintAutomatedReviewVerdict({
      verdict: "needs_changes",
      confidence: "medium",
      summary: "Fix tests",
      scopeDrift: false,
      missingTests: ["unit tests"],
      riskyChanges: [],
      requiredChanges: ["Add tests"],
      completedSliceItems: [],
      remainingSpecItems: [],
      nextCursorPrompt: "Do more work"
    });
    expect(result.ok).toBe(false);
  });

  it("staging output passes parseFeatureReviewVerdictBlock", () => {
    const staged = formatAutomatedReviewForImportStaging({
      verdict: "accepted",
      confidence: "medium",
      summary: "Slice accepted.",
      scopeDrift: false,
      missingTests: [],
      riskyChanges: [],
      requiredChanges: [],
      completedSliceItems: ["Done"],
      remainingSpecItems: ["Next slice"],
      nextCursorPrompt: "Implement next approved slice only."
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) {
      return;
    }
    const parsed = parseFeatureReviewVerdictBlock(staged.markdown);
    expect(parsed?.status).toBe("accepted");
    expect(parsed?.nextPrompt).toContain("next approved slice");
  });

  it("maps stop to blocked import status", () => {
    const staged = formatAutomatedReviewForImportStaging({
      verdict: "stop",
      confidence: "high",
      summary: "Stop for risky migration.",
      scopeDrift: true,
      missingTests: [],
      riskyChanges: ["database writes"],
      requiredChanges: ["Revert migration"],
      completedSliceItems: [],
      remainingSpecItems: [],
      stopReason: "Database migration out of slice scope"
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) {
      return;
    }
    expect(parseFeatureReviewVerdictBlock(staged.markdown)?.status).toBe("blocked");
  });

  it("rejects malformed automated verdict fence", () => {
    expect(parseFeatureAutomatedReviewVerdictBlock("```feature-automated-review-verdict\n{bad\n```")).toBeUndefined();
  });
});
