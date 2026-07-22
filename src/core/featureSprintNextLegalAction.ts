import {
  listOpenRequiredClarifications,
  canApproveClarifiedSpec,
  canFreezeClarifiedSpec,
  getFrozenClarifiedSpec
} from "./featureSprintClarifiedSpec";
import {
  resolveFeatureSprintAutonomyPolicy
} from "./featureSprintAutonomyPolicy";
import {
  isSprintMapAuthoritative,
  listFeatureSprintMapTasks,
  findTaskInFeatureSprintMap,
  getUnmetRequiredDependencies
} from "./featureSprintMap";
import {
  buildFeatureSprintActionId,
  buildFeatureSprintTaskContract,
  resolvePlanStateRevision,
  validateProofAgainstTaskContract,
  type HarnessFeatureSprintNextLegalAction
} from "./featureSprintTaskContract";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintHumanHoldReason,
  HarnessFeatureSprintLegalAction,
  HarnessFeatureSprintMap,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintTask
} from "./types";

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function findPlan(data: LifeHarnessData, planId: string): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((plan) => plan.id === planId);
}

function hold(
  plan: HarnessFeatureSprintPlan,
  input: {
    holdReason: HarnessFeatureSprintHumanHoldReason;
    reason: string;
    unmetPreconditions?: string[];
    taskId?: string;
    phase?: "localize" | "implement" | "review";
    frozenSpecRevision?: number;
    now?: Date;
  }
): HarnessFeatureSprintNextLegalAction {
  const stateRevision = resolvePlanStateRevision(plan);
  const action: HarnessFeatureSprintLegalAction = "human_hold";
  return {
    actionId: buildFeatureSprintActionId({
      planId: plan.id,
      stateRevision,
      action,
      taskId: input.taskId,
      phase: input.phase
    }),
    action,
    planId: plan.id,
    stateRevision,
    requiresHuman: true,
    reason: input.reason,
    unmetPreconditions: input.unmetPreconditions ?? [input.reason],
    holdReason: input.holdReason,
    executionContext: {
      executionModel: isSprintMapAuthoritative(plan) ? "sprint_map" : "legacy_steps",
      ...(input.taskId
        ? {
            sprintId: plan.executionTarget?.sprintId,
            storyId: plan.executionTarget?.storyId,
            taskId: input.taskId,
            phase: input.phase
          }
        : {}),
      ...(typeof input.frozenSpecRevision === "number"
        ? { frozenSpecRevision: input.frozenSpecRevision }
        : {})
    },
    createdAt: nowIso(input.now)
  };
}

function actionOf(
  plan: HarnessFeatureSprintPlan,
  input: {
    action: Exclude<HarnessFeatureSprintLegalAction, "human_hold">;
    reason: string;
    unmetPreconditions?: string[];
    requiresHuman?: boolean;
    taskId?: string;
    phase?: "localize" | "implement" | "review";
    frozenSpecRevision?: number;
    eligibleProfiles?: string[];
    now?: Date;
  }
): HarnessFeatureSprintNextLegalAction {
  const stateRevision = resolvePlanStateRevision(plan);
  return {
    actionId: buildFeatureSprintActionId({
      planId: plan.id,
      stateRevision,
      action: input.action,
      taskId: input.taskId,
      phase: input.phase
    }),
    action: input.action,
    planId: plan.id,
    stateRevision,
    requiresHuman: input.requiresHuman === true,
    reason: input.reason,
    unmetPreconditions: input.unmetPreconditions ?? [],
    eligibleProfiles: input.eligibleProfiles,
    executionContext: {
      executionModel: isSprintMapAuthoritative(plan) ? "sprint_map" : "legacy_steps",
      sprintId: plan.executionTarget?.sprintId,
      storyId: plan.executionTarget?.storyId,
      taskId: input.taskId ?? plan.executionTarget?.taskId,
      phase: input.phase ?? plan.executionTarget?.phase,
      ...(typeof input.frozenSpecRevision === "number"
        ? { frozenSpecRevision: input.frozenSpecRevision }
        : {})
    },
    createdAt: nowIso(input.now)
  };
}

function linkedStep(plan: HarnessFeatureSprintPlan, task: HarnessFeatureSprintTask) {
  if (!task.linkedStepId) {
    return undefined;
  }
  return plan.steps.find((step) => step.id === task.linkedStepId);
}

/** Authoritative Sprint Map completion: every required map task is status `done`. */
export function allAuthoritativeMapTasksDone(plan: HarnessFeatureSprintPlan): boolean {
  const tasks = listFeatureSprintMapTasks(plan.sprintMap);
  return tasks.length > 0 && tasks.every((entry) => entry.task.status === "done");
}

export type KernelTaskExecutability = {
  ok: boolean;
  holdReason?: HarnessFeatureSprintHumanHoldReason;
  reason: string;
  unmetPreconditions: string[];
};

/**
 * Narrow shared gate: whether a map task may be selected / launched by the kernel.
 * Parked and blocked are non-executable; required dependencies must be done.
 */
export function evaluateKernelTaskExecutability(
  map: HarnessFeatureSprintMap | undefined,
  task: HarnessFeatureSprintTask
): KernelTaskExecutability {
  if (task.status === "parked") {
    return {
      ok: false,
      holdReason: "task_not_executable",
      reason: `Task "${task.title}" is parked and cannot be executed.`,
      unmetPreconditions: [`parked:${task.id}`]
    };
  }
  if (task.status === "blocked" || task.gateState === "blocked") {
    return {
      ok: false,
      holdReason: "review_blocked",
      reason: `Task "${task.title}" is blocked.`,
      unmetPreconditions: [`blocked:${task.id}`]
    };
  }
  if (task.status === "done") {
    return {
      ok: false,
      holdReason: "task_not_executable",
      reason: `Task "${task.title}" is already done.`,
      unmetPreconditions: [`done:${task.id}`]
    };
  }
  if (!map) {
    return {
      ok: false,
      holdReason: "unsupported_legacy_state",
      reason: "Sprint Map is missing.",
      unmetPreconditions: ["missing_sprint_map"]
    };
  }
  const unmet = getUnmetRequiredDependencies(map, task);
  if (unmet.length > 0) {
    const details = unmet.map((item) => {
      const depId = item.dependency.taskId;
      const label = item.prerequisite?.title ?? depId;
      const status = item.prerequisite?.status ?? "missing";
      return `${depId} (${label}, ${status})`;
    });
    return {
      ok: false,
      holdReason: "dependency_unmet",
      reason: `Task "${task.title}" has unmet required dependencies.`,
      unmetPreconditions: details
    };
  }
  if (
    task.status !== "ready" &&
    task.status !== "in_progress" &&
    task.status !== "planned"
  ) {
    return {
      ok: false,
      holdReason: "task_not_executable",
      reason: `Task "${task.title}" status "${task.status}" is not executable.`,
      unmetPreconditions: [`status:${task.id}:${task.status}`]
    };
  }
  return { ok: true, reason: "Executable.", unmetPreconditions: [] };
}

export function listSelectableKernelTasks(plan: HarnessFeatureSprintPlan) {
  if (!plan.sprintMap) {
    return [];
  }
  return listFeatureSprintMapTasks(plan.sprintMap).filter(
    (entry) => evaluateKernelTaskExecutability(plan.sprintMap, entry.task).ok
  );
}

export function firstSelectableKernelTask(plan: HarnessFeatureSprintPlan) {
  const selectable = listSelectableKernelTasks(plan);
  return (
    selectable.find((entry) => entry.task.status === "ready") ??
    selectable.find((entry) => entry.task.status === "in_progress") ??
    selectable.find((entry) => entry.task.status === "planned")
  );
}

export function listUnfinishedNonSelectableTasks(plan: HarnessFeatureSprintPlan): Array<{
  taskId: string;
  title: string;
  status: string;
  reasons: string[];
}> {
  if (!plan.sprintMap) {
    return [];
  }
  return listFeatureSprintMapTasks(plan.sprintMap)
    .filter((entry) => entry.task.status !== "done")
    .map((entry) => {
      const gate = evaluateKernelTaskExecutability(plan.sprintMap, entry.task);
      return {
        taskId: entry.task.id,
        title: entry.task.title,
        status: entry.task.status,
        reasons: gate.ok ? [] : gate.unmetPreconditions
      };
    })
    .filter((entry) => entry.reasons.length > 0);
}

function holdForUnfinishedNonSelectable(
  plan: HarnessFeatureSprintPlan,
  frozenRevision: number,
  now: Date,
  contextTaskId?: string
): HarnessFeatureSprintNextLegalAction {
  const unfinished = listUnfinishedNonSelectableTasks(plan);
  const details = unfinished.map(
    (entry) =>
      `${entry.taskId} [${entry.status}]${
        entry.reasons.length ? `: ${entry.reasons.join("; ")}` : ""
      }`
  );
  return hold(plan, {
    holdReason: "unfinished_tasks_remain",
    reason:
      "Unfinished Sprint Map tasks remain but none are currently selectable for autonomous execution.",
    unmetPreconditions: details.length > 0 ? details : unfinished.map((entry) => entry.taskId),
    taskId: contextTaskId,
    frozenSpecRevision: frozenRevision,
    now
  });
}

/**
 * Deterministic Feature Sprint next-legal-action kernel.
 * Pure: no model calls, no subprocesses, no persistence writes.
 */
export function getNextFeatureSprintLegalAction(
  data: LifeHarnessData,
  planId: string,
  now: Date = new Date()
): HarnessFeatureSprintNextLegalAction | { ok: false; error: string } {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }

  const policy = resolveFeatureSprintAutonomyPolicy(plan);
  const clarified = plan.clarifiedSpec;

  if (plan.status === "done" && (plan.evidenceLogId || plan.evidenceProofItemId)) {
    return actionOf(plan, {
      action: "terminal_complete",
      reason: "Sprint is complete.",
      now
    });
  }

  // Kernel control plane requires clarifiedSpec. Legacy plans stay manual-compatible.
  if (!clarified) {
    return hold(plan, {
      holdReason: "unsupported_legacy_state",
      reason:
        "Plan has no clarifiedSpec — kernel autopilot path is unavailable. Continue with existing manual Feature Sprint controls.",
      now
    });
  }

  const openQuestions = listOpenRequiredClarifications(clarified);
  const needsApprovalPath =
    openQuestions.length > 0 ||
    clarified.status === "clarifying" ||
    clarified.status === "draft" ||
    clarified.status === "revision_required";

  if (needsApprovalPath) {
    if (openQuestions.length > 0) {
      return actionOf(plan, {
        action: "request_clarification",
        reason: "Required clarification questions remain open.",
        unmetPreconditions: openQuestions.map((item) => `${item.id}: ${item.question}`),
        requiresHuman: true,
        now
      });
    }
    const approveGate = canApproveClarifiedSpec(clarified);
    if (
      approveGate.ok ||
      clarified.status === "draft" ||
      clarified.status === "revision_required"
    ) {
      return actionOf(plan, {
        action: "approve_spec",
        reason:
          clarified.status === "revision_required"
            ? "Material revision is ready for approval before refreeze."
            : "Clarified spec is ready for approval.",
        unmetPreconditions: approveGate.ok ? [] : approveGate.unmetPreconditions,
        requiresHuman: true,
        now
      });
    }
    return actionOf(plan, {
      action: "request_clarification",
      reason: "Clarified spec cannot be approved yet.",
      unmetPreconditions: approveGate.unmetPreconditions,
      requiresHuman: true,
      now
    });
  }

  if (clarified.status === "approved") {
    const freezeGate = canFreezeClarifiedSpec(clarified);
    if (!freezeGate.ok) {
      return hold(plan, {
        holdReason: "spec_approval_required",
        reason: freezeGate.unmetPreconditions.join(" ") || "Spec cannot be frozen.",
        unmetPreconditions: freezeGate.unmetPreconditions,
        now
      });
    }
    return actionOf(plan, {
      action: "freeze_spec",
      reason: "Approved clarified spec is ready to freeze.",
      requiresHuman: policy.requireHumanForSpecFreeze,
      frozenSpecRevision: clarified.revision,
      now
    });
  }

  const frozen = getFrozenClarifiedSpec(plan);
  if (!frozen) {
    return hold(plan, {
      holdReason: "spec_approval_required",
      reason: "No frozen clarified spec is available for execution.",
      now
    });
  }

  if (!plan.sprintMap || listFeatureSprintMapTasks(plan.sprintMap).length === 0) {
    return hold(plan, {
      holdReason: "unsupported_legacy_state",
      reason: "Frozen spec requires an adopted Sprint Map with at least one task.",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (!isSprintMapAuthoritative(plan)) {
    return actionOf(plan, {
      action: "adopt_sprint_map",
      reason: "Sprint Map exists but is not authoritative yet.",
      requiresHuman: true,
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (allAuthoritativeMapTasksDone(plan)) {
    if (plan.status === "done") {
      return actionOf(plan, {
        action: "terminal_complete",
        reason: "All tasks are done and sprint is complete.",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    return actionOf(plan, {
      action: "complete_sprint",
      reason: "All Sprint Map tasks are done.",
      requiresHuman: policy.requireHumanForFinalCompletion,
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  const target = plan.executionTarget;
  const selected = target
    ? findTaskInFeatureSprintMap(plan.sprintMap, target.taskId)
    : undefined;

  if (!selected || !target) {
    const next = firstSelectableKernelTask(plan);
    if (!next) {
      return holdForUnfinishedNonSelectable(plan, frozen.revision, now);
    }
    return actionOf(plan, {
      action: "select_task",
      reason: `Select task "${next.task.title}" for execution.`,
      taskId: next.task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  const task = selected.task;
  const step = linkedStep(plan, task);
  const contractResult = buildFeatureSprintTaskContract({ task, frozenSpec: frozen });
  const executability = evaluateKernelTaskExecutability(plan.sprintMap, task);

  if (task.status === "done") {
    const nextTask = firstSelectableKernelTask(plan);
    if (!nextTask) {
      // Unfinished tasks remain (parked/blocked/deps) — never complete_sprint here.
      return holdForUnfinishedNonSelectable(plan, frozen.revision, now, task.id);
    }
    return actionOf(plan, {
      action: "select_task",
      reason: `Current task is done; select "${nextTask.task.title}".`,
      taskId: nextTask.task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (!executability.ok) {
    const alternate = firstSelectableKernelTask(plan);
    if (alternate && alternate.task.id !== task.id) {
      return actionOf(plan, {
        action: "select_task",
        reason: `Current target is not executable; select "${alternate.task.title}".`,
        unmetPreconditions: executability.unmetPreconditions,
        taskId: alternate.task.id,
        phase: "implement",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    return hold(plan, {
      holdReason: executability.holdReason ?? "task_not_executable",
      reason: executability.reason,
      unmetPreconditions: executability.unmetPreconditions,
      taskId: task.id,
      phase: target.phase,
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  // Review / correction branch first when evidence exists.
  if (step?.reviewStatus === "blocked") {
    return hold(plan, {
      holdReason: "review_blocked",
      reason: "Review verdict is blocked and requires human intervention.",
      taskId: task.id,
      phase: "review",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (step?.reviewStatus === "needs_changes") {
    const attempt = task.correctionAttempt ?? step.correctionAttempt ?? 0;
    const maxAttempts =
      task.maxCorrectionAttempts ??
      step.maxCorrectionAttempts ??
      policy.maxCorrectionAttempts;
    if (attempt >= maxAttempts) {
      return hold(plan, {
        holdReason: "retry_limit_reached",
        reason: `Correction attempt limit reached (${attempt}/${maxAttempts}).`,
        taskId: task.id,
        phase: "review",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    const riskTierForCorrection = task.riskTier ?? "standard";
    if (
      riskTierForCorrection === "risky" &&
      policy.requireHumanForRiskyTasks &&
      !task.humanApprovedForRisk
    ) {
      return hold(plan, {
        holdReason: "risky_task_approval_required",
        reason: "Risky task requires human approval before correction.",
        taskId: task.id,
        phase: "implement",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    return actionOf(plan, {
      action: "launch_correction",
      reason: "Review requested changes; launch a bounded correction.",
      taskId: task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      eligibleProfiles: ["cursor_implementation", "codex_implementation"],
      now
    });
  }

  if (step?.reviewStatus === "accepted") {
    if (!contractResult.ok || !contractResult.contract) {
      return hold(plan, {
        holdReason: "missing_evidence",
        reason: "Accepted review cannot advance while the task contract is invalid.",
        unmetPreconditions: contractResult.unmetPreconditions,
        taskId: task.id,
        phase: "review",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    if (!step.implementationProof) {
      return hold(plan, {
        holdReason: "missing_evidence",
        reason: "Accepted review cannot advance without implementation proof.",
        taskId: task.id,
        phase: "review",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    const proofCheck = validateProofAgainstTaskContract({
      changedFiles: step.implementationProof.filesChanged,
      contract: contractResult.contract,
      verificationResult: step.implementationProof.verificationResult,
      frozenSpecRevision: step.implementationProof.frozenSpecRevision ?? step.frozenSpecRevision
    });
    if (!proofCheck.ok) {
      return hold(plan, {
        holdReason: proofCheck.holdReason ?? "missing_evidence",
        reason: "Accepted review cannot override known proof failures.",
        unmetPreconditions: proofCheck.unmetPreconditions,
        taskId: task.id,
        phase: "review",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    return actionOf(plan, {
      action: "advance_task",
      reason: "Review accepted; advance the task.",
      taskId: task.id,
      phase: "review",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  // After a launch was recorded, wait for worker output instead of re-launching.
  if (
    (plan.automationPhase === "implementing" || plan.automationPhase === "reviewing") &&
    !step?.outputSummary &&
    !step?.implementationProof &&
    !step?.reviewVerdict
  ) {
    return hold(plan, {
      holdReason: "missing_evidence",
      reason: "Awaiting worker result for the launched action.",
      taskId: task.id,
      phase: target.phase,
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  // Correction proof saved → require re-review (unless verdict text is already waiting to import).
  if (
    (task.correctionAttempt ?? 0) > 0 &&
    step?.implementationProof &&
    !step.reviewStatus &&
    !step.reviewVerdict
  ) {
    return actionOf(plan, {
      action: "launch_review",
      reason: "Correction proof saved; re-review is required before advance.",
      taskId: task.id,
      phase: "review",
      frozenSpecRevision: frozen.revision,
      eligibleProfiles: ["cursor_review", "codex_review"],
      now
    });
  }

  if (step?.outputSummary && step.implementationProof && !step.reviewStatus && !step.reviewVerdict) {
    const proofCheck = contractResult.ok
      ? validateProofAgainstTaskContract({
          changedFiles: step.implementationProof.filesChanged,
          contract: contractResult.contract!,
          verificationResult: step.implementationProof.verificationResult,
          frozenSpecRevision:
            step.implementationProof.frozenSpecRevision ?? step.frozenSpecRevision
        })
      : {
          ok: false,
          unmetPreconditions: contractResult.unmetPreconditions,
          holdReason: "missing_evidence" as const
        };

    if (!proofCheck.ok) {
      return hold(plan, {
        holdReason: proofCheck.holdReason ?? "missing_evidence",
        reason: "Implementation proof is not valid for review launch.",
        unmetPreconditions: proofCheck.unmetPreconditions,
        taskId: task.id,
        phase: "implement",
        frozenSpecRevision: frozen.revision,
        now
      });
    }

    return actionOf(plan, {
      action: "launch_review",
      reason: "Valid implementation proof is ready for review.",
      taskId: task.id,
      phase: "review",
      frozenSpecRevision: frozen.revision,
      eligibleProfiles: ["cursor_review", "codex_review"],
      now
    });
  }

  if (step?.outputSummary && !step.implementationProof) {
    return actionOf(plan, {
      action: (task.correctionAttempt ?? 0) > 0 ? "save_correction_proof" : "save_implementation_proof",
      reason: "Implementation output exists but proof is not normalized/saved.",
      taskId: task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (step?.reviewVerdict && !step.reviewStatus) {
    return actionOf(plan, {
      action: "import_review_verdict",
      reason: "Review output exists but verdict is not imported.",
      taskId: task.id,
      phase: "review",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  // Ready to launch implementation.
  if (!contractResult.ok) {
    return hold(plan, {
      holdReason: "missing_evidence",
      reason: "Task contract is incomplete for autonomous implementation.",
      unmetPreconditions: contractResult.unmetPreconditions,
      taskId: task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  const riskTier = contractResult.contract!.riskTier;
  if (riskTier === "risky" && policy.requireHumanForRiskyTasks && !task.humanApprovedForRisk) {
    return hold(plan, {
      holdReason: "risky_task_approval_required",
      reason: "Risky task requires human approval before implementation.",
      taskId: task.id,
      phase: "implement",
      frozenSpecRevision: frozen.revision,
      now
    });
  }

  if (target.phase === "localize" && !step?.promptLocalization) {
    if (plan.automationPhase === "localizing") {
      return actionOf(plan, {
        action: "save_localization",
        reason: "Localization launch recorded; import localization to continue.",
        taskId: task.id,
        phase: "localize",
        frozenSpecRevision: frozen.revision,
        now
      });
    }
    return actionOf(plan, {
      action: "launch_localization",
      reason: "Localization phase is selected and localization is missing.",
      taskId: task.id,
      phase: "localize",
      frozenSpecRevision: frozen.revision,
      eligibleProfiles: ["cursor_implementation"],
      now
    });
  }

  return actionOf(plan, {
    action: "launch_implementation",
    reason: "Launch implementation for the selected task.",
    taskId: task.id,
    phase: "implement",
    frozenSpecRevision: frozen.revision,
    eligibleProfiles: ["cursor_implementation", "codex_implementation"],
    now
  });
}
