import { randomUUID } from "node:crypto";

import {
  resolveProfileProvider,
  type FeatureSprintRunnerFailureClass,
  type FeatureSprintRunnerModeLabel,
  type FeatureSprintRunnerProfile,
  type FeatureSprintRunnerResponse,
  type FeatureSprintRunnerResultUsability,
  type FeatureSprintRunnerTerminationReason,
  type FeatureSprintVerificationResult
} from "../../../src/core/featureSprintRunner";
import { redactSecrets } from "./redact";
import { usabilityForFailure } from "./resultUsability";

export type BuildRunnerResultInput = {
  profile: FeatureSprintRunnerProfile;
  runnerMode: FeatureSprintRunnerModeLabel;
  startedAt: string;
  completedAt?: string;
  ok: boolean;
  outputText?: string;
  error?: string;
  exitCode?: number | null;
  commandPreview?: string;
  worktreePath?: string;
  branchName?: string;
  gitStatus?: string;
  diffStat?: string;
  changedFiles?: string[];
  diffText?: string;
  verificationResults?: FeatureSprintVerificationResult[];
  terminationReason: FeatureSprintRunnerTerminationReason;
  failureClass?: FeatureSprintRunnerFailureClass;
  resultUsability?: FeatureSprintRunnerResultUsability;
  timedOut?: boolean;
  cancelled?: boolean;
  stdoutText?: string;
  stderrText?: string;
  parseWarnings?: string[];
  diagnosticMessage?: string;
  runId?: string;
  executionContext?: unknown;
};

function resolveFailureClass(
  input: BuildRunnerResultInput
): FeatureSprintRunnerFailureClass {
  if (input.failureClass) {
    return input.failureClass;
  }
  if (input.ok && input.terminationReason === "completed") {
    return "none";
  }
  switch (input.terminationReason) {
    case "agent_nonzero_exit":
    case "readonly_mutation":
      return "agent";
    case "timeout":
    case "cancelled":
    case "spawn_error":
    case "args_error":
    case "gate_rejected":
    case "worktree_invalid":
    case "runner_error":
      return "runner";
    default:
      return input.ok ? "none" : "runner";
  }
}

function durationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, end - start);
}

function resolveUsability(
  input: BuildRunnerResultInput,
  failureClass: FeatureSprintRunnerFailureClass
): FeatureSprintRunnerResultUsability {
  if (input.resultUsability) {
    return input.resultUsability;
  }
  if (input.ok && failureClass === "none") {
    return "usable";
  }
  return usabilityForFailure(failureClass);
}

/**
 * Build a consistent runner response envelope (mock / Cursor / Codex).
 *
 * Contract:
 * - `terminationReason` describes process fate.
 * - `resultUsability` / `failureClass` describe workflow usefulness.
 * - `ok === true` only when `resultUsability === "usable"` (no empty_output success).
 */
export function buildRunnerResult(input: BuildRunnerResultInput): FeatureSprintRunnerResponse {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const failureClass = resolveFailureClass(input);
  const resultUsability = resolveUsability(input, failureClass);
  // Contradiction guard: never report ok with empty_output / unusable.
  const ok = input.ok && resultUsability === "usable" && failureClass === "none";

  const safeError = input.error ? redactSecrets(input.error) : undefined;
  const safeDiagnostic = input.diagnosticMessage
    ? redactSecrets(input.diagnosticMessage)
    : safeError;
  // Agent content: redact only known secret substrings (tokens/keys), not prose.
  const stdoutText = input.stdoutText ? redactSecrets(input.stdoutText) : undefined;
  const stderrText = input.stderrText ? redactSecrets(input.stderrText) : undefined;
  const outputText = input.outputText ? redactSecrets(input.outputText) : undefined;

  return {
    ok,
    profile: input.profile,
    outputText,
    error: safeError,
    exitCode: input.exitCode === null || input.exitCode === undefined ? undefined : input.exitCode,
    startedAt: input.startedAt,
    completedAt,
    commandPreview: input.commandPreview,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    gitStatus: input.gitStatus,
    diffStat: input.diffStat,
    changedFiles: input.changedFiles,
    diffText: input.diffText,
    verificationResults: input.verificationResults,
    runId: input.runId ?? randomUUID(),
    provider: resolveProfileProvider(input.profile),
    runnerMode: input.runnerMode,
    durationMs: durationMs(input.startedAt, completedAt),
    terminationReason: input.terminationReason,
    failureClass,
    resultUsability,
    timedOut: input.timedOut === true,
    cancelled: input.cancelled === true,
    stdoutText,
    stderrText,
    parseWarnings: input.parseWarnings,
    diagnosticMessage: safeDiagnostic,
    executionContext: input.executionContext
  };
}
