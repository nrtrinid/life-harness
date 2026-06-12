import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import type {
  FeatureSprintWorktreeCleanupRequest,
  FeatureSprintWorktreeCleanupResponse
} from "../../../src/core/featureSprintRunner";
import { resolveWorktreeRoot, validateGitRepo } from "./worktree";

function nowIso(): string {
  return new Date().toISOString();
}

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

function buildResponse(
  partial: Omit<FeatureSprintWorktreeCleanupResponse, "startedAt" | "completedAt"> & {
    startedAt: string;
  }
): FeatureSprintWorktreeCleanupResponse {
  return {
    ...partial,
    completedAt: nowIso()
  };
}

function isUnderWorktreeRoot(resolvedPath: string, worktreeRoot: string): boolean {
  const root = path.resolve(worktreeRoot);
  const target = path.resolve(resolvedPath);
  if (target === root) {
    return false;
  }
  return target.startsWith(`${root}${path.sep}`);
}

function matchesExpectedWorktreePath(
  resolvedWorktreePath: string,
  branchName: string | undefined,
  worktreeRoot: string
): boolean {
  if (!branchName) {
    return isUnderWorktreeRoot(resolvedWorktreePath, worktreeRoot);
  }

  const expected = path.resolve(path.join(worktreeRoot, branchName));
  return resolvedWorktreePath === expected;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupFeatureSprintWorktree(
  request: FeatureSprintWorktreeCleanupRequest
): Promise<FeatureSprintWorktreeCleanupResponse> {
  const startedAt = nowIso();
  const worktreePath = request.worktreePath.trim();
  const resolvedWorktreePath = path.resolve(worktreePath);
  const worktreeRoot = resolveWorktreeRoot();
  const filesystemRoot = path.parse(resolvedWorktreePath).root;

  if (resolvedWorktreePath === filesystemRoot) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path not allowed.",
      error: "Refusing to clean filesystem root.",
      startedAt
    });
  }

  if (!isUnderWorktreeRoot(resolvedWorktreePath, worktreeRoot)) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path not allowed.",
      error: "Worktree path is outside the Feature Sprint worktree root.",
      startedAt
    });
  }

  if (!matchesExpectedWorktreePath(resolvedWorktreePath, request.branchName, worktreeRoot)) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path not allowed.",
      error: "Worktree path does not match the recorded branch location.",
      startedAt
    });
  }

  const repoPath = request.repoPath?.trim();
  if (!repoPath) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "repoPath is required to remove a worktree.",
      error: "Missing repoPath.",
      startedAt
    });
  }

  const repoValidated = await validateGitRepo(repoPath);
  if (!repoValidated.ok) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: repoValidated.error,
      error: repoValidated.error,
      startedAt
    });
  }

  const repoRoot = repoValidated.repoTopLevel;
  if (resolvedWorktreePath === repoRoot) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path not allowed.",
      error: "Refusing to clean the main repository checkout.",
      startedAt
    });
  }

  if (repoRoot.startsWith(`${resolvedWorktreePath}${path.sep}`)) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path not allowed.",
      error: "Worktree path cannot contain the repository root.",
      startedAt
    });
  }

  if (!(await pathExists(resolvedWorktreePath))) {
    return buildResponse({
      ok: false,
      status: "not_found",
      worktreePath,
      branchName: request.branchName,
      message: "Worktree path was not found on disk.",
      startedAt
    });
  }

  const insideWorktree = await runGit(resolvedWorktreePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!insideWorktree.ok || insideWorktree.stdout !== "true") {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Path is not a git worktree.",
      error: insideWorktree.stderr || insideWorktree.stdout || "Not a worktree.",
      startedAt
    });
  }

  const statusResult = await runGit(resolvedWorktreePath, ["status", "--short"]);
  const gitStatus = statusResult.ok ? statusResult.stdout : statusResult.stderr || statusResult.stdout;
  const hadChanges = Boolean(gitStatus.trim());

  if (hadChanges && request.force !== true) {
    return buildResponse({
      ok: false,
      status: "blocked",
      worktreePath,
      branchName: request.branchName,
      message:
        "Worktree has uncommitted changes. Inspect output and diff, then use force clean after review.",
      hadChanges: true,
      gitStatus,
      startedAt
    });
  }

  const removeArgs = ["worktree", "remove"];
  if (request.force === true) {
    removeArgs.push("--force");
  }
  removeArgs.push(resolvedWorktreePath);

  const removeResult = await runGit(repoRoot, removeArgs);
  if (!removeResult.ok) {
    return buildResponse({
      ok: false,
      status: "failed",
      worktreePath,
      branchName: request.branchName,
      message: "Failed to remove worktree.",
      error: removeResult.stderr || removeResult.stdout || "git worktree remove failed.",
      hadChanges,
      gitStatus,
      startedAt
    });
  }

  return buildResponse({
    ok: true,
    status: "cleaned",
    worktreePath,
    branchName: request.branchName,
    message: request.force
      ? "Worktree removed with force after uncommitted changes."
      : "Worktree removed.",
    hadChanges,
    gitStatus,
    startedAt
  });
}
