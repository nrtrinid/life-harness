import { describe, expect, it, vi, afterEach } from "vitest";

import { createSeedState } from "../data/createSeedState";
import {
  buildFeatureSprintRunnerExecutionContext,
  historyAttributionFromExecutionContext
} from "./featureSprintMap";
import {
  FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
  runFeatureSprintPacket
} from "./featureSprintRunnerClient";
import {
  completeFeatureSprintRunnerRun,
  createFeatureSprintRunnerRun
} from "./featureSprintRunnerHistory";
import { formatRunnerResultUsabilityLabel } from "./featureSprintRunner";
import { buildFeatureSprintRunnerOutputView } from "./featureSprintRunnerOutputView";
import {
  createFeatureSprintPlanForCard,
  updateFeatureSprintPlan
} from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintMap,
  HarnessFeatureSprintPlan,
  LifeCard
} from "./types";

const FIXED_NOW = new Date("2026-07-16T18:00:00.000Z");

function card(overrides: Partial<LifeCard> = {}): LifeCard {
  return {
    id: "card-ctx-1",
    title: "Execution context feature",
    area: "build",
    state: "active",
    progress: 40,
    warmth: "warm",
    nextTinyAction: "Wire context",
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
    cards: [card()],
    ...overrides
  };
}

function sampleMap(options?: {
  taskStatus?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][0]["status"];
  withDep?: boolean;
}): HarnessFeatureSprintMap {
  return {
    sprints: [
      {
        id: "sprint-1",
        title: "Sprint 1",
        objective: "Land context",
        stories: [
          {
            id: "story-1",
            title: "Story / Slice 1",
            outcome: "Typed context round-trips",
            tasks: [
              {
                id: "task-a",
                title: "Task A",
                objective: "Prerequisite",
                status: "done",
                acceptanceCriteria: [{ id: "ac-a", text: "Done" }],
                dependencies: [],
                scope: { allowedPaths: ["src/core/"] },
                verificationRequirements: [{ id: "vr-a", description: "unit" }],
                linkedStepId: "step-1"
              },
              {
                id: "task-b",
                title: "Task B",
                objective: "Implement context",
                status: options?.taskStatus ?? "ready",
                acceptanceCriteria: [{ id: "ac-b", text: "Context echoes" }],
                dependencies: options?.withDep
                  ? [{ id: "dep-1", taskId: "task-a", required: true }]
                  : [],
                scope: { allowedPaths: ["src/core/"] },
                verificationRequirements: [{ id: "vr-b", description: "unit" }],
                linkedStepId: "step-1"
              }
            ]
          }
        ]
      }
    ]
  };
}

function planWithMap(
  data: LifeHarnessData,
  options?: {
    authoritative?: boolean;
    taskStatus?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][0]["status"];
    withDep?: boolean;
    phase?: "localize" | "implement" | "review";
    includeTarget?: boolean;
    prerequisiteStatus?: HarnessFeatureSprintMap["sprints"][0]["stories"][0]["tasks"][0]["status"];
  }
): { data: LifeHarnessData; plan: HarnessFeatureSprintPlan } {
  const created = createFeatureSprintPlanForCard(data, {
    cardId: "card-ctx-1",
    title: "Context plan",
    goal: "Prove execution context",
    acceptanceCriteria: ["Context round-trips"]
  });
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(created.error);
  }

  const map = sampleMap({
    taskStatus: options?.taskStatus,
    withDep: options?.withDep
  });
  if (options?.prerequisiteStatus) {
    map.sprints[0].stories[0].tasks[0].status = options.prerequisiteStatus;
  }
  const target =
    options?.includeTarget === false
      ? undefined
      : {
          sprintId: "sprint-1",
          storyId: "story-1",
          taskId: "task-b",
          phase: options?.phase ?? ("implement" as const)
        };

  const updated = updateFeatureSprintPlan(created.state, created.planId, {
    sprintMap: map,
    executionTarget: target ?? null,
    executionModel: options?.authoritative ? "sprint_map" : null
  });
  expect(updated.ok).toBe(true);
  if (!updated.ok) {
    throw new Error(updated.error);
  }
  const plan = updated.state.featureSprintPlans.find((item) => item.id === created.planId)!;
  return { data: updated.state, plan };
}

describe("buildFeatureSprintRunnerExecutionContext", () => {
  it("produces legacy context for a legacy plan", () => {
    const { plan } = planWithMap(baseData(), { authoritative: false, includeTarget: false });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      stepId: plan.currentStepId,
      phase: "implement"
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.context).toEqual({
      planId: plan.id,
      stepId: plan.currentStepId,
      executionModel: "legacy_steps"
    });
    expect(built.context.sprintId).toBeUndefined();
  });

  it("does not produce authoritative map context for a preview map", () => {
    const { plan } = planWithMap(baseData(), { authoritative: false });
    expect(plan.sprintMap).toBeTruthy();
    expect(plan.executionModel).toBeUndefined();

    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      stepId: plan.currentStepId,
      phase: "implement"
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.context.executionModel).toBe("legacy_steps");
    expect(built.context.sprintId).toBeUndefined();
    expect(built.context.taskId).toBeUndefined();
    expect(historyAttributionFromExecutionContext(built.context).mapPhase).toBeUndefined();
  });

  it("produces full target IDs and matching phase for an adopted map", () => {
    const { plan } = planWithMap(baseData(), {
      authoritative: true,
      phase: "review"
    });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "review",
      stepId: plan.currentStepId
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.context).toEqual({
      planId: plan.id,
      executionModel: "sprint_map",
      sprintId: "sprint-1",
      storyId: "story-1",
      taskId: "task-b",
      phase: "review",
      stepId: "step-1"
    });
  });

  it("blocks adopted map with missing target", () => {
    const { plan } = planWithMap(baseData(), {
      authoritative: true,
      includeTarget: false
    });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "implement"
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.error.toLowerCase()).toMatch(/target|select/);
  });

  it("blocks phase mismatch", () => {
    const { plan } = planWithMap(baseData(), {
      authoritative: true,
      phase: "review"
    });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "implement"
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.error).toContain("requires");
  });

  it("blocks unmet dependency", () => {
    const { plan } = planWithMap(baseData(), {
      authoritative: true,
      withDep: true,
      taskStatus: "ready",
      prerequisiteStatus: "planned"
    });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "implement"
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.error.toLowerCase()).toMatch(/dependenc/);
  });

  it("omits phase for authoritative non-phase (prompt audit) context and history", () => {
    const { data, plan } = planWithMap(baseData(), {
      authoritative: true,
      phase: "implement"
    });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      stepId: plan.currentStepId
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.context.executionModel).toBe("sprint_map");
    expect(built.context.sprintId).toBe("sprint-1");
    expect(built.context.storyId).toBe("story-1");
    expect(built.context.taskId).toBe("task-b");
    expect(built.context.phase).toBeUndefined();
    expect(built.context).not.toHaveProperty("phase");

    const attribution = historyAttributionFromExecutionContext(built.context);
    expect(attribution.mapPhase).toBeUndefined();
    const created = createFeatureSprintRunnerRun(data, {
      profile: "codex_prompt_audit",
      cardId: "card-ctx-1",
      ...attribution,
      planId: plan.id,
      stepId: plan.currentStepId
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const run = created.state.featureSprintRunnerRuns[0]!;
    expect(run.profile).toBe("codex_prompt_audit");
    expect(run.sprintId).toBe("sprint-1");
    expect(run.taskId).toBe("task-b");
    expect(run.mapPhase).toBeUndefined();
  });

  it("records implement and review mapPhase for authoritative phase launches", () => {
    for (const phase of ["implement", "review"] as const) {
      const { data, plan } = planWithMap(baseData(), { authoritative: true, phase });
      const built = buildFeatureSprintRunnerExecutionContext({
        plan,
        phase,
        stepId: plan.currentStepId
      });
      expect(built.ok).toBe(true);
      if (!built.ok) {
        return;
      }
      expect(built.context.phase).toBe(phase);
      const attribution = historyAttributionFromExecutionContext(built.context);
      expect(attribution.mapPhase).toBe(phase);
      const created = createFeatureSprintRunnerRun(data, {
        profile: phase === "implement" ? "cursor_implementation" : "cursor_review",
        cardId: "card-ctx-1",
        ...attribution,
        planId: plan.id,
        stepId: plan.currentStepId
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      expect(created.state.featureSprintRunnerRuns[0]?.mapPhase).toBe(phase);
    }
  });
});

describe("execution context transport + history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const context = {
    planId: "plan-ctx",
    executionModel: "sprint_map" as const,
    sprintId: "sprint-1",
    storyId: "story-1",
    taskId: "task-b",
    phase: "implement" as const,
    stepId: "step-1"
  };

  it("preserves request context through successful client response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          profile: "cursor_implementation",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          outputText: "done",
          resultUsability: "usable",
          failureClass: "none",
          terminationReason: "completed",
          executionContext: context
        })
      })
    );

    const result = await runFeatureSprintPacket({
      profile: "cursor_implementation",
      promptMarkdown: "## implement",
      repoPath: "C:/tmp/repo",
      worktree: { enabled: true },
      executionContext: context
    });
    expect(result.ok).toBe(true);
    expect(result.executionContext).toEqual(context);
  });

  it("preserves context on HTTP 500 empty_output envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          profile: "cursor_review",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          failureClass: "empty_output",
          resultUsability: "empty_output",
          terminationReason: "completed",
          error: "empty",
          executionContext: context
        })
      })
    );

    const result = await runFeatureSprintPacket({
      profile: "cursor_review",
      promptMarkdown: "## review",
      executionContext: context
    });
    expect(result.ok).toBe(false);
    expect(result.resultUsability).toBe("empty_output");
    expect(result.executionContext).toEqual(context);
  });

  it("preserves timeout and readonly_mutation context envelopes", async () => {
    for (const envelope of [
      {
        terminationReason: "timeout",
        timedOut: true,
        resultUsability: "unusable",
        failureClass: "runner"
      },
      {
        terminationReason: "readonly_mutation",
        resultUsability: "needs_human_review",
        failureClass: "agent"
      }
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({
            ok: false,
            profile: "cursor_review",
            startedAt: "2026-01-01T00:00:00.000Z",
            completedAt: "2026-01-01T00:00:01.000Z",
            error: envelope.terminationReason,
            executionContext: context,
            ...envelope
          })
        })
      );

      const result = await runFeatureSprintPacket({
        profile: "cursor_review",
        promptMarkdown: "## review",
        executionContext: context
      });
      expect(result.executionContext).toEqual(context);
      expect(result.terminationReason).toBe(envelope.terminationReason);
    }
  });

  it("falls back to request context on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await runFeatureSprintPacket({
      profile: "cursor_scoping",
      promptMarkdown: "## scope",
      executionContext: {
        planId: "plan-net",
        executionModel: "legacy_steps",
        stepId: "step-net"
      }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE);
    expect(result.executionContext).toEqual({
      planId: "plan-net",
      executionModel: "legacy_steps",
      stepId: "step-net"
    });
  });

  it("remains compatible when request has no context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          profile: "cursor_scoping",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          outputText: "ok",
          resultUsability: "usable",
          failureClass: "none",
          terminationReason: "completed"
        })
      })
    );
    const result = await runFeatureSprintPacket({
      profile: "cursor_scoping",
      promptMarkdown: "## scope"
    });
    expect(result.ok).toBe(true);
    expect(result.executionContext).toBeUndefined();
  });

  it("stores map attribution and usability on history complete from response context", () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: true });
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_implementation",
      cardId: "card-ctx-1",
      planId: plan.id,
      stepId: plan.currentStepId
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: false,
      profile: "cursor_implementation",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      error: "empty",
      runId: "run-empty-echo",
      failureClass: "empty_output",
      resultUsability: "empty_output",
      terminationReason: "completed",
      diagnosticMessage: "Completed with empty captured output.",
      executionContext: {
        planId: plan.id,
        executionModel: "sprint_map",
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-b",
        phase: "implement",
        stepId: "step-1"
      }
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const run = completed.state.featureSprintRunnerRuns[0]!;
    expect(run.status).toBe("failed");
    expect(run.sprintId).toBe("sprint-1");
    expect(run.storyId).toBe("story-1");
    expect(run.taskId).toBe("task-b");
    expect(run.mapPhase).toBe("implement");
    expect(run.resultUsability).toBe("empty_output");
    expect(run.diagnosticMessage).toContain("empty");

    const view = buildFeatureSprintRunnerOutputView(completed.state, run.id)!;
    expect(view.usabilityLabel).toBe("Empty output (unusable)");
    expect(view.taskId).toBe("task-b");
  });

  it("overlays echoed context from structured readonly_mutation envelope", () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: true, phase: "review" });
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_review",
      cardId: "card-ctx-1",
      planId: plan.id,
      stepId: plan.currentStepId,
      sprintId: "sprint-1",
      storyId: "story-1",
      taskId: "task-b",
      mapPhase: "review"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: false,
      profile: "cursor_review",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      runId: "run-ro-echo",
      terminationReason: "readonly_mutation",
      failureClass: "agent",
      resultUsability: "needs_human_review",
      error: "readonly_mutation",
      executionContext: {
        planId: plan.id,
        executionModel: "sprint_map",
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-b",
        phase: "review"
      }
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const run = completed.state.featureSprintRunnerRuns[0]!;
    expect(run.mapPhase).toBe("review");
    expect(run.terminationReason).toBe("readonly_mutation");
    expect(run.resultUsability).toBe("needs_human_review");
  });

  it("keeps create-time attribution on network failure without fabricating runner echo", async () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: true });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "implement",
      stepId: plan.currentStepId
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_implementation",
      cardId: "card-ctx-1",
      ...historyAttributionFromExecutionContext(built.context),
      planId: plan.id,
      stepId: plan.currentStepId
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await runFeatureSprintPacket({
      profile: "cursor_implementation",
      promptMarkdown: "## implement",
      repoPath: "C:/tmp/repo",
      worktree: { enabled: true },
      executionContext: built.context
    });
    expect(result.ok).toBe(false);
    expect(result.runId).toBeUndefined();
    expect(result.terminationReason).toBeUndefined();
    expect(result.executionContext).toEqual(built.context);

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, result);
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const run = completed.state.featureSprintRunnerRuns[0]!;
    expect(run.status).toBe("failed");
    expect(run.sprintId).toBe("sprint-1");
    expect(run.taskId).toBe("task-b");
    expect(run.mapPhase).toBe("implement");
    expect(run.terminationReason).toBeUndefined();
    expect(run.failureClass).toBeUndefined();
    expect(run.resultUsability).toBeUndefined();
    expect(run.error).toBe(FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE);
  });

  it("keeps create-time attribution when response body is invalid JSON", async () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: true, phase: "review" });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "review",
      stepId: plan.currentStepId
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_review",
      cardId: "card-ctx-1",
      ...historyAttributionFromExecutionContext(built.context),
      planId: plan.id,
      stepId: plan.currentStepId
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        }
      })
    );
    const result = await runFeatureSprintPacket({
      profile: "cursor_review",
      promptMarkdown: "## review",
      executionContext: built.context
    });
    expect(result.ok).toBe(false);
    expect(result.runId).toBeUndefined();
    expect(result.terminationReason).toBeUndefined();

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, result);
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const run = completed.state.featureSprintRunnerRuns[0]!;
    expect(run.status).toBe("failed");
    expect(run.mapPhase).toBe("review");
    expect(run.terminationReason).toBeUndefined();
  });

  it("prefers echoed context from successful structured response", () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: true });
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_implementation",
      cardId: "card-ctx-1",
      planId: plan.id,
      stepId: plan.currentStepId,
      sprintId: "stale-sprint",
      storyId: "stale-story",
      taskId: "stale-task",
      mapPhase: "localize"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const completed = completeFeatureSprintRunnerRun(created.state, created.runId, {
      ok: true,
      profile: "cursor_implementation",
      startedAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
      outputText: "done",
      runId: "run-ok-echo",
      terminationReason: "completed",
      failureClass: "none",
      resultUsability: "usable",
      executionContext: {
        planId: plan.id,
        executionModel: "sprint_map",
        sprintId: "sprint-1",
        storyId: "story-1",
        taskId: "task-b",
        phase: "implement"
      }
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const run = completed.state.featureSprintRunnerRuns[0]!;
    expect(run.sprintId).toBe("sprint-1");
    expect(run.storyId).toBe("story-1");
    expect(run.taskId).toBe("task-b");
    expect(run.mapPhase).toBe("implement");
  });

  it("does not attribute preview map IDs onto a legacy run", () => {
    const { data, plan } = planWithMap(baseData(), { authoritative: false });
    const built = buildFeatureSprintRunnerExecutionContext({
      plan,
      phase: "implement",
      stepId: plan.currentStepId
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const attribution = historyAttributionFromExecutionContext(built.context);
    const created = createFeatureSprintRunnerRun(data, {
      profile: "cursor_implementation",
      cardId: "card-ctx-1",
      planId: plan.id,
      stepId: plan.currentStepId,
      ...attribution
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const run = created.state.featureSprintRunnerRuns[0]!;
    expect(run.sprintId).toBeUndefined();
    expect(run.mapPhase).toBeUndefined();
  });

  it("distinguishes timeout vs cancellation labels", () => {
    expect(
      formatRunnerResultUsabilityLabel({
        status: "failed",
        timedOut: true,
        terminationReason: "timeout"
      })
    ).toBe("Timed out");
    expect(
      formatRunnerResultUsabilityLabel({
        status: "failed",
        cancelled: true,
        terminationReason: "cancelled"
      })
    ).toBe("Cancelled");
    expect(
      formatRunnerResultUsabilityLabel({
        status: "failed",
        resultUsability: "needs_human_review",
        terminationReason: "readonly_mutation"
      })
    ).toBe("Needs human review");
  });
});
