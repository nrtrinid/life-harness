import {
  applyFeatureSprintLegalAction,
  type ApplyFeatureSprintLegalActionInput,
  type ApplyFeatureSprintLegalActionResult,
  type FeatureSprintLegalArtifact,
  type ImplementationProofArtifact,
  type LocalizationArtifact,
  type ReviewVerdictArtifact
} from "./featureSprintApplyLegalAction";
import { buildImplementationProofFromSources, resolveLatestImplementationRunForStep } from "./featureSprintImplementationProof";
import { findTaskInFeatureSprintMap } from "./featureSprintMap";
import { getNextFeatureSprintLegalAction } from "./featureSprintNextLegalAction";
import { parseFeaturePromptLocalizationBlock } from "./featureSprintOrchestrator";
import { buildProjectContextForCard } from "./projectRegistry";
import {
  resolvePlanStateRevision,
  type HarnessFeatureSprintNextLegalAction
} from "./featureSprintTaskContract";
import type { LifeHarnessData } from "./lifeHarnessData";
import type {
  HarnessFeatureSprintActionAuditEntry,
  HarnessFeatureSprintHumanHoldReason,
  HarnessFeatureSprintLegalAction,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintStep
} from "./types";

const MAX_AUDIT_LOG = 40;

const DEFAULT_VERIFY_COMMANDS = ["npm run typecheck", "npm test"];

export type FeatureSprintPlanKernelMode = "kernel_managed" | "legacy_manual";

export type FeatureSprintLegalActionCategory =
  | "state_only"
  | "worker_launch"
  | "artifact_required"
  | "informational";

export const FEATURE_SPRINT_LEGAL_ACTION_LABELS: Record<HarnessFeatureSprintLegalAction, string> = {
  request_clarification: "Clarification required",
  approve_spec: "Approve clarified specification",
  freeze_spec: "Freeze specification",
  adopt_sprint_map: "Adopt Sprint Map",
  select_task: "Select task",
  launch_localization: "Launch localization",
  save_localization: "Save localization",
  launch_implementation: "Launch implementation",
  save_implementation_proof: "Save implementation proof",
  launch_review: "Launch review",
  import_review_verdict: "Import review verdict",
  launch_correction: "Launch correction",
  save_correction_proof: "Save correction proof",
  advance_task: "Advance task",
  complete_sprint: "Complete sprint",
  human_hold: "Human hold",
  terminal_complete: "Terminal complete"
};

const STATE_ONLY_ACTIONS = new Set<HarnessFeatureSprintLegalAction>([
  "approve_spec",
  "freeze_spec",
  "adopt_sprint_map",
  "select_task",
  "advance_task",
  "complete_sprint"
]);

const WORKER_LAUNCH_ACTIONS = new Set<HarnessFeatureSprintLegalAction>([
  "launch_localization",
  "launch_implementation",
  "launch_review",
  "launch_correction"
]);

const ARTIFACT_REQUIRED_ACTIONS = new Set<HarnessFeatureSprintLegalAction>([
  "request_clarification",
  "save_localization",
  "save_implementation_proof",
  "save_correction_proof",
  "import_review_verdict"
]);

export function resolveFeatureSprintPlanKernelMode(
  plan: HarnessFeatureSprintPlan
): FeatureSprintPlanKernelMode {
  return plan.clarifiedSpec ? "kernel_managed" : "legacy_manual";
}

export function isKernelManagedFeatureSprintPlan(plan: HarnessFeatureSprintPlan): boolean {
  return resolveFeatureSprintPlanKernelMode(plan) === "kernel_managed";
}

export function classifyFeatureSprintLegalAction(
  action: HarnessFeatureSprintLegalAction
): FeatureSprintLegalActionCategory {
  if (action === "human_hold" || action === "terminal_complete") {
    return "informational";
  }
  if (STATE_ONLY_ACTIONS.has(action)) {
    return "state_only";
  }
  if (WORKER_LAUNCH_ACTIONS.has(action)) {
    return "worker_launch";
  }
  if (ARTIFACT_REQUIRED_ACTIONS.has(action)) {
    return "artifact_required";
  }
  return "informational";
}

export type FeatureSprintNextLegalActionPresentation = {
  mode: FeatureSprintPlanKernelMode;
  next: HarnessFeatureSprintNextLegalAction | null;
  error?: string;
  label: string;
  detail: string;
  category: FeatureSprintLegalActionCategory;
  requiresExternalWorker: boolean;
  canTrigger: boolean;
  holdReason?: HarnessFeatureSprintHumanHoldReason;
  /** When artifact is required, explains which dedicated control to use. */
  artifactInputHint?: string;
};

export const KERNEL_MANAGED_USE_PANEL_MESSAGE =
  "Use the Next Legal Action panel for kernel-managed plans.";

export const KERNEL_LAUNCH_INTENT_APPLIED_MESSAGE =
  "Legal launch transition recorded. This records launch intent, not provider success.";

export const KERNEL_MANAGED_PROMPT_AUDIT_MESSAGE =
  "Prompt audit is a legacy ancillary worker. Use the Next Legal Action panel for kernel-managed plans.";

export type FeatureSprintLegacyControlKind =
  | "launch_implementation"
  | "launch_review"
  | "launch_localization"
  | "launch_correction"
  | "advance_task"
  | "complete_sprint"
  | "adopt_sprint_map"
  | "select_execution_target"
  | "mutate_sprint_map"
  | "approve_legacy_feature_spec"
  | "adopt_next_slice"
  | "launch_prompt_audit";

const DEDICATED_ARTIFACT_HANDLER_ACTIONS = new Set<HarnessFeatureSprintLegalAction>([
  "save_implementation_proof",
  "save_correction_proof",
  "import_review_verdict",
  "save_localization"
]);

export function hasDedicatedArtifactHandler(
  action: HarnessFeatureSprintLegalAction
): boolean {
  return DEDICATED_ARTIFACT_HANDLER_ACTIONS.has(action);
}

export function describeArtifactActionInput(action: HarnessFeatureSprintLegalAction): string {
  switch (action) {
    case "request_clarification":
      return "Clarification answers are not wired yet. Resolve open questions before continuing.";
    case "save_localization":
      return "Use the localization import controls below.";
    case "save_implementation_proof":
    case "save_correction_proof":
      return "Save agent output, then use Normalize for review below.";
    case "import_review_verdict":
      return "Use Import review verdict below.";
    default:
      return "Use the dedicated controls below for this action.";
  }
}

function findPlan(data: LifeHarnessData, planId: string): HarnessFeatureSprintPlan | undefined {
  return data.featureSprintPlans.find((plan) => plan.id === planId);
}

function presentationFromNext(
  plan: HarnessFeatureSprintPlan,
  next: HarnessFeatureSprintNextLegalAction
): FeatureSprintNextLegalActionPresentation {
  const mode = resolveFeatureSprintPlanKernelMode(plan);
  const category = classifyFeatureSprintLegalAction(next.action);
  const requiresExternalWorker = category === "worker_launch";
  const artifactInputHint =
    category === "artifact_required" ? describeArtifactActionInput(next.action) : undefined;
  const canTrigger =
    mode === "kernel_managed" &&
    category !== "informational" &&
    next.action !== "human_hold" &&
    next.action !== "terminal_complete" &&
    category !== "artifact_required";

  const unmet =
    next.unmetPreconditions.length > 0 ? `\n${next.unmetPreconditions.join("\n")}` : "";

  return {
    mode,
    next,
    label: FEATURE_SPRINT_LEGAL_ACTION_LABELS[next.action] ?? next.action,
    detail: `${next.reason}${unmet}`,
    category,
    requiresExternalWorker,
    canTrigger,
    holdReason: next.holdReason,
    artifactInputHint
  };
}

/**
 * Read-only adapter: never mutates state or launches providers.
 */
export function presentFeatureSprintNextLegalAction(
  data: LifeHarnessData,
  planId: string,
  now: Date = new Date()
): FeatureSprintNextLegalActionPresentation {
  const plan = findPlan(data, planId);
  if (!plan) {
    return {
      mode: "legacy_manual",
      next: null,
      error: `Plan not found: ${planId}`,
      label: "Plan not found",
      detail: `Plan not found: ${planId}`,
      category: "informational",
      requiresExternalWorker: false,
      canTrigger: false
    };
  }

  const mode = resolveFeatureSprintPlanKernelMode(plan);
  if (mode === "legacy_manual") {
    return {
      mode,
      next: null,
      label: "Legacy manual plan",
      detail:
        "This plan has no clarified spec kernel state. Use the existing manual Feature Sprint controls below.",
      category: "informational",
      requiresExternalWorker: false,
      canTrigger: false,
      holdReason: "unsupported_legacy_state"
    };
  }

  const next = getNextFeatureSprintLegalAction(data, planId, now);
  if ("ok" in next && next.ok === false) {
    return {
      mode,
      next: null,
      error: next.error,
      label: "Kernel unavailable",
      detail: next.error,
      category: "informational",
      requiresExternalWorker: false,
      canTrigger: false
    };
  }

  return presentationFromNext(plan, next as HarnessFeatureSprintNextLegalAction);
}

export type ValidateFeatureSprintTriggerInput = {
  planId: string;
  actionId: string;
  stateRevision: number;
  expectedAction?: HarnessFeatureSprintLegalAction;
};

export type ValidateFeatureSprintTriggerResult =
  | {
      ok: true;
      next: HarnessFeatureSprintNextLegalAction;
      plan: HarnessFeatureSprintPlan;
    }
  | {
      ok: false;
      error: string;
      holdReason?: HarnessFeatureSprintHumanHoldReason;
      next?: HarnessFeatureSprintNextLegalAction;
    };

/**
 * Re-reads persisted state and rejects stale envelopes before any mutation or launch.
 */
export function validateFeatureSprintLegalActionTrigger(
  data: LifeHarnessData,
  input: ValidateFeatureSprintTriggerInput,
  now: Date = new Date()
): ValidateFeatureSprintTriggerResult {
  const plan = findPlan(data, input.planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${input.planId}` };
  }

  if (!isKernelManagedFeatureSprintPlan(plan)) {
    return { ok: false, error: "unsupported_legacy_state", holdReason: "unsupported_legacy_state" };
  }

  const currentRevision = resolvePlanStateRevision(plan);
  if (input.stateRevision !== currentRevision) {
    return { ok: false, error: "stale_action", holdReason: "stale_action" };
  }

  const legal = getNextFeatureSprintLegalAction(data, input.planId, now);
  if ("ok" in legal && legal.ok === false) {
    return { ok: false, error: legal.error };
  }

  const next = legal as HarnessFeatureSprintNextLegalAction;
  if (next.actionId !== input.actionId) {
    return {
      ok: false,
      error: `Action id mismatch. Expected ${next.actionId}.`,
      next,
      holdReason: next.holdReason
    };
  }

  if (input.expectedAction && input.expectedAction !== next.action) {
    return {
      ok: false,
      error: `Wrong action kind. Kernel requires ${next.action}.`,
      next
    };
  }

  return { ok: true, next, plan };
}

export type CanTriggerFeatureSprintActionInput = {
  planId: string;
  expectedActions?: HarnessFeatureSprintLegalAction[];
  actionId?: string;
  stateRevision?: number;
};

export type CanTriggerFeatureSprintActionResult =
  | { ok: true; mode: "legacy_manual" }
  | ValidateFeatureSprintTriggerResult;

/**
 * Central gate for legacy controls and panel triggers. Never manufactures envelopes.
 */
export function canTriggerFeatureSprintAction(
  data: LifeHarnessData,
  input: CanTriggerFeatureSprintActionInput,
  now: Date = new Date()
): CanTriggerFeatureSprintActionResult {
  const plan = findPlan(data, input.planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${input.planId}` };
  }

  if (!isKernelManagedFeatureSprintPlan(plan)) {
    return { ok: true, mode: "legacy_manual" };
  }

  const legal = getNextFeatureSprintLegalAction(data, input.planId, now);
  if ("ok" in legal && legal.ok === false) {
    return { ok: false, error: legal.error };
  }

  const next = legal as HarnessFeatureSprintNextLegalAction;

  if (input.expectedActions && input.expectedActions.length > 0) {
    if (!input.expectedActions.includes(next.action)) {
      return {
        ok: false,
        error: `Kernel requires ${next.action}, not this control.`,
        next,
        holdReason: next.holdReason
      };
    }
  }

  if (typeof input.actionId === "string" && typeof input.stateRevision === "number") {
    return validateFeatureSprintLegalActionTrigger(data, {
      planId: input.planId,
      actionId: input.actionId,
      stateRevision: input.stateRevision,
      expectedAction: next.action
    });
  }

  return { ok: true, next, plan };
}

export type GuardKernelLegacyControlResult =
  | { mode: "legacy_manual" }
  | { mode: "kernel_blocked"; message: string };

/**
 * Legacy mutating/worker controls must not bypass the kernel when clarifiedSpec exists.
 */
export function guardKernelManagedLegacyControl(
  plan: HarnessFeatureSprintPlan | undefined,
  _control: FeatureSprintLegacyControlKind
): GuardKernelLegacyControlResult {
  if (!plan || !isKernelManagedFeatureSprintPlan(plan)) {
    return { mode: "legacy_manual" };
  }
  return { mode: "kernel_blocked", message: KERNEL_MANAGED_USE_PANEL_MESSAGE };
}

export function isKernelDelegatedRunnerLaunchAllowed(
  plan: HarnessFeatureSprintPlan | undefined,
  kernelDelegatedLaunch: boolean
): boolean {
  if (!plan || !isKernelManagedFeatureSprintPlan(plan)) {
    return true;
  }
  return kernelDelegatedLaunch;
}

export function isKernelManagedPromptAuditLaunchAllowed(
  plan: HarnessFeatureSprintPlan | undefined
): boolean {
  if (!plan || !isKernelManagedFeatureSprintPlan(plan)) {
    return true;
  }
  return false;
}

function replacePlan(data: LifeHarnessData, plan: HarnessFeatureSprintPlan): LifeHarnessData {
  return {
    ...data,
    featureSprintPlans: data.featureSprintPlans.map((item) => (item.id === plan.id ? plan : item))
  };
}

function shouldSkipDuplicateAudit(
  plan: HarnessFeatureSprintPlan,
  audit: HarnessFeatureSprintActionAuditEntry
): boolean {
  const log = plan.actionAuditLog ?? [];
  const last = log[log.length - 1];
  return Boolean(
    last &&
      last.actionId === audit.actionId &&
      last.result === audit.result &&
      last.stateRevisionBefore === audit.stateRevisionBefore
  );
}

function appendAuditWithoutRevisionBump(
  data: LifeHarnessData,
  planId: string,
  audit: HarnessFeatureSprintActionAuditEntry
): LifeHarnessData {
  const plan = findPlan(data, planId);
  if (!plan) {
    return data;
  }
  if (shouldSkipDuplicateAudit(plan, audit)) {
    return data;
  }
  const actionAuditLog = [...(plan.actionAuditLog ?? []), audit].slice(-MAX_AUDIT_LOG);
  return replacePlan(data, {
    ...plan,
    actionAuditLog,
    updatedAt: audit.createdAt
  });
}

export function mergeFeatureSprintActionAuditEntry(
  data: LifeHarnessData,
  planId: string,
  audit: HarnessFeatureSprintActionAuditEntry
): LifeHarnessData {
  return appendAuditWithoutRevisionBump(data, planId, audit);
}

export function applyFeatureSprintLegalActionWithBridge(
  data: LifeHarnessData,
  input: ApplyFeatureSprintLegalActionInput,
  now: Date = new Date()
): ApplyFeatureSprintLegalActionResult {
  return applyFeatureSprintLegalAction(data, input, now);
}

export function formatFeatureSprintLegalActionFailure(
  error: string,
  holdReason?: HarnessFeatureSprintHumanHoldReason
): string {
  const labels: Partial<Record<HarnessFeatureSprintHumanHoldReason, string>> = {
    stale_action: "This action is stale — the plan state changed. Refresh and try again.",
    unsupported_legacy_state:
      "This plan uses legacy manual mode. Kernel actions are not available; use the manual controls below.",
    dependency_unmet: "Required dependencies are not complete.",
    task_not_executable: "The selected task cannot run right now.",
    verification_failed: "Verification failed or proof is incomplete.",
    review_blocked: "Review is blocked.",
    missing_evidence: "Required evidence is missing.",
    retry_limit_reached: "Correction retry limit reached.",
    unfinished_tasks_remain: "Finish remaining Sprint Map tasks before completing the sprint."
  };

  if (holdReason && labels[holdReason]) {
    return `${labels[holdReason]} (${error})`;
  }
  if (error === "stale_action") {
    return labels.stale_action ?? error;
  }
  return error;
}

function resolveTaskIdForStep(plan: HarnessFeatureSprintPlan, stepId: string): string | undefined {
  if (plan.executionTarget?.taskId) {
    return plan.executionTarget.taskId;
  }
  if (!plan.sprintMap) {
    return undefined;
  }
  for (const sprint of plan.sprintMap.sprints) {
    for (const story of sprint.stories) {
      for (const task of story.tasks) {
        if (task.linkedStepId === stepId) {
          return task.id;
        }
      }
    }
  }
  return undefined;
}

export function buildImplementationProofArtifactForStep(
  data: LifeHarnessData,
  planId: string,
  stepId: string,
  now: Date = new Date()
):
  | { ok: true; artifact: ImplementationProofArtifact }
  | { ok: false; error: string; holdReason?: HarnessFeatureSprintHumanHoldReason } {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }
  if (!plan.clarifiedSpec || plan.clarifiedSpec.status !== "frozen") {
    return { ok: false, error: "Frozen clarified spec required." };
  }

  const step = plan.steps.find((item) => item.id === stepId);
  if (!step) {
    return { ok: false, error: `Step not found: ${stepId}` };
  }

  const rawOutput = step.outputSummary?.trim();
  if (!rawOutput) {
    return { ok: false, error: "Save agent output before applying proof." };
  }

  const taskId = resolveTaskIdForStep(plan, stepId);
  if (!taskId) {
    return { ok: false, error: "Could not resolve Sprint Map task for this step." };
  }

  const project = buildProjectContextForCard(data, plan.cardId);
  const projectVerificationCommands =
    project?.verificationCommands?.length ? project.verificationCommands : DEFAULT_VERIFY_COMMANDS;
  const matchingRun = resolveLatestImplementationRunForStep(data, planId, stepId);
  const proof = buildImplementationProofFromSources({
    rawOutput,
    step,
    projectVerificationCommands,
    matchingRun,
    timestamp: now.toISOString(),
    existingProof: step.implementationProof,
    workerOutputEvidence: step.workerOutputEvidence
  });

  if (proof.verificationResult === "fail") {
    return {
      ok: false,
      error: "Failed verification cannot be saved as authoritative proof.",
      holdReason: "verification_failed"
    };
  }

  return {
    ok: true,
    artifact: {
      type: "implementation_proof",
      planId,
      taskId,
      stepId,
      frozenSpecRevision: plan.clarifiedSpec.revision,
      changedFiles: proof.filesChanged,
      rawOutput: proof.rawOutput,
      verificationResult: proof.verificationResult,
      testsRun: proof.testsRun,
      knownRisks: proof.knownRisks
    }
  };
}

export function buildReviewVerdictArtifactForStep(
  data: LifeHarnessData,
  planId: string,
  text: string,
  stepId?: string
):
  | { ok: true; artifact: ReviewVerdictArtifact }
  | { ok: false; error: string; holdReason?: HarnessFeatureSprintHumanHoldReason } {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }
  if (!plan.clarifiedSpec) {
    return { ok: false, error: "Clarified spec required." };
  }

  const resolvedStepId = stepId ?? plan.currentStepId;
  if (!resolvedStepId) {
    return { ok: false, error: "No current step for review verdict." };
  }

  const taskId = resolveTaskIdForStep(plan, resolvedStepId);
  if (!taskId) {
    return { ok: false, error: "Could not resolve Sprint Map task for this step." };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Review verdict text is required." };
  }

  return {
    ok: true,
    artifact: {
      type: "review_verdict",
      planId,
      taskId,
      stepId: resolvedStepId,
      frozenSpecRevision: plan.clarifiedSpec.revision,
      text: trimmed
    }
  };
}

export function buildLocalizationArtifactForStep(
  data: LifeHarnessData,
  planId: string,
  text: string,
  stepId?: string
):
  | { ok: true; artifact: LocalizationArtifact }
  | { ok: false; error: string; holdReason?: HarnessFeatureSprintHumanHoldReason } {
  const plan = findPlan(data, planId);
  if (!plan) {
    return { ok: false, error: `Plan not found: ${planId}` };
  }
  if (!plan.clarifiedSpec) {
    return { ok: false, error: "Clarified spec required." };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Localization text is required." };
  }
  if (!parseFeaturePromptLocalizationBlock(trimmed)) {
    return { ok: false, error: "No valid feature-prompt-localization block found." };
  }

  const resolvedStepId = stepId ?? plan.currentStepId;
  if (!resolvedStepId) {
    return { ok: false, error: "No current step for localization." };
  }

  const taskId = resolveTaskIdForStep(plan, resolvedStepId);
  if (!taskId) {
    return { ok: false, error: "Could not resolve Sprint Map task for this step." };
  }

  return {
    ok: true,
    artifact: {
      type: "localization",
      planId,
      taskId,
      stepId: resolvedStepId,
      frozenSpecRevision: plan.clarifiedSpec.revision,
      text: trimmed
    }
  };
}

export function resolveStepForKernelAction(
  plan: HarnessFeatureSprintPlan,
  next: HarnessFeatureSprintNextLegalAction
): HarnessFeatureSprintStep | undefined {
  const taskId = next.executionContext?.taskId;
  if (!taskId || !plan.sprintMap) {
    return plan.steps.find((step) => step.id === plan.currentStepId);
  }
  const found = findTaskInFeatureSprintMap(plan.sprintMap, taskId);
  const stepId = found?.task.linkedStepId ?? plan.currentStepId;
  return plan.steps.find((step) => step.id === stepId);
}

export type ManualKernelBridgeTriggerKind =
  | "apply_state"
  | "launch_worker"
  | "needs_artifact"
  | "blocked";

export function resolveManualKernelBridgeTriggerKind(
  next: HarnessFeatureSprintNextLegalAction
): ManualKernelBridgeTriggerKind {
  const category = classifyFeatureSprintLegalAction(next.action);
  if (category === "informational") {
    return "blocked";
  }
  if (category === "artifact_required") {
    return "needs_artifact";
  }
  if (category === "worker_launch") {
    return "launch_worker";
  }
  return "apply_state";
}

export function buildApplyInputFromPresentation(
  next: HarnessFeatureSprintNextLegalAction,
  artifact?: FeatureSprintLegalArtifact
): ApplyFeatureSprintLegalActionInput {
  return {
    planId: next.planId,
    actionId: next.actionId,
    stateRevision: next.stateRevision,
    expectedAction: next.action,
    artifact
  };
}
