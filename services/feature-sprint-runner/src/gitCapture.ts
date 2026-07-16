import { spawn } from "node:child_process";

import {
  FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX,
  FEATURE_SPRINT_RUNNER_DIFF_STAT_MAX,
  FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX,
  capDiffText
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

function splitNameOnlyLines(stdout: string): string[] {
  const files: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      files.push(trimmed);
    }
  }
  return files;
}

/**
 * Changed paths vs HEAD (staged + unstaged tracked changes) plus untracked files.
 * Includes adds, deletes, renames (new path), and modifications that `git diff HEAD`
 * reports — not only the working-tree unstaged diff.
 *
 * Attribution limitation: this is a workspace snapshot vs HEAD, not exact per-run
 * authorship. Callers that have a pre-run baseline should use
 * {@link subtractPreRunChangedFiles} so preexisting dirt is not treated as new
 * implementation evidence. Content-only edits to paths already dirty before the run
 * may still be under-attributed.
 */
export async function captureChangedFiles(worktreePath: string): Promise<string[]> {
  const [diffNames, untracked] = await Promise.all([
    runGit(worktreePath, ["diff", "--name-only", "HEAD"]),
    runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"])
  ]);

  const files = new Set<string>();
  for (const source of [diffNames.stdout, untracked.stdout]) {
    for (const name of splitNameOnlyLines(source)) {
      files.add(name);
    }
  }

  return [...files].slice(0, FEATURE_SPRINT_RUNNER_CHANGED_FILES_MAX);
}

/**
 * Paths present after a run that were not in the pre-run changed-file snapshot.
 * Does not claim exact authorship for content edits to already-dirty paths.
 */
export function subtractPreRunChangedFiles(
  preRunChangedFiles: string[],
  postRunChangedFiles: string[]
): string[] {
  const baseline = new Set(preRunChangedFiles);
  return postRunChangedFiles.filter((name) => !baseline.has(name));
}

export async function captureGitStatus(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ["status", "--short"]);
  const text = result.ok ? result.stdout : result.stderr || result.stdout;
  return truncate(text, FEATURE_SPRINT_RUNNER_GIT_STATUS_MAX);
}

export async function captureDiffStat(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ["diff", "--stat", "HEAD"]);
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

export async function captureDiffText(worktreePath: string): Promise<string | undefined> {
  try {
    const result = await runGit(worktreePath, ["diff", "HEAD", "--"]);
    if (!result.ok) {
      return undefined;
    }

    const text = result.stdout.trim();
    if (!text) {
      return undefined;
    }

    return capDiffText(text);
  } catch {
    return undefined;
  }
}

export async function captureGitMetadata(
  worktreePath: string,
  options?: { preRunChangedFiles?: string[] }
): Promise<{
  gitStatus: string;
  diffStat: string;
  changedFiles: string[];
  diffText?: string;
  /** True when a pre-run baseline was applied to narrow changedFiles. */
  usedPreRunBaseline: boolean;
}> {
  const [gitStatus, diffStat, postChangedFiles, diffText] = await Promise.all([
    captureGitStatus(worktreePath),
    captureDiffStat(worktreePath),
    captureChangedFiles(worktreePath),
    captureDiffText(worktreePath)
  ]);

  const usedPreRunBaseline = Array.isArray(options?.preRunChangedFiles);
  const changedFiles = usedPreRunBaseline
    ? subtractPreRunChangedFiles(options!.preRunChangedFiles!, postChangedFiles)
    : postChangedFiles;

  return { gitStatus, diffStat, changedFiles, diffText, usedPreRunBaseline };
}
