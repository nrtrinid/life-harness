import { describe, expect, it } from "vitest";

import {
  applyFeatureSprintLegalAction,
  approveRiskyTaskForPlan,
  requestClarifiedSpecRevision,
  upsertDraftClarifiedSpec
} from "./featureSprintApplyLegalAction";
import { classifyClarifiedSpecMaterialChange } from "./featureSprintClarifiedSpec";
import {
  createMockKernelSprintSeed,
  defaultHappyPathScript,
  reviewFence,
  runMockFeatureSprintKernelLoop
} from "./featureSprintKernelDogfood";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import { normalizeData } from "./stateHydration";
import { normalizeRepoRelativePath, pathMatchesScope, resolvePlanStateRevision } from "./featureSprintTaskContract";
import {
  formatWorkerOutputEvidencePacketSections,
  resolveWorkerEvidenceForStep
} from "./featureSprintWorkerOutput";

describe("feature sprint next-legal-action kernel", () => {
  it("happy path completes mock sprint without UI clicks", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1)
    });
    expect(result.ok).toBe(true);
    expect(result.terminalAction).toBe("terminal_complete");
    expect(result.steps.map((step) => step.action)).toEqual(
      expect.arrayContaining([
        "approve_spec",
        "freeze_spec",
        "adopt_sprint_map",
        "launch_implementation",
        "save_implementation_proof",
        "launch_review",
        "import_review_verdict",
        "advance_task",
        "complete_sprint",
        "terminal_complete"
      ])
    );
  });

  it("stops when required clarification remains open", () => {
    const seed = createMockKernelSprintSeed({ withOpenClarification: true });
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next && next.action).toBe("request_clarification");

    const withoutAnswers = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: { ...defaultHappyPathScript(1), clarificationAnswers: [] },
      maxSteps: 3
    });
    // Applying request_clarification without answering keeps clarifying / request loop or fails apply.
    expect(
      withoutAnswers.stopReason ||
        withoutAnswers.steps.some((step) => step.action === "request_clarification")
    ).toBeTruthy();
  });

  it("holds risky tasks before implementation", () => {
    const seed = createMockKernelSprintSeed({ riskTier: "risky" });
    // Drive to frozen + adopted + selected.
    let state = seed.state;
    const script = defaultHappyPathScript(1);
    // Manually walk until human hold.
    for (let i = 0; i < 10; i += 1) {
      const nextResult = getNextFeatureSprintLegalAction(state, seed.planId);
      if ("ok" in nextResult && nextResult.ok === false) {
        throw new Error(nextResult.error);
      }
      const next = nextResult as Exclude<typeof nextResult, { ok: false }>;
      if (next.action === "human_hold") {
        expect(next.holdReason).toBe("risky_task_approval_required");
        return;
      }
      if (next.action === "terminal_complete") {
        throw new Error("Should not complete risky task without approval");
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action,
        artifact: { type: "none" }
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
    }
    throw new Error("Did not reach risky hold");
  });

  it("blocks scope violations", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        implementationProof: {
          frozenSpecRevision: 1,
          changedFiles: ["README.md"],
          rawOutput: "Touched unapproved file.",
          verificationResult: "pass"
        },
        reviewVerdictText: reviewFence("accepted", "Should not matter.")
      },
      maxSteps: 20
    });
    expect(result.ok).toBe(false);
    expect(result.stopReason).toMatch(/scope|Allowed|outside/i);
  });

  it("blocks verification failures before review", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        implementationProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "Broken verify.",
          verificationResult: "fail"
        }
      },
      maxSteps: 20
    });
    expect(result.ok).toBe(false);
    expect(String(result.stopReason)).toMatch(/Verification|fail/i);
  });

  it("enters correction on needs_changes and can recover", () => {
    const seed = createMockKernelSprintSeed({ maxCorrectionAttempts: 2 });
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        implementationProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "First impl.",
          verificationResult: "pass"
        },
        reviewVerdictText: reviewFence("needs_changes", "Needs a fix."),
        correctionProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "Corrected impl.",
          verificationResult: "pass"
        },
        correctionReviewVerdictText: reviewFence("accepted", "Fixed.")
      }
    });
    expect(result.ok).toBe(true);
    expect(result.terminalAction).toBe("terminal_complete");
    expect(result.steps.some((step) => step.action === "launch_correction")).toBe(true);
  });

  it("holds when correction limit is reached", () => {
    const seed = createMockKernelSprintSeed({ maxCorrectionAttempts: 1 });
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        implementationProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "First impl.",
          verificationResult: "pass"
        },
        reviewVerdictText: reviewFence("needs_changes", "Still wrong."),
        correctionProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "Still wrong.",
          verificationResult: "pass"
        },
        correctionReviewVerdictText: reviewFence("needs_changes", "Again.")
      },
      maxSteps: 30
    });
    expect(result.terminalAction).toBe("human_hold");
    expect(result.stopReason).toMatch(/retry_limit|Correction/i);
  });

  it("holds on blocked review", () => {
    const seed = createMockKernelSprintSeed({});
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        implementationProof: {
          frozenSpecRevision: 1,
          changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
          rawOutput: "Impl.",
          verificationResult: "pass"
        },
        reviewVerdictText: reviewFence("blocked", "Unsafe.")
      },
      maxSteps: 25
    });
    expect(result.terminalAction).toBe("human_hold");
    expect(result.next?.holdReason).toBe("review_blocked");
  });

  it("rejects stale actions", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("action" in next).toBe(true);
    if (!("action" in next)) {
      return;
    }
    const stale = applyFeatureSprintLegalAction(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision + 1,
      expectedAction: next.action
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toBe("stale_action");
    }
  });

  it("applies duplicate actions idempotently", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("actionId" in next).toBe(true);
    if (!("actionId" in next)) {
      return;
    }
    const first = applyFeatureSprintLegalAction(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = applyFeatureSprintLegalAction(first.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    // After first apply, revision advanced so same actionId+old revision is stale OR idempotent if revision matched applied set.
    // Replaying with the old revision should be stale; replaying recorded actionId against current revision uses appliedActionIds.
    const replayCurrent = applyFeatureSprintLegalAction(first.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: first.stateRevision,
      expectedAction: next.action
    });
    expect(replayCurrent.ok).toBe(true);
    if (replayCurrent.ok) {
      expect(replayCurrent.idempotent).toBe(true);
    }
    expect(second.ok === false || ("idempotent" in second && second.idempotent === true)).toBe(true);
  });

  it("recovers material revision through approve then freeze at a higher revision", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (let i = 0; i < 8; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        break;
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
      if (next.action === "freeze_spec") {
        break;
      }
    }

    const planBefore = state.featureSprintPlans[0]!;
    expect(planBefore.clarifiedSpec?.status).toBe("frozen");
    expect(planBefore.clarifiedSpec?.revision).toBe(1);

    // Plant old-revision execution artifacts that must be invalidated.
    state = {
      ...state,
      featureSprintPlans: [
        {
          ...planBefore,
          steps: [
            {
              id: "step-kernel-1",
              title: "Old step",
              goal: "Old",
              status: "done",
              acceptanceCriteria: ["old"],
              frozenSpecRevision: 1,
              implementationProof: {
                filesChanged: ["src/core/featureSprintNextLegalAction.ts"],
                behaviorChanged: [],
                rawOutput: "old proof",
                verificationResult: "pass",
                frozenSpecRevision: 1,
                knownRisks: [],
                testsRun: [],
                testsNotRun: [],
                suggestedReviewFocus: [],
                createdAt: "2026-07-22T12:00:00.000Z",
                updatedAt: "2026-07-22T12:00:00.000Z"
              },
              reviewStatus: "accepted",
              reviewVerdict: "old accept",
              correctionAttempt: 1,
              createdAt: "2026-07-22T12:00:00.000Z",
              updatedAt: "2026-07-22T12:00:00.000Z"
            }
          ],
          sprintMap: {
            ...planBefore.sprintMap!,
            sprints: planBefore.sprintMap!.sprints.map((sprint) => ({
              ...sprint,
              stories: sprint.stories.map((story) => ({
                ...story,
                tasks: story.tasks.map((task) =>
                  task.id === seed.taskId
                    ? {
                        ...task,
                        status: "done" as const,
                        gateState: "passed" as const,
                        frozenSpecRevision: 1,
                        correctionAttempt: 1,
                        linkedStepId: "step-kernel-1"
                      }
                    : task
                )
              }))
            }))
          }
        }
      ]
    };

    const revised = requestClarifiedSpecRevision(state, seed.planId, {
      type: "clarified_spec_revision",
      baseRevision: 1,
      patch: { acceptanceCriteria: ["New criterion after freeze"] }
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) {
      return;
    }
    // Not permanently held — must approve before refreeze.
    expect(revised.next.action).toBe("approve_spec");
    const revisedPlan = revised.state.featureSprintPlans[0]!;
    expect(revisedPlan.clarifiedSpec?.status).toBe("revision_required");
    expect(revisedPlan.clarifiedSpec?.revision).toBe(2);
    expect(revisedPlan.clarifiedSpec?.supersedesRevision).toBe(1);
    expect(revisedPlan.steps[0]?.implementationProof).toBeUndefined();
    expect(revisedPlan.steps[0]?.reviewStatus).toBeUndefined();
    expect(revisedPlan.sprintMap?.sprints[0].stories[0].tasks[0].status).toBe("ready");

    const approved = applyFeatureSprintLegalAction(revised.state, {
      planId: seed.planId,
      actionId: revised.next.actionId,
      stateRevision: revised.next.stateRevision,
      expectedAction: "approve_spec"
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.next.action).toBe("freeze_spec");

    const frozen = applyFeatureSprintLegalAction(approved.state, {
      planId: seed.planId,
      actionId: approved.next.actionId,
      stateRevision: approved.next.stateRevision,
      expectedAction: "freeze_spec"
    });
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const frozenPlan = frozen.state.featureSprintPlans[0]!;
    expect(frozenPlan.clarifiedSpec?.status).toBe("frozen");
    expect(frozenPlan.clarifiedSpec?.revision).toBe(2);
    expect(frozenPlan.clarifiedSpec!.revision).toBeGreaterThan(1);

    // Old proof under revision 1 cannot authorize work under revision 2.
    const task = frozenPlan.sprintMap!.sprints[0].stories[0].tasks[0];
    const withStaleProof = {
      ...frozen.state,
      featureSprintPlans: [
        {
          ...frozenPlan,
          executionModel: "sprint_map" as const,
          executionTarget: {
            sprintId: "sprint-1",
            storyId: "story-1",
            taskId: task.id,
            phase: "review" as const
          },
          steps: [
            {
              id: "step-kernel-1",
              title: task.title,
              goal: task.objective,
              status: "reviewing" as const,
              acceptanceCriteria: task.acceptanceCriteria.map((item) => item.text),
              linkedStepId: undefined,
              frozenSpecRevision: 1,
              implementationProof: {
                filesChanged: ["src/core/featureSprintNextLegalAction.ts"],
                behaviorChanged: [],
                rawOutput: "stale",
                verificationResult: "pass" as const,
                frozenSpecRevision: 1,
                knownRisks: [],
                testsRun: [],
                testsNotRun: [],
                suggestedReviewFocus: [],
                createdAt: "2026-07-22T12:00:00.000Z",
                updatedAt: "2026-07-22T12:00:00.000Z"
              },
              reviewStatus: "accepted" as const,
              createdAt: "2026-07-22T12:00:00.000Z",
              updatedAt: "2026-07-22T12:00:00.000Z"
            }
          ],
          sprintMap: {
            ...frozenPlan.sprintMap!,
            sprints: frozenPlan.sprintMap!.sprints.map((sprint) => ({
              ...sprint,
              stories: sprint.stories.map((story) => ({
                ...story,
                tasks: story.tasks.map((item) =>
                  item.id === task.id
                    ? { ...item, status: "in_progress" as const, linkedStepId: "step-kernel-1" }
                    : item
                )
              }))
            }))
          }
        }
      ]
    };
    const staleNext = getNextFeatureSprintLegalAction(withStaleProof, seed.planId);
    expect("action" in staleNext && staleNext.action).toBe("human_hold");
    if ("holdReason" in staleNext) {
      expect(staleNext.holdReason).toBe("missing_evidence");
    }
  });

  it("does not invalidate artifacts for rejected non-material revision requests", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (let i = 0; i < 5; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        break;
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      if (!applied.ok) {
        break;
      }
      state = applied.state;
      if (next.action === "freeze_spec") {
        break;
      }
    }
    const plan = state.featureSprintPlans[0]!;
    const withProof = {
      ...state,
      featureSprintPlans: [
        {
          ...plan,
          steps: [
            {
              id: "step-keep",
              title: "Keep",
              goal: "Keep",
              status: "sent" as const,
              acceptanceCriteria: ["x"],
              frozenSpecRevision: 1,
              implementationProof: {
                filesChanged: ["src/core/featureSprintNextLegalAction.ts"],
                behaviorChanged: [],
                rawOutput: "keep",
                verificationResult: "pass" as const,
                frozenSpecRevision: 1,
                knownRisks: [],
                testsRun: [],
                testsNotRun: [],
                suggestedReviewFocus: [],
                createdAt: "2026-07-22T12:00:00.000Z",
                updatedAt: "2026-07-22T12:00:00.000Z"
              },
              createdAt: "2026-07-22T12:00:00.000Z",
              updatedAt: "2026-07-22T12:00:00.000Z"
            }
          ]
        }
      ]
    };
    const rejected = requestClarifiedSpecRevision(withProof, seed.planId, {
      type: "clarified_spec_revision",
      baseRevision: 1,
      patch: {
        // Same material fields — only whitespace-equivalent objective (non-material).
        objective: plan.clarifiedSpec!.objective
      }
    });
    expect(rejected.ok).toBe(false);
    expect(withProof.featureSprintPlans[0]!.steps[0]?.implementationProof).toBeDefined();
  });

  it("classifies material vs uncertain wording changes", () => {
    const base = {
      revision: 1,
      status: "frozen" as const,
      objective: "Ship kernel",
      userIntent: "Control plane",
      assumptions: ["Mock only"],
      constraints: ["No providers"],
      nonGoals: ["UI rewrite"],
      acceptanceCriteria: ["Tests pass"],
      clarificationQuestions: []
    };
    const material = classifyClarifiedSpecMaterialChange(base, {
      ...base,
      acceptanceCriteria: ["Tests pass", "Docs updated"]
    });
    expect(material.material).toBe(true);

    const uncertain = classifyClarifiedSpecMaterialChange(base, {
      ...base,
      userIntent: "Control plane (clarified wording)"
    });
    expect(uncertain.material).toBe(true);
    expect(uncertain.uncertain).toBe(true);
  });

  it("rehydrates and resumes from the correct next action", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (let i = 0; i < 4; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        throw new Error("missing action");
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
    }

    const before = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in before).toBe(true);
    if (!("action" in before)) {
      return;
    }

    const hydrated = normalizeData(JSON.parse(JSON.stringify(state)));
    const after = getNextFeatureSprintLegalAction(hydrated, seed.planId);
    expect("action" in after).toBe(true);
    if (!("action" in after)) {
      return;
    }
    expect(after.action).toBe(before.action);
    expect(after.stateRevision).toBe(before.stateRevision);
    expect(resolvePlanStateRevision(hydrated.featureSprintPlans[0])).toBe(before.stateRevision);
  });

  it("keeps legacy plans on unsupported_legacy_state hold", () => {
    const seed = createMockKernelSprintSeed({});
    const plan = seed.state.featureSprintPlans[0];
    const legacy = {
      ...seed.state,
      featureSprintPlans: [{ ...plan, clarifiedSpec: undefined, clarifiedSpecHistory: undefined }]
    };
    const next = getNextFeatureSprintLegalAction(legacy, seed.planId);
    expect("holdReason" in next && next.holdReason).toBe("unsupported_legacy_state");
  });

  it("allows risky task after explicit human approval", () => {
    const seed = createMockKernelSprintSeed({ riskTier: "risky" });
    const result = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: {
        ...defaultHappyPathScript(1),
        approveRiskyTaskIds: [seed.taskId]
      }
    });
    expect(result.ok).toBe(true);
    expect(result.terminalAction).toBe("terminal_complete");
  });
});

describe("clarified spec upsert guards", () => {
  it("does not silently mutate a frozen spec via draft upsert", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (const expected of ["approve_spec", "freeze_spec"] as const) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      expect("action" in next && next.action).toBe(expected);
      if (!("action" in next)) {
        return;
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }
      state = applied.state;
    }
    const blocked = upsertDraftClarifiedSpec(state, seed.planId, {
      type: "clarified_spec_draft",
      objective: "Silent rewrite",
      userIntent: "Nope",
      acceptanceCriteria: ["Should fail"]
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("pathMatchesScope normalization", () => {
  it("normalizes separators and rejects traversal escapes", () => {
    const allowed = ["src/core/**"];
    expect(pathMatchesScope("src/core/example.ts", allowed)).toBe(true);
    expect(pathMatchesScope("src\\core\\example.ts", allowed)).toBe(true);
    expect(pathMatchesScope("src/core/./example.ts", allowed)).toBe(true);
    expect(pathMatchesScope("src/core/../other.ts", allowed)).toBe(false);
    expect(pathMatchesScope("src/core/../../README.md", allowed)).toBe(false);
    expect(pathMatchesScope("../src/core/example.ts", allowed)).toBe(false);
    expect(pathMatchesScope("src/foobar/example.ts", ["src/foo"])).toBe(false);
    expect(pathMatchesScope("src/foo/example.ts", ["src/foo"])).toBe(true);
    expect(normalizeRepoRelativePath("C:/Users/me/file.ts").ok).toBe(false);
    expect(normalizeRepoRelativePath("/etc/passwd").ok).toBe(false);
    // Explicit absolute-path rejections required by final review.
    expect(pathMatchesScope("/src/core/example.ts", allowed)).toBe(false);
    expect(normalizeRepoRelativePath("/src/core/example.ts")).toEqual({
      ok: false,
      reason: "absolute"
    });
    expect(pathMatchesScope("C:\\repo\\src\\core\\example.ts", allowed)).toBe(false);
    expect(normalizeRepoRelativePath("C:\\repo\\src\\core\\example.ts")).toEqual({
      ok: false,
      reason: "absolute"
    });
  });
});

describe("completion, dependency, parked, and get/apply agreement gates", () => {
  function walkToFrozenAdopted(state: ReturnType<typeof createMockKernelSprintSeed>["state"], planId: string) {
    let nextState = state;
    for (let i = 0; i < 10; i += 1) {
      const next = getNextFeatureSprintLegalAction(nextState, planId);
      if (!("action" in next)) {
        break;
      }
      if (next.action === "select_task" || next.action === "launch_implementation") {
        return nextState;
      }
      const applied = applyFeatureSprintLegalAction(nextState, {
        planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      if (!applied.ok) {
        throw new Error(applied.error);
      }
      nextState = applied.state;
      if (next.action === "adopt_sprint_map") {
        return nextState;
      }
    }
    return nextState;
  }

  function withTasks(
    state: ReturnType<typeof createMockKernelSprintSeed>["state"],
    planId: string,
    mutate: (
      tasks: Array<
        NonNullable<
          NonNullable<(typeof state)["featureSprintPlans"][0]["sprintMap"]>["sprints"][0]["stories"][0]["tasks"][0]
        >
      >
    ) => void,
    executionTarget?: {
      sprintId: string;
      storyId: string;
      taskId: string;
      phase: "implement" | "review" | "localize";
    }
  ) {
    const plan = state.featureSprintPlans.find((item) => item.id === planId)!;
    const map = structuredClone(plan.sprintMap!);
    const tasks = map.sprints[0].stories[0].tasks;
    mutate(tasks);
    return {
      ...state,
      featureSprintPlans: [
        {
          ...plan,
          sprintMap: map,
          executionModel: "sprint_map" as const,
          executionTarget
        }
      ]
    };
  }

  it("holds instead of completing when a parked sibling remains", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(
      state,
      seed.planId,
      (tasks) => {
        tasks[0].status = "done";
        tasks.push({
          ...tasks[0],
          id: "task-parked",
          title: "Parked leftover",
          status: "parked",
          dependencies: [],
          linkedStepId: undefined
        });
      },
      { sprintId: "sprint-1", storyId: "story-1", taskId: seed.taskId, phase: "implement" }
    );
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if ("holdReason" in next) {
      expect(next.holdReason).toBe("unfinished_tasks_remain");
      expect(next.unmetPreconditions.some((item) => item.includes("task-parked"))).toBe(true);
    }
  });

  it("holds instead of completing when a blocked sibling remains", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(
      state,
      seed.planId,
      (tasks) => {
        tasks[0].status = "done";
        tasks.push({
          ...tasks[0],
          id: "task-blocked",
          title: "Blocked leftover",
          status: "blocked",
          dependencies: [],
          linkedStepId: undefined
        });
      },
      { sprintId: "sprint-1", storyId: "story-1", taskId: seed.taskId, phase: "implement" }
    );
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if ("holdReason" in next) {
      expect(next.holdReason).toBe("unfinished_tasks_remain");
    }
  });

  it("holds instead of completing when a dependency-blocked sibling remains", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(
      state,
      seed.planId,
      (tasks) => {
        tasks[0].status = "done";
        tasks.push({
          ...tasks[0],
          id: "task-waiting-dep",
          title: "Waiting on missing dep",
          status: "ready",
          dependencies: [{ id: "d1", taskId: "missing-upstream", required: true }],
          linkedStepId: undefined
        });
      },
      { sprintId: "sprint-1", storyId: "story-1", taskId: seed.taskId, phase: "implement" }
    );
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if ("holdReason" in next) {
      expect(next.holdReason).toBe("unfinished_tasks_remain");
    }
  });

  it("permits complete_sprint when the authoritative map is fully done", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].status = "done";
      tasks[0].gateState = "passed";
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("complete_sprint");
    if (!("action" in next)) {
      return;
    }
    const applied = applyFeatureSprintLegalAction(state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const replay = applyFeatureSprintLegalAction(applied.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: applied.stateRevision,
      expectedAction: next.action
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.idempotent).toBe(true);
    }
  });

  it("does not select B while required dependency A is incomplete", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].status = "ready";
      tasks[0].id = "task-a";
      tasks.push({
        ...tasks[0],
        id: "task-b",
        title: "Depends on A",
        status: "ready",
        dependencies: [{ id: "d1", taskId: "task-a", required: true }],
        linkedStepId: undefined
      });
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("select_task");
    if ("executionContext" in next) {
      expect(next.executionContext?.taskId).toBe("task-a");
    }
  });

  it("selects B after A is complete", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].status = "done";
      tasks[0].id = "task-a";
      tasks.push({
        ...tasks[0],
        id: "task-b",
        title: "Depends on A",
        status: "ready",
        dependencies: [{ id: "d1", taskId: "task-a", required: true }],
        linkedStepId: undefined
      });
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("select_task");
    if ("executionContext" in next) {
      expect(next.executionContext?.taskId).toBe("task-b");
    }
  });

  it("selects independently ready C when B is blocked", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].id = "task-b";
      tasks[0].status = "blocked";
      tasks.push({
        ...tasks[0],
        id: "task-c",
        title: "Independent C",
        status: "ready",
        dependencies: [],
        linkedStepId: undefined
      });
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("select_task");
    if ("executionContext" in next) {
      expect(next.executionContext?.taskId).toBe("task-c");
    }
  });

  it("holds on a dependency cycle with no ready task instead of completing", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].id = "task-a";
      tasks[0].status = "ready";
      tasks[0].dependencies = [{ id: "d1", taskId: "task-b", required: true }];
      tasks.push({
        ...tasks[0],
        id: "task-b",
        title: "B",
        status: "ready",
        dependencies: [{ id: "d2", taskId: "task-a", required: true }],
        linkedStepId: undefined
      });
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if ("holdReason" in next) {
      expect(["unfinished_tasks_remain", "dependency_unmet"]).toContain(next.holdReason);
    }
    expect("action" in next && next.action !== "complete_sprint").toBe(true);
  });

  it("holds a parked selected task and does not launch implementation", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(
      state,
      seed.planId,
      (tasks) => {
        tasks[0].status = "parked";
      },
      { sprintId: "sprint-1", storyId: "story-1", taskId: seed.taskId, phase: "implement" }
    );
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if ("holdReason" in next) {
      expect(["task_not_executable", "unfinished_tasks_remain"]).toContain(next.holdReason);
    }
  });

  it("skips a parked non-selected task in favor of a ready sibling", () => {
    const seed = createMockKernelSprintSeed({});
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    state = withTasks(state, seed.planId, (tasks) => {
      tasks[0].status = "parked";
      tasks.push({
        ...tasks[0],
        id: "task-ready",
        title: "Ready sibling",
        status: "ready",
        dependencies: [],
        linkedStepId: undefined
      });
    });
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("select_task");
    if ("executionContext" in next) {
      expect(next.executionContext?.taskId).toBe("task-ready");
    }
  });

  it("getNext and apply agree when accepted review has an invalid contract", () => {
    const seed = createMockKernelSprintSeed({ allowedPaths: [] });
    let state = walkToFrozenAdopted(seed.state, seed.planId);
    const plan = state.featureSprintPlans[0]!;
    state = {
      ...state,
      featureSprintPlans: [
        {
          ...plan,
          executionModel: "sprint_map",
          executionTarget: {
            sprintId: "sprint-1",
            storyId: "story-1",
            taskId: seed.taskId,
            phase: "review"
          },
          steps: [
            {
              id: "step-kernel-1",
              title: "Task",
              goal: "Goal",
              status: "reviewing",
              acceptanceCriteria: ["ac"],
              frozenSpecRevision: 1,
              implementationProof: {
                filesChanged: ["src/core/featureSprintNextLegalAction.ts"],
                behaviorChanged: [],
                rawOutput: "impl",
                verificationResult: "pass",
                frozenSpecRevision: 1,
                knownRisks: [],
                testsRun: [],
                testsNotRun: [],
                suggestedReviewFocus: [],
                createdAt: "2026-07-22T12:00:00.000Z",
                updatedAt: "2026-07-22T12:00:00.000Z"
              },
              reviewStatus: "accepted",
              createdAt: "2026-07-22T12:00:00.000Z",
              updatedAt: "2026-07-22T12:00:00.000Z"
            }
          ],
          sprintMap: {
            ...plan.sprintMap!,
            sprints: plan.sprintMap!.sprints.map((sprint) => ({
              ...sprint,
              stories: sprint.stories.map((story) => ({
                ...story,
                tasks: story.tasks.map((task) =>
                  task.id === seed.taskId
                    ? {
                        ...task,
                        status: "in_progress" as const,
                        scope: { allowedPaths: [], forbiddenPaths: [] },
                        linkedStepId: "step-kernel-1"
                      }
                    : task
                )
              }))
            }))
          }
        }
      ]
    };
    const next = getNextFeatureSprintLegalAction(state, seed.planId);
    expect("action" in next && next.action).toBe("human_hold");
    if (!("action" in next)) {
      return;
    }
    expect(next.action).not.toBe("advance_task");
    const applied = applyFeatureSprintLegalAction(state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.next.action).toBe(next.action);
      expect(applied.idempotent === true || applied.audit.result === "held").toBe(true);
    }
  });
});

describe("final-pass material revision reopen and idempotency regressions", () => {
  it("reopens a completed plan on material revision so terminal_complete is impossible", () => {
    const seed = createMockKernelSprintSeed({});
    const completed = runMockFeatureSprintKernelLoop({
      state: seed.state,
      planId: seed.planId,
      script: defaultHappyPathScript(1)
    });
    expect(completed.ok).toBe(true);
    expect(completed.terminalAction).toBe("terminal_complete");
    const donePlan = completed.state.featureSprintPlans[0]!;
    expect(donePlan.status).toBe("done");
    expect(donePlan.evidenceLogId || donePlan.evidenceProofItemId).toBeTruthy();
    const archivedLogId = donePlan.evidenceLogId;
    const archivedProofId = donePlan.evidenceProofItemId;
    expect(donePlan.clarifiedSpec?.revision).toBe(1);

    const revised = requestClarifiedSpecRevision(completed.state, seed.planId, {
      type: "clarified_spec_revision",
      baseRevision: 1,
      patch: { acceptanceCriteria: ["Must re-complete under revision 2"] }
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) {
      return;
    }
    const reopened = revised.state.featureSprintPlans[0]!;
    expect(reopened.status).toBe("in_progress");
    expect(reopened.completedAt).toBeUndefined();
    expect(reopened.evidenceLogId).toBeUndefined();
    expect(reopened.evidenceProofItemId).toBeUndefined();
    // Archival rows remain in the ledger; only plan pointers are cleared.
    if (archivedLogId) {
      expect(revised.state.logs.some((log) => log.id === archivedLogId)).toBe(true);
    }
    if (archivedProofId) {
      expect(revised.state.proofItems.some((item) => item.id === archivedProofId)).toBe(true);
    }
    expect(revised.next.action).not.toBe("terminal_complete");
    expect(revised.next.action).toBe("approve_spec");

    const approved = applyFeatureSprintLegalAction(revised.state, {
      planId: seed.planId,
      actionId: revised.next.actionId,
      stateRevision: revised.next.stateRevision,
      expectedAction: "approve_spec"
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.next.action).toBe("freeze_spec");
    const frozen = applyFeatureSprintLegalAction(approved.state, {
      planId: seed.planId,
      actionId: approved.next.actionId,
      stateRevision: approved.next.stateRevision,
      expectedAction: "freeze_spec"
    });
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const frozenPlan = frozen.state.featureSprintPlans[0]!;
    expect(frozenPlan.clarifiedSpec?.status).toBe("frozen");
    expect(frozenPlan.clarifiedSpec?.revision).toBe(2);
    expect(frozen.next.action).not.toBe("terminal_complete");
    expect(frozen.next.action).not.toBe("complete_sprint");
    // Map work was reset; kernel must require re-execution / re-selection.
    expect(
      ["adopt_sprint_map", "select_task", "launch_implementation", "human_hold"].includes(
        frozen.next.action
      )
    ).toBe(true);
  });

  it("clears workerOutputEvidence on material revision so packets lose superseded output", () => {
    const seed = createMockKernelSprintSeed({});
    let state = seed.state;
    for (let i = 0; i < 5; i += 1) {
      const next = getNextFeatureSprintLegalAction(state, seed.planId);
      if (!("action" in next)) {
        break;
      }
      const applied = applyFeatureSprintLegalAction(state, {
        planId: seed.planId,
        actionId: next.actionId,
        stateRevision: next.stateRevision,
        expectedAction: next.action
      });
      if (!applied.ok) {
        break;
      }
      state = applied.state;
      if (next.action === "freeze_spec") {
        break;
      }
    }
    const plan = state.featureSprintPlans[0]!;
    const withWorker = {
      ...state,
      featureSprintPlans: [
        {
          ...plan,
          steps: [
            {
              id: "step-worker",
              title: "With worker evidence",
              goal: "goal",
              status: "sent" as const,
              acceptanceCriteria: ["x"],
              frozenSpecRevision: 1,
              workerOutputEvidence: {
                source: "manual" as const,
                rawOutput: "SUPERSEDED_WORKER_OUTPUT_MARKER",
                changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
                capturedAt: "2026-07-22T12:00:00.000Z"
              },
              createdAt: "2026-07-22T12:00:00.000Z",
              updatedAt: "2026-07-22T12:00:00.000Z"
            }
          ]
        }
      ]
    };
    const before = formatWorkerOutputEvidencePacketSections(
      resolveWorkerEvidenceForStep(withWorker.featureSprintPlans[0]!.steps[0]!)
    ).join("\n");
    expect(before).toContain("SUPERSEDED_WORKER_OUTPUT_MARKER");

    const revised = requestClarifiedSpecRevision(withWorker, seed.planId, {
      type: "clarified_spec_revision",
      baseRevision: 1,
      patch: { acceptanceCriteria: ["New AC after worker evidence"] }
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) {
      return;
    }
    const step = revised.state.featureSprintPlans[0]!.steps[0]!;
    expect(step.workerOutputEvidence).toBeUndefined();
    const after = formatWorkerOutputEvidencePacketSections(
      resolveWorkerEvidenceForStep(step)
    ).join("\n");
    expect(after).not.toContain("SUPERSEDED_WORKER_OUTPUT_MARKER");
  });

  it("rejects historical appliedActionIds that are not the latest entry", () => {
    const seed = createMockKernelSprintSeed({});
    const next = getNextFeatureSprintLegalAction(seed.state, seed.planId);
    expect("actionId" in next).toBe(true);
    if (!("actionId" in next)) {
      return;
    }
    const first = applyFeatureSprintLegalAction(seed.state, {
      planId: seed.planId,
      actionId: next.actionId,
      stateRevision: next.stateRevision,
      expectedAction: next.action
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const secondNext = getNextFeatureSprintLegalAction(first.state, seed.planId);
    expect("actionId" in secondNext).toBe(true);
    if (!("actionId" in secondNext)) {
      return;
    }
    const second = applyFeatureSprintLegalAction(first.state, {
      planId: seed.planId,
      actionId: secondNext.actionId,
      stateRevision: secondNext.stateRevision,
      expectedAction: secondNext.action
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    const ids = second.state.featureSprintPlans[0]!.appliedActionIds ?? [];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const olderId = ids[0]!;
    const latestId = ids[ids.length - 1]!;
    expect(olderId).not.toBe(latestId);

    const historical = applyFeatureSprintLegalAction(second.state, {
      planId: seed.planId,
      actionId: olderId,
      stateRevision: second.stateRevision,
      expectedAction: next.action
    });
    expect(historical.ok).toBe(false);
    if (!historical.ok) {
      expect(historical.error).toBe("stale_action");
      expect(historical.holdReason).toBe("stale_action");
    }

    const latestReplay = applyFeatureSprintLegalAction(second.state, {
      planId: seed.planId,
      actionId: latestId,
      stateRevision: second.stateRevision,
      expectedAction: secondNext.action
    });
    expect(latestReplay.ok).toBe(true);
    if (latestReplay.ok) {
      expect(latestReplay.idempotent).toBe(true);
      expect(latestReplay.stateRevision).toBe(second.stateRevision);
    }
  });
});
