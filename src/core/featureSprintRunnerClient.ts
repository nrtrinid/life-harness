import {
  capGitMetadataFields,
  FEATURE_SPRINT_RUNNER_DEFAULT_BASE_URL,
  FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS,
  parseFeatureSprintRunnerExecutionContext,
  type FeatureSprintRunnerExecutionContext,
  type FeatureSprintRunnerProfile,
  type FeatureSprintVerificationResult,
  type FeatureSprintWorktreeCleanupRequest,
  type FeatureSprintWorktreeCleanupResponse,
  isFeatureSprintRunnerProfile,
  isFeatureSprintWorktreeCleanupStatus,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse,
  validateFeatureSprintRunnerRequest,
  validateFeatureSprintWorktreeCleanupRequest
} from "./featureSprintRunner";
import {
  FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE,
  FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
  parseFeatureSprintRunnerHealthBody,
  type FeatureSprintRunnerHealthProbe
} from "./featureSprintRunnerHealth";

export type { FeatureSprintRunnerHealthProbe } from "./featureSprintRunnerHealth";
export {
  buildRunnerAgentUnavailableHint,
  classifyRunnerHealthFailure,
  FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE,
  FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
  formatRunnerHealthCapabilityLine,
  guardRunnerAgentAvailability,
  isRunnerAgentAvailable,
  parseFeatureSprintRunnerHealthBody
} from "./featureSprintRunnerHealth";

export {
  composeImplementationRunnerOutputSummary,
  summarizeVerificationResults
} from "./featureSprintRunner";

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

function parseVerificationResults(value: unknown): FeatureSprintVerificationResult[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const results: FeatureSprintVerificationResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.command !== "string" || typeof record.startedAt !== "string") {
      continue;
    }
    if (
      record.status !== "passed" &&
      record.status !== "failed" &&
      record.status !== "skipped"
    ) {
      continue;
    }
    if (typeof record.completedAt !== "string") {
      continue;
    }

    results.push({
      command: record.command,
      status: record.status,
      exitCode: typeof record.exitCode === "number" ? record.exitCode : undefined,
      stdoutExcerpt: typeof record.stdoutExcerpt === "string" ? record.stdoutExcerpt : undefined,
      stderrExcerpt: typeof record.stderrExcerpt === "string" ? record.stderrExcerpt : undefined,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      error: typeof record.error === "string" ? record.error : undefined
    });
  }

  return results.length > 0 ? results : undefined;
}

function buildFailureResponse(
  profile: FeatureSprintRunnerProfile,
  error: string,
  startedAt: string,
  executionContext?: FeatureSprintRunnerExecutionContext
): FeatureSprintRunnerResponse {
  const completedAt = nowIso();
  return {
    ok: false,
    profile,
    error,
    startedAt,
    completedAt,
    executionContext
  };
}

/** Minimum shape for a structured runner response (success or failure). */
function isStructuredRunnerResponseBody(
  body: unknown
): body is Partial<FeatureSprintRunnerResponse> & {
  ok: boolean;
  profile: FeatureSprintRunnerProfile;
  startedAt: string;
  completedAt: string;
} {
  if (!body || typeof body !== "object") {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    typeof record.ok === "boolean" &&
    isFeatureSprintRunnerProfile(record.profile) &&
    typeof record.startedAt === "string" &&
    typeof record.completedAt === "string"
  );
}

function mapStructuredRunnerResponse(
  body: Partial<FeatureSprintRunnerResponse> & {
    ok: boolean;
    profile: FeatureSprintRunnerProfile;
    startedAt: string;
    completedAt: string;
  }
): FeatureSprintRunnerResponse {
  const changedFiles = Array.isArray(body.changedFiles)
    ? body.changedFiles.filter((item): item is string => typeof item === "string")
    : undefined;

  const verificationResults = parseVerificationResults(body.verificationResults);

  return capGitMetadataFields({
    ok: body.ok,
    profile: body.profile,
    outputText: typeof body.outputText === "string" ? body.outputText : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    exitCode: typeof body.exitCode === "number" ? body.exitCode : undefined,
    startedAt: body.startedAt,
    completedAt: body.completedAt,
    commandPreview: typeof body.commandPreview === "string" ? body.commandPreview : undefined,
    stdoutPath: typeof body.stdoutPath === "string" ? body.stdoutPath : undefined,
    worktreePath: typeof body.worktreePath === "string" ? body.worktreePath : undefined,
    branchName: typeof body.branchName === "string" ? body.branchName : undefined,
    gitStatus: typeof body.gitStatus === "string" ? body.gitStatus : undefined,
    diffStat: typeof body.diffStat === "string" ? body.diffStat : undefined,
    changedFiles,
    diffText: typeof body.diffText === "string" ? body.diffText : undefined,
    verificationResults,
    runId: typeof body.runId === "string" ? body.runId : undefined,
    provider:
      body.provider === "cursor" || body.provider === "codex" ? body.provider : undefined,
    runnerMode:
      body.runnerMode === "mock" ||
      body.runnerMode === "codex" ||
      body.runnerMode === "cursor" ||
      body.runnerMode === "real"
        ? body.runnerMode
        : undefined,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
    terminationReason:
      typeof body.terminationReason === "string"
        ? (body.terminationReason as FeatureSprintRunnerResponse["terminationReason"])
        : undefined,
    failureClass:
      body.failureClass === "none" ||
      body.failureClass === "agent" ||
      body.failureClass === "runner" ||
      body.failureClass === "environment" ||
      body.failureClass === "empty_output"
        ? body.failureClass
        : undefined,
    resultUsability:
      body.resultUsability === "usable" ||
      body.resultUsability === "empty_output" ||
      body.resultUsability === "needs_human_review" ||
      body.resultUsability === "unusable"
        ? body.resultUsability
        : undefined,
    timedOut: body.timedOut === true,
    cancelled: body.cancelled === true,
    stdoutText: typeof body.stdoutText === "string" ? body.stdoutText : undefined,
    stderrText: typeof body.stderrText === "string" ? body.stderrText : undefined,
    parseWarnings: Array.isArray(body.parseWarnings)
      ? body.parseWarnings.filter((item): item is string => typeof item === "string")
      : undefined,
    diagnosticMessage:
      typeof body.diagnosticMessage === "string" ? body.diagnosticMessage : undefined,
    executionContext: parseFeatureSprintRunnerExecutionContext(body.executionContext)
  });
}

export async function checkFeatureSprintRunnerHealth(
  baseUrl?: string
): Promise<FeatureSprintRunnerHealthProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEATURE_SPRINT_RUNNER_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveBaseUrl(baseUrl)}/health`, {
      method: "GET",
      headers: buildAuthHeaders(),
      signal: controller.signal
    });

    const body = await response.json().catch(() => null);
    const parsed = parseFeatureSprintRunnerHealthBody(body);
    const httpStatus = response.status;

    if (httpStatus === 401) {
      return {
        ok: false,
        httpStatus,
        failureKind: "unauthorized",
        error: FEATURE_SPRINT_RUNNER_UNAUTHORIZED_MESSAGE
      };
    }

    if (!response.ok) {
      return {
        ...parsed,
        ok: false,
        httpStatus,
        failureKind: parsed.setup?.missingEnv.length ? "misconfigured" : "misconfigured",
        error: parsed.error ?? FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE
      };
    }

    return {
      ...parsed,
      httpStatus,
      failureKind: parsed.ok ? "ready" : "misconfigured"
    };
  } catch {
    return {
      ok: false,
      failureKind: "unreachable",
      error: FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE
    };
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
      startedAt,
      parseFeatureSprintRunnerExecutionContext(request.executionContext)
    );
  }

  const requestContext = validated.request.executionContext;

  try {
    const response = await fetch(`${resolveBaseUrl(options.baseUrl)}/feature-sprint/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify(validated.request)
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return buildFailureResponse(
        validated.request.profile,
        "Runner returned an unreadable response body.",
        startedAt,
        requestContext
      );
    }

    // Preserve structured ok:false envelopes even when HTTP status is 4xx/5xx.
    if (isStructuredRunnerResponseBody(body)) {
      return mapStructuredRunnerResponse(body);
    }

    if (!response.ok) {
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      return buildFailureResponse(
        validated.request.profile,
        typeof record.error === "string" ? record.error : FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
        startedAt,
        requestContext
      );
    }

    return buildFailureResponse(
      validated.request.profile,
      "Runner returned an invalid response.",
      startedAt,
      requestContext
    );
  } catch {
    return buildFailureResponse(
      validated.request.profile,
      FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
      startedAt,
      requestContext
    );
  }
}

function buildCleanupFailureResponse(
  worktreePath: string,
  message: string,
  startedAt: string
): FeatureSprintWorktreeCleanupResponse {
  return {
    ok: false,
    status: "failed",
    worktreePath,
    message,
    error: message,
    startedAt,
    completedAt: nowIso()
  };
}

function parseCleanupResponse(
  body: Partial<FeatureSprintWorktreeCleanupResponse>,
  fallbackWorktreePath: string,
  startedAt: string
): FeatureSprintWorktreeCleanupResponse {
  if (
    typeof body.ok !== "boolean" ||
    !isFeatureSprintWorktreeCleanupStatus(body.status) ||
    typeof body.message !== "string" ||
    typeof body.startedAt !== "string" ||
    typeof body.completedAt !== "string"
  ) {
    return buildCleanupFailureResponse(
      fallbackWorktreePath,
      "Runner returned an invalid cleanup response.",
      startedAt
    );
  }

  return {
    ok: body.ok,
    status: body.status,
    worktreePath: typeof body.worktreePath === "string" ? body.worktreePath : fallbackWorktreePath,
    branchName: typeof body.branchName === "string" ? body.branchName : undefined,
    message: body.message,
    hadChanges: typeof body.hadChanges === "boolean" ? body.hadChanges : undefined,
    gitStatus: typeof body.gitStatus === "string" ? body.gitStatus : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    startedAt: body.startedAt,
    completedAt: body.completedAt
  };
}

export async function cleanupFeatureSprintWorktree(
  request: FeatureSprintWorktreeCleanupRequest,
  options: { baseUrl?: string } = {}
): Promise<FeatureSprintWorktreeCleanupResponse> {
  const startedAt = nowIso();
  const validated = validateFeatureSprintWorktreeCleanupRequest(request);
  if (!validated.ok) {
    return buildCleanupFailureResponse(
      typeof request.worktreePath === "string" ? request.worktreePath : "",
      validated.error,
      startedAt
    );
  }

  try {
    const response = await fetch(`${resolveBaseUrl(options.baseUrl)}/feature-sprint/cleanup-worktree`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify(validated.request)
    });

    const body = (await response.json()) as Partial<FeatureSprintWorktreeCleanupResponse>;

    if (!response.ok) {
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE;
      return buildCleanupFailureResponse(validated.request.worktreePath, message, startedAt);
    }

    return parseCleanupResponse(body, validated.request.worktreePath, startedAt);
  } catch {
    return buildCleanupFailureResponse(
      validated.request.worktreePath,
      FEATURE_SPRINT_RUNNER_UNREACHABLE_MESSAGE,
      startedAt
    );
  }
}
