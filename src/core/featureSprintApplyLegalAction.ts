import {
  createDraftClarifiedSpec,
  classifyClarifiedSpecMaterialChange,
  listOpenRequiredClarifications,
  normalizeClarifiedSpec,
  canApproveClarifiedSpec,
  canFreezeClarifiedSpec
} from "./featureSprintClarifiedSpec";
import { resolveFeatureSprintAutonomyPolicy } from "./featureSprintAutonomyPolicy";
import {
  findTaskInFeatureSprintMap,
  isSprintMapAuthoritative,
  listFeatureSprintMapTasks
} from "./featureSprintMap";
import {
  allAuthoritativeMapTasksDone,
  evaluateKernelTaskExecutability,
  getNextFeatureSprintLegalAction
} from "./featureSprintNextLegalAction";
import {
  buildFeatureSprintTaskContract,
  resolvePlanStateRevision,
  validateProofAgainstTaskContract,
  type HarnessFeatureSprintNextLegalAction
} from "./featureSprintTaskContract";
import {
  adoptSprintMapExecutionForPlan,
  completeFeatureSprintPlan,
  importFeatureReviewVerdictFromText,
  normalizeImplementationProofForStep,
  updateFeatureSprintPlan,
  updateFeatureSprintStep
} from "./featureSprintOrchestrator";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintActionAuditEntry,
  HarnessFeatureSprintClarifiedSpec,
  HarnessFeatureSprintHumanHoldReason,
  HarnessFeatureSprintLegalAction,
  HarnessFeatureSprintMap,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintStepImplementationProof,
  HarnessFeatureSprintTask,
  HarnessFeatureSprintVerificationProofResult
} from "./types";

const MAX_APPLIED_ACTION_IDS = 64;
const MAX_AUDIT_LOG = 40;
const MAX_SPEC_HISTORY = 12;

export type ClarificationAnswersArtifact = {
  type: "clarification_answers";
  specRevision: number;
  answers: Array<{ questionId: string; answer: string }>;
};

export type ImplementationProofArtifact = {
  type: "implementation_proof";
  planId: string;
  taskId: string;
  stepId?: string;
  frozenSpecRevision: number;
  changedFiles: string[];
  rawOutput: string;
  verificationResult: HarnessFeatureSprintVerificationProofResult;
  testsRun?: string[];
  knownRisks?: string[];
};

export type ReviewVerdictArtifact = {
  type: "review_verdict";
  planId: string;
  taskId: string;
  stepId?: string;
  frozenSpecRevision: number;
  /** Full text containing a feature-review-verdict fence. */
  text: string;
};

export type SpecDraftArtifact = {
  type: "clarified_spec_draft";
  objective: string;
  userIntent: string;
  assumptions?: string[];
  constraints?: string[];
  nonGoals?: string[];
  acceptanceCriteria: string[];
  clarificationQuestions?: HarnessFeatureSprintClarifiedSpec["clarificationQuestions"];
  riskNotes?: string[];
  sideEffectFlags?: string[];
};

export type SpecRevisionArtifact = {
  type: "clarified_spec_revision";
  baseRevision: number;
  patch: {
    objective?: string;
    userIntent?: string;
    assumptions?: string[];
    constraints?: string[];
    nonGoals?: string[];
    acceptanceCriteria?: string[];
    riskNotes?: string[];
    sideEffectFlags?: string[];
  };
};

export type RiskApprovalArtifact = {
  type: "risky_task_approval";
  taskId: string;
};

export type FeatureSprintLegalArtifact =
  | ClarificationAnswersArtifact
  | ImplementationProofArtifact
  | ReviewVerdictArtifact
  | SpecDraftArtifact
  | SpecRevisionArtifact
  | RiskApprovalArtifact
  | { type: "none" };

export type ApplyFeatureSprintLegalActionInput = {
  planId: string;
  actionId: string;
  stateRevision: number;
  expectedAction?: HarnessFeatureSprintLegalAction;
  artifact?: FeatureSprintLegalArtifact;
};

export type ApplyFeatureSprintLegalActionResult =
  | {
      ok: true;
      state: LifeHarnessData;
      stateRevision: number;
      next: HarnessFeatureSprintNextLegalAction;
      audit: HarnessFeatureSprintActionAuditEntry;
      idempotent?: boolean;
    }
  | {
      ok: false;
      error: string;
      holdReason?: HarnessFeatureSprintHumanHoldReason;
      state?: LifeHarnessData;
      next?: HarnessFeatureSprintNextLegalAction;
      audit?: HarnessFeatureSprintActionAuditEntry;
    };

function findPlan(data: LifeHarnessData, planId: string): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((plan) => plan.id === planId);
}

function bumpRevision(plan: HarnessFeatureSprintPlan): number {
  return resolvePlanStateRevision(plan) + 1;
}

function rememberAction(
  plan: HarnessFeatureSprintPlan,
  actionId: string,
  audit: HarnessFeatureSprintActionAuditEntry
): Pick<HarnessFeatureSprintPlan, "appliedActionIds" | "actionAuditLog"> {
  const appliedActionIds = [...(plan.appliedActionIds ?? []).filter((id) => id !== actionId), actionId].slice(
    -MAX_APPLIED_ACTION_IDS
  );
  const actionAuditLog = [...(plan.actionAuditLog ?? []), audit].slice(-MAX_AUDIT_LOG);
  return { appliedActionIds, actionAuditLog };
}

function replacePlan(data: LifeHarnessData, plan: HarnessFeatureSprintPlan): LifeHarnessData {
  return {
    ...data,
    featureSprintPlans: data.featureSprintPlans.map((item) => (item.id === plan.id ? plan : item))
  };
}

function mapUpdateTask(
  map: HarnessFeatureSprintMap,
  taskId: string,
  patch: Partial<HarnessFeatureSprintTask>
): HarnessFeatureSprintMap {
  return {
    sprints: map.sprints.map((sprint) => ({
      ...sprint,
      stories: sprint.stories.map((story) => ({
        ...story,
        tasks: story.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
      }))
    }))
  };
}

function ensureLinkedStep(
  plan: HarnessFeatureSprintPlan,
  task: HarnessFeatureSprintTask,
  now: string
): { plan: HarnessFeatureSprintPlan; stepId: string } {
  if (task.linkedStepId && plan.steps.some((step) => step.id === task.linkedStepId)) {
    return { plan, stepId: task.linkedStepId };
  }
  const stepId = task.linkedStepId?.trim() || `step-${task.id}`;
  if (plan.steps.some((step) => step.id === stepId)) {
    const sprintMap = plan.sprintMap
      ? mapUpdateTask(plan.sprintMap, task.id, { linkedStepId: stepId })
      : plan.sprintMap;
    return { plan: { ...plan, sprintMap }, stepId };
  }
  const step = {
    id: stepId,
    title: task.title,
    goal: task.objective,
    status: "ready" as const,
    acceptanceCriteria: task.acceptanceCriteria.map((item) => item.text),
    frozenSpecRevision: task.frozenSpecRevision,
    createdAt: now,
    updatedAt: now
  };
  const sprintMap = plan.sprintMap
    ? mapUpdateTask(plan.sprintMap, task.id, { linkedStepId: stepId, status: "in_progress" })
    : plan.sprintMap;
  return {
    plan: {
      ...plan,
      steps: [...plan.steps, step],
      currentStepId: stepId,
      sprintMap,
      status: plan.status === "planning" ? "in_progress" : plan.status
    },
    stepId
  };
}

function buildAudit(input: {
  actionId: string;
  action: HarnessFeatureSprintLegalAction | string;
  before: number;
  after?: number;
  result: HarnessFeatureSprintActionAuditEntry["result"];
  reason: string;
  plan: HarnessFeatureSprintPlan;
  holdReason?: HarnessFeatureSprintHumanHoldReason;
  now: string;
}): HarnessFeatureSprintActionAuditEntry {
  return {
    actionId: input.actionId,
    action: input.action,
    stateRevisionBefore: input.before,
    stateRevisionAfter: input.after,
    result: input.result,
    reason: input.reason,
    executionContext: input.plan.executionTarget
      ? {
          executionModel: isSprintMapAuthoritative(input.plan) ? "sprint_map" : "legacy_steps",
          sprintId: input.plan.executionTarget.sprintId,
          storyId: input.plan.executionTarget.storyId,
          taskId: input.plan.executionTarget.taskId,
          phase: input.plan.executionTarget.phase,
          frozenSpecRevision: input.plan.clarifiedSpec?.revision
        }
      : {
          executionModel: isSprintMapAuthoritative(input.plan) ? "sprint_map" : "legacy_steps",
          frozenSpecRevision: input.plan.clarifiedSpec?.revision
        },
    specRevision: input.plan.clarifiedSpec?.revision,
    holdReason: input.holdReason,
    createdAt: input.now
  };
}

function nextAfter(
  state: LifeHarnessData,
  planId: string,
  now: Date
): HarnessFeatureSprintNextLegalAction {
  const next = getNextFeatureSprintLegalAction(state, planId, now);
  if ("ok" in next && next.ok === false) {
    throw new Error(next.error);
  }
  return next as HarnessFeatureSprintNextLegalAction;
}

/**
 * Typed action-application boundary.
 * Recalculates legality, rejects stale/wrong actions, applies artifacts idempotently.
 * Does not launch real providers.
 */
export function applyFeatureSprintLegalAction(
  data: LifeHarnessData,
  input: ApplyFeatureSprintLegalActionInput,
  now: Date = new Date()
): ApplyFeatureSprintLegalActionResult {
  const plan = findPlan(data, input.planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${input.planId}` };
  }

  const currentRevision = resolvePlanStateRevision(plan);
  const timestamp = now.toISOString();

  if (input.stateRevision !== currentRevision) {
    const audit = buildAudit({
      actionId: input.actionId,
      action: input.expectedAction ?? "human_hold",
      before: currentRevision,
      result: "rejected",
      reason: "stale_action",
      plan,
      holdReason: "stale_action",
      now: timestamp
    });
    return {
      ok: false,
      error: "stale_action",
      holdReason: "stale_action",
      state: data,
      audit
    };
  }

  const appliedIds = plan.appliedActionIds ?? [];
  if (appliedIds.includes(input.actionId)) {
    // Narrow idempotency: only the most recent applied actionId may short-circuit.
    // Historical IDs still present in the ring buffer must not false-succeed.
    const lastApplied = appliedIds[appliedIds.length - 1];
    if (input.actionId !== lastApplied) {
      return {
        ok: false,
        error: "stale_action",
        holdReason: "stale_action",
        state: data,
        audit: buildAudit({
          actionId: input.actionId,
          action: input.expectedAction ?? "human_hold",
          before: currentRevision,
          result: "rejected",
          reason: "Historical actionId is not the latest applied action.",
          plan,
          holdReason: "stale_action",
          now: timestamp
        })
      };
    }
    const next = nextAfter(data, plan.id, now);
    const audit = buildAudit({
      actionId: input.actionId,
      action: next.action,
      before: currentRevision,
      after: currentRevision,
      result: "applied",
      reason: "Idempotent replay — latest action already applied.",
      plan,
      now: timestamp
    });
    return {
      ok: true,
      state: data,
      stateRevision: currentRevision,
      next,
      audit,
      idempotent: true
    };
  }

  const legal = getNextFeatureSprintLegalAction(data, plan.id, now);
  if ("ok" in legal && legal.ok === false) {
    return { ok: false, error: legal.error };
  }
  const expected = legal as HarnessFeatureSprintNextLegalAction;

  if (expected.actionId !== input.actionId) {
    return {
      ok: false,
      error: `Action id mismatch. Expected ${expected.actionId}.`,
      next: expected,
      holdReason: expected.holdReason
    };
  }

  if (input.expectedAction && input.expectedAction !== expected.action) {
    return {
      ok: false,
      error: `Wrong action kind. Kernel requires ${expected.action}.`,
      next: expected
    };
  }

  const artifact = input.artifact ?? { type: "none" };

  try {
    switch (expected.action) {
      case "request_clarification": {
        if (artifact.type !== "clarification_answers") {
          return { ok: false, error: "clarification_answers artifact required.", next: expected };
        }
        if (!plan.clarifiedSpec || artifact.specRevision !== plan.clarifiedSpec.revision) {
          return { ok: false, error: "Clarification artifact revision mismatch.", next: expected };
        }
        const questions = plan.clarifiedSpec.clarificationQuestions.map((question) => {
          const answer = artifact.answers.find((item) => item.questionId === question.id);
          if (!answer) {
            return question;
          }
          return {
            ...question,
            status: "answered" as const,
            answer: answer.answer.trim()
          };
        });
        const open = listOpenRequiredClarifications({
          ...plan.clarifiedSpec,
          clarificationQuestions: questions
        });
        const clarifiedSpec: HarnessFeatureSprintClarifiedSpec = {
          ...plan.clarifiedSpec,
          clarificationQuestions: questions,
          status: open.length > 0 ? "clarifying" : "draft",
          updatedAt: timestamp
        };
        const stateRevision = bumpRevision(plan);
        const updated: HarnessFeatureSprintPlan = {
          ...plan,
          clarifiedSpec,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Applied clarification answers.",
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        const state = replacePlan(data, updated);
        return {
          ok: true,
          state,
          stateRevision,
          next: nextAfter(state, plan.id, now),
          audit
        };
      }

      case "approve_spec": {
        if (!plan.clarifiedSpec) {
          return { ok: false, error: "No clarified spec to approve.", next: expected };
        }
        const gate = canApproveClarifiedSpec(plan.clarifiedSpec);
        if (!gate.ok) {
          return { ok: false, error: gate.unmetPreconditions.join(" "), next: expected };
        }
        const stateRevision = bumpRevision(plan);
        const updated: HarnessFeatureSprintPlan = {
          ...plan,
          clarifiedSpec: {
            ...plan.clarifiedSpec,
            status: "approved",
            approvedAt: timestamp,
            updatedAt: timestamp
          },
          stateRevision,
          updatedAt: timestamp,
          automationPhase: "spec_approved"
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Approved clarified spec.",
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        const state = replacePlan(data, updated);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "freeze_spec": {
        if (!plan.clarifiedSpec) {
          return { ok: false, error: "No clarified spec to freeze.", next: expected };
        }
        const gate = canFreezeClarifiedSpec(plan.clarifiedSpec);
        if (!gate.ok) {
          return { ok: false, error: gate.unmetPreconditions.join(" "), next: expected };
        }
        const policy = resolveFeatureSprintAutonomyPolicy(plan);
        if (policy.requireHumanForSpecFreeze && artifact.type !== "none") {
          // Freeze itself is the human-authorized action when requiresHuman was true on the envelope.
        }
        const stateRevision = bumpRevision(plan);
        const frozen: HarnessFeatureSprintClarifiedSpec = {
          ...plan.clarifiedSpec,
          status: "frozen",
          frozenAt: timestamp,
          updatedAt: timestamp
        };
        let sprintMap = plan.sprintMap;
        if (sprintMap) {
          for (const row of listFeatureSprintMapTasks(sprintMap)) {
            sprintMap = mapUpdateTask(sprintMap, row.task.id, {
              frozenSpecRevision: frozen.revision
            });
          }
        }
        const updated: HarnessFeatureSprintPlan = {
          ...plan,
          clarifiedSpec: frozen,
          sprintMap,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Froze clarified spec.",
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        const state = replacePlan(data, updated);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "adopt_sprint_map": {
        const adopted = adoptSprintMapExecutionForPlan(data, plan.id, now);
        if (!adopted.ok) {
          return { ok: false, error: adopted.error ?? "Adopt failed.", next: expected };
        }
        let nextPlan = findPlan(adopted.state, plan.id)!;
        const stateRevision = bumpRevision(plan);
        nextPlan = {
          ...nextPlan,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Adopted Sprint Map authority.",
          plan: nextPlan,
          now: timestamp
        });
        Object.assign(nextPlan, rememberAction(nextPlan, input.actionId, audit));
        const state = replacePlan(adopted.state, nextPlan);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "select_task": {
        const taskId = expected.executionContext?.taskId;
        if (!taskId || !plan.sprintMap) {
          return { ok: false, error: "No task available to select.", next: expected };
        }
        const found = findTaskInFeatureSprintMap(plan.sprintMap, taskId);
        if (!found) {
          return { ok: false, error: `Task not found: ${taskId}`, next: expected };
        }
        const selectGate = evaluateKernelTaskExecutability(plan.sprintMap, found.task);
        if (!selectGate.ok) {
          return {
            ok: false,
            error: selectGate.reason,
            holdReason: selectGate.holdReason,
            next: expected
          };
        }
        let working = plan;
        const linked = ensureLinkedStep(working, found.task, timestamp);
        working = linked.plan;
        const stateRevision = bumpRevision(plan);
        const updated: HarnessFeatureSprintPlan = {
          ...working,
          executionTarget: {
            sprintId: found.sprint.id,
            storyId: found.story.id,
            taskId: found.task.id,
            phase: "implement"
          },
          sprintMap: working.sprintMap
            ? mapUpdateTask(working.sprintMap, found.task.id, {
                status: found.task.status === "planned" ? "ready" : found.task.status,
                frozenSpecRevision: plan.clarifiedSpec?.revision
              })
            : working.sprintMap,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: `Selected task ${taskId}.`,
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        const state = replacePlan(data, updated);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "launch_implementation":
      case "launch_localization":
      case "launch_correction":
      case "launch_review": {
        // Kernel records intent only — real provider launch stays manual / orchestrator-owned.
        const stateRevision = bumpRevision(plan);
        let working = plan;
        const taskId = expected.executionContext?.taskId;
        if (taskId && working.sprintMap) {
          const found = findTaskInFeatureSprintMap(working.sprintMap, taskId);
          if (found) {
            const launchGate = evaluateKernelTaskExecutability(working.sprintMap, found.task);
            if (!launchGate.ok) {
              return {
                ok: false,
                error: launchGate.reason,
                holdReason: launchGate.holdReason,
                next: expected
              };
            }
            const linked = ensureLinkedStep(working, found.task, timestamp);
            working = linked.plan;
            if (expected.action === "launch_correction") {
              const attempt = (found.task.correctionAttempt ?? 0) + 1;
              working = {
                ...working,
                automationPhase: "implementing",
                sprintMap: mapUpdateTask(working.sprintMap!, taskId, {
                  correctionAttempt: attempt,
                  status: "in_progress"
                }),
                steps: working.steps.map((step) =>
                  step.id === linked.stepId
                    ? {
                        ...step,
                        correctionAttempt: attempt,
                        reviewStatus: undefined,
                        reviewVerdict: undefined,
                        implementationProof: undefined,
                        outputSummary: undefined,
                        status: "ready" as const,
                        updatedAt: timestamp
                      }
                    : step
                )
              };
            } else if (expected.action === "launch_implementation") {
              working = {
                ...working,
                sprintMap: mapUpdateTask(working.sprintMap!, taskId, { status: "in_progress" }),
                automationPhase: "implementing"
              };
            } else if (expected.action === "launch_review") {
              working = {
                ...working,
                executionTarget: working.executionTarget
                  ? { ...working.executionTarget, phase: "review" }
                  : working.executionTarget,
                automationPhase: "reviewing"
              };
            }
          }
        }
        const updated: HarnessFeatureSprintPlan = {
          ...working,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: `Recorded ${expected.action} (no real provider launch).`,
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        const state = replacePlan(data, updated);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "save_implementation_proof":
      case "save_correction_proof": {
        if (artifact.type !== "implementation_proof") {
          return { ok: false, error: "implementation_proof artifact required.", next: expected };
        }
        if (!plan.clarifiedSpec || plan.clarifiedSpec.status !== "frozen") {
          return { ok: false, error: "Frozen spec required to save proof.", next: expected };
        }
        if (artifact.frozenSpecRevision !== plan.clarifiedSpec.revision) {
          return { ok: false, error: "Proof spec revision mismatch.", next: expected };
        }
        const taskId = artifact.taskId;
        if (expected.executionContext?.taskId && taskId !== expected.executionContext.taskId) {
          return {
            ok: false,
            error: `Proof taskId ${taskId} does not match legal action task ${expected.executionContext.taskId}.`,
            next: expected
          };
        }
        if (artifact.planId !== plan.id) {
          return { ok: false, error: "Proof planId mismatch.", next: expected };
        }
        const found = plan.sprintMap
          ? findTaskInFeatureSprintMap(plan.sprintMap, taskId)
          : undefined;
        if (!found) {
          return { ok: false, error: `Task not found: ${taskId}`, next: expected };
        }
        const contract = buildFeatureSprintTaskContract({
          task: found.task,
          frozenSpec: plan.clarifiedSpec
        });
        if (!contract.ok || !contract.contract) {
          return {
            ok: false,
            error: contract.unmetPreconditions.join(" "),
            holdReason: "missing_evidence",
            next: expected
          };
        }
        const proofCheck = validateProofAgainstTaskContract({
          changedFiles: artifact.changedFiles,
          contract: contract.contract,
          verificationResult: artifact.verificationResult,
          frozenSpecRevision: artifact.frozenSpecRevision
        });
        if (!proofCheck.ok) {
          return {
            ok: false,
            error: proofCheck.unmetPreconditions.join(" "),
            holdReason: proofCheck.holdReason,
            next: expected
          };
        }

        let working = plan;
        const linked = ensureLinkedStep(working, found.task, timestamp);
        working = linked.plan;
        const proof: HarnessFeatureSprintStepImplementationProof = {
          rawOutput: artifact.rawOutput,
          filesChanged: artifact.changedFiles,
          behaviorChanged: [],
          testsRun: artifact.testsRun ?? [],
          testsNotRun: [],
          verificationResult: artifact.verificationResult,
          knownRisks: artifact.knownRisks ?? [],
          suggestedReviewFocus: [],
          frozenSpecRevision: artifact.frozenSpecRevision,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        let state: LifeHarnessData = replacePlan(data, working);
        const stepSaved = updateFeatureSprintStep(
          state,
          plan.id,
          linked.stepId,
          {
            outputSummary: artifact.rawOutput,
            status: "sent",
            frozenSpecRevision: artifact.frozenSpecRevision,
            implementationProof: null
          },
          now
        );
        if (!stepSaved.ok) {
          return { ok: false, error: stepSaved.error ?? "Failed to save step output.", next: expected };
        }
        state = stepSaved.state;
        // Attach proof directly (normalize path requires existing outputSummary which we just set).
        const afterSave = findPlan(state, plan.id)!;
        const withProofSteps = afterSave.steps.map((step) =>
          step.id === linked.stepId
            ? {
                ...step,
                implementationProof: proof,
                frozenSpecRevision: artifact.frozenSpecRevision,
                updatedAt: timestamp
              }
            : step
        );
        const stateRevision = bumpRevision(plan);
        const updated: HarnessFeatureSprintPlan = {
          ...afterSave,
          steps: withProofSteps,
          stateRevision,
          updatedAt: timestamp,
          automationPhase: "proof_normalizing"
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Saved validated implementation proof.",
          plan: updated,
          now: timestamp
        });
        Object.assign(updated, rememberAction(updated, input.actionId, audit));
        state = replacePlan(state, updated);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "import_review_verdict": {
        if (artifact.type !== "review_verdict") {
          return { ok: false, error: "review_verdict artifact required.", next: expected };
        }
        if (!plan.clarifiedSpec || artifact.frozenSpecRevision !== plan.clarifiedSpec.revision) {
          return { ok: false, error: "Review verdict spec revision mismatch.", next: expected };
        }
        const taskId = artifact.taskId;
        if (expected.executionContext?.taskId && taskId !== expected.executionContext.taskId) {
          return {
            ok: false,
            error: `Verdict taskId ${taskId} does not match legal action task ${expected.executionContext.taskId}.`,
            next: expected
          };
        }
        if (artifact.planId !== plan.id) {
          return { ok: false, error: "Verdict planId mismatch.", next: expected };
        }
        const found = plan.sprintMap
          ? findTaskInFeatureSprintMap(plan.sprintMap, taskId)
          : undefined;
        if (!found) {
          return { ok: false, error: `Task not found: ${taskId}`, next: expected };
        }
        let working = plan;
        const linked = ensureLinkedStep(working, found.task, timestamp);
        working = linked.plan;
        const step = working.steps.find((item) => item.id === linked.stepId);
        if (step?.implementationProof) {
          const contract = buildFeatureSprintTaskContract({
            task: found.task,
            frozenSpec: plan.clarifiedSpec!
          });
          if (!contract.ok || !contract.contract) {
            return {
              ok: false,
              error: contract.unmetPreconditions.join(" ") || "Task contract incomplete.",
              holdReason: "missing_evidence",
              next: expected
            };
          }
          const proofCheck = validateProofAgainstTaskContract({
            changedFiles: step.implementationProof.filesChanged,
            contract: contract.contract,
            verificationResult: step.implementationProof.verificationResult,
            frozenSpecRevision: step.implementationProof.frozenSpecRevision
          });
          if (!proofCheck.ok) {
            return {
              ok: false,
              error: "Review acceptance cannot override known proof failures.",
              holdReason: proofCheck.holdReason,
              next: expected
            };
          }
        } else {
          return {
            ok: false,
            error: "Cannot import review verdict without implementation proof.",
            holdReason: "missing_evidence",
            next: expected
          };
        }

        const imported = importFeatureReviewVerdictFromText(
          replacePlan(data, working),
          plan.id,
          artifact.text,
          linked.stepId,
          now
        );
        if (!imported.ok) {
          return {
            ok: false,
            error: imported.error ?? "Review verdict import failed.",
            holdReason: "review_conflict",
            next: expected
          };
        }
        let nextPlan = findPlan(imported.state, plan.id)!;
        const stateRevision = bumpRevision(plan);
        nextPlan = {
          ...nextPlan,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Imported review verdict.",
          plan: nextPlan,
          now: timestamp
        });
        Object.assign(nextPlan, rememberAction(nextPlan, input.actionId, audit));
        const state = replacePlan(imported.state, nextPlan);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "advance_task": {
        const taskId = expected.executionContext?.taskId;
        if (!taskId || !plan.sprintMap) {
          return { ok: false, error: "No task to advance.", next: expected };
        }
        const found = findTaskInFeatureSprintMap(plan.sprintMap, taskId);
        if (!found) {
          return { ok: false, error: `Task not found: ${taskId}`, next: expected };
        }
        const step = found.task.linkedStepId
          ? plan.steps.find((item) => item.id === found.task.linkedStepId)
          : undefined;
        if (!step) {
          return { ok: false, error: "Linked step missing for advance.", next: expected };
        }
        if (step.reviewStatus !== "accepted") {
          return { ok: false, error: "Cannot advance without accepted review.", next: expected };
        }
        if (!step.implementationProof) {
          return {
            ok: false,
            error: "Cannot advance without implementation proof.",
            holdReason: "missing_evidence",
            next: expected
          };
        }
        if (step.implementationProof && plan.clarifiedSpec) {
          const contract = buildFeatureSprintTaskContract({
            task: found.task,
            frozenSpec: plan.clarifiedSpec
          });
          if (!contract.ok || !contract.contract) {
            return {
              ok: false,
              error: contract.unmetPreconditions.join(" ") || "Task contract incomplete.",
              holdReason: "missing_evidence",
              next: expected
            };
          }
          const proofCheck = validateProofAgainstTaskContract({
            changedFiles: step.implementationProof.filesChanged,
            contract: contract.contract,
            verificationResult: step.implementationProof.verificationResult,
            frozenSpecRevision: step.implementationProof.frozenSpecRevision
          });
          if (!proofCheck.ok) {
            return {
              ok: false,
              error: proofCheck.unmetPreconditions.join(" "),
              holdReason: proofCheck.holdReason,
              next: expected
            };
          }
        }

        let state: LifeHarnessData = data;
        if (step) {
          const advanced = updateFeatureSprintStep(
            state,
            plan.id,
            step.id,
            { status: "done", completedAt: timestamp },
            now
          );
          if (!advanced.ok) {
            return { ok: false, error: advanced.error ?? "Failed to complete step.", next: expected };
          }
          state = advanced.state;
        }
        let nextPlan = findPlan(state, plan.id)!;
        nextPlan = {
          ...nextPlan,
          sprintMap: mapUpdateTask(nextPlan.sprintMap!, taskId, {
            status: "done",
            gateState: "passed",
            updatedAt: timestamp
          }),
          executionTarget: undefined,
          stateRevision: bumpRevision(plan),
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: nextPlan.stateRevision!,
          result: "applied",
          reason: `Advanced task ${taskId}.`,
          plan: nextPlan,
          now: timestamp
        });
        Object.assign(nextPlan, rememberAction(nextPlan, input.actionId, audit));
        state = replacePlan(state, nextPlan);
        return {
          ok: true,
          state,
          stateRevision: nextPlan.stateRevision!,
          next: nextAfter(state, plan.id, now),
          audit
        };
      }

      case "complete_sprint": {
        if (!allAuthoritativeMapTasksDone(plan)) {
          return {
            ok: false,
            error:
              "Cannot complete sprint while unfinished authoritative Sprint Map tasks remain.",
            holdReason: "unfinished_tasks_remain",
            next: expected
          };
        }
        const completed = completeFeatureSprintPlan(
          data,
          plan.id,
          { proofText: "Kernel mock sprint completion." },
          now
        );
        if (!completed.ok) {
          return { ok: false, error: completed.error ?? "Complete failed.", next: expected };
        }
        let nextPlan = findPlan(completed.state, plan.id)!;
        const stateRevision = bumpRevision(plan);
        nextPlan = {
          ...nextPlan,
          stateRevision,
          updatedAt: timestamp
        };
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          after: stateRevision,
          result: "applied",
          reason: "Completed sprint.",
          plan: nextPlan,
          now: timestamp
        });
        Object.assign(nextPlan, rememberAction(nextPlan, input.actionId, audit));
        const state = replacePlan(completed.state, nextPlan);
        return { ok: true, state, stateRevision, next: nextAfter(state, plan.id, now), audit };
      }

      case "human_hold":
      case "terminal_complete": {
        const audit = buildAudit({
          actionId: input.actionId,
          action: expected.action,
          before: currentRevision,
          result: expected.action === "human_hold" ? "held" : "applied",
          reason: expected.reason,
          plan,
          holdReason: expected.holdReason,
          now: timestamp
        });
        return {
          ok: true,
          state: data,
          stateRevision: currentRevision,
          next: expected,
          audit,
          idempotent: true
        };
      }

      default:
        return { ok: false, error: `Unsupported action: ${expected.action}`, next: expected };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      next: expected
    };
  }
}

/** Seed or replace a draft clarified spec (bootstrap helper for tests/dogfood). */
export function upsertDraftClarifiedSpec(
  data: LifeHarnessData,
  planId: string,
  artifact: SpecDraftArtifact,
  now: Date = new Date()
): ApplyFeatureSprintLegalActionResult {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }
  if (plan.clarifiedSpec?.status === "frozen") {
    return { ok: false, error: "Cannot silently modify a frozen spec. Submit a revision artifact." };
  }
  if (plan.clarifiedSpec?.status === "approved") {
    return {
      ok: false,
      error: "Cannot overwrite approved specs via draft upsert. Use revision flow after freeze, or unapprove is not supported."
    };
  }
  const timestamp = now.toISOString();
  // Allow further edits while revision_required (editable revised content awaiting approve).
  const prior = plan.clarifiedSpec;
  const clarifiedSpec =
    prior?.status === "revision_required"
      ? normalizeClarifiedSpec({
          ...prior,
          objective: artifact.objective,
          userIntent: artifact.userIntent,
          assumptions: artifact.assumptions ?? prior.assumptions,
          constraints: artifact.constraints ?? prior.constraints,
          nonGoals: artifact.nonGoals ?? prior.nonGoals,
          acceptanceCriteria: artifact.acceptanceCriteria,
          clarificationQuestions:
            artifact.clarificationQuestions ?? prior.clarificationQuestions,
          riskNotes: artifact.riskNotes ?? prior.riskNotes,
          sideEffectFlags: artifact.sideEffectFlags ?? prior.sideEffectFlags,
          status: "revision_required",
          updatedAt: timestamp
        })!
      : createDraftClarifiedSpec({ ...artifact, now: timestamp });
  const stateRevision = bumpRevision(plan);
  const updated: HarnessFeatureSprintPlan = {
    ...plan,
    clarifiedSpec,
    stateRevision,
    updatedAt: timestamp
  };
  const audit = buildAudit({
    actionId: `${planId}::${stateRevision}::upsert_draft::-::-`,
    action: "request_clarification",
    before: resolvePlanStateRevision(plan),
    after: stateRevision,
    result: "applied",
    reason:
      prior?.status === "revision_required"
        ? "Updated revised clarified spec content (still requires approve → freeze)."
        : "Upserted draft clarified spec.",
    plan: updated,
    now: timestamp
  });
  Object.assign(updated, rememberAction(updated, audit.actionId, audit));
  const state = replacePlan(data, updated);
  return {
    ok: true,
    state,
    stateRevision,
    next: nextAfter(state, planId, now),
    audit
  };
}

function invalidateArtifactsAfterMaterialRevision(
  plan: HarnessFeatureSprintPlan,
  timestamp: string
): Pick<
  HarnessFeatureSprintPlan,
  | "steps"
  | "sprintMap"
  | "executionTarget"
  | "automationPhase"
  | "currentStepId"
  | "status"
  | "completedAt"
  | "evidenceLogId"
  | "evidenceProofItemId"
> {
  const steps = plan.steps.map((step) => {
    const {
      implementationProof: _proof,
      reviewVerdict: _verdict,
      reviewStatus: _status,
      correctionAttempt: _attempt,
      outputSummary: _summary,
      workerOutputEvidence: _worker,
      frozenSpecRevision: _rev,
      ...rest
    } = step;
    return {
      ...rest,
      status: step.status === "done" || step.status === "sent" || step.status === "reviewing"
        ? ("ready" as const)
        : step.status,
      updatedAt: timestamp
    };
  });

  let sprintMap = plan.sprintMap;
  if (sprintMap) {
    for (const row of listFeatureSprintMapTasks(sprintMap)) {
      const task = row.task;
      if (task.status === "parked") {
        sprintMap = mapUpdateTask(sprintMap, task.id, {
          correctionAttempt: undefined,
          frozenSpecRevision: undefined,
          updatedAt: timestamp
        });
        continue;
      }
      const resetStatus =
        task.status === "done" || task.status === "in_progress" ? "ready" : task.status;
      sprintMap = mapUpdateTask(sprintMap, task.id, {
        status: resetStatus,
        gateState: task.gateState === "passed" ? undefined : task.gateState,
        correctionAttempt: undefined,
        frozenSpecRevision: undefined,
        updatedAt: timestamp
      });
    }
  }

  // Reopen active completion authority. Archival proof/log rows remain in data.logs /
  // data.proofItems; only plan-pointer fields that drive terminal_complete are cleared.
  const reopenCompleted = plan.status === "done";
  return {
    steps,
    sprintMap,
    executionTarget: undefined,
    automationPhase: undefined,
    currentStepId: undefined,
    status: reopenCompleted ? "in_progress" : plan.status,
    completedAt: undefined,
    evidenceLogId: undefined,
    evidenceProofItemId: undefined
  };
}

/**
 * Material revision of a frozen spec.
 * Archives the prior revision, bumps revision, enters editable `revision_required`,
 * and invalidates execution artifacts that depended on the superseded freeze.
 * Does not silently refreeze — caller must approve → freeze.
 */
export function requestClarifiedSpecRevision(
  data: LifeHarnessData,
  planId: string,
  artifact: SpecRevisionArtifact,
  now: Date = new Date()
): ApplyFeatureSprintLegalActionResult {
  const plan = findPlan(data, planId);
  if (!plan?.clarifiedSpec) {
    return { ok: false, error: `Plan/spec not found: ${planId}` };
  }
  if (plan.clarifiedSpec.revision !== artifact.baseRevision) {
    return { ok: false, error: "stale_action", holdReason: "stale_action" };
  }
  if (plan.clarifiedSpec.status !== "frozen" && plan.clarifiedSpec.status !== "revision_required") {
    return { ok: false, error: "Only frozen/revision_required specs can be revised via this path." };
  }

  const nextDraft = {
    objective: artifact.patch.objective ?? plan.clarifiedSpec.objective,
    userIntent: artifact.patch.userIntent ?? plan.clarifiedSpec.userIntent,
    assumptions: artifact.patch.assumptions ?? plan.clarifiedSpec.assumptions,
    constraints: artifact.patch.constraints ?? plan.clarifiedSpec.constraints,
    nonGoals: artifact.patch.nonGoals ?? plan.clarifiedSpec.nonGoals,
    acceptanceCriteria: artifact.patch.acceptanceCriteria ?? plan.clarifiedSpec.acceptanceCriteria,
    riskNotes: artifact.patch.riskNotes ?? plan.clarifiedSpec.riskNotes,
    sideEffectFlags: artifact.patch.sideEffectFlags ?? plan.clarifiedSpec.sideEffectFlags,
    clarificationQuestions: plan.clarifiedSpec.clarificationQuestions
  };
  const classification = classifyClarifiedSpecMaterialChange(plan.clarifiedSpec, nextDraft);
  if (!classification.material && !classification.uncertain) {
    return { ok: false, error: "Change classified as non-material; edit draft fields without revision bump." };
  }

  const timestamp = now.toISOString();
  const history = [...(plan.clarifiedSpecHistory ?? []), plan.clarifiedSpec].slice(-MAX_SPEC_HISTORY);
  const priorFrozenRevision = plan.clarifiedSpec.revision;
  const clarifiedSpec = normalizeClarifiedSpec({
    ...plan.clarifiedSpec,
    ...nextDraft,
    revision: plan.clarifiedSpec.revision + 1,
    status: "revision_required",
    supersedesRevision: priorFrozenRevision,
    approvedAt: undefined,
    frozenAt: undefined,
    updatedAt: timestamp
  })!;
  const invalidated = invalidateArtifactsAfterMaterialRevision(plan, timestamp);
  const stateRevision = bumpRevision(plan);
  const updated: HarnessFeatureSprintPlan = {
    ...plan,
    ...invalidated,
    clarifiedSpec,
    clarifiedSpecHistory: history,
    stateRevision,
    updatedAt: timestamp
  };
  // Ensure optional completion pointers are truly absent (not merely undefined keys).
  delete updated.completedAt;
  delete updated.evidenceLogId;
  delete updated.evidenceProofItemId;
  delete updated.automationPhase;
  delete updated.executionTarget;
  delete updated.currentStepId;
  const audit = buildAudit({
    actionId: `${planId}::${stateRevision}::spec_revision::-::-`,
    action: "request_clarification",
    before: resolvePlanStateRevision(plan),
    after: stateRevision,
    result: "applied",
    reason:
      classification.reasons.join(" ") ||
      "Material spec revision applied; approve then freeze required.",
    plan: updated,
    now: timestamp
  });
  Object.assign(updated, rememberAction(updated, audit.actionId, audit));
  const state = replacePlan(data, updated);
  return {
    ok: true,
    state,
    stateRevision,
    next: nextAfter(state, planId, now),
    audit
  };
}

export function approveRiskyTaskForPlan(
  data: LifeHarnessData,
  planId: string,
  taskId: string,
  now: Date = new Date()
): ApplyFeatureSprintLegalActionResult {
  const plan = findPlan(data, planId);
  if (!plan?.sprintMap) {
    return { ok: false, error: "Plan/map not found." };
  }
  if (!findTaskInFeatureSprintMap(plan.sprintMap, taskId)) {
    return { ok: false, error: `Task not found: ${taskId}` };
  }
  const timestamp = now.toISOString();
  const stateRevision = bumpRevision(plan);
  const updated: HarnessFeatureSprintPlan = {
    ...plan,
    sprintMap: mapUpdateTask(plan.sprintMap, taskId, { humanApprovedForRisk: true }),
    stateRevision,
    updatedAt: timestamp
  };
  const audit = buildAudit({
    actionId: `${planId}::${stateRevision}::risky_approval::${taskId}::-`,
    action: "launch_implementation",
    before: resolvePlanStateRevision(plan),
    after: stateRevision,
    result: "applied",
    reason: "Human approved risky task.",
    plan: updated,
    now: timestamp
  });
  Object.assign(updated, rememberAction(updated, audit.actionId, audit));
  const state = replacePlan(data, updated);
  return { ok: true, state, stateRevision, next: nextAfter(state, planId, now), audit };
}

// Re-export for dogfood convenience without forcing unused import warnings in apply file consumers.
export { normalizeImplementationProofForStep, updateFeatureSprintPlan };
