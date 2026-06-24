import {
  buildFeatureScopingPacket,
  buildFeatureStepImplementationPacket,
  buildFeatureStepLocalizationPacket,
  buildFeatureStepPromptAuditPacket,
  buildFeatureStepReviewPacket,
  buildFeatureStepSpecUpdatePacket,
  getActiveFeatureSprintPlanForCard,
  type FeaturePacketBuildResult
} from "./featureSprintOrchestrator";
import { buildFeatureSprintAutomatedReviewPacket } from "./featureSprintReviewerAdapter";
import type { FeatureSprintDeepSeekConfig } from "./featureSprintDeepSeekConfig";
import {
  buildNextFeatureSprintJob,
  resolveFeatureSprintCurrentSlice,
  type FeatureSprintNextJob,
  type FeatureSprintNextJobAction,
  type FeatureSprintNextJobExpectedFence,
  type FeatureSprintNextJobRole
} from "./featureSprintCurrentSlice";
export { resolveRunnerJobStartPhase } from "./featureSprintCurrentSlice";
import {
  buildRunnerProfile,
  type FeatureSprintRunnerAgent,
  type FeatureSprintRunnerProfile,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "./featureSprintRunner";
import { getProjectForCard } from "./projectRegistry";
import type { LifeHarnessData } from "./lifeHarnessData";
import type { HarnessFeatureSprintSlicePhase } from "./types";

export type FeatureSprintRunnerJobProvider =
  | "manual"
  | "cursor"
  | "chatgpt"
  | "codex"
  | "local"
  | "deepseek";

export type FeatureSprintRunnerJobLifecycleStatus =
  | "prepared"
  | "started"
  | "completed"
  | "failed"
  | "staged"
  | "human_required";

export type FeatureSprintRunnerJobEphemeralLifecycle = {
  status: FeatureSprintRunnerJobLifecycleStatus;
  action: FeatureSprintNextJobAction;
  provider?: FeatureSprintRunnerJobProvider;
  expectedOutputFence?: FeatureSprintNextJobExpectedFence;
};

export type FeatureSprintRunnerJobStagingTarget =
  | "plan"
  | "localization"
  | "prompt_audit"
  | "implementation"
  | "review"
  | "spec_update"
  | "none";

export type FeatureSprintNextJobButtonMode =
  | "runner"
  | "manual"
  | "human_gate"
  | "automated_review";

const DEEPSEEK_ELIGIBLE_ACTIONS = new Set<FeatureSprintNextJobAction>(["copy_review"]);

export type FeatureSprintRunnerJobRequest = {
  cardId: string;
  planId?: string;
  stepId?: string;
  sliceId?: string;
  phase?: HarnessFeatureSprintSlicePhase;
  action: FeatureSprintNextJobAction;
  role: FeatureSprintNextJobRole;
  provider: FeatureSprintRunnerJobProvider;
  expectedOutputFence?: FeatureSprintNextJobExpectedFence;
  inputPacket: string;
  runnerProfile?: FeatureSprintRunnerProfile;
  canMutateRepo: boolean;
  requiresHumanImport: boolean;
  requiresHumanApproval: boolean;
  worktree?: FeatureSprintRunnerRequest["worktree"];
  verificationCommands?: string[];
};

export type FeatureSprintRunnerJobPrepareResult =
  | { ok: true; request: FeatureSprintRunnerJobRequest; job: FeatureSprintNextJob }
  | {
      ok: false;
      reason: "no_job" | "human_required" | "packet_error";
      job?: FeatureSprintNextJob;
      error?: string;
    };

export type FeatureSprintRunnerJobResult = {
  ok: boolean;
  provider: FeatureSprintRunnerJobProvider;
  role: FeatureSprintNextJobRole;
  action: FeatureSprintNextJobAction;
  outputText?: string;
  outputFence?: FeatureSprintNextJobExpectedFence;
  summary?: string;
  error?: string;
  lifecycleStatus?: FeatureSprintRunnerJobLifecycleStatus;
  stagedForImport?: boolean;
};

const HUMAN_ONLY_ACTIONS = new Set<FeatureSprintNextJobAction>([
  "approve_spec",
  "approve_revised_spec",
  "advance_slice",
  "adopt_next_slice",
  "mark_complete",
  "save_agent_output",
  "normalize_proof",
  "setup_project",
  "check_runner",
  "import_plan",
  "import_localization",
  "import_prompt_critique",
  "import_review_verdict"
]);

const RUNNER_CAPABLE_ACTIONS = new Set<FeatureSprintNextJobAction>([
  "run_scoping",
  "copy_localization",
  "copy_prompt_audit",
  "copy_implementation",
  "copy_review",
  "import_spec_update"
]);

export function isHumanOnlyFeatureSprintRunnerJobAction(
  action: FeatureSprintNextJobAction
): boolean {
  return HUMAN_ONLY_ACTIONS.has(action);
}

export function isRunnerCapableFeatureSprintJobAction(
  action: FeatureSprintNextJobAction
): boolean {
  return RUNNER_CAPABLE_ACTIONS.has(action);
}

export function getFeatureSprintRunnerJobStagingTarget(
  action: FeatureSprintNextJobAction
): FeatureSprintRunnerJobStagingTarget {
  switch (action) {
    case "run_scoping":
    case "import_plan":
      return "plan";
    case "copy_localization":
    case "import_localization":
      return "localization";
    case "copy_prompt_audit":
    case "import_prompt_critique":
      return "prompt_audit";
    case "copy_implementation":
    case "save_agent_output":
      return "implementation";
    case "copy_review":
    case "import_review_verdict":
      return "review";
    case "import_spec_update":
      return "spec_update";
    default:
      return "none";
  }
}

function isDeepSeekEligibleForJob(
  job: FeatureSprintNextJob,
  deepseekConfig?: FeatureSprintDeepSeekConfig
): boolean {
  return (
    deepseekConfig?.available === true &&
    DEEPSEEK_ELIGIBLE_ACTIONS.has(job.action) &&
    job.providerOptions.includes("deepseek")
  );
}

export function resolveFeatureSprintRunnerProvider(
  job: FeatureSprintNextJob,
  options: {
    preferredAgent?: FeatureSprintRunnerAgent;
    preferredProvider?: FeatureSprintRunnerJobProvider;
    runnerHealth?: "unknown" | "available" | "unavailable";
    deepseekConfig?: FeatureSprintDeepSeekConfig;
  } = {}
): FeatureSprintRunnerJobProvider {
  const runnerHealth = options.runnerHealth ?? "unknown";
  const preferred =
    options.preferredProvider ??
    (options.preferredAgent === "cursor"
      ? "cursor"
      : options.preferredAgent === "codex"
        ? "codex"
        : undefined);

  if (preferred === "deepseek") {
    if (isDeepSeekEligibleForJob(job, options.deepseekConfig)) {
      return "deepseek";
    }
    return "manual";
  }

  if (preferred === "chatgpt" || preferred === "manual") {
    return preferred;
  }

  if (runnerHealth !== "available") {
    return "manual";
  }

  if (preferred === "cursor" && job.providerOptions.includes("cursor")) {
    return "cursor";
  }

  if (preferred === "codex" && job.providerOptions.includes("codex")) {
    return "codex";
  }

  if (job.providerOptions.includes("cursor")) {
    return "cursor";
  }
  if (job.providerOptions.includes("codex")) {
    return "codex";
  }
  if (job.providerOptions.includes("local")) {
    return "local";
  }

  return "manual";
}

export function resolveRunnerProfileForJob(
  provider: FeatureSprintRunnerJobProvider,
  action: FeatureSprintNextJobAction,
  agent: FeatureSprintRunnerAgent = "codex"
): FeatureSprintRunnerProfile | undefined {
  if (provider === "manual" || provider === "chatgpt" || provider === "deepseek") {
    return undefined;
  }

  const runnerAgent: FeatureSprintRunnerAgent =
    provider === "cursor" ? "cursor" : "codex";

  switch (action) {
    case "run_scoping":
      return buildRunnerProfile(runnerAgent, "scoping");
    case "copy_implementation":
      return buildRunnerProfile(runnerAgent, "implementation");
    case "copy_review":
      return buildRunnerProfile(runnerAgent, "review");
    case "copy_prompt_audit":
      return provider === "cursor" ? undefined : "codex_prompt_audit";
    case "copy_localization":
      if (provider === "cursor") {
        return "cursor_localization";
      }
      if (provider === "codex" || provider === "local") {
        return "codex_localization";
      }
      return undefined;
    default:
      return undefined;
  }
}

export type FeatureSprintRunnerJobPacketContext = {
  sliceTitle?: string;
  slicePhase?: HarnessFeatureSprintSlicePhase;
  expectedOutputFence?: FeatureSprintNextJobExpectedFence;
};

export function appendFeatureSprintRunnerJobContext(
  markdown: string,
  context: FeatureSprintRunnerJobPacketContext
): string {
  const lines = ["", "## Life Harness slice context"];
  if (context.sliceTitle) {
    lines.push(`- Current slice: ${context.sliceTitle}`);
  }
  if (context.slicePhase) {
    lines.push(`- Phase: ${context.slicePhase}`);
  }
  if (context.expectedOutputFence) {
    lines.push(`- Expected output fence: \`${context.expectedOutputFence}\``);
  }
  lines.push(
    "- Stay within this slice only.",
    "- Do not advance the plan or approve gates.",
    "- Life Harness imports/saves/advances manually after you return output."
  );
  if (context.expectedOutputFence) {
    lines.push(
      `- Return only the fenced \`${context.expectedOutputFence}\` block when applicable.`
    );
  }
  return `${markdown.trimEnd()}\n${lines.join("\n")}`;
}

function buildPacketForAction(
  data: LifeHarnessData,
  action: FeatureSprintNextJobAction,
  cardId: string,
  planId: string | undefined,
  stepId: string | undefined,
  options: {
    roughSpec?: string;
    agentOutput?: string;
    now?: Date;
  }
): FeaturePacketBuildResult {
  switch (action) {
    case "run_scoping":
      return buildFeatureScopingPacket(data, cardId, {
        roughSpec: options.roughSpec,
        now: options.now
      });
    case "copy_localization":
      if (!planId) {
        return { ok: false, error: "No active plan for localization packet." };
      }
      return buildFeatureStepLocalizationPacket(data, planId, stepId, { now: options.now });
    case "copy_prompt_audit":
      if (!planId) {
        return { ok: false, error: "No active plan for prompt audit packet." };
      }
      return buildFeatureStepPromptAuditPacket(data, planId, stepId, { now: options.now });
    case "copy_implementation":
      if (!planId) {
        return { ok: false, error: "No active plan for implementation packet." };
      }
      return buildFeatureStepImplementationPacket(data, planId, stepId, { now: options.now });
    case "copy_review":
      if (!planId) {
        return { ok: false, error: "No active plan for review packet." };
      }
      return buildFeatureStepReviewPacket(data, planId, stepId, options.agentOutput, {
        now: options.now
      });
    case "import_spec_update":
      // Action name reflects the downstream human import gate — bridge prepares packet only.
      if (!planId) {
        return { ok: false, error: "No active plan for spec update packet." };
      }
      return buildFeatureStepSpecUpdatePacket(data, planId, stepId, { now: options.now });
    default:
      return { ok: false, error: `No packet builder for action: ${action}` };
  }
}

export function buildPacketForFeatureSprintRunnerJob(
  data: LifeHarnessData,
  job: FeatureSprintNextJob,
  context: {
    cardId: string;
    planId?: string;
    stepId?: string;
    roughSpec?: string;
    agentOutput?: string;
    now?: Date;
    provider?: FeatureSprintRunnerJobProvider;
  }
): FeaturePacketBuildResult {
  const plan = context.planId
    ? getActiveFeatureSprintPlanForCard(data, context.cardId)
    : undefined;
  const step = plan?.steps.find((item) => item.id === context.stepId);
  const slice = resolveFeatureSprintCurrentSlice(plan, step);

  const packet =
    context.provider === "deepseek" && job.action === "copy_review"
      ? buildFeatureSprintAutomatedReviewPacket(data, context.cardId, {
          planId: context.planId,
          stepId: context.stepId,
          agentOutput: context.agentOutput,
          now: context.now
        })
      : buildPacketForAction(
          data,
          job.action,
          context.cardId,
          context.planId,
          context.stepId,
          context
        );

  if (!packet.ok) {
    return packet;
  }

  return {
    ok: true,
    markdown: appendFeatureSprintRunnerJobContext(packet.markdown, {
      sliceTitle: slice?.title ?? job.label,
      slicePhase: slice?.phase ?? job.phase,
      expectedOutputFence: job.expectedOutputFence
    })
  };
}

export function buildFeatureSprintRunnerJobRequest(
  data: LifeHarnessData,
  cardId: string,
  job: FeatureSprintNextJob,
  options: {
    preferredAgent?: FeatureSprintRunnerAgent;
    preferredProvider?: FeatureSprintRunnerJobProvider;
    runnerHealth?: "unknown" | "available" | "unavailable";
    deepseekConfig?: FeatureSprintDeepSeekConfig;
    roughSpec?: string;
    agentOutput?: string;
    now?: Date;
  } = {}
): FeatureSprintRunnerJobPrepareResult | { ok: true; request: FeatureSprintRunnerJobRequest } {
  const plan = getActiveFeatureSprintPlanForCard(data, cardId);
  const stepId = plan?.currentStepId;
  const provider = resolveFeatureSprintRunnerProvider(job, options);
  const runnerProfile = resolveRunnerProfileForJob(
    provider,
    job.action,
    options.preferredAgent ?? "codex"
  );
  const project = getProjectForCard(data, cardId);

  const packet = buildPacketForFeatureSprintRunnerJob(data, job, {
    cardId,
    planId: plan?.id,
    stepId,
    roughSpec: options.roughSpec,
    agentOutput: options.agentOutput,
    now: options.now,
    provider
  });

  if (!packet.ok) {
    return { ok: false, reason: "packet_error", job, error: packet.error };
  }

  const canMutateRepo =
    job.action === "copy_implementation" &&
    Boolean(runnerProfile) &&
    provider !== "manual" &&
    provider !== "chatgpt";

  return {
    ok: true,
    request: {
      cardId,
      planId: plan?.id,
      stepId,
      sliceId: job.sliceId,
      phase: job.phase,
      action: job.action,
      role: job.role,
      provider,
      expectedOutputFence: job.expectedOutputFence,
      inputPacket: packet.markdown,
      runnerProfile,
      canMutateRepo,
      requiresHumanImport: job.requiresHumanImport,
      requiresHumanApproval: job.requiresHumanApproval,
      worktree: canMutateRepo ? { enabled: true } : undefined,
      verificationCommands: project?.verificationCommands
    }
  };
}

export function prepareFeatureSprintRunnerJob(
  data: LifeHarnessData,
  cardId: string,
  options: {
    preferredAgent?: FeatureSprintRunnerAgent;
    preferredProvider?: FeatureSprintRunnerJobProvider;
    runnerHealth?: "unknown" | "available" | "unavailable";
    deepseekConfig?: FeatureSprintDeepSeekConfig;
    roughSpec?: string;
    agentOutput?: string;
    now?: Date;
  } = {}
): FeatureSprintRunnerJobPrepareResult {
  const job = buildNextFeatureSprintJob(data, cardId, {
    runnerHealth: options.runnerHealth,
    runnerAgent: options.preferredAgent
  });

  if (!job) {
    return { ok: false, reason: "no_job" };
  }

  if (isHumanOnlyFeatureSprintRunnerJobAction(job.action)) {
    return { ok: false, reason: "human_required", job };
  }

  if (!isRunnerCapableFeatureSprintJobAction(job.action)) {
    return { ok: false, reason: "human_required", job };
  }

  const built = buildFeatureSprintRunnerJobRequest(data, cardId, job, options);
  if (!built.ok) {
    return built;
  }

  return { ok: true, request: built.request, job };
}

export function resolveFeatureSprintNextJobButtonMode(
  job: FeatureSprintNextJob | undefined,
  options: {
    preferredAgent?: FeatureSprintRunnerAgent;
    preferredProvider?: FeatureSprintRunnerJobProvider;
    runnerHealth?: "unknown" | "available" | "unavailable";
    deepseekConfig?: FeatureSprintDeepSeekConfig;
  } = {}
): FeatureSprintNextJobButtonMode {
  if (!job) {
    return "human_gate";
  }

  if (isHumanOnlyFeatureSprintRunnerJobAction(job.action)) {
    return "human_gate";
  }

  if (!isRunnerCapableFeatureSprintJobAction(job.action)) {
    return "human_gate";
  }

  const provider = resolveFeatureSprintRunnerProvider(job, {
    preferredAgent: options.preferredAgent,
    preferredProvider: options.preferredProvider,
    runnerHealth: options.runnerHealth,
    deepseekConfig: options.deepseekConfig
  });

  if (provider === "deepseek" && options.deepseekConfig?.available) {
    return "automated_review";
  }

  const profile = resolveRunnerProfileForJob(
    provider,
    job.action,
    options.preferredAgent ?? "codex"
  );

  if (profile && options.runnerHealth === "available") {
    return "runner";
  }

  return "manual";
}

export function resolveFeatureSprintNextJobButtonLabel(
  mode: FeatureSprintNextJobButtonMode,
  options: { deepseekMode?: FeatureSprintDeepSeekConfig["mode"] } = {}
): string {
  switch (mode) {
    case "runner":
      return "Run next job";
    case "manual":
      return "Prepare next job";
    case "automated_review":
      return options.deepseekMode === "mock"
        ? "Run automated review (mock)"
        : "Run automated review";
    case "human_gate":
      return "Show next gate";
    default:
      return "Show next gate";
  }
}

export type FeatureSprintRunnerJobExecuteDeps = {
  runPacket: (request: FeatureSprintRunnerRequest) => Promise<FeatureSprintRunnerResponse>;
  onStarted?: () => void | Promise<void>;
  onCompleted?: (result: FeatureSprintRunnerJobResult) => void | Promise<void>;
  onFailed?: (error: string) => void | Promise<void>;
};

/** Narrow executor: request in, output text out. Does not stage UI or mutate board state. */
export async function executeFeatureSprintRunnerJob(
  request: FeatureSprintRunnerJobRequest,
  deps: FeatureSprintRunnerJobExecuteDeps
): Promise<FeatureSprintRunnerJobResult> {
  if (!request.runnerProfile) {
    const error = "No runner profile for this provider/action.";
    await deps.onFailed?.(error);
    return {
      ok: false,
      provider: request.provider,
      role: request.role,
      action: request.action,
      error,
      outputFence: request.expectedOutputFence,
      lifecycleStatus: "failed"
    };
  }

  await deps.onStarted?.();

  let result: FeatureSprintRunnerResponse;
  try {
    result = await deps.runPacket({
      profile: request.runnerProfile,
      promptMarkdown: request.inputPacket,
      cardId: request.cardId,
      planId: request.planId,
      stepId: request.stepId,
      worktree: request.worktree,
      verificationCommands: request.verificationCommands,
      runVerification: request.canMutateRepo
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.onFailed?.(message);
    return {
      ok: false,
      provider: request.provider,
      role: request.role,
      action: request.action,
      error: message,
      outputFence: request.expectedOutputFence,
      lifecycleStatus: "failed"
    };
  }

  if (!result.ok || !result.outputText?.trim()) {
    const error = result.error ?? "Runner returned no output.";
    await deps.onFailed?.(error);
    return {
      ok: false,
      provider: request.provider,
      role: request.role,
      action: request.action,
      error,
      outputFence: request.expectedOutputFence,
      lifecycleStatus: "failed"
    };
  }

  const success: FeatureSprintRunnerJobResult = {
    ok: true,
    provider: request.provider,
    role: request.role,
    action: request.action,
    outputText: result.outputText,
    outputFence: request.expectedOutputFence,
    summary: "Runner completed. Stage output in UI; import/save remains manual.",
    lifecycleStatus: "completed"
  };
  await deps.onCompleted?.(success);
  return success;
}
