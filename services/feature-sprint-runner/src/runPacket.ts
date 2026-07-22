import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  capGitMetadataFields,
  FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS,
  isImplementationProfile,
  resolveProfileProvider,
  type FeatureSprintRunnerProfile,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { buildAgentSpawnSpec, type AgentSpawnSpec } from "./agentSpawn";
import { buildCodexArgs } from "./codexArgs";
import { buildCursorArgs } from "./cursorArgs";
import { captureChangedFiles, captureGitMetadata } from "./gitCapture";
import { buildMockRunnerOutput } from "./mockOutput";
import {
  captureReadonlyBaseline,
  detectReadonlyMutations,
  validateImplementationWorkspace
} from "./phaseSafety";
import {
  checkRealCodexGate,
  checkRealCursorGate,
  checkRealImplementationGate,
  resolveRunnerMode,
  type RunnerMode
} from "./providerGates";
import { normalizeAgentCapturedOutput } from "./outputNormalize";
import { resolveCodexBin, resolveCursorBin } from "./resolveBin";
import { buildRunnerResult } from "./resultEnvelope";
import { assessCompletedRunUsability } from "./resultUsability";
import { spawnAgentProcess } from "./spawnAgent";
import { extractResolvedModelFromCursorOutput } from "./cursorModel";
import { createFeatureWorktree } from "./worktree";
import { runVerificationCommands } from "./verification";

function resolveCursorOutputFormatEnv(): "text" | "json" | "stream-json" {
  const configured = process.env.FEATURE_SPRINT_CURSOR_OUTPUT_FORMAT?.trim().toLowerCase();
  if (configured === "json" || configured === "stream-json") {
    return configured;
  }
  return "text";
}

export type { RunnerMode } from "./providerGates";
export { resolveRunnerMode } from "./providerGates";
export type { AgentSpawnSpec } from "./agentSpawn";

const MOCK_IMPLEMENTATION_MARKER = ".life-harness/mock-implementation-result.md";

/** @deprecated Prefer buildAgentSpawnSpec from agentSpawn.ts */
export function buildAgentSpawn(
  bin: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): AgentSpawnSpec {
  return buildAgentSpawnSpec(bin, args, platform);
}

export function resolveMaxOutputChars(): number {
  const raw = process.env.FEATURE_SPRINT_RUNNER_MAX_OUTPUT_CHARS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 500_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500_000;
}

/** Echo request correlation metadata unchanged on every envelope path. */
function withRequestContext(
  request: FeatureSprintRunnerRequest,
  input: Parameters<typeof buildRunnerResult>[0]
): FeatureSprintRunnerResponse {
  return buildRunnerResult({
    ...input,
    executionContext:
      input.executionContext !== undefined ? input.executionContext : request.executionContext
  });
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

function assertRealCodexAllowed(): string | undefined {
  const gate = checkRealCodexGate();
  return gate.ok ? undefined : gate.error;
}

function assertRealCursorAllowed(): string | undefined {
  const gate = checkRealCursorGate();
  return gate.ok ? undefined : gate.error;
}

function assertRealImplementationAllowed(profile: FeatureSprintRunnerProfile): string | undefined {
  const provider = resolveProfileProvider(profile);
  const providerGate = provider === "cursor" ? assertRealCursorAllowed() : assertRealCodexAllowed();
  if (providerGate) {
    return providerGate;
  }

  const implGate = checkRealImplementationGate();
  return implGate.ok ? undefined : implGate.error;
}

export function assertRealRunAllowed(profile: FeatureSprintRunnerProfile): string | undefined {
  const mode = resolveRunnerMode();
  if (mode === "mock") {
    return undefined;
  }

  const provider = resolveProfileProvider(profile);
  if (mode === "real") {
    return provider === "cursor" ? assertRealCursorAllowed() : assertRealCodexAllowed();
  }

  if (provider === "codex") {
    if (mode !== "codex") {
      return "Codex profiles require FEATURE_SPRINT_RUNNER_MODE=codex or real.";
    }
    return assertRealCodexAllowed();
  }

  if (mode !== "cursor") {
    return "Cursor profiles require FEATURE_SPRINT_RUNNER_MODE=cursor or real.";
  }
  return assertRealCursorAllowed();
}

export function resolveProviderAvailability(): {
  codexAvailable: boolean;
  cursorAvailable: boolean;
} {
  const mode = resolveRunnerMode();
  if (mode === "mock") {
    return { codexAvailable: true, cursorAvailable: true };
  }

  if (mode === "real") {
    return {
      codexAvailable: assertRealCodexAllowed() === undefined,
      cursorAvailable: assertRealCursorAllowed() === undefined
    };
  }

  if (mode === "codex") {
    return {
      codexAvailable: assertRealCodexAllowed() === undefined,
      cursorAvailable: false
    };
  }

  return {
    codexAvailable: false,
    cursorAvailable: assertRealCursorAllowed() === undefined
  };
}

async function attachImplementationMetadata(
  request: FeatureSprintRunnerRequest,
  worktreePath: string,
  branchName: string,
  base: FeatureSprintRunnerResponse,
  options?: { preRunChangedFiles?: string[] }
): Promise<FeatureSprintRunnerResponse> {
  const git = await captureGitMetadata(worktreePath, {
    preRunChangedFiles: options?.preRunChangedFiles
  });
  let verificationResults = base.verificationResults;

  if (request.runVerification) {
    verificationResults = await runVerificationCommands(
      worktreePath,
      request.verificationCommands ?? []
    );
  }

  const parseWarnings = [...(base.parseWarnings ?? [])];
  if (git.usedPreRunBaseline) {
    parseWarnings.push(
      "Changed-file capture subtracts the pre-run workspace snapshot vs HEAD; preexisting dirty paths are not attributed to this run, and content-only edits to already-dirty paths may be under-attributed."
    );
  }

  return capGitMetadataFields({
    ...base,
    worktreePath,
    branchName,
    gitStatus: git.gitStatus,
    diffStat: git.diffStat,
    changedFiles: git.changedFiles,
    diffText: git.diffText,
    verificationResults,
    parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined
  });
}

type SpawnAgentArgs =
  | {
      ok: true;
      bin: string;
      args: string[];
      preview: string;
      feedPromptViaStdin?: boolean;
      requestedModel?: string;
    }
  | { ok: false; error: string };

function buildAgentArgs(
  profile: FeatureSprintRunnerProfile,
  promptPath: string,
  workspacePath: string
): SpawnAgentArgs {
  const provider = resolveProfileProvider(profile);
  if (provider === "cursor") {
    const cursorArgs = buildCursorArgs(promptPath, { workspacePath, profile });
    if (!cursorArgs.ok) {
      return cursorArgs;
    }
    const resolved = resolveCursorBin();
    return {
      ok: true,
      bin: resolved.exists ? resolved.resolved : cursorArgs.bin,
      args: cursorArgs.args,
      preview: cursorArgs.preview,
      requestedModel: cursorArgs.requestedModel
    };
  }

  const codexArgs = buildCodexArgs(promptPath, { workspacePath, profile });
  if (!codexArgs.ok) {
    return codexArgs;
  }
  const resolved = resolveCodexBin();
  return {
    ok: true,
    bin: resolved.exists ? resolved.resolved : codexArgs.bin,
    args: codexArgs.args,
    preview: codexArgs.preview,
    feedPromptViaStdin: codexArgs.feedPromptViaStdin
  };
}

function agentFailureLabel(profile: FeatureSprintRunnerProfile): string {
  return resolveProfileProvider(profile) === "cursor" ? "Cursor" : "Codex";
}

async function spawnAgentInWorktree(
  request: FeatureSprintRunnerRequest,
  worktreePath: string,
  startedAt: string,
  options?: { readOnly?: boolean }
): Promise<FeatureSprintRunnerResponse> {
  const mode = resolveRunnerMode();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "feature-sprint-runner-"));
  const promptPath = path.join(tempDir, "prompt.md");
  const agentLabel = agentFailureLabel(request.profile);
  const readOnly = options?.readOnly === true;
  let baselineStatus = "";

  try {
    if (readOnly) {
      baselineStatus = await captureReadonlyBaseline(worktreePath);
    }

    await writeFile(promptPath, request.promptMarkdown, "utf8");
    const argsResult = buildAgentArgs(request.profile, promptPath, worktreePath);
    if (!argsResult.ok) {
      return withRequestContext(request, {
        ok: false,
        profile: request.profile,
        runnerMode: mode,
        error: argsResult.error,
        startedAt,
        terminationReason: "args_error",
        failureClass: "runner"
      });
    }

    const requestedModel = argsResult.requestedModel;
    const modelAttribution = (stdout?: string) => {
      if (resolveProfileProvider(request.profile) !== "cursor") {
        return {
          requestedModel: undefined,
          resolvedModel: undefined,
          modelEvidenceSource: undefined
        };
      }
      const format = resolveCursorOutputFormatEnv();
      const extracted = extractResolvedModelFromCursorOutput(
        stdout,
        format === "json" ? "json" : "text"
      );
      return {
        requestedModel,
        resolvedModel: extracted.resolvedModel,
        modelEvidenceSource: extracted.resolvedModel
          ? extracted.modelEvidenceSource
          : requestedModel
            ? ("unknown" as const)
            : extracted.modelEvidenceSource
      };
    };

    if (resolveProfileProvider(request.profile) === "cursor") {
      const cursorResolved = resolveCursorBin();
      if (!cursorResolved.exists && argsResult.bin === "agent") {
        return withRequestContext(request, {
          ok: false,
          profile: request.profile,
          runnerMode: mode,
          error: `Cursor CLI not found (${cursorResolved.resolved}). Install with the Cursor installer and verify: agent --version`,
          startedAt,
          commandPreview: argsResult.preview,
          terminationReason: "spawn_error",
          failureClass: "environment",
          diagnosticMessage: "Missing Cursor CLI.",
          requestedModel,
          modelEvidenceSource: requestedModel ? "unknown" : undefined
        });
      }
    }

    if (resolveProfileProvider(request.profile) === "codex") {
      const codexResolved = resolveCodexBin();
      if (!codexResolved.exists && (argsResult.bin === "codex" || argsResult.bin.endsWith("codex"))) {
        return withRequestContext(request, {
          ok: false,
          profile: request.profile,
          runnerMode: mode,
          error: `Codex CLI not found (${codexResolved.resolved}). Install @openai/codex or set FEATURE_SPRINT_CODEX_BIN.`,
          startedAt,
          commandPreview: argsResult.preview,
          terminationReason: "spawn_error",
          failureClass: "environment",
          diagnosticMessage: "Missing Codex CLI."
        });
      }
    }

    const timeoutMs = request.timeoutMs ?? FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS;
    const maxOutputChars = resolveMaxOutputChars();

    const result = await spawnAgentProcess({
      bin: argsResult.bin,
      args: argsResult.args,
      cwd: worktreePath,
      env: process.env,
      timeoutMs,
      maxStdoutChars: maxOutputChars * 2,
      maxStderrChars: maxOutputChars,
      stdinText: argsResult.feedPromptViaStdin ? request.promptMarkdown : undefined
    });

    const completedAt = new Date().toISOString();
    const provider = resolveProfileProvider(request.profile);
    const outputFormat =
      provider === "cursor" ? resolveCursorOutputFormatEnv() : "text";
    const normalized = normalizeAgentCapturedOutput(
      result.stdout,
      result.stderr,
      outputFormat
    );
    const stdoutText = truncateOutput(result.stdout.trim(), maxOutputChars);
    const stderrText = truncateOutput(result.stderr.trim(), maxOutputChars);
    const outputText = truncateOutput(normalized.text, maxOutputChars);

    const withContext = {
      executionContext: request.executionContext,
      ...modelAttribution(result.stdout)
    };

    if (result.termination === "timeout") {
      return withRequestContext(request, {
        ok: false,
        profile: request.profile,
        runnerMode: mode,
        error: `${agentLabel} runner timed out.`,
        exitCode: result.exitCode,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        outputText: outputText || undefined,
        stdoutText: stdoutText || undefined,
        stderrText: stderrText || undefined,
        terminationReason: "timeout",
        timedOut: true,
        resultUsability: "unusable",
        diagnosticMessage: `${agentLabel} timed out after ${timeoutMs}ms.`,
        ...withContext
      });
    }

    if (result.termination === "cancelled") {
      return withRequestContext(request, {
        ok: false,
        profile: request.profile,
        runnerMode: mode,
        error: `${agentLabel} run was cancelled.`,
        exitCode: result.exitCode,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        outputText: outputText || undefined,
        stdoutText: stdoutText || undefined,
        stderrText: stderrText || undefined,
        terminationReason: "cancelled",
        cancelled: true,
        resultUsability: "unusable",
        diagnosticMessage: `${agentLabel} run cancelled.`,
        ...withContext
      });
    }

    if (result.termination === "spawn_error" || (result.exitCode ?? 1) !== 0) {
      const terminationReason =
        result.termination === "spawn_error" ? "spawn_error" : "agent_nonzero_exit";
      return withRequestContext(request, {
        ok: false,
        profile: request.profile,
        runnerMode: mode,
        error: outputText || `${agentLabel} runner failed.`,
        exitCode: result.exitCode,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        outputText: outputText || undefined,
        stdoutText: stdoutText || undefined,
        stderrText: stderrText || undefined,
        terminationReason,
        failureClass: terminationReason === "spawn_error" ? "environment" : "agent",
        resultUsability: terminationReason === "spawn_error" ? "unusable" : "needs_human_review",
        diagnosticMessage:
          terminationReason === "spawn_error"
            ? `Failed to spawn ${agentLabel} CLI.`
            : `${agentLabel} exited with code ${result.exitCode ?? 1}.`,
        ...withContext
      });
    }

    // Implementation usability is finalized after git capture (worktree evidence).
    // Scoping/review require nonempty text now.
    const parseWarnings = [...normalized.parseWarnings];
    let response: FeatureSprintRunnerResponse;

    if (isImplementationProfile(request.profile)) {
      response = withRequestContext(request, {
        ok: true,
        profile: request.profile,
        runnerMode: mode,
        outputText: outputText || undefined,
        exitCode: result.exitCode ?? 0,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        stdoutText: stdoutText || undefined,
        stderrText: stderrText || undefined,
        terminationReason: "completed",
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        ...withContext
      });
    } else {
      const usability = assessCompletedRunUsability({
        profile: request.profile,
        outputText,
        agentLabel
      });
      parseWarnings.push(...usability.parseWarnings);
      response = withRequestContext(request, {
        ok: usability.ok,
        profile: request.profile,
        runnerMode: mode,
        outputText: outputText || undefined,
        error: usability.error,
        exitCode: result.exitCode ?? 0,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        stdoutText: stdoutText || undefined,
        stderrText: stderrText || undefined,
        terminationReason: "completed",
        failureClass: usability.failureClass,
        resultUsability: usability.resultUsability,
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        diagnosticMessage: usability.diagnosticMessage,
        ...withContext
      });
    }

    if (readOnly) {
      const mutation = await detectReadonlyMutations(worktreePath, baselineStatus);
      if (!mutation.ok) {
        response = withRequestContext(request, {
          ok: false,
          profile: request.profile,
          runnerMode: mode,
          error: mutation.error,
          exitCode: result.exitCode ?? 0,
          startedAt,
          completedAt,
          commandPreview: argsResult.preview,
          outputText: response.outputText,
          stdoutText: stdoutText || undefined,
          stderrText: stderrText || undefined,
          terminationReason: "readonly_mutation",
          failureClass: "agent",
          resultUsability: "needs_human_review",
          diagnosticMessage:
            "Read-only phase wrote unexpected changes. Review the working tree; nothing was reverted.",
          gitStatus: (await captureGitMetadata(worktreePath)).gitStatus,
          ...withContext
        });
      }
    }

    return response;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runRealScopingOrReview(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const mode = resolveRunnerMode();
  const gateError = assertRealRunAllowed(request.profile);
  if (gateError) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: gateError,
      startedAt,
      terminationReason: "gate_rejected",
      failureClass: "environment",
      diagnosticMessage: gateError
    });
  }

  const cwd = request.repoPath?.trim() || process.cwd();
  return spawnAgentInWorktree(request, cwd, startedAt, { readOnly: true });
}

async function runMockImplementation(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const mode = resolveRunnerMode();
  const worktree = await createFeatureWorktree({
    repoPath: request.repoPath!,
    baseRef: request.worktree?.baseRef,
    branchHint: request.worktree?.branchName,
    cardId: request.cardId,
    planId: request.planId
  });

  if (!worktree.ok) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: worktree.error,
      startedAt,
      terminationReason: "worktree_invalid",
      failureClass: "runner",
      diagnosticMessage: worktree.error
    });
  }

  const workspaceCheck = await validateImplementationWorkspace(
    worktree.worktreePath,
    worktree.repoTopLevel
  );
  if (!workspaceCheck.ok) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: workspaceCheck.error,
      startedAt,
      worktreePath: worktree.worktreePath,
      branchName: worktree.branchName,
      terminationReason: "worktree_invalid",
      failureClass: "runner",
      diagnosticMessage: workspaceCheck.error
    });
  }

  await mkdir(path.join(worktree.worktreePath, ".life-harness"), { recursive: true });
  const markerPath = path.join(worktree.worktreePath, MOCK_IMPLEMENTATION_MARKER);
  const markerBody = [
    "# Mock implementation result",
    "",
    "This file was written inside an isolated git worktree by the Feature Sprint runner mock profile.",
    "",
    "## Prompt excerpt",
    request.promptMarkdown.slice(0, 500)
  ].join("\n");
  await writeFile(markerPath, markerBody, "utf8");

  const outputText = [
    "Mock implementation completed inside an isolated worktree.",
    "",
    `Wrote ${MOCK_IMPLEMENTATION_MARKER}.`,
    "Inspect the worktree diff before saving agent output or running review."
  ].join("\n");

  return attachImplementationMetadata(
    request,
    worktree.worktreePath,
    worktree.branchName,
    withRequestContext(request, {
      ok: true,
      profile: request.profile,
      runnerMode: mode,
      outputText,
      startedAt,
      commandPreview: `mock:${request.profile}`,
      terminationReason: "completed",
      worktreePath: worktree.worktreePath,
      branchName: worktree.branchName
    })
  );
}

async function runRealImplementation(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const mode = resolveRunnerMode();
  const gateError = assertRealImplementationAllowed(request.profile);
  if (gateError) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: gateError,
      startedAt,
      terminationReason: "gate_rejected",
      failureClass: "environment",
      diagnosticMessage: gateError
    });
  }

  const worktree = await createFeatureWorktree({
    repoPath: request.repoPath!,
    baseRef: request.worktree?.baseRef,
    branchHint: request.worktree?.branchName,
    cardId: request.cardId,
    planId: request.planId
  });

  if (!worktree.ok) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: worktree.error,
      startedAt,
      terminationReason: "worktree_invalid",
      failureClass: "runner",
      diagnosticMessage: worktree.error
    });
  }

  const workspaceCheck = await validateImplementationWorkspace(
    worktree.worktreePath,
    worktree.repoTopLevel
  );
  if (!workspaceCheck.ok) {
    return withRequestContext(request, {
      ok: false,
      profile: request.profile,
      runnerMode: mode,
      error: workspaceCheck.error,
      startedAt,
      worktreePath: worktree.worktreePath,
      branchName: worktree.branchName,
      terminationReason: "worktree_invalid",
      failureClass: "runner",
      diagnosticMessage: workspaceCheck.error
    });
  }

  const preRunChangedFiles = await captureChangedFiles(worktree.worktreePath);
  const agentResult = await spawnAgentInWorktree(request, worktree.worktreePath, startedAt);
  // Non-completed failures (timeout/cancel/spawn/nonzero) stay failed even before git capture.
  if (
    agentResult.terminationReason &&
    agentResult.terminationReason !== "completed"
  ) {
    return capGitMetadataFields({
      ...agentResult,
      worktreePath: worktree.worktreePath,
      branchName: worktree.branchName,
      executionContext: request.executionContext
    });
  }

  const withMeta = await attachImplementationMetadata(
    request,
    worktree.worktreePath,
    worktree.branchName,
    agentResult,
    { preRunChangedFiles }
  );

  const usability = assessCompletedRunUsability({
    profile: request.profile,
    outputText: withMeta.outputText,
    changedFiles: withMeta.changedFiles,
    agentLabel: agentFailureLabel(request.profile)
  });

  if (usability.ok) {
    return {
      ...withMeta,
      ok: true,
      failureClass: "none",
      resultUsability: "usable",
      parseWarnings: [
        ...(withMeta.parseWarnings ?? []),
        ...usability.parseWarnings
      ].filter(Boolean),
      executionContext: request.executionContext
    };
  }

  // Preserve the subprocess runId — do not mint a second identity on reassessment.
  return withRequestContext(request, {
    ok: false,
    profile: request.profile,
    runnerMode: mode,
    runId: withMeta.runId,
    outputText: withMeta.outputText,
    error: usability.error,
    exitCode: withMeta.exitCode,
    startedAt: withMeta.startedAt,
    completedAt: withMeta.completedAt,
    commandPreview: withMeta.commandPreview,
    worktreePath: withMeta.worktreePath,
    branchName: withMeta.branchName,
    gitStatus: withMeta.gitStatus,
    diffStat: withMeta.diffStat,
    changedFiles: withMeta.changedFiles,
    diffText: withMeta.diffText,
    verificationResults: withMeta.verificationResults,
    stdoutText: withMeta.stdoutText,
    stderrText: withMeta.stderrText,
    terminationReason: "completed",
    failureClass: usability.failureClass,
    resultUsability: usability.resultUsability,
    parseWarnings: [
      ...(withMeta.parseWarnings ?? []),
      ...usability.parseWarnings
    ],
    diagnosticMessage: usability.diagnosticMessage,
    executionContext: request.executionContext
  });
}

export async function runFeatureSprintPacketOnRunner(
  request: FeatureSprintRunnerRequest
): Promise<FeatureSprintRunnerResponse> {
  const startedAt = new Date().toISOString();
  const mode = resolveRunnerMode();

  if (isImplementationProfile(request.profile)) {
    if (mode === "mock") {
      return runMockImplementation(request, startedAt);
    }
    return runRealImplementation(request, startedAt);
  }

  if (mode === "mock") {
    return withRequestContext(request, {
      ok: true,
      profile: request.profile,
      runnerMode: mode,
      outputText: buildMockRunnerOutput(request.profile),
      startedAt,
      commandPreview: `mock:${request.profile}`,
      terminationReason: "completed",
      resultUsability: "usable",
      executionContext: request.executionContext
    });
  }

  return runRealScopingOrReview(request, startedAt);
}
