import { resolveRunnerToken } from "./auth";

export type RunnerMode = "mock" | "codex" | "cursor" | "real";

export type ProviderGateResult = {
  ok: boolean;
  missingEnv: string[];
  error?: string;
};

function missing(...keys: string[]): ProviderGateResult {
  return { ok: false, missingEnv: keys };
}

function ready(): ProviderGateResult {
  return { ok: true, missingEnv: [] };
}

export function checkRealCodexGate(): ProviderGateResult {
  const missingEnv: string[] = [];

  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX !== "1") {
    missingEnv.push("FEATURE_SPRINT_RUNNER_ENABLE_CODEX");
  }

  if (!resolveRunnerToken()) {
    missingEnv.push("FEATURE_SPRINT_RUNNER_TOKEN");
  }

  if (missingEnv.length === 0) {
    return ready();
  }

  return {
    ok: false,
    missingEnv,
    error: "Real Codex mode requires FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1 and FEATURE_SPRINT_RUNNER_TOKEN."
  };
}

export function checkRealCursorGate(): ProviderGateResult {
  const missingEnv: string[] = [];

  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR !== "1") {
    missingEnv.push("FEATURE_SPRINT_RUNNER_ENABLE_CURSOR");
  }

  if (!resolveRunnerToken()) {
    missingEnv.push("FEATURE_SPRINT_RUNNER_TOKEN");
  }

  if (!process.env.CURSOR_API_KEY?.trim()) {
    missingEnv.push("CURSOR_API_KEY");
  }

  if (missingEnv.length === 0) {
    return ready();
  }

  return {
    ok: false,
    missingEnv,
    error:
      "Real Cursor mode requires FEATURE_SPRINT_RUNNER_ENABLE_CURSOR=1, FEATURE_SPRINT_RUNNER_TOKEN, and CURSOR_API_KEY."
  };
}

export function checkRealImplementationGate(): ProviderGateResult {
  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION !== "1") {
    return {
      ok: false,
      missingEnv: ["FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION"],
      error: "Real implementation mode requires FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1."
    };
  }

  return ready();
}

export function collectSetupMissingEnv(mode: RunnerMode): string[] {
  const missing = new Set<string>();

  if (mode === "mock") {
    return [];
  }

  if (mode === "codex" || mode === "real") {
    for (const key of checkRealCodexGate().missingEnv) {
      missing.add(key);
    }
  }

  if (mode === "cursor" || mode === "real") {
    for (const key of checkRealCursorGate().missingEnv) {
      missing.add(key);
    }
  }

  if (mode !== "mock") {
    for (const key of checkRealImplementationGate().missingEnv) {
      missing.add(key);
    }
  }

  return [...missing];
}

export function resolveRecommendedScript(mode: RunnerMode): RunnerMode {
  return mode;
}

export function resolveRunnerMode(): RunnerMode {
  const mode = process.env.FEATURE_SPRINT_RUNNER_MODE?.trim().toLowerCase();
  if (mode === "real") {
    return "real";
  }
  if (mode === "codex") {
    return "codex";
  }
  if (mode === "cursor") {
    return "cursor";
  }
  return "mock";
}
