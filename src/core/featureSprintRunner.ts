export type FeatureSprintRunnerProfile = "codex_scoping" | "codex_review" | "codex_implementation";

export type FeatureSprintRunnerStatus = "idle" | "running" | "succeeded" | "failed";

export type FeatureSprintRunnerWorktreeRequest = {
  enabled?: boolean;
  baseRef?: string;
  branchName?: string;
};

export type FeatureSprintRunnerRequest = {
  profile: FeatureSprintRunnerProfile;
  promptMarkdown: string;
  cardId?: string;
  planId?: string;
  stepId?: string;
  repoPath?: string;
  timeoutMs?: number;
  worktree?: FeatureSprintRunnerWorktreeRequest;
};

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
};

export const FEATURE_SPRINT_RUNNER_PROFILES: FeatureSprintRunnerProfile[] = [
  "codex_scoping",
  "codex_review",
  "codex_implementation"
];

export const FEATURE_SPRINT_RUNNER_DEFAULT_PORT = 8127;
export const FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL = "http://127.0.0.1:8127";
export const FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS = 600_000;
export const FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS = 200_000;
export const FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS = 3_000;
export const FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX = 8_000;
export const FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX = 8_000;
export const FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX = 200;

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isFeatureSprintRunnerProfile(value: unknown): value is FeatureSprintRunnerProfile {
  return (
    value === "codex_scoping" ||
    value === "codex_review" ||
    value === "codex_implementation"
  );
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
      : undefined
  };
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

  return sections.join("\n\n");
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

  if (record.profile === "codex_implementation") {
    if (!repoPath) {
      return { ok: false, error: "codex_implementation requires repoPath." };
    }
    if (worktree?.enabled !== true) {
      return { ok: false, error: "codex_implementation requires worktree.enabled === true." };
    }
  }

  return {
    ok: true,
    request: {
      profile: record.profile,
      promptMarkdown,
      cardId: cleanOptional(typeof record.cardId === "string" ? record.cardId : undefined),
      planId: cleanOptional(typeof record.planId === "string" ? record.planId : undefined),
      stepId: cleanOptional(typeof record.stepId === "string" ? record.stepId : undefined),
      repoPath,
      timeoutMs,
      worktree
    }
  };
}
