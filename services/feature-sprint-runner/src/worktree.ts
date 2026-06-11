import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BRANCH_MAX_LENGTH = 80;

export type CreateFeatureWorktreeInput = {
  repoPath: string;
  baseRef?: string;
  branchHint?: string;
  cardId?: string;
  planId?: string;
};

export type CreateFeatureWorktreeResult =
  | { ok: true; worktreePath: string; branchName: string; repoTopLevel: string }
  | { ok: false; error: string };

function runGit(
  cwd: string,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      shell: false,
      cwd,
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

export function sanitizeBranchName(raw: string): string {
  const sanitized = raw
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-./]+|[-./]+$/g, "");

  const suffix = Math.random().toString(36).slice(2, 8);
  const base = sanitized || "feature-step";
  const maxBaseLength = Math.max(1, BRANCH_MAX_LENGTH - suffix.length - 1);
  return `${base.slice(0, maxBaseLength)}-${suffix}`;
}

export function resolveWorktreeRoot(): string {
  const configured = process.env.FEATURE_SPRINT_WORKTREE_ROOT?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.tmpdir(), "life-harness-feature-worktrees");
}

export async function validateGitRepo(repoPath: string): Promise<
  | { ok: true; repoTopLevel: string }
  | { ok: false; error: string }
> {
  const resolved = path.resolve(repoPath.trim());
  const result = await runGit(resolved, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || result.stdout || "repoPath is not a git repository."
    };
  }

  return { ok: true, repoTopLevel: path.resolve(result.stdout) };
}

function buildDefaultBranchName(input: CreateFeatureWorktreeInput): string {
  const anchor = input.cardId || input.planId || "feature-step";
  const timestamp = Date.now().toString(36);
  return sanitizeBranchName(`life-harness/feature-step-${anchor}-${timestamp}`);
}

export async function createFeatureWorktree(
  input: CreateFeatureWorktreeInput
): Promise<CreateFeatureWorktreeResult> {
  const validated = await validateGitRepo(input.repoPath);
  if (!validated.ok) {
    return validated;
  }

  const branchName = sanitizeBranchName(input.branchHint?.trim() || buildDefaultBranchName(input));
  const baseRef = input.baseRef?.trim() || "HEAD";
  const worktreeRoot = resolveWorktreeRoot();
  await mkdir(worktreeRoot, { recursive: true });

  const worktreePath = path.join(worktreeRoot, branchName);
  const addResult = await runGit(validated.repoTopLevel, [
    "worktree",
    "add",
    "-b",
    branchName,
    worktreePath,
    baseRef
  ]);

  if (!addResult.ok) {
    return {
      ok: false,
      error: addResult.stderr || addResult.stdout || "Failed to create git worktree."
    };
  }

  return {
    ok: true,
    worktreePath,
    branchName,
    repoTopLevel: validated.repoTopLevel
  };
}
