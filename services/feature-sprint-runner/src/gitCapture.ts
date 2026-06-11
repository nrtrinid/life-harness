import { spawn } from "node:child_process";

import {
  FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX,
  FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX,
  FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX
} from "../../../src/core/featureSprintRunner";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n[truncated]`;
}

function runGit(
  worktreePath: string,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      shell: false,
      cwd: worktreePath,
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Failed to spawn git."
      });
    });
  });
}

export async function captureGitStatus(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ["status", "--short"]);
  const text = result.ok ? result.stdout : result.stderr || result.stdout;
  return truncate(text, FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX);
}

export async function captureDiffStat(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ["diff", "--stat"]);
  const text = result.ok ? result.stdout : result.stderr || result.stdout;
  if (text.trim()) {
    return truncate(text, FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX);
  }

  const changedFiles = await captureChangedFiles(worktreePath);
  if (changedFiles.length > 0) {
    return truncate(`${changedFiles.length} untracked file(s)`, FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX);
  }

  return "";
}

export async function captureChangedFiles(worktreePath: string): Promise<string[]> {
  const [diffNames, untracked] = await Promise.all([
    runGit(worktreePath, ["diff", "--name-only"]),
    runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"])
  ]);

  const files = new Set<string>();
  for (const source of [diffNames.stdout, untracked.stdout]) {
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        files.add(trimmed);
      }
    }
  }

  return [...files].slice(0, FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX);
}

export async function captureGitMetadata(worktreePath: string): Promise<{
  gitStatus: string;
  diffStat: string;
  changedFiles: string[];
}> {
  const [gitStatus, diffStat, changedFiles] = await Promise.all([
    captureGitStatus(worktreePath),
    captureDiffStat(worktreePath),
    captureChangedFiles(worktreePath)
  ]);

  return { gitStatus, diffStat, changedFiles };
}
