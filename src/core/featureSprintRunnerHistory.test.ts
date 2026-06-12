import { describe, expect, it } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildStoredOutputFields,
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun,
  deleteFeatureSprintRunnerRun,
  FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_EXCERPT_MAX,
  FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX,
  getFeatureSprintRunnerRunsForCard,
  getFeatureSprintRunnerRunsForPlan,
  isFeatureSprintRunnerHistorySafetyBlocked,
  markFeatureSprintRunnerRunImported,
  markMostRecentFeatureSprintRunnerRunImported
} from "./featureSprintRunnerHistory";
import {
  createFeatureSprintPlanForCard,
  importFeatureSprintPlanFromText
} from "./featureSprintOrchestrator";
import { normalizeData } from "./stateHydration";
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
    nextTinyAction: "Add feature sprint runner history.",
    doneForNow: "History drafted.",
    doLane: "Wire history core.",
    improveLane: "Do not add auto-import.",
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
        likelyFiles: ["src/core/featureSprintRunnerHistory.ts"],
        verificationCommands: ["npm run typecheck", "npm test -- featureSprintRunnerHistory"],
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString()
      }
    ],
    ...overrides
  };
}

function fixtureSucceededResponse(outputText: string) {
  return {
    ok: true as const,
    profile: "codex_scoping" as const,
    outputText,
    startedAt: FIXED_NOW.toISOString(),
    completedAt: FIXED_NOW.toISOString(),
    commandPreview: "codex exec --profile scoping"
  };
}

describe("featureSprintRunnerHistory", () => {
  it("defaults featureSprintRunnerRuns to empty array", () => {
    expect(createSeedState().featureSprintRunnerRuns).toEqual([]);
    expect(
      normalizeData({
        cards: [],
        dailyState: createSeedState().dailyState
      }).featureSprintRunnerRuns
    ).toEqual([]);
  });

  it("creates a running run with timestamps", () => {
    const result = createFeatureSprintRunnerRun(
      baseData(),
      {
        profile: "codex_scoping",
        cardId: "card-build-test",
        repoPath: "C:/repo"
      },
      FIXED_NOW.toISOString()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const run = result.state.featureSprintRunnerRuns[0];
    expect(run?.status).toBe("running");
    expect(run?.profile).toBe("codex_scoping");
    expect(run?.cardId).toBe("card-build-test");
    expect(run?.createdAt).toBe(FIXED_NOW.toISOString());
    expect(run?.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(result.runId).toBe(run?.id);
  });

  it("completes succeeded runs with capped output fields", () => {
    const longOutput = "x".repeat(FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX + 100);
    const created = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      fixtureSucceededResponse(longOutput),
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const run = completed.state.featureSprintRunnerRuns.find((item) => item.id === created.runId);
    expect(run?.status).toBe("succeeded");
    expect(run?.outputText).toHaveLength(FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_TEXT_MAX);
    expect(run?.outputExcerpt).toHaveLength(FEATURE_SPRINT_RUNNER_HISTORY_OUTPUT_EXCERPT_MAX + 1);
    expect(run?.commandPreview).toBe("codex exec --profile scoping");
    expect(run?.completedAt).toBeTruthy();
  });

  it("stores failed completion error without requiring output", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      {
        ok: false,
        profile: "codex_scoping",
        error: "Runner unreachable.",
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString()
      },
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const run = completed.state.featureSprintRunnerRuns[0];
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("Runner unreachable.");
    expect(run?.outputText).toBeUndefined();
  });

  it("marks imported and picks most recent matching succeeded run", () => {
    const first = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test" },
      "2026-06-09T10:00:00.000Z"
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const firstCompleted = completeFeatureSprintRunnerRun(
      first.state,
      first.runId,
      fixtureSucceededResponse("older output"),
      "2026-06-09T10:01:00.000Z"
    );
    expect(firstCompleted.ok).toBe(true);
    if (!firstCompleted.ok) {
      return;
    }

    const second = createFeatureSprintRunnerRun(
      firstCompleted.state,
      { profile: "codex_scoping", cardId: "card-build-test" },
      "2026-06-09T11:00:00.000Z"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    const secondCompleted = completeFeatureSprintRunnerRun(
      second.state,
      second.runId,
      fixtureSucceededResponse("newer output"),
      "2026-06-09T11:01:00.000Z"
    );
    expect(secondCompleted.ok).toBe(true);
    if (!secondCompleted.ok) {
      return;
    }

    const marked = markMostRecentFeatureSprintRunnerRunImported(
      secondCompleted.state,
      { cardId: "card-build-test", profile: "codex_scoping" },
      FIXED_NOW.toISOString()
    );
    expect(marked.ok).toBe(true);
    if (!marked.ok) {
      return;
    }

    expect(marked.runId).toBe(second.runId);
    const newest = marked.state.featureSprintRunnerRuns.find((run) => run.id === second.runId);
    const older = marked.state.featureSprintRunnerRuns.find((run) => run.id === first.runId);
    expect(newest?.importedAt).toBe(FIXED_NOW.toISOString());
    expect(older?.importedAt).toBeUndefined();
  });

  it("deletes a run without mutating plans", () => {
    const created = createFeatureSprintRunnerRun(
      baseData({ featureSprintPlans: [] }),
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const next = deleteFeatureSprintRunnerRun(created.state, created.runId);
    expect(next.featureSprintRunnerRuns).toHaveLength(0);
    expect(next.featureSprintPlans).toEqual(created.state.featureSprintPlans);
  });

  it("queries by card newest first", () => {
    const older = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test", startedAt: "2026-06-09T10:00:00.000Z" },
      "2026-06-09T10:00:00.000Z"
    );
    expect(older.ok).toBe(true);
    if (!older.ok) {
      return;
    }

    const newer = createFeatureSprintRunnerRun(
      older.state,
      { profile: "codex_review", cardId: "card-build-test", startedAt: "2026-06-09T12:00:00.000Z" },
      "2026-06-09T12:00:00.000Z"
    );
    expect(newer.ok).toBe(true);
    if (!newer.ok) {
      return;
    }

    const otherCard = createFeatureSprintRunnerRun(
      newer.state,
      { profile: "codex_scoping", cardId: "card-other", startedAt: "2026-06-09T13:00:00.000Z" },
      "2026-06-09T13:00:00.000Z"
    );
    expect(otherCard.ok).toBe(false);

    const runs = getFeatureSprintRunnerRunsForCard(newer.state, "card-build-test", 5);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.profile).toBe("codex_review");
    expect(runs[1]?.profile).toBe("codex_scoping");
  });

  it("queries by plan", () => {
    const planCreated = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-build-test",
        title: "History plan",
        goal: "Test plan query",
        acceptanceCriteria: ["Query works"]
      },
      FIXED_NOW
    );
    expect(planCreated.ok).toBe(true);
    if (!planCreated.ok) {
      return;
    }

    const plan = planCreated.state.featureSprintPlans[0];
    expect(plan).toBeTruthy();
    if (!plan) {
      return;
    }

    const runCreated = createFeatureSprintRunnerRun(
      planCreated.state,
      {
        profile: "codex_review",
        cardId: "card-build-test",
        planId: plan.id,
        stepId: plan.steps[0]?.id
      },
      FIXED_NOW.toISOString()
    );
    expect(runCreated.ok).toBe(true);
    if (!runCreated.ok) {
      return;
    }

    const runs = getFeatureSprintRunnerRunsForPlan(runCreated.state, plan.id, 5);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.planId).toBe(plan.id);
  });

  it("rejects S3 card with safetyBlocked", () => {
    const result = createFeatureSprintRunnerRun(baseData({
      cards: [fixtureCard({ id: "card-s3", sensitivity: "S3" })]
    }), {
      profile: "codex_scoping",
      cardId: "card-s3"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.safetyBlocked).toBe(true);
    expect(isFeatureSprintRunnerHistorySafetyBlocked(result)).toBe(true);
  });

  it("rejects missing card with safetyBlocked", () => {
    const result = createFeatureSprintRunnerRun(baseData(), {
      profile: "codex_scoping",
      cardId: "missing-card"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.safetyBlocked).toBe(true);
  });

  it("leaves importedAt unset when plan import parse fails and mark is not called", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      fixtureSucceededResponse("not a plan block"),
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const importResult = importFeatureSprintPlanFromText(
      completed.state,
      "card-build-test",
      "no fenced block here"
    );
    expect(importResult.ok).toBe(false);

    const run = completed.state.featureSprintRunnerRuns[0];
    expect(run?.importedAt).toBeUndefined();
  });

  it("marks imported only after successful plan import", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      fixtureSucceededResponse(
        '```feature-sprint-plan\n{"title":"Imported","goal":"G","acceptanceCriteria":["A"],"steps":[{"title":"S","goal":"G","acceptanceCriteria":["A"]}]}\n```'
      ),
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const importResult = importFeatureSprintPlanFromText(
      completed.state,
      "card-build-test",
      completed.state.featureSprintRunnerRuns[0]?.outputText ?? ""
    );
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      return;
    }

    const marked = markMostRecentFeatureSprintRunnerRunImported(
      importResult.state,
      { cardId: "card-build-test", profile: "codex_scoping" },
      FIXED_NOW.toISOString()
    );
    expect(marked.ok).toBe(true);
    if (!marked.ok) {
      return;
    }

    const run = marked.state.featureSprintRunnerRuns.find((item) => item.id === created.runId);
    expect(run?.importedAt).toBe(FIXED_NOW.toISOString());
    expect(marked.state.featureSprintPlans.length).toBeGreaterThan(0);
  });

  it("does not mutate featureSprintPlans on history operations", () => {
    const planCreated = createFeatureSprintPlanForCard(
      baseData(),
      {
        cardId: "card-build-test",
        title: "Immutable plan",
        goal: "Stay unchanged",
        acceptanceCriteria: ["No mutation"]
      },
      FIXED_NOW
    );
    expect(planCreated.ok).toBe(true);
    if (!planCreated.ok) {
      return;
    }

    const before = JSON.stringify(planCreated.state.featureSprintPlans);
    const runCreated = createFeatureSprintRunnerRun(
      planCreated.state,
      { profile: "codex_scoping", cardId: "card-build-test" },
      FIXED_NOW.toISOString()
    );
    expect(runCreated.ok).toBe(true);
    if (!runCreated.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      runCreated.state,
      runCreated.runId,
      fixtureSucceededResponse("output"),
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const marked = markFeatureSprintRunnerRunImported(
      completed.state,
      runCreated.runId,
      FIXED_NOW.toISOString()
    );
    expect(marked.ok).toBe(true);
    if (!marked.ok) {
      return;
    }

    const deleted = deleteFeatureSprintRunnerRun(marked.state, runCreated.runId);
    expect(JSON.stringify(deleted.featureSprintPlans)).toBe(before);
  });

  it("buildStoredOutputFields always includes excerpt", () => {
    const fields = buildStoredOutputFields("short output");
    expect(fields.outputText).toBe("short output");
    expect(fields.outputExcerpt).toBe("short output");
  });

  it("stores implementation worktree metadata on complete", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      {
        profile: "codex_implementation",
        cardId: "card-build-test",
        repoPath: "C:/repo"
      },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      {
        ok: true,
        profile: "codex_implementation",
        outputText: "Implemented in worktree.",
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString(),
        worktreePath: "/tmp/worktree-a",
        branchName: "life-harness/feature-step-card-build-test",
        changedFiles: [".life-harness/mock-implementation-result.md"],
        diffStat: " .life-harness/mock-implementation-result.md | 3 +++",
        gitStatus: "?? .life-harness/mock-implementation-result.md"
      },
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const run = completed.state.featureSprintRunnerRuns[0];
    expect(run?.worktreePath).toBe("/tmp/worktree-a");
    expect(run?.branchName).toContain("life-harness/feature-step");
    expect(run?.changedFiles).toEqual([".life-harness/mock-implementation-result.md"]);
    expect(run?.diffStat).toContain("mock-implementation-result");
    expect(run?.diffText).toBeUndefined();
  });

  it("stores diffText on complete when present", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      {
        profile: "codex_implementation",
        cardId: "card-build-test"
      },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      {
        ok: true,
        profile: "codex_implementation",
        outputText: "Implemented.",
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString(),
        diffText: "diff --git a/src/example.ts b/src/example.ts"
      },
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    expect(completed.state.featureSprintRunnerRuns[0]?.diffText).toContain("diff --git");
  });

  it("stores verification results without failing implementation complete", () => {
    const created = createFeatureSprintRunnerRun(
      baseData(),
      {
        profile: "codex_implementation",
        cardId: "card-build-test",
        repoPath: "C:/repo"
      },
      FIXED_NOW.toISOString()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const verificationResults = [
      {
        command: "node .life-harness/verify-pass.js",
        status: "passed" as const,
        exitCode: 0,
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString()
      },
      {
        command: "node .life-harness/verify-fail.js",
        status: "failed" as const,
        exitCode: 1,
        stderrExcerpt: "verify failed",
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString()
      },
      {
        command: "node .life-harness/verify-pass-2.js",
        status: "passed" as const,
        exitCode: 0,
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString()
      }
    ];

    const completed = completeFeatureSprintRunnerRun(
      created.state,
      created.runId,
      {
        ok: true,
        profile: "codex_implementation",
        outputText: "Implemented in worktree.",
        startedAt: FIXED_NOW.toISOString(),
        completedAt: FIXED_NOW.toISOString(),
        verificationResults
      },
      FIXED_NOW.toISOString()
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const run = completed.state.featureSprintRunnerRuns[0];
    expect(run?.status).toBe("succeeded");
    expect(run?.verificationResults).toHaveLength(3);
    expect(run?.verificationResults?.map((row) => row.status)).toEqual(["passed", "failed", "passed"]);
    expect(JSON.stringify(completed.state.featureSprintPlans)).toBe(
      JSON.stringify(created.state.featureSprintPlans)
    );
  });
});
