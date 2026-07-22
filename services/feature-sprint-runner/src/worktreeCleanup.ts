import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import type {
  FeatureSprintWorktreeCleanupRequest,
  FeatureSprintWorktreeCleanupResponse,
  FeatureSprintWorktreeCleanupStageResult
} from "../../../src/core/featureSprintRunner";
import { reconcileFeatureSprintWorktreeCleanupState } from "../../../src/core/featureSprintRunner";
import { removeValidatedWorktreeDirectory } from "./removeValidatedWorktreeDirectory";
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

function normalizePathForCompare(targetPath: string): string {
  let normalized = path.resolve(targetPath);
  if (process.platform === "win32") {
    normalized = normalized.toLowerCase();
  }
  if (normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** True when `git worktree list` still registers this path. */
export async function isGitWorktreeRegistered(
  repoRoot: string,
  worktreePath: string
): Promise<boolean> {
  const listed = await runGit(repoRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) {
    return false;
  }

  const expected = normalizePathForCompare(worktreePath);
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) {
      continue;
    }
    const candidate = normalizePathForCompare(line.slice("worktree ".length).trim());
    if (candidate === expected) {
      return true;
    }
  }
  return false;
}

function stageSkipped(reason?: string): FeatureSprintWorktreeCleanupStageResult {
  return { attempted: false, ok: true, skipped: true, error: reason };
}

function stageOk(method?: string): FeatureSprintWorktreeCleanupStageResult {
  return { attempted: true, ok: true, method };
}

function stageFailed(error: string, method?: string): FeatureSprintWorktreeCleanupStageResult {
  return { attempted: true, ok: false, error, method };
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

  let gitRegistered = await isGitWorktreeRegistered(repoRoot, resolvedWorktreePath);
  let filesystemExists = await pathExists(resolvedWorktreePath);
  let gitStage: FeatureSprintWorktreeCleanupStageResult = stageSkipped("not needed yet");
  let filesystemStage: FeatureSprintWorktreeCleanupStageResult = stageSkipped("not needed yet");
  let hadChanges: boolean | undefined;
  let gitStatus: string | undefined;

  // Idempotent terminal state: both already gone.
  if (!gitRegistered && !filesystemExists) {
    const reconciled = reconcileFeatureSprintWorktreeCleanupState({
      gitRegistered: false,
      filesystemExists: false
    });
    return buildResponse({
      ok: reconciled.ok,
      status: reconciled.status,
      worktreePath,
      branchName: request.branchName,
      message: reconciled.message,
      gitRegistered: false,
      filesystemExists: false,
      gitStage: stageSkipped("already absent"),
      filesystemStage: stageSkipped("already absent"),
      startedAt
    });
  }

  // Dirty-worktree gate only when a live Git worktree remains on disk.
  if (gitRegistered && filesystemExists) {
    const insideWorktree = await runGit(resolvedWorktreePath, [
      "rev-parse",
      "--is-inside-work-tree"
    ]);
    if (insideWorktree.ok && insideWorktree.stdout === "true") {
      const statusResult = await runGit(resolvedWorktreePath, ["status", "--short"]);
      gitStatus = statusResult.ok
        ? statusResult.stdout
        : statusResult.stderr || statusResult.stdout;
      hadChanges = Boolean((gitStatus ?? "").trim());

      if (hadChanges && request.force !== true) {
        const blocked = reconcileFeatureSprintWorktreeCleanupState({
          gitRegistered: true,
          filesystemExists: true,
          blocked: true,
          hadChanges: true
        });
        return buildResponse({
          ok: blocked.ok,
          status: blocked.status,
          worktreePath,
          branchName: request.branchName,
          message: blocked.message,
          hadChanges: true,
          gitStatus,
          gitRegistered: true,
          filesystemExists: true,
          gitStage: stageSkipped("blocked by dirty worktree"),
          filesystemStage: stageSkipped("blocked by dirty worktree"),
          startedAt
        });
      }
    }
  }

  // Stage 1: Git registration cleanup
  if (gitRegistered) {
    const removeArgs = ["worktree", "remove"];
    if (request.force === true) {
      removeArgs.push("--force");
    }
    removeArgs.push(resolvedWorktreePath);

    const removeResult = await runGit(repoRoot, removeArgs);
    gitRegistered = await isGitWorktreeRegistered(repoRoot, resolvedWorktreePath);
    filesystemExists = await pathExists(resolvedWorktreePath);

    if (!gitRegistered) {
      gitStage = stageOk(request.force ? "git worktree remove --force" : "git worktree remove");
      if (!removeResult.ok) {
        // Git may deregister while still returning non-zero (Windows deep trees).
        gitStage = {
          ...gitStage,
          error: removeResult.stderr || removeResult.stdout || "git worktree remove reported failure."
        };
      }
    } else {
      gitStage = stageFailed(
        removeResult.stderr || removeResult.stdout || "git worktree remove failed.",
        request.force ? "git worktree remove --force" : "git worktree remove"
      );
    }
  } else {
    gitStage = stageSkipped("registration already absent");
  }

  // Stage 2: filesystem cleanup only when Git registration is already gone.
  // Never delete files for a path that is still a registered worktree.
  // Orphan directories may retain dirty leftovers — require explicit force.
  filesystemExists = await pathExists(resolvedWorktreePath);
  gitRegistered = await isGitWorktreeRegistered(repoRoot, resolvedWorktreePath);
  if (filesystemExists && !gitRegistered) {
    if (request.force !== true) {
      filesystemStage = stageSkipped("force required for orphan filesystem cleanup");
    } else {
      const removal = await removeValidatedWorktreeDirectory(resolvedWorktreePath);
      filesystemExists = await pathExists(resolvedWorktreePath);
      if (removal.ok && !filesystemExists) {
        filesystemStage = stageOk(removal.method);
      } else {
        filesystemStage = stageFailed(
          removal.error || "Filesystem directory removal failed.",
          removal.method
        );
      }
    }
  } else if (!filesystemExists) {
    filesystemStage = stageSkipped("filesystem path already absent");
  } else {
    filesystemStage = stageSkipped("git registration still present; refusing filesystem delete");
  }

  gitRegistered = await isGitWorktreeRegistered(repoRoot, resolvedWorktreePath);
  filesystemExists = await pathExists(resolvedWorktreePath);

  const reconciled = reconcileFeatureSprintWorktreeCleanupState({
    gitRegistered,
    filesystemExists,
    hadChanges
  });

  let message = reconciled.message;
  if (
    reconciled.status === "orphaned_on_disk" &&
    filesystemStage.skipped &&
    request.force !== true
  ) {
    message =
      "Git worktree removed, but files remain on disk. Use Force clean to finish filesystem cleanup.";
  } else if (reconciled.status === "cleaned" && request.force === true && hadChanges) {
    message = "Worktree removed with force after uncommitted changes.";
  } else if (reconciled.status === "cleaned" && gitStage.attempted && filesystemStage.attempted) {
    message = "Worktree removed.";
  } else if (reconciled.status === "cleaned") {
    message = "Worktree already removed from Git and disk.";
  }

  return buildResponse({
    ok: reconciled.ok,
    status: reconciled.status,
    worktreePath,
    branchName: request.branchName,
    message,
    hadChanges,
    gitStatus,
    error:
      reconciled.ok
        ? undefined
        : filesystemStage.error || gitStage.error || reconciled.message,
    gitRegistered,
    filesystemExists,
    gitStage,
    filesystemStage,
    startedAt
  });
}
