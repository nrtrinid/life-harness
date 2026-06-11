import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  FEATURE_SPRINT_RUNNER_DEFAULT_TIMEOUT_MS,
  type FeatureSprintRunnerRequest,
  type FeatureSprintRunnerResponse
} from "../../../src/core/featureSprintRunner";
import { buildCodexArgs } from "./codexArgs";
import { resolveRunnerToken } from "./auth";
import { buildMockRunnerOutput } from "./mockOutput";

export type RunnerMode = "mock" | "codex";

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
        cwd: request.repoPath?.trim() || process.cwd(),
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

export async function runFeatureSprintPacketOnRunner(
  request: FeatureSprintRunnerRequest
): Promise<FeatureSprintRunnerResponse> {
  const startedAt = new Date().toISOString();
  const mode = resolveRunnerMode();

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
