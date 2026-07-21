import { spawn } from "node:child_process";

import {
  FEATURE_SPRINT_VERIFY_MAX_COMMANDS,
  FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS,
  type FeatureSprintVerificationResult,
  type FeatureSprintVerificationStatus
} from "../../../src/core/featureSprintRunner";

export type ParsedVerificationCommand = {
  command: string;
  bin: string;
  args: string[];
};

export type VerificationSpawnSpec = {
  file: string;
  args: string[];
};

const ALLOWED_BINS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "tsc",
  "vitest",
  "pytest",
  "python",
  "python3"
]);

const WINDOWS_PACKAGE_MANAGER_BINS = new Set(["npm", "npx", "pnpm", "yarn"]);

/** Fully blocked bins — never executed. Narrow git allowlist is handled separately. */
const BLOCKED_BINS = new Set(["cd", "rm", "del", "mv", "cp", "curl", "wget", "ssh", "scp"]);

/**
 * Read-only git forms permitted for Project Registry verification.
 * Other git verbs remain rejected (not executed).
 */
const ALLOWED_GIT_ARG_FORMS: ReadonlyArray<readonly string[]> = [["diff", "--check"]];

const SHELL_METACHAR_PATTERN = /[|`;&<>$()\\\n\r"'`]/;

export function resolveVerifyTimeoutMs(): number {
  const raw = process.env.FEATURE_SPRINT_VERIFY_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 120_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export function resolveVerifyMaxCommands(): number {
  const raw = process.env.FEATURE_SPRINT_VERIFY_MAX_COMMANDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : FEATURE_SPRINT_VERIFY_MAX_COMMANDS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FEATURE_SPRINT_VERIFY_MAX_COMMANDS;
}

export function resolveVerifyMaxOutputChars(): number {
  const raw = process.env.FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FEATURE_SPRINT_VERIFY_MAX_OUTPUT_CHARS;
}

export function buildVerificationSpawn(
  parsed: ParsedVerificationCommand,
  platform: NodeJS.Platform = process.platform
): VerificationSpawnSpec {
  if (platform === "win32" && WINDOWS_PACKAGE_MANAGER_BINS.has(parsed.bin)) {
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", parsed.bin, ...parsed.args]
    };
  }

  return {
    file: parsed.bin,
    args: parsed.args
  };
}

function truncateExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n[truncated]`;
}

function isAllowedGitArgs(args: string[]): boolean {
  return ALLOWED_GIT_ARG_FORMS.some(
    (form) => form.length === args.length && form.every((token, index) => token === args[index])
  );
}

export function parseVerificationCommand(command: string): ParsedVerificationCommand | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return null;
  }

  if (SHELL_METACHAR_PATTERN.test(trimmed)) {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) {
    return null;
  }

  const first = tokens[0]!;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
    return null;
  }

  const binLower = first.toLowerCase();
  const args = tokens.slice(1);

  if (binLower === "git") {
    if (!isAllowedGitArgs(args)) {
      return null;
    }
    return {
      command: trimmed,
      bin: "git",
      args
    };
  }

  if (BLOCKED_BINS.has(binLower)) {
    return null;
  }

  if (!ALLOWED_BINS.has(binLower)) {
    return null;
  }

  return {
    command: trimmed,
    bin: binLower,
    args
  };
}

function resultWithStatus(
  command: string,
  startedAt: string,
  status: FeatureSprintVerificationStatus,
  extras: Partial<FeatureSprintVerificationResult> = {}
): FeatureSprintVerificationResult {
  return {
    command,
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    ...extras
  };
}

async function runSingleCommand(
  worktreePath: string,
  parsed: ParsedVerificationCommand,
  timeoutMs: number,
  maxOutputChars: number
): Promise<FeatureSprintVerificationResult> {
  const startedAt = new Date().toISOString();
  const spawnSpec = buildVerificationSpawn(parsed);

  const result = await new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError?: string;
  }>((resolve) => {
    let child;
    try {
      child = spawn(spawnSpec.file, spawnSpec.args, {
        shell: false,
        cwd: worktreePath,
        env: process.env
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to spawn verification command.";
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: message
      });
      return;
    }

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
      if (stderr.length > maxOutputChars * 2) {
        stderr = stderr.slice(0, maxOutputChars * 2);
      }
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut: killed });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr,
        timedOut: false,
        spawnError: error.message
      });
    });
  });

  const completedAt = new Date().toISOString();
  const stdoutExcerpt = truncateExcerpt(result.stdout.trim(), maxOutputChars) || undefined;
  const stderrExcerpt = truncateExcerpt(result.stderr.trim(), maxOutputChars) || undefined;

  if (result.spawnError) {
    return resultWithStatus(parsed.command, startedAt, "failed", {
      completedAt,
      error: result.spawnError,
      stdoutExcerpt,
      stderrExcerpt
    });
  }

  if (result.timedOut) {
    return resultWithStatus(parsed.command, startedAt, "timed_out", {
      completedAt,
      exitCode: result.exitCode ?? undefined,
      error: "Verification command timed out.",
      stdoutExcerpt,
      stderrExcerpt
    });
  }

  const exitCode = result.exitCode ?? 1;
  // Success follows process evidence: spawn ok, not timed out, exit code 0.
  // Nonempty stderr alone does not fail a successful exit.
  return {
    command: parsed.command,
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    stdoutExcerpt,
    stderrExcerpt,
    startedAt,
    completedAt
  };
}

export async function runVerificationCommands(
  worktreePath: string,
  commands: string[],
  options: { timeoutMs?: number; maxOutputChars?: number; maxCommands?: number } = {}
): Promise<FeatureSprintVerificationResult[]> {
  const timeoutMs = options.timeoutMs ?? resolveVerifyTimeoutMs();
  const maxOutputChars = options.maxOutputChars ?? resolveVerifyMaxOutputChars();
  const maxCommands = options.maxCommands ?? resolveVerifyMaxCommands();
  const cappedCommands = commands.slice(0, maxCommands);
  const results: FeatureSprintVerificationResult[] = [];

  for (const command of cappedCommands) {
    const startedAt = new Date().toISOString();
    const trimmed = command.trim() || command;
    const parsed = parseVerificationCommand(command);
    if (!parsed) {
      results.push(
        resultWithStatus(trimmed, startedAt, "rejected", {
          error: "Command rejected by verification parser."
        })
      );
      continue;
    }

    results.push(await runSingleCommand(worktreePath, parsed, timeoutMs, maxOutputChars));
  }

  return results;
}
