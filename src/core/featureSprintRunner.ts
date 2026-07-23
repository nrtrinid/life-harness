export type FeatureSprintRunnerProfile =
  | "codex_scoping"
  | "codex_review"
  | "codex_implementation"
  | "codex_prompt_audit"
  | "cursor_scoping"
  | "cursor_review"
  | "cursor_implementation";

export type FeatureSprintRunnerAgent = "codex" | "cursor";

export function isFeatureSprintRunnerAgent(value: unknown): value is FeatureSprintRunnerAgent {
  return value === "codex" || value === "cursor";
}

export type FeatureSprintRunnerPhase = "scoping" | "review" | "implementation" | "prompt_audit";

export type FeatureSprintRunnerStatus = "idle" | "running" | "succeeded" | "failed";

export type FeatureSprintRunnerWorktreeRequest = {
  enabled?: boolean;
  baseRef?: string;
  branchName?: string;
};

export type FeatureSprintVerificationStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "rejected"
  | "timed_out"
  | "cancelled";

export type FeatureSprintVerificationResult = {
  command: string;
  status: FeatureSprintVerificationStatus;
  exitCode?: number;
  stdoutExcerpt?: string;
  stderrExcerpt?: string;
  startedAt: string;
  completedAt: string;
  error?: string;
};

/**
 * Typed correlation metadata for Feature Sprint runner transport.
 * Shared by app ↔ runner HTTP. The runner echoes this unchanged and must not
 * interpret Sprint Map hierarchy, dependencies, or authority.
 * Wire field for map phase is always `phase` (app history may store `mapPhase`).
 */
export type FeatureSprintRunnerExecutionContext = {
  planId: string;
  stepId?: string;
  executionModel?: "legacy_steps" | "sprint_map";
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  phase?: "localize" | "implement" | "review";
};

const FEATURE_SPRINT_RUNNER_EXECUTION_MODELS = ["legacy_steps", "sprint_map"] as const;
const FEATURE_SPRINT_RUNNER_EXECUTION_PHASES = ["localize", "implement", "review"] as const;

function cleanContextString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Soft-parse known correlation fields; reject non-plain / secret-prone shapes. */
export function parseFeatureSprintRunnerExecutionContext(
  value: unknown
): FeatureSprintRunnerExecutionContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const planId = cleanContextString(record.planId);
  if (!planId) {
    return undefined;
  }

  const executionModelRaw = cleanContextString(record.executionModel);
  const executionModel =
    executionModelRaw &&
    (FEATURE_SPRINT_RUNNER_EXECUTION_MODELS as readonly string[]).includes(executionModelRaw)
      ? (executionModelRaw as FeatureSprintRunnerExecutionContext["executionModel"])
      : undefined;

  const phaseRaw = cleanContextString(record.phase);
  const phase =
    phaseRaw && (FEATURE_SPRINT_RUNNER_EXECUTION_PHASES as readonly string[]).includes(phaseRaw)
      ? (phaseRaw as FeatureSprintRunnerExecutionContext["phase"])
      : undefined;

  const context: FeatureSprintRunnerExecutionContext = { planId };
  const stepId = cleanContextString(record.stepId);
  const sprintId = cleanContextString(record.sprintId);
  const storyId = cleanContextString(record.storyId);
  const taskId = cleanContextString(record.taskId);
  if (stepId) {
    context.stepId = stepId;
  }
  if (executionModel) {
    context.executionModel = executionModel;
  }
  if (sprintId) {
    context.sprintId = sprintId;
  }
  if (storyId) {
    context.storyId = storyId;
  }
  if (taskId) {
    context.taskId = taskId;
  }
  if (phase) {
    context.phase = phase;
  }
  return context;
}

export type FeatureSprintRunnerRequest = {
  profile: FeatureSprintRunnerProfile;
  promptMarkdown: string;
  cardId?: string;
  planId?: string;
  stepId?: string;
  repoPath?: string;
  timeoutMs?: number;
  worktree?: FeatureSprintRunnerWorktreeRequest;
  verificationCommands?: string[];
  runVerification?: boolean;
  /**
   * Typed Sprint Map / execution-target correlation context. Optional.
   * The runner copies this into the response when present and must not interpret it.
   */
  executionContext?: FeatureSprintRunnerExecutionContext;
  /**
   * App-owned durable attempt identity. When present, the runner journals by this id
   * and must not spawn a second provider process for the same attemptId.
   */
  attemptId?: string;
  /**
   * Immutable binding for attemptId conflict detection. Required when attemptId is set.
   */
  attemptBinding?: FeatureSprintRunnerAttemptBinding;
};

/** Immutable identity fields bound to an app-owned attemptId. */
export type FeatureSprintRunnerAttemptBinding = {
  planId: string;
  actionId: string;
  stateRevision: number;
  profile: FeatureSprintRunnerProfile;
  cardId?: string;
  stepId?: string;
  taskId?: string;
  phase?: string;
  clarifiedSpecRevision?: number;
};

export type FeatureSprintAttemptJournalStatus =
  | "unknown"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "identity_conflict";

export type FeatureSprintAttemptStatusResponse = {
  ok: boolean;
  attemptId: string;
  status: FeatureSprintAttemptJournalStatus;
  runId?: string;
  result?: FeatureSprintRunnerResponse;
  error?: string;
  identityConflict?: boolean;
  providerSpawned?: boolean;
};

/** Runner-side termination classification (optional; older clients ignore). */
export type FeatureSprintRunnerTerminationReason =
  | "completed"
  | "timeout"
  | "cancelled"
  | "spawn_error"
  | "gate_rejected"
  | "agent_nonzero_exit"
  | "worktree_invalid"
  | "readonly_mutation"
  | "args_error"
  | "runner_error";

/**
 * Distinguishes agent vs runner/environment failures (optional).
 * `empty_output` means the process exited normally but produced no usable Feature Sprint content.
 */
export type FeatureSprintRunnerFailureClass =
  | "none"
  | "agent"
  | "runner"
  | "environment"
  | "empty_output";

/**
 * Workflow usability — independent of process termination.
 * Prefer this over inferring from `ok` alone when classifying empty successful exits.
 */
export type FeatureSprintRunnerResultUsability =
  | "usable"
  | "empty_output"
  | "needs_human_review"
  | "unusable";

export type FeatureSprintRunnerModeLabel = "mock" | "codex" | "cursor" | "real";

/** How model identity was attributed on a runner response. */
export type FeatureSprintRunnerModelEvidenceSource =
  | "request"
  | "cli_output"
  | "runner"
  | "unknown";

export type FeatureSprintRunnerResponse = {
  ok: boolean;
  profile: FeatureSprintRunnerProfile;
  outputText?: string;
  error?: string;
  exitCode?: number;
  startedAt: string;
  completedAt: string;
  commandPreview?: string;
  stdoutPath?: string;
  worktreePath?: string;
  branchName?: string;
  gitStatus?: string;
  diffStat?: string;
  changedFiles?: string[];
  diffText?: string;
  verificationResults?: FeatureSprintVerificationResult[];
  /** Optional normalized envelope fields — backward compatible for Sprint Map clients. */
  runId?: string;
  provider?: FeatureSprintRunnerAgent;
  runnerMode?: FeatureSprintRunnerModeLabel;
  durationMs?: number;
  terminationReason?: FeatureSprintRunnerTerminationReason;
  failureClass?: FeatureSprintRunnerFailureClass;
  /** Workflow usability; `ok` is false whenever this is not `usable`. */
  resultUsability?: FeatureSprintRunnerResultUsability;
  timedOut?: boolean;
  cancelled?: boolean;
  stdoutText?: string;
  stderrText?: string;
  parseWarnings?: string[];
  /**
   * Journal durability for attemptId runs.
   * `degraded_in_process_only` means the provider finished but the completed journal
   * file could not be written; same-process replay may still work, restart replay may not.
   */
  journalDurability?: "durable" | "degraded_in_process_only";
  /** Safe user-facing failure detail (no secrets). */
  diagnosticMessage?: string;
  /**
   * Typed execution context echoed from the request (Sprint Map seam).
   * Runner must not interpret sprint/story/task/phase relationships.
   */
  executionContext?: FeatureSprintRunnerExecutionContext;
  /** Model Life Harness asked the provider CLI to use (informational). */
  requestedModel?: string;
  /**
   * Model confirmed by CLI/structured evidence only.
   * Never copied from requestedModel solely because the process succeeded.
   */
  resolvedModel?: string;
  modelEvidenceSource?: FeatureSprintRunnerModelEvidenceSource;
};

/**
 * True when the response is a structured runner envelope (mock/real), not a
 * client-synthesized transport failure. Do not infer this from executionContext alone.
 */
export function hasStructuredFeatureSprintRunnerEnvelope(
  response: Pick<
    FeatureSprintRunnerResponse,
    "runId" | "terminationReason" | "failureClass" | "resultUsability" | "provider" | "runnerMode"
  >
): boolean {
  if (typeof response.runId === "string" && response.runId.trim()) {
    return true;
  }
  if (typeof response.terminationReason === "string" && response.terminationReason.trim()) {
    return true;
  }
  if (typeof response.failureClass === "string" && response.failureClass.trim()) {
    return true;
  }
  if (typeof response.resultUsability === "string" && response.resultUsability.trim()) {
    return true;
  }
  if (response.provider === "codex" || response.provider === "cursor") {
    return true;
  }
  if (
    response.runnerMode === "mock" ||
    response.runnerMode === "codex" ||
    response.runnerMode === "cursor" ||
    response.runnerMode === "real"
  ) {
    return true;
  }
  return false;
}

export type FeatureSprintWorktreeCleanupRequest = {
  worktreePath: string;
  branchName?: string;
  repoPath?: string;
  force?: boolean;
};

export type FeatureSprintWorktreeCleanupStatus =
  | "cleaned"
  | "blocked"
  | "not_found"
  | "orphaned_on_disk"
  | "stale_git_registration"
  | "failed";

export type FeatureSprintWorktreeCleanupStageResult = {
  attempted: boolean;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  method?: string;
};

export type FeatureSprintWorktreeCleanupResponse = {
  ok: boolean;
  status: FeatureSprintWorktreeCleanupStatus;
  worktreePath: string;
  branchName?: string;
  message: string;
  hadChanges?: boolean;
  gitStatus?: string;
  error?: string;
  /** Final probe: path still listed by `git worktree list`. */
  gitRegistered?: boolean;
  /** Final probe: path still exists on disk. */
  filesystemExists?: boolean;
  gitStage?: FeatureSprintWorktreeCleanupStageResult;
  filesystemStage?: FeatureSprintWorktreeCleanupStageResult;
  startedAt: string;
  completedAt: string;
};

export const FEATURE_SPRINT_RUNNER_PROFILES: FeatureSprintRunnerProfile[] = [
  "codex_scoping",
  "codex_review",
  "codex_implementation",
  "codex_prompt_audit",
  "cursor_scoping",
  "cursor_review",
  "cursor_implementation"
];

export const FEATURE_SPRINT_RUNNER_DEFAULT_PORT = 8127;
export const FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL = "http://127.0.0.1:8127";
export const FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS = 600_000;
export const FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS = 200_000;
export const FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS = 3_000;
export const FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX = 8_000;
export const FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX = 8_000;
export const FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX = 200;
export const FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX = 50_000;
export const FEATURE_SPRINT_VERIFY_MAX_COMMANDS = 5;
export const FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS = 12_000;

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isFeatureSprintRunnerProfile(value: unknown): value is FeatureSprintRunnerProfile {
  return FEATURE_SPRINT_RUNNER_PROFILES.includes(value as FeatureSprintRunnerProfile);
}

export function resolveProfileProvider(
  profile: FeatureSprintRunnerProfile
): FeatureSprintRunnerAgent {
  return profile.startsWith("cursor_") ? "cursor" : "codex";
}

export function isImplementationProfile(profile: FeatureSprintRunnerProfile): boolean {
  return profile === "codex_implementation" || profile === "cursor_implementation";
}

export function isScopingProfile(profile: FeatureSprintRunnerProfile): boolean {
  return profile === "codex_scoping" || profile === "cursor_scoping";
}

export function isReviewProfile(profile: FeatureSprintRunnerProfile): boolean {
  return profile === "codex_review" || profile === "cursor_review";
}

export function isPromptAuditProfile(profile: FeatureSprintRunnerProfile): boolean {
  return profile === "codex_prompt_audit";
}

export function buildRunnerProfile(
  agent: FeatureSprintRunnerAgent,
  phase: FeatureSprintRunnerPhase
): FeatureSprintRunnerProfile {
  return `${agent}_${phase}` as FeatureSprintRunnerProfile;
}

export const FEATURE_SPRINT_RUNNER_PROFILE_LABELS: Record<FeatureSprintRunnerProfile, string> = {
  codex_scoping: "Codex scoping",
  codex_review: "Codex review",
  codex_implementation: "Codex implementation",
  codex_prompt_audit: "Codex prompt audit",
  cursor_scoping: "Cursor scoping",
  cursor_review: "Cursor review",
  cursor_implementation: "Cursor implementation"
};

export function formatRunnerProfileLabel(profile: FeatureSprintRunnerProfile): string {
  return FEATURE_SPRINT_RUNNER_PROFILE_LABELS[profile];
}

/** Compact label for recent-run list / notices. */
export function formatRunnerResultUsabilityLabel(run: {
  status: string;
  resultUsability?: FeatureSprintRunnerResultUsability;
  terminationReason?: FeatureSprintRunnerTerminationReason;
  timedOut?: boolean;
  cancelled?: boolean;
  failureClass?: FeatureSprintRunnerFailureClass;
}): string | undefined {
  if (run.timedOut || run.terminationReason === "timeout") {
    return "Timed out";
  }
  if (run.cancelled || run.terminationReason === "cancelled") {
    return "Cancelled";
  }
  if (run.resultUsability === "empty_output" || run.failureClass === "empty_output") {
    return "Empty output (unusable)";
  }
  if (run.resultUsability === "needs_human_review" || run.terminationReason === "readonly_mutation") {
    return "Needs human review";
  }
  if (run.resultUsability === "unusable") {
    return "Unusable result";
  }
  if (run.status === "failed" && run.terminationReason) {
    return run.terminationReason.replace(/_/g, " ");
  }
  return undefined;
}

export function runnerAgentLabel(agent: FeatureSprintRunnerAgent): string {
  return agent === "cursor" ? "Cursor" : "Codex";
}

function parseWorktreeRequest(
  value: unknown
): FeatureSprintRunnerWorktreeRequest | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const worktree: FeatureSprintRunnerWorktreeRequest = {};

  if (record.enabled !== undefined) {
    if (typeof record.enabled !== "boolean") {
      return undefined;
    }
    worktree.enabled = record.enabled;
  }

  const baseRef = cleanOptional(typeof record.baseRef === "string" ? record.baseRef : undefined);
  if (baseRef) {
    worktree.baseRef = baseRef;
  }

  const branchName = cleanOptional(
    typeof record.branchName === "string" ? record.branchName : undefined
  );
  if (branchName) {
    worktree.branchName = branchName;
  }

  return worktree;
}

export const FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_MARKER = `[truncated at ${FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX.toLocaleString()} characters]`;

export function capDiffText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX) {
    return value;
  }

  const marker = `\n${FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_MARKER}`;
  const sliceEnd = Math.max(0, FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX - marker.length);
  return `${value.slice(0, sliceEnd)}${marker}`;
}

export function isDiffTextTruncated(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return value.endsWith(FEATURE_SPRINT_RUNNER_DIFF_TRUNCATION_MARKER);
}

export function capGitMetadataFields(response: FeatureSprintRunnerResponse): FeatureSprintRunnerResponse {
  return {
    ...response,
    gitStatus: response.gitStatus
      ? response.gitStatus.slice(0, FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX)
      : undefined,
    diffStat: response.diffStat
      ? response.diffStat.slice(0, FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX)
      : undefined,
    changedFiles: response.changedFiles
      ? response.changedFiles.slice(0, FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX)
      : undefined,
    diffText: capDiffText(response.diffText),
    verificationResults: capVerificationResults(response.verificationResults)
  };
}

export function capVerificationResults(
  results: FeatureSprintVerificationResult[] | undefined
): FeatureSprintVerificationResult[] | undefined {
  if (!results) {
    return undefined;
  }

  return results.map((result) => ({
    ...result,
    stdoutExcerpt: result.stdoutExcerpt
      ? result.stdoutExcerpt.slice(0, FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS)
      : undefined,
    stderrExcerpt: result.stderrExcerpt
      ? result.stderrExcerpt.slice(0, FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS)
      : undefined
  }));
}

export function summarizeVerificationResults(
  results: FeatureSprintVerificationResult[] | undefined
): string {
  if (!results || results.length === 0) {
    return "skipped";
  }

  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const rejected = results.filter((item) => item.status === "rejected").length;
  const timedOut = results.filter((item) => item.status === "timed_out").length;
  const cancelled = results.filter((item) => item.status === "cancelled").length;
  const skipped = results.filter((item) => item.status === "skipped").length;

  const parts: string[] = [];
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  if (rejected > 0) {
    parts.push(`${rejected} rejected`);
  }
  if (timedOut > 0) {
    parts.push(`${timedOut} timed out`);
  }
  if (cancelled > 0) {
    parts.push(`${cancelled} cancelled`);
  }
  if (passed > 0) {
    parts.push(`${passed} passed`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }

  return parts.length > 0 ? parts.join(" / ") : "skipped";
}

function formatVerificationResultLine(result: FeatureSprintVerificationResult): string {
  const lines = [`- command: ${result.command}`, `  status: ${result.status}`];
  if (result.exitCode !== undefined) {
    lines.push(`  exitCode: ${result.exitCode}`);
  }
  if (result.error) {
    lines.push(`  error: ${result.error}`);
  }
  if (result.stderrExcerpt?.trim()) {
    lines.push(`  stderr: ${result.stderrExcerpt.trim()}`);
  } else if (result.stdoutExcerpt?.trim()) {
    lines.push(`  stdout: ${result.stdoutExcerpt.trim()}`);
  }
  return lines.join("\n");
}

export function composeImplementationRunnerOutputSummary(
  response: FeatureSprintRunnerResponse
): string {
  const sections: string[] = [];

  if (response.outputText?.trim()) {
    sections.push(response.outputText.trim());
  }

  if (response.worktreePath) {
    sections.push(`Worktree: ${response.worktreePath}`);
  }

  if (response.branchName) {
    sections.push(`Branch: ${response.branchName}`);
  }

  if (response.changedFiles && response.changedFiles.length > 0) {
    sections.push(`Changed files (${response.changedFiles.length}):`);
    sections.push(response.changedFiles.map((file) => `- ${file}`).join("\n"));
  }

  if (response.diffStat?.trim()) {
    sections.push("Diff stat:");
    sections.push(response.diffStat.trim());
  }

  if (response.gitStatus?.trim()) {
    sections.push("Git status:");
    sections.push(response.gitStatus.trim());
  }

  if (response.verificationResults && response.verificationResults.length > 0) {
    sections.push("## Verification");
    sections.push(
      response.verificationResults.map((result) => formatVerificationResultLine(result)).join("\n")
    );
  }

  return sections.join("\n\n");
}

function parseVerificationCommands(
  value: unknown
): { ok: true; commands: string[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, commands: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: "verificationCommands must be an array of strings." };
  }

  const commands = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (commands.length !== value.length) {
    return { ok: false, error: "verificationCommands must be an array of strings." };
  }

  if (commands.length > FEATURE_SPRINT_VERIFY_MAX_COMMANDS) {
    return {
      ok: false,
      error: `verificationCommands exceeds max (${FEATURE_SPRINT_VERIFY_MAX_COMMANDS}).`
    };
  }

  return { ok: true, commands };
}

export function validateFeatureSprintRunnerRequest(
  value: unknown
):
  | { ok: true; request: FeatureSprintRunnerRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Runner request must be an object." };
  }

  const record = value as Record<string, unknown>;

  if (!isFeatureSprintRunnerProfile(record.profile)) {
    return { ok: false, error: "Unknown or missing runner profile." };
  }

  const promptMarkdown = typeof record.promptMarkdown === "string" ? record.promptMarkdown : "";
  if (!promptMarkdown.trim()) {
    return { ok: false, error: "promptMarkdown is required." };
  }

  if (promptMarkdown.length > FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS) {
    return {
      ok: false,
      error: `promptMarkdown exceeds max length (${FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS}).`
    };
  }

  let timeoutMs = FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS;
  if (record.timeoutMs !== undefined) {
    if (typeof record.timeoutMs !== "number" || !Number.isFinite(record.timeoutMs) || record.timeoutMs <= 0) {
      return { ok: false, error: "timeoutMs must be a positive number." };
    }
    timeoutMs = Math.floor(record.timeoutMs);
  }

  const repoPath = cleanOptional(typeof record.repoPath === "string" ? record.repoPath : undefined);
  const worktree = parseWorktreeRequest(record.worktree);

  if (record.worktree !== undefined && !worktree) {
    return { ok: false, error: "worktree must be an object with optional enabled/baseRef/branchName." };
  }

  const verificationParsed = parseVerificationCommands(record.verificationCommands);
  if (!verificationParsed.ok) {
    return { ok: false, error: verificationParsed.error };
  }

  let runVerification = false;
  if (record.runVerification !== undefined) {
    if (typeof record.runVerification !== "boolean") {
      return { ok: false, error: "runVerification must be a boolean." };
    }
    runVerification = record.runVerification;
  }

  if (isImplementationProfile(record.profile)) {
    if (!repoPath) {
      return { ok: false, error: `${record.profile} requires repoPath.` };
    }
    if (worktree?.enabled !== true) {
      return { ok: false, error: `${record.profile} requires worktree.enabled === true.` };
    }
  } else if (runVerification || verificationParsed.commands.length > 0) {
    return {
      ok: false,
      error: "verificationCommands and runVerification are only allowed for implementation profiles."
    };
  }

  const request: FeatureSprintRunnerRequest = {
    profile: record.profile,
    promptMarkdown,
    cardId: cleanOptional(typeof record.cardId === "string" ? record.cardId : undefined),
    planId: cleanOptional(typeof record.planId === "string" ? record.planId : undefined),
    stepId: cleanOptional(typeof record.stepId === "string" ? record.stepId : undefined),
    repoPath,
    timeoutMs,
    worktree
  };

  if ("executionContext" in record) {
    const parsed = parseFeatureSprintRunnerExecutionContext(record.executionContext);
    if (parsed) {
      request.executionContext = parsed;
    }
  }

  if (record.attemptId !== undefined) {
    if (typeof record.attemptId !== "string" || !record.attemptId.trim()) {
      return { ok: false, error: "attemptId must be a non-empty string when provided." };
    }
    if (record.attemptId.length > 200) {
      return { ok: false, error: "attemptId exceeds max length (200)." };
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(record.attemptId.trim())) {
      return { ok: false, error: "attemptId contains invalid characters." };
    }
    request.attemptId = record.attemptId.trim();

    const bindingParsed = parseAttemptBinding(record.attemptBinding, record.profile);
    if (!bindingParsed.ok) {
      return bindingParsed;
    }
    request.attemptBinding = bindingParsed.binding;
  } else if (record.attemptBinding !== undefined) {
    return { ok: false, error: "attemptBinding requires attemptId." };
  }

  if (isImplementationProfile(record.profile)) {
    if (verificationParsed.commands.length > 0) {
      request.verificationCommands = verificationParsed.commands;
    }
    if (runVerification) {
      request.runVerification = true;
    }
  }

  return { ok: true, request };
}

function parseAttemptBinding(
  value: unknown,
  requestProfile: FeatureSprintRunnerProfile
):
  | { ok: true; binding: FeatureSprintRunnerAttemptBinding }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "attemptBinding is required when attemptId is set." };
  }
  const record = value as Record<string, unknown>;
  const planId = cleanOptional(typeof record.planId === "string" ? record.planId : undefined);
  const actionId = cleanOptional(typeof record.actionId === "string" ? record.actionId : undefined);
  if (!planId || !actionId) {
    return { ok: false, error: "attemptBinding.planId and attemptBinding.actionId are required." };
  }
  if (typeof record.stateRevision !== "number" || !Number.isFinite(record.stateRevision) || record.stateRevision < 0) {
    return { ok: false, error: "attemptBinding.stateRevision must be a non-negative number." };
  }
  const profile =
    typeof record.profile === "string" && isFeatureSprintRunnerProfile(record.profile)
      ? record.profile
      : requestProfile;
  if (profile !== requestProfile) {
    return { ok: false, error: "attemptBinding.profile must match request.profile." };
  }
  const binding: FeatureSprintRunnerAttemptBinding = {
    planId,
    actionId,
    stateRevision: Math.floor(record.stateRevision),
    profile
  };
  const cardId = cleanOptional(typeof record.cardId === "string" ? record.cardId : undefined);
  const stepId = cleanOptional(typeof record.stepId === "string" ? record.stepId : undefined);
  const taskId = cleanOptional(typeof record.taskId === "string" ? record.taskId : undefined);
  const phase = cleanOptional(typeof record.phase === "string" ? record.phase : undefined);
  if (cardId) {
    binding.cardId = cardId;
  }
  if (stepId) {
    binding.stepId = stepId;
  }
  if (taskId) {
    binding.taskId = taskId;
  }
  if (phase) {
    binding.phase = phase;
  }
  if (record.clarifiedSpecRevision !== undefined) {
    if (
      typeof record.clarifiedSpecRevision !== "number" ||
      !Number.isFinite(record.clarifiedSpecRevision)
    ) {
      return { ok: false, error: "attemptBinding.clarifiedSpecRevision must be a number." };
    }
    binding.clarifiedSpecRevision = Math.floor(record.clarifiedSpecRevision);
  }
  return { ok: true, binding };
}

function hasUnsafePathSegments(value: string): boolean {
  if (!value.trim()) {
    return true;
  }
  if (value.includes("\0")) {
    return true;
  }
  if (value.startsWith("~")) {
    return true;
  }
  return value.split(/[/\\]/).some((segment) => segment === "..");
}

export function validateFeatureSprintWorktreeCleanupRequest(
  value: unknown
):
  | { ok: true; request: FeatureSprintWorktreeCleanupRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Cleanup request must be an object." };
  }

  const record = value as Record<string, unknown>;
  const worktreePath =
    typeof record.worktreePath === "string" ? record.worktreePath.trim() : "";
  if (!worktreePath) {
    return { ok: false, error: "worktreePath is required." };
  }
  if (hasUnsafePathSegments(worktreePath)) {
    return { ok: false, error: "worktreePath contains unsafe path segments." };
  }

  const branchName = cleanOptional(
    typeof record.branchName === "string" ? record.branchName : undefined
  );
  if (branchName && hasUnsafePathSegments(branchName)) {
    return { ok: false, error: "branchName contains unsafe path segments." };
  }

  const repoPath = cleanOptional(typeof record.repoPath === "string" ? record.repoPath : undefined);
  if (repoPath && hasUnsafePathSegments(repoPath)) {
    return { ok: false, error: "repoPath contains unsafe path segments." };
  }

  let force = false;
  if (record.force !== undefined) {
    if (typeof record.force !== "boolean") {
      return { ok: false, error: "force must be a boolean." };
    }
    force = record.force;
  }

  const request: FeatureSprintWorktreeCleanupRequest = {
    worktreePath,
    force
  };
  if (branchName) {
    request.branchName = branchName;
  }
  if (repoPath) {
    request.repoPath = repoPath;
  }

  return { ok: true, request };
}

export function isFeatureSprintWorktreeCleanupStatus(
  value: unknown
): value is FeatureSprintWorktreeCleanupStatus {
  return (
    value === "cleaned" ||
    value === "blocked" ||
    value === "not_found" ||
    value === "orphaned_on_disk" ||
    value === "stale_git_registration" ||
    value === "failed"
  );
}

/**
 * Derive cleanup status from independent Git-registration and filesystem probes.
 * Callers supply the observed final state after staged attempts.
 */
export function reconcileFeatureSprintWorktreeCleanupState(input: {
  gitRegistered: boolean;
  filesystemExists: boolean;
  blocked?: boolean;
  hadChanges?: boolean;
}): {
  status: FeatureSprintWorktreeCleanupStatus;
  ok: boolean;
  message: string;
} {
  if (input.blocked) {
    return {
      status: "blocked",
      ok: false,
      message:
        "Worktree has uncommitted changes. Inspect output and diff, then use force clean after review."
    };
  }

  if (!input.gitRegistered && !input.filesystemExists) {
    return {
      status: "cleaned",
      ok: true,
      message: "Worktree already removed from Git and disk."
    };
  }

  if (!input.gitRegistered && input.filesystemExists) {
    return {
      status: "orphaned_on_disk",
      ok: false,
      message: "Git worktree removed, but files remain on disk. Retry filesystem cleanup."
    };
  }

  if (input.gitRegistered && !input.filesystemExists) {
    return {
      status: "stale_git_registration",
      ok: false,
      message: "Files are gone, but a stale Git worktree registration remains. Retry registration cleanup."
    };
  }

  return {
    status: "failed",
    ok: false,
    message: "Worktree cleanup did not complete."
  };
}
