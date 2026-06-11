export type FeatureSprintRunnerProfile = "codex_scoping" | "codex_review";

export type FeatureSprintRunnerStatus = "idle" | "running" | "succeeded" | "failed";

export type FeatureSprintRunnerRequest = {
  profile: FeatureSprintRunnerProfile;
  promptMarkdown: string;
  cardId?: string;
  planId?: string;
  stepId?: string;
  repoPath?: string;
  timeoutMs?: number;
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
};

export const FEATURE_SPRINT_RUNNER_PROFILES: FeatureSprintRunnerProfile[] = [
  "codex_scoping",
  "codex_review"
];

export const FEATURE_SPRINT_RUNNER_DEFAULT_PORT = 8127;
export const FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL = "http://127.0.0.1:8127";
export const FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS = 600_000;
export const FEATURE_SPRINT_RUNNER_MAX_PROMPT_CHARS = 200_000;
export const FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS = 3_000;

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isFeatureSprintRunnerProfile(value: unknown): value is FeatureSprintRunnerProfile {
  return value === "codex_scoping" || value === "codex_review";
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

  return {
    ok: true,
    request: {
      profile: record.profile,
      promptMarkdown,
      cardId: cleanOptional(typeof record.cardId === "string" ? record.cardId : undefined),
      planId: cleanOptional(typeof record.planId === "string" ? record.planId : undefined),
      stepId: cleanOptional(typeof record.stepId === "string" ? record.stepId : undefined),
      repoPath: cleanOptional(typeof record.repoPath === "string" ? record.repoPath : undefined),
      timeoutMs
    }
  };
}
