import { shouldIncludeCard } from "./contextPacketRedaction";
import {
  getActiveFeatureSprintPlanForCard,
  hasPersistedFeatureSpec,
  hasStepPromptAudit,
  hasStepImplementationProof,
  hasStepPromptLocalization,
  isFeatureSpecApproved
} from "./featureSprintOrchestrator";
import { getFeatureSprintRunnerRunsForCard } from "./featureSprintRunnerHistory";
import type { FeatureSprintRunnerHealthProbe } from "./featureSprintRunnerHealth";
import { formatRunnerHealthCapabilityLine } from "./featureSprintRunnerHealth";
import type { FeatureSprintRunnerPhase } from "./featureSprintRunner";
import {
  isImplementationProfile,
  isPromptAuditProfile,
  isReviewProfile,
  isScopingProfile,
  runnerAgentLabel,
  type FeatureSprintRunnerAgent,
  type FeatureSprintRunnerProfile
} from "./featureSprintRunner";
import type { LifeHarnessData } from "./lifeHarnessData";
import { getProjectForCard } from "./projectRegistry";
import type {
  HarnessFeatureSprintPlan,
  HarnessFeatureSprintRunnerRun,
  HarnessFeatureSprintStep,
  LifeCard
} from "./types";

export type FeatureSprintDogfoodCheckStatus =
  | "ready"
  | "missing"
  | "warning"
  | "done"
  | "blocked";

export type FeatureSprintDogfoodCheck = {
  id: string;
  label: string;
  status: FeatureSprintDogfoodCheckStatus;
  detail: string;
  targetRoute?: string;
};

export type FeatureSprintDogfoodNextAction = {
  label: string;
  detail: string;
  kind:
    | "add_project_metadata"
    | "check_runner"
    | "run_scoping"
    | "import_plan"
    | "approve_feature_spec"
    | "run_implementation"
    | "save_agent_output"
    | "run_review"
    | "import_review"
    | "advance_step"
    | "complete_feature"
    | "inspect_proof"
    | "manual";
};

export type FeatureSprintDogfoodNextActionKind = FeatureSprintDogfoodNextAction["kind"];

export type FeatureSprintDogfoodOverallStatus =
  | "not_ready"
  | "ready"
  | "in_progress"
  | "needs_review"
  | "complete";

export type FeatureSprintDogfoodSummary = {
  cardId: string;
  cardTitle: string;
  overallStatus: FeatureSprintDogfoodOverallStatus;
  checks: FeatureSprintDogfoodCheck[];
  nextAction: FeatureSprintDogfoodNextAction;
};

type RunnerHealth = "unknown" | "available" | "unavailable";

type BuildContext = {
  data: LifeHarnessData;
  cardId: string;
  card?: LifeCard;
  plan?: HarnessFeatureSprintPlan;
  step?: HarnessFeatureSprintStep;
  runnerHealth: RunnerHealth;
  runnerHealthProbe?: FeatureSprintRunnerHealthProbe;
  runnerAgent: FeatureSprintRunnerAgent;
  latestScopingRun?: HarnessFeatureSprintRunnerRun;
  latestImplementationRun?: HarnessFeatureSprintRunnerRun;
  latestReviewRun?: HarnessFeatureSprintRunnerRun;
};

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasOutput(run: HarnessFeatureSprintRunnerRun | undefined): boolean {
  return Boolean(cleanOptional(run?.outputText) ?? cleanOptional(run?.outputExcerpt));
}

function hasImplementationMetadata(run: HarnessFeatureSprintRunnerRun | undefined): boolean {
  return Boolean(
    cleanOptional(run?.worktreePath) ||
      cleanOptional(run?.diffStat) ||
      (run?.changedFiles?.length ?? 0) > 0
  );
}

function allStepsDone(plan: HarnessFeatureSprintPlan | undefined): boolean {
  return Boolean(plan && plan.steps.length > 0 && plan.steps.every((step) => step.status === "done"));
}

function hasCompletionProof(plan: HarnessFeatureSprintPlan | undefined): boolean {
  return Boolean(plan?.evidenceLogId || plan?.evidenceProofItemId);
}

function currentStep(plan: HarnessFeatureSprintPlan | undefined): HarnessFeatureSprintStep | undefined {
  if (!plan) {
    return undefined;
  }
  if (plan.currentStepId) {
    return plan.steps.find((step) => step.id === plan.currentStepId);
  }
  return undefined;
}

function getLatestFeatureSprintPlanForCard(
  data: LifeHarnessData,
  cardId: string
): HarnessFeatureSprintPlan | undefined {
  return [...data.featureSprintPlans]
    .filter((plan) => plan.cardId === cardId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function matchesRunnerPhase(profile: FeatureSprintRunnerProfile, phase: FeatureSprintRunnerPhase): boolean {
  if (phase === "scoping") {
    return isScopingProfile(profile);
  }
  if (phase === "review") {
    return isReviewProfile(profile);
  }
  if (phase === "prompt_audit") {
    return isPromptAuditProfile(profile);
  }
  return isImplementationProfile(profile);
}

function latestRunForPhase(
  runs: HarnessFeatureSprintRunnerRun[],
  phase: FeatureSprintRunnerPhase,
  options: { planId?: string; stepId?: string } = {}
): HarnessFeatureSprintRunnerRun | undefined {
  return runs.find((run) => {
    if (!matchesRunnerPhase(run.profile, phase)) {
      return false;
    }
    if (options.planId !== undefined && run.planId !== options.planId) {
      return false;
    }
    if (options.stepId !== undefined && run.stepId !== options.stepId) {
      return false;
    }
    return run.status === "succeeded";
  });
}

function buildMissingCardSummary(cardId: string): FeatureSprintDogfoodSummary {
  return {
    cardId,
    cardTitle: "Missing card",
    overallStatus: "not_ready",
    checks: [
      {
        id: "card",
        label: "Card exists",
        status: "blocked",
        detail: "This card is not present in current Life Harness state."
      }
    ],
    nextAction: {
      kind: "manual",
      label: "Open Board",
      detail: "Return to the board and choose an existing card before running the builder loop."
    }
  };
}

function buildChecks(context: BuildContext): FeatureSprintDogfoodCheck[] {
  const { data, cardId, card, plan, step, runnerHealth } = context;
  const project = getProjectForCard(data, cardId);
  const repoPath = cleanOptional(project?.repoPath);
  const verifyCommands = project?.verificationCommands?.filter((command) => command.trim()) ?? [];
  const latestImplementationRun = context.latestImplementationRun;
  const latestReviewRun = context.latestReviewRun;

  const checks: FeatureSprintDogfoodCheck[] = [];

  checks.push({
    id: "card",
    label: "Card can use builder loop",
    status: card && shouldIncludeCard(card) ? "ready" : "blocked",
    detail: card && shouldIncludeCard(card) ? "Card is present and not redacted." : "S3/redacted cards are blocked from feature sprint automation."
  });

  checks.push({
    id: "project",
    label: "Project metadata",
    status: project ? "ready" : "missing",
    detail: project ? `Project: ${project.name}` : "Add project metadata in this Backroom before scoping."
  });

  checks.push({
    id: "repo_path",
    label: "Repo path",
    status: repoPath ? "ready" : "missing",
    detail: repoPath ? repoPath : "Add a repo path so implementation can run in an isolated worktree."
  });

  checks.push({
    id: "verification_commands",
    label: "Verification commands",
    status: verifyCommands.length > 0 ? "ready" : "warning",
    detail:
      verifyCommands.length > 0
        ? `${verifyCommands.length} command${verifyCommands.length === 1 ? "" : "s"} configured.`
        : "No verification commands configured; implementation can run, but verification capture will be thin."
  });

  checks.push({
    id: "runner_health",
    label: "Local runner",
    status: runnerHealth === "available" ? "ready" : "warning",
    detail:
      runnerHealth === "available"
        ? context.runnerHealthProbe
          ? `Runner checked: ${formatRunnerHealthCapabilityLine(context.runnerHealthProbe)}`
          : "Runner was checked and is available."
        : runnerHealth === "unavailable"
          ? context.runnerHealthProbe?.error ??
            "Runner is unavailable. Open Runner setup in Start feature step 2, or copy packets manually."
          : "Runner has not been checked in this session. Use Check runner in Start feature step 2."
  });

  checks.push({
    id: "active_plan",
    label: "Active feature sprint plan",
    status: plan ? "ready" : context.latestScopingRun && !context.latestScopingRun.importedAt ? "warning" : "missing",
    detail: plan
      ? `${plan.title} (${plan.status}).`
      : context.latestScopingRun && !context.latestScopingRun.importedAt
        ? "Scoping output exists; import the plan to continue."
        : "No active plan yet. Run scoping or copy a scoping packet."
  });

  checks.push({
    id: "feature_spec",
    label: "Persisted feature spec",
    status: hasPersistedFeatureSpec(plan) ? "ready" : "missing",
    detail: hasPersistedFeatureSpec(plan)
      ? `Spec saved (${plan?.featureSpec?.source ?? "manual"}).`
      : "Save a ChatGPT web spec on the plan before approving."
  });

  checks.push({
    id: "feature_spec_approval",
    label: "Feature spec approval",
    status: !hasPersistedFeatureSpec(plan)
      ? "missing"
      : isFeatureSpecApproved(plan)
        ? "done"
        : "warning",
    detail: !hasPersistedFeatureSpec(plan)
      ? "No persisted spec yet."
      : isFeatureSpecApproved(plan)
        ? "Spec is approved for implementation."
        : "Approve the persisted spec before running implementation."
  });

  checks.push({
    id: "current_step",
    label: "Current step",
    status: step ? (step.status === "done" ? "done" : "ready") : plan && (plan.status === "reviewing" || allStepsDone(plan)) ? "done" : "missing",
    detail: step
      ? `${step.title} (${step.status}).`
      : plan
        ? "No current step is selected; the plan is at completion/review gate."
        : "Import a plan before choosing an implementation step."
  });

  checks.push({
    id: "step_localization",
    label: "Cursor localization",
    status: !step
      ? "missing"
      : hasStepPromptLocalization(step)
        ? "ready"
        : "warning",
    detail: !step
      ? "No current step for localization."
      : hasStepPromptLocalization(step)
        ? "Localization saved on the current step (optional inner loop)."
        : "Optional: copy localization packet, run Cursor read-only, then import."
  });

  checks.push({
    id: "step_prompt_audit",
    label: "Prompt audit",
    status: !step
      ? "missing"
      : hasStepPromptAudit(step)
        ? step.promptAudit?.verdict === "tighten_first"
          ? "warning"
          : "ready"
        : "warning",
    detail: !step
      ? "No current step for prompt audit."
      : hasStepPromptAudit(step)
        ? step.promptAudit?.verdict === "tighten_first"
          ? "Audit saved (review needed — tighten first). Implementation is not blocked."
          : "Audited implementation prompt saved for this step."
        : "Optional: copy prompt audit packet, run GPT/Codex, then import."
  });

  checks.push({
    id: "implementation_run",
    label: "Implementation runner output",
    status: hasOutput(latestImplementationRun) ? "ready" : step?.outputSummary ? "done" : "missing",
    detail: hasOutput(latestImplementationRun)
      ? "Latest implementation run has output ready to inspect/save."
      : step?.outputSummary
        ? "Implementation output is already saved on the current step."
        : "Run implementation in worktree or paste agent output manually."
  });

  checks.push({
    id: "implementation_metadata",
    label: "Worktree/diff metadata",
    status: hasImplementationMetadata(latestImplementationRun) ? "ready" : hasOutput(latestImplementationRun) ? "warning" : "missing",
    detail: hasImplementationMetadata(latestImplementationRun)
      ? "Latest implementation run captured worktree/diff metadata."
      : hasOutput(latestImplementationRun)
        ? "Implementation output exists, but worktree/diff metadata is thin."
        : "No implementation metadata yet."
  });

  checks.push({
    id: "verification_results",
    label: "Verification results",
    status: latestImplementationRun?.verificationResults?.length ? "ready" : verifyCommands.length > 0 ? "warning" : "warning",
    detail: latestImplementationRun?.verificationResults?.length
      ? `${latestImplementationRun.verificationResults.length} verification result${latestImplementationRun.verificationResults.length === 1 ? "" : "s"} captured.`
      : verifyCommands.length > 0
        ? "Verification commands are configured, but no implementation verification results are captured yet."
        : "Verification capture is unavailable until project commands are configured."
  });

  checks.push({
    id: "step_output",
    label: "Saved step output",
    status: step?.outputSummary ? "ready" : "missing",
    detail: step?.outputSummary ? "Current step has saved agent output." : "Save agent output after inspecting the runner result."
  });

  checks.push({
    id: "step_implementation_proof",
    label: "Implementation proof",
    status: !step?.outputSummary
      ? "missing"
      : hasStepImplementationProof(step)
        ? "ready"
        : "warning",
    detail: !step?.outputSummary
      ? "Save agent output before normalizing proof."
      : hasStepImplementationProof(step)
        ? "Normalized proof saved for review (optional but recommended)."
        : "Optional: normalize proof for review before running review."
  });

  checks.push({
    id: "review_output",
    label: "Review output",
    status: step?.reviewVerdict ? "done" : hasOutput(latestReviewRun) ? "ready" : step?.outputSummary ? "missing" : "missing",
    detail: step?.reviewVerdict
      ? "Review verdict is saved on the current step."
      : hasOutput(latestReviewRun)
        ? "Latest review run has output ready to import."
        : step?.outputSummary
          ? "Run review with Codex or copy a review packet."
          : "Save implementation output before review."
  });

  checks.push({
    id: "review_verdict",
    label: "Imported review verdict",
    status: step?.reviewStatus ? (step.reviewStatus === "accepted" ? "ready" : "warning") : "missing",
    detail: step?.reviewStatus
      ? `Review status: ${step.reviewStatus}.`
      : "Import a review verdict before advancing."
  });

  checks.push({
    id: "advance_gate",
    label: "Advance gate",
    status: step?.reviewStatus === "accepted" && step.status !== "done" ? "ready" : step?.status === "done" ? "done" : "missing",
    detail:
      step?.reviewStatus === "accepted" && step.status !== "done"
        ? "Step is accepted and ready to advance."
        : step?.status === "done"
          ? "Current step is already done."
          : "Advance only after an accepted review."
  });

  checks.push({
    id: "completion_proof",
    label: "Completion proof",
    status: hasCompletionProof(plan) ? "done" : plan?.status === "done" ? "warning" : allStepsDone(plan) || plan?.status === "reviewing" ? "ready" : "missing",
    detail: hasCompletionProof(plan)
      ? "Completion proof is linked to the plan."
      : plan?.status === "done"
        ? "Plan is done but proof linkage is missing."
        : allStepsDone(plan) || plan?.status === "reviewing"
          ? "Plan is ready to mark complete."
          : "Complete the feature sprint after accepted steps are advanced."
  });

  return checks;
}

function blockedBySetup(context: BuildContext): boolean {
  const project = getProjectForCard(context.data, context.cardId);
  return !project || !cleanOptional(project.repoPath);
}

function buildNextAction(context: BuildContext): FeatureSprintDogfoodNextAction {
  const { data, cardId, plan, step, runnerHealth } = context;
  const agentLabel = runnerAgentLabel(context.runnerAgent);
  const project = getProjectForCard(data, cardId);
  const repoPath = cleanOptional(project?.repoPath);

  if (plan?.status === "done" && hasCompletionProof(plan)) {
    return {
      kind: "inspect_proof",
      label: "Inspect proof",
      detail: "Feature sprint is complete. Open the proof ledger to inspect the evidence."
    };
  }

  if (!project || !repoPath) {
    return {
      kind: "add_project_metadata",
      label: "Add project metadata",
      detail: "Add project metadata and a repo path in the Project metadata section below."
    };
  }

  if (runnerHealth !== "available") {
    return {
      kind: "check_runner",
      label: "Check runner",
      detail:
        runnerHealth === "unavailable"
          ? "Open Runner setup in Start feature step 2 for fix commands, or copy packets manually."
          : "Use Check runner in Start feature step 2 before running scoping or implementation."
    };
  }

  if (!plan && context.latestScopingRun && !context.latestScopingRun.importedAt) {
    return {
      kind: "import_plan",
      label: "Import plan",
      detail: "Scoping output exists. Inspect it, then use Import plan below."
    };
  }

  if (!plan) {
    return {
      kind: "run_scoping",
      label: "Run scoping",
      detail:
        "Use the Start feature panel: paste a rough spec if helpful, then run scoping with the selected runner agent or copy the scoping packet."
    };
  }

  if (!step && (plan.status === "reviewing" || allStepsDone(plan))) {
    return {
      kind: "complete_feature",
      label: "Mark feature complete",
      detail: "All implementation steps are past the current-step gate. Add final proof and mark the feature complete."
    };
  }

  if (step && !step.outputSummary && hasOutput(context.latestImplementationRun)) {
    return {
      kind: "save_agent_output",
      label: "Save agent output",
      detail:
        "Open View details on the run, inspect output/diff/verification, then Save agent output below."
    };
  }

  if (
    plan &&
    hasPersistedFeatureSpec(plan) &&
    !isFeatureSpecApproved(plan) &&
    step &&
    (step.status === "ready" || step.status === "planned") &&
    !step.outputSummary
  ) {
    return {
      kind: "approve_feature_spec",
      label: "Approve feature spec",
      detail:
        "Persisted feature spec is not approved yet. Approve it before running implementation in worktree."
    };
  }

  if (step && (step.status === "ready" || step.status === "planned") && !step.outputSummary) {
    return {
      kind: "run_implementation",
      label: "Run implementation in worktree",
      detail: `Optional: copy/import localization and prompt audit first. Then use Run implementation with ${agentLabel} below, or copy the implementation prompt for manual agent work.`
    };
  }

  if (step?.outputSummary && !step.reviewStatus && !step.reviewVerdict && hasOutput(context.latestReviewRun)) {
    return {
      kind: "import_review",
      label: "Import review verdict",
      detail: "Review output exists. Inspect it, then use Import review verdict below."
    };
  }

  if (step?.outputSummary && !step.reviewStatus && !step.reviewVerdict) {
    return {
      kind: "run_review",
      label: "Run review",
      detail: `Use Run review with ${agentLabel} below, or copy the review packet for manual review.`
    };
  }

  if (step?.reviewStatus === "accepted" && step.status !== "done") {
    return {
      kind: "advance_step",
      label: "Advance step",
      detail: "The review accepted this step. Use Advance step below."
    };
  }

  if (allStepsDone(plan) || (plan.status === "reviewing" && !step)) {
    return {
      kind: "complete_feature",
      label: "Mark feature complete",
      detail: "The plan is at the completion gate. Use Mark feature complete below."
    };
  }

  return {
    kind: "manual",
    label: "Inspect feature sprint",
    detail: "Check the active plan, recent runner runs, and manual controls below."
  };
}

function buildOverallStatus(context: BuildContext): FeatureSprintDogfoodOverallStatus {
  const { plan, step } = context;

  if (plan?.status === "done" && hasCompletionProof(plan)) {
    return "complete";
  }

  if (blockedBySetup(context)) {
    return "not_ready";
  }

  if (step?.reviewStatus === "accepted" || (step?.outputSummary && !step.reviewStatus)) {
    return "needs_review";
  }

  if (plan) {
    return "in_progress";
  }

  return "ready";
}

export function buildFeatureSprintDogfoodSummary(
  data: LifeHarnessData,
  cardId: string,
  options: {
    runnerHealth?: RunnerHealth;
    runnerHealthProbe?: FeatureSprintRunnerHealthProbe;
    runnerAgent?: FeatureSprintRunnerAgent;
    now?: Date;
  } = {}
): FeatureSprintDogfoodSummary {
  void options.now;
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) {
    return buildMissingCardSummary(cardId);
  }

  const plan =
    getActiveFeatureSprintPlanForCard(data, cardId) ??
    getLatestFeatureSprintPlanForCard(data, cardId);
  const step = currentStep(plan);
  const recentRuns = getFeatureSprintRunnerRunsForCard(data, cardId, 20);
  const runScope = plan
    ? {
        planId: plan.id,
        stepId: step?.id
      }
    : {};
  const context: BuildContext = {
    data,
    cardId,
    card,
    plan,
    step,
    runnerHealth: options.runnerHealth ?? "unknown",
    runnerHealthProbe: options.runnerHealthProbe,
    runnerAgent: options.runnerAgent ?? "codex",
    latestScopingRun: latestRunForPhase(recentRuns, "scoping"),
    latestImplementationRun: latestRunForPhase(recentRuns, "implementation", runScope),
    latestReviewRun: latestRunForPhase(recentRuns, "review", runScope)
  };

  const checks = buildChecks(context);
  const redacted = !shouldIncludeCard(card);
  if (redacted) {
    return {
      cardId,
      cardTitle: card.title,
      overallStatus: "not_ready",
      checks,
      nextAction: {
        kind: "manual",
        label: "Use manual handling",
        detail: "This card is S3/redacted, so the feature sprint builder loop is blocked."
      }
    };
  }

  return {
    cardId,
    cardTitle: card.title,
    overallStatus: buildOverallStatus(context),
    checks,
    nextAction: buildNextAction(context)
  };
}
