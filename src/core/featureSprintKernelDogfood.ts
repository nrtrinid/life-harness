/**
 * Deterministic mock headless Feature Sprint orchestrator.
 * Follows kernel next-legal-action envelopes; contains minimal policy of its own.
 *
 * Persistence note: Feature Sprint state lives in app LifeHarnessData (Expo/web localStorage).
 * services/feature-sprint-runner cannot safely host GET /next-legal-action without an explicit
 * state export API. This harness is core-only.
 */
import {
  applyFeatureSprintLegalAction,
  approveRiskyTaskForPlan,
  upsertDraftClarifiedSpec,
  type FeatureSprintLegalArtifact,
  type ImplementationProofArtifact,
  type ReviewVerdictArtifact
} from "./featureSprintApplyLegalAction";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import { resolvePlanStateRevision } from "./featureSprintTaskContract";
import type { HarnessFeatureSprintNextLegalAction } from "./featureSprintTaskContract";
import type {
  HarnessFeatureSprintLegalAction,
  HarnessFeatureSprintPlan
} from "./types";
import type { LifeHarnessData } from "./lifeHarnessData";
import { createSeedState } from "../data/createSeedState";
import { updateFeatureSprintStep } from "./featureSprintOrchestrator";
import { findTaskInFeatureSprintMap } from "./featureSprintMap";

export type MockKernelWorkerScript = {
  /** When launch_implementation is seen, provide this proof on the following save action. */
  implementationProof?: Omit<ImplementationProofArtifact, "type" | "planId" | "taskId"> & {
    taskId?: string;
  };
  /** Optional second proof for correction cycles. */
  correctionProof?: Omit<ImplementationProofArtifact, "type" | "planId" | "taskId"> & {
    taskId?: string;
  };
  reviewVerdictText?: string;
  correctionReviewVerdictText?: string;
  clarificationAnswers?: Array<{ questionId: string; answer: string }>;
  approveRiskyTaskIds?: string[];
};

export type MockKernelLoopResult = {
  ok: boolean;
  state: LifeHarnessData;
  planId: string;
  steps: Array<{ action: HarnessFeatureSprintLegalAction; actionId: string }>;
  terminalAction?: HarnessFeatureSprintLegalAction;
  stopReason?: string;
  next?: HarnessFeatureSprintNextLegalAction;
};

function findPlan(data: LifeHarnessData, planId: string): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((plan) => plan.id === planId);
}

function reviewFence(status: "accepted" | "needs_changes" | "blocked", verdict: string): string {
  return [
    "```feature-review-verdict",
    JSON.stringify({ status, verdict, followUps: [] }, null, 2),
    "```"
  ].join("\n");
}

export function createMockKernelSprintSeed(input: {
  now?: string;
  withOpenClarification?: boolean;
  riskTier?: "tiny" | "standard" | "risky";
  allowedPaths?: string[];
  verificationCommand?: string;
  maxCorrectionAttempts?: number;
}): { state: LifeHarnessData; planId: string; cardId: string; taskId: string } {
  const now = new Date(input.now ?? "2026-07-22T12:00:00.000Z");
  const base = createSeedState(now.toISOString());
  const cardId = "card-kernel-mock";
  const planId = "plan-kernel-mock";
  const taskId = "task-kernel-1";
  const stepId = "step-kernel-1";

  const plan: HarnessFeatureSprintPlan = {
    id: planId,
    cardId,
    title: "Kernel mock sprint",
    goal: "Prove next-legal-action kernel",
    status: "planning",
    acceptanceCriteria: ["Kernel completes mock sprint"],
    nonGoals: ["Real provider launches"],
    constraints: ["Core-only"],
    steps: [],
    stateRevision: 0,
    autonomyPolicy: {
      mode: "manual",
      autoSaveValidProof: false,
      autoImportValidVerdict: false,
      autoAdvanceAcceptedTinyTasks: false,
      requireHumanForRiskyTasks: true,
      requireHumanForSpecFreeze: false,
      requireHumanForFinalCompletion: false,
      maxCorrectionAttempts: input.maxCorrectionAttempts ?? 2
    },
    sprintMap: {
      sprints: [
        {
          id: "sprint-1",
          title: "Sprint 1",
          objective: "Kernel foundations",
          stories: [
            {
              id: "story-1",
              title: "Next action kernel",
              outcome: "Deterministic control plane",
              tasks: [
                {
                  id: taskId,
                  title: "Implement kernel slice",
                  objective: "Ship clarified-spec + next-action kernel",
                  status: "ready",
                  acceptanceCriteria: [{ id: "ac1", text: "Mock sprint completes" }],
                  dependencies: [],
                  scope: {
                    allowedPaths: input.allowedPaths ?? ["src/core/**"],
                    forbiddenPaths: ["services/anthropic-compat-gateway/**"]
                  },
                  verificationRequirements: [
                    {
                      id: "v1",
                      description: "Typecheck",
                      command: input.verificationCommand ?? "npx tsc --noEmit"
                    }
                  ],
                  riskTier: input.riskTier ?? "standard",
                  linkedStepId: stepId,
                  maxCorrectionAttempts: input.maxCorrectionAttempts ?? 2
                }
              ]
            }
          ]
        }
      ]
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  const state: LifeHarnessData = {
    ...base,
    cards: [
      {
        id: cardId,
        title: "Kernel mock card",
        area: "build",
        state: "active",
        progress: 10,
        warmth: "warm",
        whyItMatters: "Control plane",
        nextTinyAction: "Run mock kernel loop",
        doneForNow: "Seeded",
        doLane: "Kernel",
        improveLane: "Later",
        recentWins: [],
        openLoops: [],
        optimizationIdeas: [],
        proofItemIds: []
      }
    ],
    projects: [
      {
        id: "project-kernel-1",
        cardId,
        name: "life-harness",
        repoPath: "C:/Users/me/Projects/life-harness",
        branch: "main",
        docs: [],
        likelyFiles: ["src/core/featureSprintNextLegalAction.ts"],
        verificationCommands: [input.verificationCommand ?? "npx tsc --noEmit"],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ],
    featureSprintPlans: [plan]
  };

  const draft = upsertDraftClarifiedSpec(
    state,
    planId,
    {
      type: "clarified_spec_draft",
      objective: "Establish Feature Sprint next-legal-action kernel",
      userIntent: "Drive Feature Sprint without bypassing gates",
      assumptions: ["Mock workers only"],
      constraints: ["No real providers"],
      nonGoals: ["Autopilot launch"],
      acceptanceCriteria: ["Happy-path mock completes", "Failure scenarios hold"],
      clarificationQuestions: input.withOpenClarification
        ? [
            {
              id: "q1",
              question: "Confirm allowed scope is src/core only?",
              status: "open",
              required: true
            }
          ]
        : [],
      sideEffectFlags: []
    },
    now
  );
  if (!draft.ok) {
    throw new Error(draft.error);
  }

  return { state: draft.state, planId, cardId, taskId };
}

function artifactForAction(
  action: HarnessFeatureSprintNextLegalAction,
  script: MockKernelWorkerScript,
  plan: HarnessFeatureSprintPlan,
  correctionPass: number
): FeatureSprintLegalArtifact {
  switch (action.action) {
    case "request_clarification":
      return {
        type: "clarification_answers",
        specRevision: plan.clarifiedSpec?.revision ?? 1,
        answers: script.clarificationAnswers ?? [{ questionId: "q1", answer: "Yes, src/core only." }]
      };
    case "save_implementation_proof":
    case "save_correction_proof": {
      const proof =
        correctionPass > 0 && script.correctionProof
          ? script.correctionProof
          : script.implementationProof;
      if (!proof) {
        return { type: "none" };
      }
      return {
        type: "implementation_proof",
        planId: plan.id,
        taskId: proof.taskId ?? action.executionContext?.taskId ?? "task-kernel-1",
        frozenSpecRevision: proof.frozenSpecRevision,
        changedFiles: proof.changedFiles,
        rawOutput: proof.rawOutput,
        verificationResult: proof.verificationResult,
        testsRun: proof.testsRun,
        knownRisks: proof.knownRisks
      };
    }
    case "import_review_verdict": {
      const text =
        correctionPass > 0 && script.correctionReviewVerdictText
          ? script.correctionReviewVerdictText
          : script.reviewVerdictText ?? reviewFence("accepted", "Looks good.");
      return {
        type: "review_verdict",
        planId: plan.id,
        taskId: action.executionContext?.taskId ?? "task-kernel-1",
        frozenSpecRevision: plan.clarifiedSpec?.revision ?? 1,
        text
      };
    }
    default:
      return { type: "none" };
  }
}

/**
 * Run get→apply loop until terminal_complete, human_hold, or maxSteps.
 */
export function runMockFeatureSprintKernelLoop(input: {
  state: LifeHarnessData;
  planId: string;
  script: MockKernelWorkerScript;
  maxSteps?: number;
  now?: Date;
}): MockKernelLoopResult {
  let state = input.state;
  let now = input.now ?? new Date("2026-07-22T12:00:00.000Z");
  const steps: MockKernelLoopResult["steps"] = [];
  let correctionPass = 0;
  const maxSteps = input.maxSteps ?? 40;

  for (let i = 0; i < maxSteps; i += 1) {
    const next = getNextFeatureSprintLegalAction(state, input.planId, now);
    if ("ok" in next && next.ok === false) {
      return { ok: false, state, planId: input.planId, steps, stopReason: next.error };
    }
    const action = next as HarnessFeatureSprintNextLegalAction;
    steps.push({ action: action.action, actionId: action.actionId });

    if (action.action === "terminal_complete") {
      return { ok: true, state, planId: input.planId, steps, terminalAction: action.action, next: action };
    }

    if (action.action === "human_hold") {
      // Allow scripted risky approval then continue.
      if (
        action.holdReason === "risky_task_approval_required" &&
        action.executionContext?.taskId &&
        (input.script.approveRiskyTaskIds ?? []).includes(action.executionContext.taskId)
      ) {
        const approved = approveRiskyTaskForPlan(state, input.planId, action.executionContext.taskId, now);
        if (!approved.ok) {
          return {
            ok: false,
            state,
            planId: input.planId,
            steps,
            stopReason: approved.error,
            next: action
          };
        }
        state = approved.state;
        now = new Date(now.getTime() + 1000);
        continue;
      }
      return {
        ok: true,
        state,
        planId: input.planId,
        steps,
        terminalAction: action.action,
        stopReason: action.holdReason ?? action.reason,
        next: action
      };
    }

    if (action.action === "launch_correction") {
      correctionPass += 1;
    }

    const plan = findPlan(state, input.planId)!;
    const artifact = artifactForAction(action, input.script, plan, correctionPass);
    const applied = applyFeatureSprintLegalAction(
      state,
      {
        planId: input.planId,
        actionId: action.actionId,
        stateRevision: action.stateRevision,
        expectedAction: action.action,
        artifact
      },
      now
    );
    if (!applied.ok) {
      return {
        ok: false,
        state: applied.state ?? state,
        planId: input.planId,
        steps,
        stopReason: applied.error,
        next: applied.next ?? action
      };
    }
    state = applied.state;

    // Simulate worker returning artifacts after a launch (orchestrator follows kernel; workers are mock).
    if (
      action.action === "launch_implementation" ||
      action.action === "launch_correction"
    ) {
      const proof =
        action.action === "launch_correction" && input.script.correctionProof
          ? input.script.correctionProof
          : input.script.implementationProof;
      const planAfter = findPlan(state, input.planId);
      const taskId = action.executionContext?.taskId;
      const found =
        planAfter?.sprintMap && taskId
          ? findTaskInFeatureSprintMap(planAfter.sprintMap, taskId)
          : undefined;
      const stepId = found?.task.linkedStepId;
      if (proof && planAfter && stepId) {
        const injected = updateFeatureSprintStep(
          state,
          input.planId,
          stepId,
          {
            outputSummary: proof.rawOutput,
            status: "sent",
            frozenSpecRevision: proof.frozenSpecRevision
          },
          now
        );
        if (injected.ok && injected.state) {
          // Bump revision so subsequent actions remain coherent with persisted state.
          const bumped = findPlan(injected.state, input.planId)!;
          state = {
            ...injected.state,
            featureSprintPlans: injected.state.featureSprintPlans.map((item) =>
              item.id === input.planId
                ? {
                    ...bumped,
                    stateRevision: resolvePlanStateRevision(bumped) + 1,
                    updatedAt: new Date(now.getTime() + 1).toISOString()
                  }
                : item
            )
          };
        }
      }
    }

    if (action.action === "launch_review") {
      const text =
        correctionPass > 0 && input.script.correctionReviewVerdictText
          ? input.script.correctionReviewVerdictText
          : input.script.reviewVerdictText;
      const planAfter = findPlan(state, input.planId);
      const taskId = action.executionContext?.taskId;
      const found =
        planAfter?.sprintMap && taskId
          ? findTaskInFeatureSprintMap(planAfter.sprintMap, taskId)
          : undefined;
      const stepId = found?.task.linkedStepId;
      if (text && stepId) {
        const injected = updateFeatureSprintStep(
          state,
          input.planId,
          stepId,
          {
            reviewVerdict: text
          },
          now
        );
        if (injected.ok && injected.state) {
          const bumped = findPlan(injected.state, input.planId)!;
          // Keep reviewStatus cleared so kernel asks for import.
          state = {
            ...injected.state,
            featureSprintPlans: injected.state.featureSprintPlans.map((item) => {
              if (item.id !== input.planId) {
                return item;
              }
              return {
                ...bumped,
                steps: bumped.steps.map((step) =>
                  step.id === stepId
                    ? { ...step, reviewStatus: undefined, reviewVerdict: text }
                    : step
                ),
                stateRevision: resolvePlanStateRevision(bumped) + 1,
                updatedAt: new Date(now.getTime() + 1).toISOString()
              };
            })
          };
        }
      }
    }

    now = new Date(now.getTime() + 1000);
  }

  return {
    ok: false,
    state,
    planId: input.planId,
    steps,
    stopReason: "max_steps_exceeded",
    next: undefined
  };
}

export function defaultHappyPathScript(frozenSpecRevision = 1): MockKernelWorkerScript {
  return {
    implementationProof: {
      frozenSpecRevision,
      changedFiles: ["src/core/featureSprintNextLegalAction.ts"],
      rawOutput: "Implemented next legal action kernel.",
      verificationResult: "pass",
      testsRun: ["featureSprintNextLegalAction.test.ts"]
    },
    reviewVerdictText: reviewFence("accepted", "Accepted kernel slice.")
  };
}

export { reviewFence, resolvePlanStateRevision };
