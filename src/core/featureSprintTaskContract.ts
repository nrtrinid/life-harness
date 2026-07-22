import type {
  HarnessFeatureSprintClarifiedSpec,
  HarnessFeatureSprintExecutionModel,
  HarnessFeatureSprintHumanHoldReason,
  HarnessFeatureSprintLegalAction,
  HarnessFeatureSprintMapPhase,
  HarnessFeatureSprintTask,
  HarnessFeatureSprintTaskRiskTier
} from "./types";

export type HarnessFeatureSprintTaskContract = {
  objective: string;
  acceptanceCriteria: string[];
  allowedFiles: string[];
  forbiddenScope: string[];
  verificationCommands: string[];
  dependencies: string[];
  riskTier: HarnessFeatureSprintTaskRiskTier;
  frozenSpecRevision: number;
};

export type TaskContractValidation = {
  ok: boolean;
  contract?: HarnessFeatureSprintTaskContract;
  unmetPreconditions: string[];
};

/**
 * Empty allowed-file scope semantics for autonomous execution:
 * blocked. Manual UI launches may still warn-only via existing map readiness.
 */
export function buildFeatureSprintTaskContract(input: {
  task: HarnessFeatureSprintTask;
  frozenSpec: HarnessFeatureSprintClarifiedSpec;
}): TaskContractValidation {
  const { task, frozenSpec } = input;
  const unmet: string[] = [];

  if (frozenSpec.status !== "frozen") {
    unmet.push("Task contract requires a frozen clarified spec.");
  }

  const frozenSpecRevision = frozenSpec.revision;
  if (
    typeof task.frozenSpecRevision === "number" &&
    task.frozenSpecRevision !== frozenSpecRevision
  ) {
    unmet.push(
      `Task frozenSpecRevision ${task.frozenSpecRevision} does not match frozen spec revision ${frozenSpecRevision}.`
    );
  }

  const objective = task.objective.trim() || frozenSpec.objective.trim();
  if (!objective) {
    unmet.push("Task objective is required.");
  }

  const acceptanceCriteria =
    task.acceptanceCriteria.map((item) => item.text.trim()).filter(Boolean).length > 0
      ? task.acceptanceCriteria.map((item) => item.text.trim()).filter(Boolean)
      : frozenSpec.acceptanceCriteria;

  if (acceptanceCriteria.length === 0) {
    unmet.push("Acceptance criteria are required.");
  }

  const allowedFiles = (task.scope.allowedPaths ?? []).map((item) => item.trim()).filter(Boolean);
  if (allowedFiles.length === 0) {
    unmet.push(
      "Allowed-file scope is empty — autonomous execution is blocked (manual warn-only launches remain separate)."
    );
  }

  const forbiddenScope = (task.scope.forbiddenPaths ?? []).map((item) => item.trim()).filter(Boolean);
  const verificationCommands = task.verificationRequirements
    .map((item) => (item.command ?? item.description).trim())
    .filter(Boolean);
  if (verificationCommands.length === 0) {
    unmet.push("At least one verification requirement/command is required.");
  }

  const dependencies = task.dependencies
    .filter((item) => item.required !== false)
    .map((item) => item.taskId.trim())
    .filter(Boolean);

  const riskTier: HarnessFeatureSprintTaskRiskTier =
    task.riskTier === "tiny" || task.riskTier === "standard" || task.riskTier === "risky"
      ? task.riskTier
      : "standard";

  if (unmet.length > 0) {
    return { ok: false, unmetPreconditions: unmet };
  }

  return {
    ok: true,
    unmetPreconditions: [],
    contract: {
      objective,
      acceptanceCriteria,
      allowedFiles,
      forbiddenScope,
      verificationCommands,
      dependencies,
      riskTier,
      frozenSpecRevision
    }
  };
}

export type FeatureSprintLegalActionExecutionContext = {
  executionModel: HarnessFeatureSprintExecutionModel;
  sprintId?: string;
  storyId?: string;
  taskId?: string;
  phase?: HarnessFeatureSprintMapPhase;
  frozenSpecRevision?: number;
};

export type HarnessFeatureSprintNextLegalAction = {
  actionId: string;
  action: HarnessFeatureSprintLegalAction;
  planId: string;
  stateRevision: number;
  executionContext?: FeatureSprintLegalActionExecutionContext;
  requiresHuman: boolean;
  reason: string;
  unmetPreconditions: string[];
  eligibleProfiles?: string[];
  holdReason?: HarnessFeatureSprintHumanHoldReason;
  createdAt: string;
};

export function buildFeatureSprintActionId(input: {
  planId: string;
  stateRevision: number;
  action: HarnessFeatureSprintLegalAction;
  taskId?: string;
  phase?: HarnessFeatureSprintMapPhase;
}): string {
  return [
    input.planId,
    String(input.stateRevision),
    input.action,
    input.taskId ?? "-",
    input.phase ?? "-"
  ].join("::");
}

export function resolvePlanStateRevision(
  plan: { stateRevision?: number } | null | undefined
): number {
  const value = plan?.stateRevision;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
}

/**
 * Pure repo-relative path normalization for scope matching.
 * Does not touch the filesystem or process.cwd().
 */
export function normalizeRepoRelativePath(
  path: string
): { ok: true; path: string } | { ok: false; reason: string } {
  const trimmed = path.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  let normalized = trimmed.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) {
    return { ok: false, reason: "absolute" };
  }
  normalized = normalized.replace(/^\.\//, "");
  const parts = normalized.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length === 0) {
        return { ok: false, reason: "escape" };
      }
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return { ok: true, path: stack.join("/") };
}

function patternMatchesNormalizedPath(candidate: string, pattern: string): boolean {
  const raw = pattern.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!raw) {
    return false;
  }
  if (raw.endsWith("/**")) {
    const prefixResult = normalizeRepoRelativePath(raw.slice(0, -3));
    if (!prefixResult.ok || !prefixResult.path) {
      return false;
    }
    const prefix = prefixResult.path;
    return candidate === prefix || candidate.startsWith(`${prefix}/`);
  }
  if (raw.endsWith("/*")) {
    const prefixResult = normalizeRepoRelativePath(raw.slice(0, -2));
    if (!prefixResult.ok || !prefixResult.path) {
      return false;
    }
    const prefix = prefixResult.path;
    if (!candidate.startsWith(`${prefix}/`)) {
      return false;
    }
    const rest = candidate.slice(prefix.length + 1);
    return rest.length > 0 && !rest.includes("/");
  }
  const exact = normalizeRepoRelativePath(raw);
  if (!exact.ok || !exact.path) {
    return false;
  }
  // Exact file or directory-prefix match with segment boundary (`src/foo` ≠ `src/foobar`).
  return candidate === exact.path || candidate.startsWith(`${exact.path}/`);
}

export function pathMatchesScope(path: string, patterns: string[]): boolean {
  const normalizedPath = normalizeRepoRelativePath(path);
  if (!normalizedPath.ok) {
    return false;
  }
  return patterns.some((pattern) => patternMatchesNormalizedPath(normalizedPath.path, pattern));
}

export function validateProofAgainstTaskContract(input: {
  changedFiles: string[];
  contract: HarnessFeatureSprintTaskContract;
  verificationResult?: "pass" | "partial" | "fail" | "not_run";
  frozenSpecRevision?: number;
}): { ok: boolean; unmetPreconditions: string[]; holdReason?: HarnessFeatureSprintHumanHoldReason } {
  const unmet: string[] = [];
  let holdReason: HarnessFeatureSprintHumanHoldReason | undefined;

  if (
    typeof input.frozenSpecRevision === "number" &&
    input.frozenSpecRevision !== input.contract.frozenSpecRevision
  ) {
    unmet.push("Proof frozenSpecRevision does not match task contract.");
    holdReason = "missing_evidence";
  }

  for (const file of input.changedFiles) {
    const normalized = normalizeRepoRelativePath(file);
    if (!normalized.ok) {
      unmet.push(`Changed path rejected (${normalized.reason}): ${file}`);
      holdReason = "scope_violation";
      continue;
    }
    if (pathMatchesScope(file, input.contract.forbiddenScope)) {
      unmet.push(`Forbidden scope violation: ${file}`);
      holdReason = "scope_violation";
    } else if (!pathMatchesScope(file, input.contract.allowedFiles)) {
      unmet.push(`Changed file outside allowed scope: ${file}`);
      holdReason = "scope_violation";
    }
  }

  if (input.changedFiles.length === 0) {
    unmet.push("Implementation proof has no changed files.");
    holdReason = holdReason ?? "missing_evidence";
  }

  if (!input.verificationResult || input.verificationResult === "not_run") {
    unmet.push("Verification evidence is missing (not treated as passed).");
    holdReason = holdReason ?? "missing_evidence";
  } else if (input.verificationResult === "fail" || input.verificationResult === "partial") {
    unmet.push(`Verification result is ${input.verificationResult}.`);
    holdReason = holdReason ?? "verification_failed";
  }

  return { ok: unmet.length === 0, unmetPreconditions: unmet, holdReason };
}
