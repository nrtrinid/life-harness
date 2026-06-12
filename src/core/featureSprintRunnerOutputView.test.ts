import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX
} from "./featureSprintRunner";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun,
  FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX
} from "./featureSprintRunnerHistory";
import {
  buildFeatureSprintRunnerOutputView,
  FEATURE_SPRINT_RUNNER_DIFF_FALLBACK_MESSAGE,
  FEATURE_SPRINT_WORKTREE_CLEANUP_HELPER
} from "./featureSprintRunnerOutputView";
import { markFeatureSprintRunnerRunWorktreeCleanup } from "./featureSprintRunnerHistory";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { LifeCard } from "./types";

const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function fixtureCard(): LifeCard {
  return {
    id: "card-build-test",
    title: "Momentum Board v0.1",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    whyItMatters: "Ship the integration spine.",
    nextTinyAction: "Inspect runner output.",
    doneForNow: "Viewer drafted.",
    doLane: "Wire output view.",
    improveLane: "Do not auto-save.",
    recentWins: [],
    openLoops: [],
    optimizationIdeas: [],
    proofItemIds: []
  };
}

function baseData(overrides: Partial<LifeHarnessData> = {}): LifeHarnessData {
  return {
    ...createSeedState(FIXED_NOW.toISOString()),
    cards: [fixtureCard()],
    ...overrides
  };
}

describe("buildFeatureSprintRunnerOutputView", () => {
  it("returns undefined for a missing run", () => {
    expect(buildFeatureSprintRunnerOutputView(baseData(), "missing-run")).toBeUndefined();
  });

  it("returns worktree metadata for a successful implementation run", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Implementation complete.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      worktreePath: "/tmp/worktree-1",
      branchName: "feature/card-build-test",
      changedFiles: ["src/example.ts"],
      diffStat: " src/example.ts | 2 ++",
      gitStatus: " M src/example.ts"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.worktreePath).toBe("/tmp/worktree-1");
    expect(view?.branchName).toBe("feature/card-build-test");
    expect(view?.changedFiles).toEqual(["src/example.ts"]);
    expect(view?.safetyNotes.length).toBeGreaterThan(0);
  });

  it("includes verification summary and failure rows", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      verificationResults: [
        {
          command: "npm test",
          status: "passed",
          startedAt: FIXED_NOW.toISOString(),
          completedAt: FIXED_NOW.toISOString()
        },
        {
          command: "npm run lint",
          status: "failed",
          stderrExcerpt: "lint failed",
          startedAt: FIXED_NOW.toISOString(),
          completedAt: FIXED_NOW.toISOString()
        }
      ]
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.verificationSummary).toBe("1 failed / 1 passed");
    expect(view?.verificationFailures).toEqual([
      {
        command: "npm run lint",
        error: undefined,
        stderrExcerpt: "lint failed",
        stdoutExcerpt: undefined
      }
    ]);
  });

  it("includes diffText when present", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      diffText: "diff --git a/src/example.ts b/src/example.ts"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.diffText).toContain("diff --git");
    expect(view?.showDiffFallback).toBe(false);
  });

  it("shows untracked-only fallback when changedFiles exist without diffText", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Mock implementation complete.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      changedFiles: [".life-harness/mock-implementation-result.md"],
      diffStat: "1 untracked file(s)",
      gitStatus: "?? .life-harness/mock-implementation-result.md"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.changedFiles.length).toBe(1);
    expect(view?.diffText).toBeUndefined();
    expect(view?.showDiffFallback).toBe(true);
    expect(FEATURE_SPRINT_RUNNER_DIFF_FALLBACK_MESSAGE).toContain("Full diff was not captured");
  });

  it("marks diff and output truncation flags", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const longOutput = "x".repeat(FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX);
    const longDiff = "d".repeat(FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX + 100);

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: longOutput,
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      diffText: longDiff
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.outputTruncated).toBe(true);
    expect(view?.diffTruncated).toBe(true);
  });

  it("does not mutate input data", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      changedFiles: ["src/example.ts"]
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const before = completed.state.featureSprintRunnerRuns;
    buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(completed.state.featureSprintRunnerRuns).toBe(before);
  });

  it("exposes cleanup fields and canCleanWorktree for implementation runs", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      worktreePath: "/tmp/worktree-1",
      branchName: "life-harness/feature-step-abc"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(completed.state, created.runId);
    expect(view?.canCleanWorktree).toBe(true);
    expect(view?.safetyNotes.some((note) => note.includes("Inspect and save/review"))).toBe(true);
    expect(FEATURE_SPRINT_WORKTREE_CLEANUP_HELPER).toContain("Force clean");
  });

  it("updates safety notes after cleanup and disables further cleanup", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      worktreePath: "/tmp/worktree-1"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const marked = markFeatureSprintRunnerRunWorktreeCleanup(completed.state, created.runId, {
      ok: true,
      status: "cleaned",
      worktreePath: "/tmp/worktree-1",
      message: "Worktree removed.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString()
    }, FIXED_NOW.toISOString());
    if (!marked.ok) {
      throw new Error("Expected mark to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(marked.state, created.runId);
    expect(view?.canCleanWorktree).toBe(false);
    expect(view?.worktreeCleanupStatus).toBe("cleaned");
    expect(view?.safetyNotes.some((note) => note.includes("Worktree was cleaned"))).toBe(true);
  });

  it("surfaces not_found cleanup status on the output view", () => {
    const created = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_implementation",
      cardId: "card-build-test"
    });
    if (!created.ok) {
      throw new Error("Expected create to succeed.");
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "codex_implementation",
      outputText: "Done.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      worktreePath: "/tmp/worktree-1"
    });
    if (!completed.ok) {
      throw new Error("Expected complete to succeed.");
    }

    const marked = markFeatureSprintRunnerRunWorktreeCleanup(completed.state, created.runId, {
      ok: false,
      status: "not_found",
      worktreePath: "/tmp/worktree-1",
      message: "Worktree path was not found on disk.",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString()
    });
    if (!marked.ok) {
      throw new Error("Expected mark to succeed.");
    }

    const view = buildFeatureSprintRunnerOutputView(marked.state, created.runId);
    expect(view?.worktreeCleanupStatus).toBe("not_found");
    expect(view?.worktreeCleanedAt).toBeUndefined();
    expect(view?.canCleanWorktree).toBe(true);
  });
});
