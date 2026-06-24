import type { FeatureSprintDogfoodNextActionKind } from "./featureSprintDogfood";
import {
  canAdoptNextSliceProposal,
  doesFeatureSprintStepRequireSpecUpdate,
  getActiveFeatureSprintPlanForCard,
  hasApprovedSpecUpdateForStep,
  hasPersistedFeatureSpec,
  hasStepImplementationProof,
  hasStepPromptAudit,
  hasStepPromptLocalization,
  isFeatureSpecApproved
} from "./featureSprintOrchestrator";
import { getFeatureSprintRunnerRunsForCard } from "./featureSprintRunnerHistory";
import {
  isImplementationProfile,
  isLocalizationProfile,
  isReviewProfile,
  isScopingProfile,
  runnerAgentLabel,
  type FeatureSprintRunnerAgent
} from "./featureSprintRunner";
import { createId } from "./ids";
import type { LifeHarnessData } from "./lifeHarnessData";
import { getProjectForCard } from "./projectRegistry";
import type {
  HarnessFeatureSprintCurrentSlice,
  HarnessFeatureSprintCurrentSliceSource,
  HarnessFeatureSprintCurrentSliceStatus,
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintSlicePhase,
  HarnessFeatureSprintStep
} from "./types";

export type FeatureSprintNextJobRole =
  | "architect"
  | "localizer"
  | "prompt_auditor"
  | "implementer"
  | "reviewer"
  | "spec_updater"
  | "human";

export type FeatureSprintNextJobAction =
  | "setup_project"
  | "check_runner"
  | "run_scoping"
  | "import_plan"
  | "approve_spec"
  | "copy_localization"
  | "import_localization"
  | "copy_prompt_audit"
  | "import_prompt_critique"
  | "copy_implementation"
  | "save_agent_output"
  | "normalize_proof"
  | "copy_review"
  | "import_review_verdict"
  | "import_spec_update"
  | "approve_revised_spec"
  | "advance_slice"
  | "adopt_next_slice"
  | "mark_complete";

export type FeatureSprintNextJobExpectedFence =
  | "feature-sprint-plan"
  | "feature-prompt-localization"
  | "feature-prompt-critique"
  | "normalized-proof"
  | "feature-review-verdict"
  | "feature-spec-update";

export type FeatureSprintNextJob = {
  sliceId?: string;
  phase?: HarnessFeatureSprintSlicePhase;
  label: string;
  role: FeatureSprintNextJobRole;
  providerOptions: Array<"manual" | "cursor" | "chatgpt" | "codex" | "local" | "deepseek">;
  action: FeatureSprintNextJobAction;
  expectedOutputFence?: FeatureSprintNextJobExpectedFence;
  blockedReason?: string;
  requiresHumanApproval: boolean;
  requiresHumanImport: boolean;
  canMutateRepo: boolean;
  checklist: string[];
};

const VALID_SLICE_PHASES = new Set<HarnessFeatureSprintSlicePhase>([
  "ready",
  "localizing",
  "prompt_auditing",
  "implementing",
  "proof_pending",
  "reviewing",
  "spec_updating",
  "awaiting_spec_approval",
  "ready_to_advance",
  "done"
]);

const VALID_SLICE_STATUSES = new Set<HarnessFeatureSprintCurrentSliceStatus>([
  "ready",
  "active",
  "blocked",
  "done"
]);

const VALID_SLICE_SOURCES = new Set<HarnessFeatureSprintCurrentSliceSource>([
  "planned_step",
  "adopted_next_slice",
  "manual"
]);

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasOutput(run: HarnessFeatureSprintRunnerRun | undefined): boolean {
  return Boolean(cleanOptional(run?.outputText) ?? cleanOptional(run?.outputExcerpt));
}

function allStepsDone(plan: HarnessFeatureSprintPlan | undefined): boolean {
  return Boolean(plan && plan.steps.length > 0 && plan.steps.every((step) => step.status === "done"));
}

function hasCompletionProof(plan: HarnessFeatureSprintPlan | undefined): boolean {
  return Boolean(plan?.evidenceLogId || plan?.evidenceProofItemId);
}

export function getCurrentFeatureSprintStep(
  plan: HarnessFeatureSprintPlan | undefined
): HarnessFeatureSprintStep | undefined {
  if (!plan?.currentStepId) {
    return undefined;
  }
  return plan.steps.find((step) => step.id === plan.currentStepId);
}

export function coerceFeatureSprintSlicePhase(
  value: unknown
): HarnessFeatureSprintSlicePhase | undefined {
  if (typeof value !== "string" || !VALID_SLICE_PHASES.has(value as HarnessFeatureSprintSlicePhase)) {
    return undefined;
  }
  return value as HarnessFeatureSprintSlicePhase;
}

export function coerceFeatureSprintCurrentSliceStatus(
  value: unknown
): HarnessFeatureSprintCurrentSliceStatus | undefined {
  if (
    typeof value !== "string" ||
    !VALID_SLICE_STATUSES.has(value as HarnessFeatureSprintCurrentSliceStatus)
  ) {
    return undefined;
  }
  return value as HarnessFeatureSprintCurrentSliceStatus;
}

export function coerceFeatureSprintCurrentSliceSource(
  value: unknown
): HarnessFeatureSprintCurrentSliceSource | undefined {
  if (
    typeof value !== "string" ||
    !VALID_SLICE_SOURCES.has(value as HarnessFeatureSprintCurrentSliceSource)
  ) {
    return undefined;
  }
  return value as HarnessFeatureSprintCurrentSliceSource;
}

export function normalizeFeatureSprintCurrentSlice(
  slice: HarnessFeatureSprintCurrentSlice | undefined
): HarnessFeatureSprintCurrentSlice | undefined {
  if (!slice?.id?.trim() || !slice.title?.trim()) {
    return undefined;
  }
  const phase = coerceFeatureSprintSlicePhase(slice.phase);
  const status = coerceFeatureSprintCurrentSliceStatus(slice.status);
  const source = coerceFeatureSprintCurrentSliceSource(slice.source);
  if (!phase || !status || !source) {
    return undefined;
  }
  return {
    ...slice,
    id: slice.id.trim(),
    title: slice.title.trim(),
    summary: cleanOptional(slice.summary),
    phase,
    status,
    source,
    linkedStepId: cleanOptional(slice.linkedStepId),
    riskTier: slice.riskTier,
    expectedFiles: slice.expectedFiles?.filter(Boolean),
    createdAt: slice.createdAt,
    updatedAt: slice.updatedAt
  };
}

export function withCurrentSlicePhase(
  slice: HarnessFeatureSprintCurrentSlice,
  phase: HarnessFeatureSprintSlicePhase,
  timestamp: string
): HarnessFeatureSprintCurrentSlice {
  const status: HarnessFeatureSprintCurrentSliceStatus =
    phase === "done" ? "done" : slice.status === "done" ? "active" : slice.status;
  return {
    ...slice,
    phase,
    status,
    updatedAt: timestamp
  };
}

export type BuildCurrentSliceInput = {
  phase: HarnessFeatureSprintSlicePhase;
  source: HarnessFeatureSprintCurrentSliceSource;
  status?: HarnessFeatureSprintCurrentSliceStatus;
  riskTier?: "tiny" | "normal" | "risky";
  expectedFiles?: string[];
  sliceId?: string;
};

export function buildCurrentSliceForStep(
  step: HarnessFeatureSprintStep,
  input: BuildCurrentSliceInput,
  timestamp: string
): HarnessFeatureSprintCurrentSlice {
  const status =
    input.status ??
    (input.phase === "done" ? "done" : input.phase === "ready" ? "ready" : "active");
  return {
    id: input.sliceId ?? createId("feature_slice"),
    title: step.title.trim(),
    summary: cleanOptional(step.goal),
    status,
    phase: input.phase,
    source: input.source,
    linkedStepId: step.id,
    riskTier: input.riskTier,
    expectedFiles: input.expectedFiles,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function inferSlicePhaseFromLegacyState(
  plan: HarnessFeatureSprintPlan,
  step: HarnessFeatureSprintStep | undefined
): HarnessFeatureSprintSlicePhase | undefined {
  if (!step) {
    return undefined;
  }

  if (step.status === "done") {
    return "done";
  }

  if (
    step.reviewStatus === "accepted" &&
    doesFeatureSprintStepRequireSpecUpdate(plan, step) &&
    !hasApprovedSpecUpdateForStep(plan, step)
  ) {
    if (
      plan.latestSpecUpdate?.stepId === step.id &&
      hasPersistedFeatureSpec(plan) &&
      !isFeatureSpecApproved(plan)
    ) {
      return "awaiting_spec_approval";
    }
    return "spec_updating";
  }

  if (step.reviewStatus === "accepted" && step.status !== "done") {
    return "ready_to_advance";
  }

  if (step.reviewStatus || step.reviewVerdict) {
    return "reviewing";
  }

  if (hasStepImplementationProof(step)) {
    return "reviewing";
  }

  if (cleanOptional(step.outputSummary)) {
    return "proof_pending";
  }

  if (hasStepPromptAudit(step)) {
    return "implementing";
  }

  if (hasStepPromptLocalization(step)) {
    return "prompt_auditing";
  }

  if (plan.automationPhase === "localizing" && !hasStepPromptLocalization(step)) {
    return "localizing";
  }

  return "ready";
}

export function deriveCurrentSliceFromLegacyPlan(
  plan: HarnessFeatureSprintPlan,
  step?: HarnessFeatureSprintStep
): HarnessFeatureSprintCurrentSlice | undefined {
  const resolvedStep = step ?? getCurrentFeatureSprintStep(plan);
  if (!resolvedStep) {
    return undefined;
  }

  const phase = inferSlicePhaseFromLegacyState(plan, resolvedStep);
  if (!phase) {
    return undefined;
  }

  const timestamp = plan.updatedAt || resolvedStep.updatedAt;
  return buildCurrentSliceForStep(resolvedStep, {
    phase,
    source: "planned_step",
    status: phase === "done" ? "done" : "active",
    sliceId: `legacy-${resolvedStep.id}`
  }, timestamp);
}

export function resolveFeatureSprintCurrentSlice(
  plan: HarnessFeatureSprintPlan | undefined,
  step?: HarnessFeatureSprintStep
): HarnessFeatureSprintCurrentSlice | undefined {
  if (!plan) {
    return undefined;
  }

  const resolvedStep = step ?? getCurrentFeatureSprintStep(plan);
  const persisted = normalizeFeatureSprintCurrentSlice(plan.currentSlice);

  if (persisted) {
    if (resolvedStep && persisted.linkedStepId && persisted.linkedStepId !== resolvedStep.id) {
      return deriveCurrentSliceFromLegacyPlan(plan, resolvedStep);
    }
    if (resolvedStep && persisted.title !== resolvedStep.title.trim()) {
      return {
        ...persisted,
        title: resolvedStep.title.trim(),
        summary: cleanOptional(resolvedStep.goal)
      };
    }
    return persisted;
  }

  return deriveCurrentSliceFromLegacyPlan(plan, resolvedStep);
}

export function planPatchForCurrentSlicePhase(
  plan: HarnessFeatureSprintPlan,
  phase: HarnessFeatureSprintSlicePhase,
  timestamp: string,
  options: {
    source?: HarnessFeatureSprintCurrentSliceSource;
    riskTier?: "tiny" | "normal" | "risky";
    clear?: boolean;
  } = {}
): { currentSlice: HarnessFeatureSprintCurrentSlice | null } {
  if (options.clear) {
    return { currentSlice: null };
  }

  const step = getCurrentFeatureSprintStep(plan);
  if (!step) {
    return { currentSlice: null };
  }

  const existing = normalizeFeatureSprintCurrentSlice(plan.currentSlice);
  if (existing && existing.linkedStepId === step.id) {
    return {
      currentSlice: withCurrentSlicePhase(existing, phase, timestamp)
    };
  }

  return {
    currentSlice: buildCurrentSliceForStep(step, {
      phase,
      source: options.source ?? existing?.source ?? "planned_step",
      riskTier: options.riskTier ?? existing?.riskTier,
      sliceId: existing?.id
    }, timestamp)
  };
}

function baseJob(
  partial: Omit<FeatureSprintNextJob, "requiresHumanApproval" | "requiresHumanImport" | "canMutateRepo"> &
    Partial<Pick<FeatureSprintNextJob, "requiresHumanApproval" | "requiresHumanImport" | "canMutateRepo">>
): FeatureSprintNextJob {
  return {
    requiresHumanApproval: false,
    requiresHumanImport: false,
    canMutateRepo: false,
    checklist: [],
    ...partial
  };
}

export function resolveRunnerJobStartPhase(
  action: FeatureSprintNextJobAction
): HarnessFeatureSprintSlicePhase | undefined {
  switch (action) {
    case "copy_localization":
      return "localizing";
    case "copy_prompt_audit":
      return "prompt_auditing";
    case "copy_implementation":
      return "implementing";
    case "copy_review":
      return "reviewing";
    default:
      return undefined;
  }
}

export function findLatestLocalizationRunForStep(
  runs: HarnessFeatureSprintRunnerRun[],
  planId: string,
  stepId: string
): HarnessFeatureSprintRunnerRun | undefined {
  return runs.find(
    (run) =>
      isLocalizationProfile(run.profile) &&
      run.planId === planId &&
      run.stepId === stepId
  );
}

export function hasStagedLocalizationAwaitingImport(
  run: HarnessFeatureSprintRunnerRun | undefined,
  stagedImportText?: string
): boolean {
  if (stagedImportText?.trim()) {
    return true;
  }
  if (!run) {
    return false;
  }
  if (run.nextJobLifecycleStatus === "staged" && run.outputText?.trim()) {
    return true;
  }
  return run.status === "succeeded" && Boolean(run.outputText?.trim()) && !run.importedAt;
}

export function shouldRetryLocalizationJob(
  run: HarnessFeatureSprintRunnerRun | undefined,
  stagedImportText?: string
): boolean {
  if (hasStagedLocalizationAwaitingImport(run, stagedImportText)) {
    return false;
  }
  if (!run) {
    return true;
  }
  if (run.status === "failed" || run.nextJobLifecycleStatus === "failed") {
    return true;
  }
  if (run.status === "running" || run.nextJobLifecycleStatus === "started") {
    return true;
  }
  return true;
}

function jobForPhase(
  plan: HarnessFeatureSprintPlan,
  step: HarnessFeatureSprintStep,
  slice: HarnessFeatureSprintCurrentSlice,
  context: BuildNextJobContext
): FeatureSprintNextJob {
  const agentLabel = runnerAgentLabel(context.runnerAgent);

  switch (slice.phase) {
    case "ready": {
      if (hasPersistedFeatureSpec(plan) && !isFeatureSpecApproved(plan)) {
        return baseJob({
          sliceId: slice.id,
          phase: slice.phase,
          label: "Approve feature spec",
          role: "human",
          providerOptions: ["manual"],
          action: "approve_spec",
          requiresHumanApproval: true,
          checklist: ["Approve the persisted feature spec before localization or implementation."]
        });
      }
      if (!hasStepPromptLocalization(step) && !cleanOptional(step.outputSummary)) {
        return baseJob({
          sliceId: slice.id,
          phase: slice.phase,
          label: "Copy for Cursor localization",
          role: "localizer",
          providerOptions: ["cursor", "manual", "local"],
          action: "copy_localization",
          expectedOutputFence: "feature-prompt-localization",
          checklist: ["Optional read-only repo localization before implementation."]
        });
      }
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Copy for implementation",
        role: "implementer",
        providerOptions: ["cursor", "codex", "manual"],
        action: "copy_implementation",
        checklist: ["Copy the implementation packet or run in worktree."]
      });
    }
    case "localizing": {
      if (
        shouldRetryLocalizationJob(
          context.latestLocalizationRun,
          context.stagedLocalizationImportText
        )
      ) {
        return baseJob({
          sliceId: slice.id,
          phase: slice.phase,
          label: "Retry Cursor localization",
          role: "localizer",
          providerOptions: ["cursor", "manual", "local"],
          action: "copy_localization",
          expectedOutputFence: "feature-prompt-localization",
          checklist: ["Runner localization failed or has no staged output. Retry or copy manually."]
        });
      }
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Import localization",
        role: "localizer",
        providerOptions: ["cursor", "manual"],
        action: "import_localization",
        expectedOutputFence: "feature-prompt-localization",
        requiresHumanImport: true,
        checklist: ["Paste localization output, then import."]
      });
    }
    case "prompt_auditing":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Import prompt audit",
        role: "prompt_auditor",
        providerOptions: ["chatgpt", "codex", "manual", "local"],
        action: "import_prompt_critique",
        expectedOutputFence: "feature-prompt-critique",
        requiresHumanImport: true,
        checklist: ["Paste prompt critique output, then import."]
      });
    case "implementing":
      if (!cleanOptional(step.outputSummary) && hasOutput(context.latestImplementationRun)) {
        return baseJob({
          sliceId: slice.id,
          phase: slice.phase,
          label: "Save agent output",
          role: "human",
          providerOptions: ["manual"],
          action: "save_agent_output",
          requiresHumanApproval: true,
          checklist: ["Inspect run details, then save agent output."]
        });
      }
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: `Run implementation with ${agentLabel}`,
        role: "implementer",
        providerOptions: ["cursor", "codex", "manual"],
        action: "copy_implementation",
        canMutateRepo: true,
        checklist: ["Run bounded implementation in worktree or copy packet manually."]
      });
    case "proof_pending":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Normalize for review",
        role: "human",
        providerOptions: ["manual", "local"],
        action: "normalize_proof",
        expectedOutputFence: "normalized-proof",
        checklist: ["Normalize implementation proof before review."]
      });
    case "reviewing":
      if (
        cleanOptional(step.outputSummary) &&
        !step.reviewStatus &&
        !step.reviewVerdict &&
        hasOutput(context.latestReviewRun)
      ) {
        return baseJob({
          sliceId: slice.id,
          phase: slice.phase,
          label: "Import review verdict",
          role: "reviewer",
          providerOptions: ["chatgpt", "codex", "manual"],
          action: "import_review_verdict",
          expectedOutputFence: "feature-review-verdict",
          requiresHumanImport: true,
          checklist: ["Inspect review output, then import verdict."]
        });
      }
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: `Run review with ${agentLabel}`,
        role: "reviewer",
        providerOptions: ["chatgpt", "codex", "manual", "local", "deepseek"],
        action: "copy_review",
        checklist: ["Copy review packet to a separate reviewer worker."]
      });
    case "spec_updating":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Import spec update",
        role: "spec_updater",
        providerOptions: ["chatgpt", "codex", "manual"],
        action: "import_spec_update",
        expectedOutputFence: "feature-spec-update",
        requiresHumanImport: true,
        checklist: ["Paste architect spec update, then import."]
      });
    case "awaiting_spec_approval":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Approve revised feature spec",
        role: "human",
        providerOptions: ["manual"],
        action: "approve_revised_spec",
        requiresHumanApproval: true,
        checklist: ["Approve revised spec before advancing."]
      });
    case "ready_to_advance":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Advance step",
        role: "human",
        providerOptions: ["manual"],
        action: "advance_slice",
        requiresHumanApproval: true,
        checklist: ["Review accepted and spec gate satisfied. Advance manually."]
      });
    case "done":
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Inspect feature sprint",
        role: "human",
        providerOptions: ["manual"],
        action: "mark_complete",
        checklist: ["Current slice is done."]
      });
    default:
      return baseJob({
        sliceId: slice.id,
        phase: slice.phase,
        label: "Inspect feature sprint",
        role: "human",
        providerOptions: ["manual"],
        action: "mark_complete",
        checklist: ["Check active plan controls."]
      });
  }
}

type BuildNextJobContext = {
  data: LifeHarnessData;
  cardId: string;
  plan?: HarnessFeatureSprintPlan;
  step?: HarnessFeatureSprintStep;
  runnerHealth: "unknown" | "available" | "unavailable";
  runnerAgent: FeatureSprintRunnerAgent;
  latestScopingRun?: HarnessFeatureSprintRunnerRun;
  latestImplementationRun?: HarnessFeatureSprintRunnerRun;
  latestReviewRun?: HarnessFeatureSprintRunnerRun;
  latestLocalizationRun?: HarnessFeatureSprintRunnerRun;
  stagedLocalizationImportText?: string;
};

export function buildNextFeatureSprintJob(
  data: LifeHarnessData,
  cardId: string,
  options: {
    runnerHealth?: "unknown" | "available" | "unavailable";
    runnerAgent?: FeatureSprintRunnerAgent;
    stagedLocalizationImportText?: string;
  } = {}
): FeatureSprintNextJob | undefined {
  const runnerHealth = options.runnerHealth ?? "unknown";
  const runnerAgent = options.runnerAgent ?? "codex";
  const plan =
    getActiveFeatureSprintPlanForCard(data, cardId) ??
    data.featureSprintPlans
      .filter((item) => item.cardId === cardId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const step = getCurrentFeatureSprintStep(plan);
  const project = getProjectForCard(data, cardId);
  const repoPath = cleanOptional(project?.repoPath);
  const recentRuns = getFeatureSprintRunnerRunsForCard(data, cardId, 20);
  const runScope = plan ? { planId: plan.id, stepId: step?.id } : {};

  const context: BuildNextJobContext = {
    data,
    cardId,
    plan,
    step,
    runnerHealth,
    runnerAgent,
    latestScopingRun: recentRuns.find((run) => isScopingProfile(run.profile)),
    latestImplementationRun: recentRuns.find(
      (run) =>
        isImplementationProfile(run.profile) &&
        (!runScope.planId || run.planId === runScope.planId) &&
        (!runScope.stepId || run.stepId === runScope.stepId)
    ),
    latestReviewRun: recentRuns.find(
      (run) =>
        isReviewProfile(run.profile) &&
        (!runScope.planId || run.planId === runScope.planId) &&
        (!runScope.stepId || run.stepId === runScope.stepId)
    ),
    latestLocalizationRun:
      plan && step
        ? findLatestLocalizationRunForStep(recentRuns, plan.id, step.id)
        : undefined,
    stagedLocalizationImportText: options.stagedLocalizationImportText
  };

  if (plan?.status === "done" && hasCompletionProof(plan)) {
    return baseJob({
      label: "Inspect proof",
      role: "human",
      providerOptions: ["manual"],
      action: "mark_complete",
      checklist: ["Feature sprint complete. Inspect proof ledger."]
    });
  }

  if (!project || !repoPath) {
    return baseJob({
      label: "Add project metadata",
      role: "human",
      providerOptions: ["manual"],
      action: "setup_project",
      blockedReason: "Missing project metadata or repo path.",
      checklist: ["Add project metadata and repo path."]
    });
  }

  if (runnerHealth !== "available") {
    return baseJob({
      label: "Check runner",
      role: "human",
      providerOptions: ["manual"],
      action: "check_runner",
      blockedReason: "Runner health not confirmed.",
      checklist: ["Check runner or copy packets manually."]
    });
  }

  if (!plan && context.latestScopingRun && !context.latestScopingRun.importedAt) {
    return baseJob({
      label: "Import plan",
      role: "architect",
      providerOptions: ["chatgpt", "codex", "manual"],
      action: "import_plan",
      expectedOutputFence: "feature-sprint-plan",
      requiresHumanImport: true,
      checklist: ["Inspect scoping output, then import plan."]
    });
  }

  if (!plan) {
    return baseJob({
      label: "Run scoping",
      role: "architect",
      providerOptions: ["chatgpt", "codex", "manual", "local"],
      action: "run_scoping",
      checklist: ["Run scoping or copy scoping packet."]
    });
  }

  if (!step && canAdoptNextSliceProposal(plan)) {
    return baseJob({
      label: "Adopt proposed next slice",
      role: "human",
      providerOptions: ["manual"],
      action: "adopt_next_slice",
      requiresHumanApproval: true,
      checklist: [`Review "${plan.nextSliceProposal!.title}", then adopt.`]
    });
  }

  if (!step && (plan.status === "reviewing" || allStepsDone(plan))) {
    return baseJob({
      label: "Mark feature complete",
      role: "human",
      providerOptions: ["manual"],
      action: "mark_complete",
      requiresHumanApproval: true,
      checklist: ["Mark feature complete when ready."]
    });
  }

  if (!step || !plan) {
    return undefined;
  }

  const slice = resolveFeatureSprintCurrentSlice(plan, step);
  if (!slice) {
    return undefined;
  }

  return jobForPhase(plan, step, slice, context);
}

export function mapFeatureSprintNextJobToDogfoodAction(job: FeatureSprintNextJob): {
  kind: FeatureSprintDogfoodNextActionKind;
  label: string;
  detail: string;
} {
  const detail =
    job.checklist.length > 0 ? job.checklist.join(" ") : job.label;

  switch (job.action) {
    case "setup_project":
      return {
        kind: "add_project_metadata",
        label: job.label,
        detail
      };
    case "check_runner":
      return {
        kind: "check_runner",
        label: job.label,
        detail
      };
    case "run_scoping":
      return {
        kind: "run_scoping",
        label: job.label,
        detail
      };
    case "import_plan":
      return {
        kind: "import_plan",
        label: job.label,
        detail
      };
    case "approve_spec":
    case "approve_revised_spec":
      return {
        kind: "approve_feature_spec",
        label: job.label,
        detail
      };
    case "copy_localization":
    case "copy_prompt_audit":
    case "import_localization":
    case "import_prompt_critique":
    case "import_spec_update":
      return {
        kind: "manual",
        label: job.label,
        detail
      };
    case "copy_implementation":
      return {
        kind: "run_implementation",
        label: job.label,
        detail
      };
    case "save_agent_output":
      return {
        kind: "save_agent_output",
        label: job.label,
        detail
      };
    case "normalize_proof":
      return {
        kind: "save_agent_output",
        label: job.label,
        detail
      };
    case "copy_review":
    case "import_review_verdict":
      if (job.action === "import_review_verdict") {
        return {
          kind: "import_review",
          label: job.label,
          detail
        };
      }
      return {
        kind: "run_review",
        label: job.label,
        detail
      };
    case "advance_slice":
      return {
        kind: "advance_step",
        label: job.label,
        detail
      };
    case "adopt_next_slice":
      return {
        kind: "adopt_next_slice",
        label: job.label,
        detail
      };
    case "mark_complete":
      return {
        kind: job.label === "Inspect proof" ? "inspect_proof" : "complete_feature",
        label: job.label,
        detail
      };
    default:
      return {
        kind: "manual",
        label: job.label,
        detail
      };
  }
}

export function formatFeatureSprintSlicePhaseLabel(
  phase: HarnessFeatureSprintSlicePhase
): string {
  return phase.replaceAll("_", " ");
}
