import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  capGitMetadataFields,
  FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { buildCodexArgs } from "./codexArgs";
import { resolveRunnerToken } from "./auth";
import { captureGitMetadata } from "./gitCapture";
import { buildMockRunnerOutput } from "./mockOutput";
import { createFeatureWorktree } from "./worktree";

export type RunnerMode = "mock" | "codex";

const MOCK_IMPLEMENTATION_MARKER = ".life-harness/mock-implementation-result.md";

export function resolveRunnerMode(): RunnerMode {
  const mode = process.env.FEATURE_SPRINT_RUNNER_MODE?.trim().toLowerCase();
  if (mode === "codex") {
    return "codex";
  }
  return "mock";
}

export function resolveMaxOutputChars(): number {
  const raw = process.env.FEATURE_SPRINT_RUNNER_MAX_OUTPUT_CHARS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 500_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500_000;
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

function assertRealCodexAllowed(): string | undefined {
  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX !== "1") {
    return "Real Codex mode requires FEATURE_SPRINT_RUNNER_ENABLE_CODEX=1.";
  }

  if (!resolveRunnerToken()) {
    return "Real Codex mode requires FEATURE_SPRINT_RUNNER_TOKEN.";
  }

  return undefined;
}

function assertRealImplementationAllowed(): string | undefined {
  const codexGate = assertRealCodexAllowed();
  if (codexGate) {
    return codexGate;
  }

  if (process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION !== "1") {
    return "Real implementation mode requires FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION=1.";
  }

  return undefined;
}

async function spawnCodexInWorktree(
  request: FeatureSprintRunnerRequest,
  worktreePath: string,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "feature-sprint-runner-"));
  const promptPath = path.join(tempDir, "prompt.md");

  try {
    await writeFile(promptPath, request.promptMarkdown, "utf8");
    const argsResult = buildCodexArgs(promptPath);
    if (!argsResult.ok) {
      return {
        ok: false,
        profile: request.profile,
        error: argsResult.error,
        startedAt,
        completedAt: new Date().toISOString()
      };
    }

    const timeoutMs = request.timeoutMs ?? FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS;
    const maxOutputChars = resolveMaxOutputChars();

    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      const child = spawn(argsResult.bin, argsResult.args, {
        shell: false,
        cwd: worktreePath,
        env: process.env
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > maxOutputChars * 2) {
          stdout = stdout.slice(0, maxOutputChars * 2);
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > maxOutputChars) {
          stderr = stderr.slice(0, maxOutputChars);
        }
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, timedOut: killed });
      });

      child.on("error", () => {
        clearTimeout(timer);
        resolve({ exitCode: 1, stdout, stderr: `${stderr}\nFailed to spawn Codex CLI.`, timedOut: false });
      });
    });

    const completedAt = new Date().toISOString();
    const outputText = truncateOutput(
      [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
      maxOutputChars
    );

    if (result.timedOut) {
      return {
        ok: false,
        profile: request.profile,
        error: "Codex runner timed out.",
        exitCode: result.exitCode ?? undefined,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        outputText: outputText || undefined
      };
    }

    if ((result.exitCode ?? 1) !== 0) {
      return {
        ok: false,
        profile: request.profile,
        error: outputText || "Codex runner failed.",
        exitCode: result.exitCode ?? undefined,
        startedAt,
        completedAt,
        commandPreview: argsResult.preview,
        outputText: outputText || undefined
      };
    }

    let finalOutput = outputText;
    if (!finalOutput) {
      try {
        finalOutput = await readFile(promptPath, "utf8");
      } catch {
        finalOutput = "";
      }
    }

    return {
      ok: true,
      profile: request.profile,
      outputText: truncateOutput(finalOutput, maxOutputChars),
      exitCode: result.exitCode ?? 0,
      startedAt,
      completedAt,
      commandPreview: argsResult.preview
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runRealCodex(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const gateError = assertRealCodexAllowed();
  if (gateError) {
    return {
      ok: false,
      profile: request.profile,
      error: gateError,
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  return spawnCodexInWorktree(request, request.repoPath?.trim() || process.cwd(), startedAt);
}

async function runMockImplementation(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const worktree = await createFeatureWorktree({
    repoPath: request.repoPath!,
    baseRef: request.worktree?.baseRef,
    branchHint: request.worktree?.branchName,
    cardId: request.cardId,
    planId: request.planId
  });

  if (!worktree.ok) {
    return {
      ok: false,
      profile: request.profile,
      error: worktree.error,
      startedAt,
      completedAt: new Date().toISOString()
    };
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

  const git = await captureGitMetadata(worktree.worktreePath);
  const outputText = [
    "Mock implementation completed inside an isolated worktree.",
    "",
    `Wrote ${MOCK_IMPLEMENTATION_MARKER}.`,
    "Inspect the worktree diff before saving agent output or running review."
  ].join("\n");

  return capGitMetadataFields({
    ok: true,
    profile: request.profile,
    outputText,
    startedAt,
    completedAt: new Date().toISOString(),
    commandPreview: "mock:codex_implementation",
    worktreePath: worktree.worktreePath,
    branchName: worktree.branchName,
    gitStatus: git.gitStatus,
    diffStat: git.diffStat,
    changedFiles: git.changedFiles
  });
}

async function runRealImplementation(
  request: FeatureSprintRunnerRequest,
  startedAt: string
): Promise<FeatureSprintRunnerResponse> {
  const gateError = assertRealImplementationAllowed();
  if (gateError) {
    return {
      ok: false,
      profile: request.profile,
      error: gateError,
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  const worktree = await createFeatureWorktree({
    repoPath: request.repoPath!,
    baseRef: request.worktree?.baseRef,
    branchHint: request.worktree?.branchName,
    cardId: request.cardId,
    planId: request.planId
  });

  if (!worktree.ok) {
    return {
      ok: false,
      profile: request.profile,
      error: worktree.error,
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  const codexResult = await spawnCodexInWorktree(request, worktree.worktreePath, startedAt);
  const git = await captureGitMetadata(worktree.worktreePath);

  return capGitMetadataFields({
    ...codexResult,
    worktreePath: worktree.worktreePath,
    branchName: worktree.branchName,
    gitStatus: git.gitStatus,
    diffStat: git.diffStat,
    changedFiles: git.changedFiles
  });
}

export async function runFeatureSprintPacketOnRunner(
  request: FeatureSprintRunnerRequest
): Promise<FeatureSprintRunnerResponse> {
  const startedAt = new Date().toISOString();
  const mode = resolveRunnerMode();

  if (request.profile === "codex_implementation") {
    if (mode === "mock") {
      return runMockImplementation(request, startedAt);
    }
    return runRealImplementation(request, startedAt);
  }

  if (mode === "mock") {
    return {
      ok: true,
      profile: request.profile,
      outputText: buildMockRunnerOutput(request.profile),
      startedAt,
      completedAt: new Date().toISOString(),
      commandPreview: `mock:${request.profile}`
    };
  }

  return runRealCodex(request, startedAt);
}
