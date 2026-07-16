import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import { buildAgentSpawnSpec } from "./agentSpawn";

export type SpawnAgentTermination = "completed" | "timeout" | "cancelled" | "spawn_error";

export type SpawnAgentResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  termination: SpawnAgentTermination;
  timedOut: boolean;
  cancelled: boolean;
  pid?: number;
};

export type SpawnAgentOptions = {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxStdoutChars: number;
  maxStderrChars: number;
  stdinText?: string;
  /** When aborted, classifies termination as cancelled (not timeout). */
  signal?: AbortSignal;
  killGraceMs?: number;
  platform?: NodeJS.Platform;
};

/** Kill a process tree. On Windows uses `taskkill /T` so cmd/PowerShell descendants die. */
export function killProcessTree(
  pid: number,
  platform: NodeJS.Platform = process.platform
): void {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }

  if (platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
}

function escalateKill(
  child: ChildProcessWithoutNullStreams,
  graceMs: number,
  platform: NodeJS.Platform
): { clear: () => void } | undefined {
  const pid = child.pid;
  try {
    if (platform === "win32" && pid) {
      // Immediate tree kill on Windows — POSIX signals do not reliably stop cmd.exe children.
      killProcessTree(pid, platform);
      return undefined;
    }
    child.kill("SIGTERM");
  } catch {
    // ignore
  }

  const graceTimer = setTimeout(() => {
    if (pid) {
      killProcessTree(pid, platform);
      return;
    }
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, graceMs);
  graceTimer.unref?.();

  return {
    clear: () => {
      clearTimeout(graceTimer);
    }
  };
}

/**
 * Spawn an agent CLI, capture stdout/stderr/exit, and classify timeout vs cancel.
 */
export function spawnAgentProcess(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const spawnSpec = buildAgentSpawnSpec(options.bin, options.args);
  const graceMs = options.killGraceMs ?? 2_000;
  const platform = options.platform ?? process.platform;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let child: ChildProcessWithoutNullStreams;
    let clearGraceKill: (() => void) | undefined;

    const finish = (result: SpawnAgentResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearGraceKill?.();
      clearGraceKill = undefined;
      resolve(result);
    };

    if (options.signal?.aborted) {
      finish({
        exitCode: null,
        stdout: "",
        stderr: "Run cancelled before spawn.",
        termination: "cancelled",
        timedOut: false,
        cancelled: true
      });
      return;
    }

    try {
      child = spawn(spawnSpec.file, spawnSpec.args, {
        shell: false,
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: options.stdinText !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
        windowsVerbatimArguments: spawnSpec.windowsVerbatimArguments === true
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish({
        exitCode: 1,
        stdout: "",
        stderr: `Failed to spawn agent CLI: ${message}`,
        termination: "spawn_error",
        timedOut: false,
        cancelled: false
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      const grace = escalateKill(child, graceMs, platform);
      clearGraceKill = grace?.clear;
    }, options.timeoutMs);

    const onAbort = () => {
      cancelled = true;
      const grace = escalateKill(child, graceMs, platform);
      clearGraceKill = grace?.clear;
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    if (options.stdinText !== undefined) {
      if (!child.stdin) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        finish({
          exitCode: 1,
          stdout: "",
          stderr: "Failed to pipe prompt to agent CLI: stdin unavailable.",
          termination: "spawn_error",
          timedOut: false,
          cancelled: false
        });
        return;
      }
      child.stdin.write(options.stdinText, "utf8");
      child.stdin.end();
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > options.maxStdoutChars) {
        stdout = stdout.slice(0, options.maxStdoutChars);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > options.maxStderrChars) {
        stderr = stderr.slice(0, options.maxStderrChars);
      }
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      clearGraceKill?.();
      clearGraceKill = undefined;
      options.signal?.removeEventListener("abort", onAbort);
      let termination: SpawnAgentTermination = "completed";
      if (cancelled) {
        termination = "cancelled";
      } else if (timedOut) {
        termination = "timeout";
      }
      finish({
        exitCode,
        stdout,
        stderr,
        termination,
        timedOut,
        cancelled,
        pid: child.pid
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      clearGraceKill?.();
      clearGraceKill = undefined;
      options.signal?.removeEventListener("abort", onAbort);
      finish({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\nFailed to spawn agent CLI: ${error.message}`.trim(),
        termination: "spawn_error",
        timedOut: false,
        cancelled: false,
        pid: child.pid
      });
    });
  });
}
