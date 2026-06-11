import {
  FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL,
  FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS,
  type FeatureSprintRunnerProfile,
  isFeatureSprintRunnerProfile,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse,
  validateFeatureSprintRunnerRequest
} from "./featureSprintRunner";

export const FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE =
  "Local Feature Sprint Runner is not running. Start it with npm run feature-runner.";

export function resolveFeatureSprintRunnerToken(): string | undefined {
  const token = process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN?.trim();
  return token || undefined;
}

function buildAuthHeaders(): Record<string, string> {
  const token = resolveFeatureSprintRunnerToken();
  if (!token) {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}

function resolveBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL).replace(/\/$/, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildFailureResponse(
  profile: FeatureSprintRunnerProfile,
  error: string,
  startedAt: string
): FeatureSprintRunnerResponse {
  const completedAt = nowIso();
  return {
    ok: false,
    profile,
    error,
    startedAt,
    completedAt
  };
}

export async function checkFeatureSprintRunnerHealth(
  baseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveBaseUrl(baseUrl)}/health`, {
      method: "GET",
      headers: buildAuthHeaders(),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, error: FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runFeatureSprintPacket(
  request: FeatureSprintRunnerRequest,
  options: { baseUrl?: string } = {}
): Promise<FeatureSprintRunnerResponse> {
  const startedAt = nowIso();
  const validated = validateFeatureSprintRunnerRequest(request);
  if (!validated.ok) {
    return buildFailureResponse(
      isFeatureSprintRunnerProfile(request.profile) ? request.profile : "codex_scoping",
      validated.error,
      startedAt
    );
  }

  try {
    const response = await fetch(`${resolveBaseUrl(options.baseUrl)}/feature-sprint/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify(validated.request)
    });

    const body = (await response.json()) as Partial<FeatureSprintRunnerResponse>;

    if (!response.ok) {
      return buildFailureResponse(
        validated.request.profile,
        typeof body.error === "string" ? body.error : FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
        startedAt
      );
    }

    if (
      typeof body.ok !== "boolean" ||
      !isFeatureSprintRunnerProfile(body.profile) ||
      typeof body.startedAt !== "string" ||
      typeof body.completedAt !== "string"
    ) {
      return buildFailureResponse(
        validated.request.profile,
        "Runner returned an invalid response.",
        startedAt
      );
    }

    return {
      ok: body.ok,
      profile: body.profile,
      outputText: typeof body.outputText === "string" ? body.outputText : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
      exitCode: typeof body.exitCode === "number" ? body.exitCode : undefined,
      startedAt: body.startedAt,
      completedAt: body.completedAt,
      commandPreview: typeof body.commandPreview === "string" ? body.commandPreview : undefined,
      stdoutPath: typeof body.stdoutPath === "string" ? body.stdoutPath : undefined
    };
  } catch {
    return buildFailureResponse(
      validated.request.profile,
      FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
      startedAt
    );
  }
}
