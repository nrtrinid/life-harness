import type { FeatureSprintRunnerAgent } from "./featureSprintRunner";
import { runnerAgentLabel } from "./featureSprintRunner";

export type FeatureSprintRunnerHealthMode = "mock" | "codex" | "cursor" | "real";

export type FeatureSprintRunnerHealthProbe = {
  ok: boolean;
  mode?: FeatureSprintRunnerHealthMode;
  codexAvailable?: boolean;
  cursorAvailable?: boolean;
  error?: string;
};

function isHealthMode(value: unknown): value is FeatureSprintRunnerHealthMode {
  return value === "mock" || value === "codex" || value === "cursor" || value === "real";
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

  if (!ok) {
    return {
      ok: false,
      mode,
      codexAvailable,
      cursorAvailable,
      error: error ?? "Runner health check failed."
    };
  }

  return { ok: true, mode, codexAvailable, cursorAvailable, error };
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
    return `${label} runs are unavailable in runner mode "${mode}". Set FEATURE_SPRINT_RUNNER_MODE=cursor (or real), FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1, FEATURE_SPRINT_RUNNER_TOKEN, and CURSOR_API_KEY on the runner, then Check runner again. Manual copy/paste still works.`;
  }

  return `${label} runs are unavailable in runner mode "${mode}". Set FEATURE_SPRINT_RUNNER_MODE=codex (or real), FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1, and FEATURE_SPRINT_RUNNER_TOKEN on the runner, then Check runner again. Manual copy/paste still works.`;
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
