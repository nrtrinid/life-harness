import type { FeatureSprintRunnerAgent } from "./featureSprintRunner";
import { runnerAgentLabel } from "./featureSprintRunner";

export type FeatureSprintRunnerHealthMode = "mock" | "codex" | "cursor" | "real";

export type FeatureSprintRunnerHealthFailureKind =
  | "unreachable"
  | "unauthorized"
  | "misconfigured"
  | "agentUnavailable"
  | "ready";

export type FeatureSprintRunnerCliProbe = {
  detected: boolean;
  bin?: string;
  version?: string;
  error?: string;
};

export type FeatureSprintRunnerSetupSnapshot = {
  serverTokenRequired: boolean;
  serverTokenConfigured: boolean;
  missingEnv: string[];
  cli: FeatureSprintRunnerCliProbe;
  platform?: string;
  recommendedScript: FeatureSprintRunnerHealthMode;
};

export type FeatureSprintRunnerHealthProbe = {
  ok: boolean;
  mode?: FeatureSprintRunnerHealthMode;
  codexAvailable?: boolean;
  cursorAvailable?: boolean;
  error?: string;
  httpStatus?: number;
  failureKind?: FeatureSprintRunnerHealthFailureKind;
  setup?: FeatureSprintRunnerSetupSnapshot;
};

function isHealthMode(value: unknown): value is FeatureSprintRunnerHealthMode {
  return value === "mock" || value === "codex" || value === "cursor" || value === "real";
}

function parseCliProbe(value: unknown): FeatureSprintRunnerCliProbe | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.detected !== "boolean") {
    return undefined;
  }

  return {
    detected: record.detected,
    bin: typeof record.bin === "string" ? record.bin : undefined,
    version: typeof record.version === "string" ? record.version : undefined,
    error: typeof record.error === "string" ? record.error : undefined
  };
}

function parseSetupSnapshot(value: unknown): FeatureSprintRunnerSetupSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const missingEnv = Array.isArray(record.missingEnv)
    ? record.missingEnv.filter((item): item is string => typeof item === "string")
    : [];
  const recommendedScript = isHealthMode(record.recommendedScript)
    ? record.recommendedScript
    : "mock";

  return {
    serverTokenRequired: record.serverTokenRequired === true,
    serverTokenConfigured: record.serverTokenConfigured === true,
    missingEnv,
    cli: parseCliProbe(record.cli) ?? { detected: false },
    platform: typeof record.platform === "string" ? record.platform : undefined,
    recommendedScript
  };
}

export function parseFeatureSprintRunnerHealthBody(body: unknown): FeatureSprintRunnerHealthProbe {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Runner returned an invalid health response." };
  }

  const record = body as Record<string, unknown>;
  const ok = record.ok === true;
  const mode = isHealthMode(record.mode) ? record.mode : undefined;
  const codexAvailable = typeof record.codexAvailable === "boolean" ? record.codexAvailable : undefined;
  const cursorAvailable =
    typeof record.cursorAvailable === "boolean" ? record.cursorAvailable : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;
  const setup = parseSetupSnapshot(record.setup);

  if (!ok) {
    return {
      ok: false,
      mode,
      codexAvailable,
      cursorAvailable,
      error: error ?? "Runner health check failed.",
      setup
    };
  }

  return { ok: true, mode, codexAvailable, cursorAvailable, error, setup };
}

export function formatRunnerHealthCapabilityLine(probe: FeatureSprintRunnerHealthProbe): string {
  if (!probe.ok) {
    return probe.error ?? "unavailable";
  }

  const modeLabel = probe.mode ?? "unknown";
  const codex = probe.codexAvailable ? "Codex ready" : "Codex unavailable";
  const cursor = probe.cursorAvailable ? "Cursor ready" : "Cursor unavailable";
  return `available (${modeLabel}) · ${codex} · ${cursor}`;
}

export function isRunnerAgentAvailable(
  probe: FeatureSprintRunnerHealthProbe | undefined,
  agent: FeatureSprintRunnerAgent
): boolean {
  if (!probe?.ok) {
    return false;
  }

  if (probe.mode === "mock" || probe.mode === undefined) {
    return true;
  }

  if (agent === "cursor") {
    return probe.cursorAvailable === true;
  }

  return probe.codexAvailable === true;
}

export function buildRunnerAgentUnavailableHint(
  agent: FeatureSprintRunnerAgent,
  probe?: FeatureSprintRunnerHealthProbe
): string {
  const label = runnerAgentLabel(agent);
  const mode = probe?.mode ?? "unknown";

  if (agent === "cursor") {
    return `${label} runs are unavailable in runner mode "${mode}". Open Runner setup below for fix steps. Manual copy/paste still works.`;
  }

  return `${label} runs are unavailable in runner mode "${mode}". Open Runner setup below for fix steps. Manual copy/paste still works.`;
}

export function guardRunnerAgentAvailability(
  agent: FeatureSprintRunnerAgent,
  probe: FeatureSprintRunnerHealthProbe | undefined
): string | undefined {
  if (!probe?.ok) {
    return undefined;
  }

  if (isRunnerAgentAvailable(probe, agent)) {
    return undefined;
  }

  return buildRunnerAgentUnavailableHint(agent, probe);
}

export function classifyRunnerHealthFailure(
  probe: FeatureSprintRunnerHealthProbe | undefined,
  options: {
    httpStatus?: number;
    appTokenConfigured?: boolean;
    runnerAgent?: FeatureSprintRunnerAgent;
  } = {}
): FeatureSprintRunnerHealthFailureKind {
  if (options.httpStatus === 401) {
    return "unauthorized";
  }

  if (!probe) {
    return "unreachable";
  }

  if (probe.failureKind === "unauthorized" || probe.failureKind === "unreachable") {
    return probe.failureKind;
  }

  if (!probe.ok) {
    if (probe.setup?.missingEnv.length || probe.error) {
      return "misconfigured";
    }
    return "unreachable";
  }

  if (
    options.runnerAgent &&
    !isRunnerAgentAvailable(probe, options.runnerAgent)
  ) {
    return "agentUnavailable";
  }

  if (
    probe.setup?.serverTokenConfigured &&
    options.appTokenConfigured === false
  ) {
    return "unauthorized";
  }

  return "ready";
}

export const FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE =
  "Runner token mismatch. Set EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN in .env to match FEATURE_SPRINT_RUNNER_TOKEN on the runner.";

export const FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE =
  "Local Feature Sprint Runner is not running. Start it with npm run feature-runner:mock or feature-runner:cursor.";
