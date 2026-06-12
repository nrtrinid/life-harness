import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFeatureWorktree, resolveWorktreeRoot } from "../src/worktree";
import { cleanupFeatureSprintWorktree } from "../src/worktreeCleanup";

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { shell: false, cwd, env: process.env });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args.join(" ")} failed with ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function createTempGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "worktree-cleanup-repo-"));
  await runGit(dir, ["init"]);
  await runGit(dir, ["config", "user.email", "cleanup-test@example.com"]);
  await runGit(dir, ["config", "user.name", "Cleanup Test"]);
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  await runGit(dir, ["add", "README.md"]);
  await runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

describe("cleanupFeatureSprintWorktree", () => {
  const envSnapshot = { ...process.env };
  let tempRepoPath: string | undefined;
  let tempWorktreeRoot: string | undefined;

  beforeEach(async () => {
    process.env = { ...envSnapshot };
    tempWorktreeRoot = await mkdtemp(path.join(os.tmpdir(), "worktree-cleanup-root-"));
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = tempWorktreeRoot;
    tempRepoPath = await createTempGitRepo();
  });

  afterEach(async () => {
    process.env = { ...envSnapshot };
    if (tempRepoPath) {
      await rm(tempRepoPath, { recursive: true, force: true });
    }
    if (tempWorktreeRoot) {
      await rm(tempWorktreeRoot, { recursive: true, force: true });
    }
  });

  it("rejects worktree paths outside the configured root", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside-worktree");
    const result = await cleanupFeatureSprintWorktree({
      worktreePath: outsidePath,
      repoPath: tempRepoPath!
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Path not allowed.");
  });

  it("rejects cleaning the main repository checkout", async () => {
    const repoInsideRoot = path.join(tempWorktreeRoot!, "nested-repo");
    await mkdir(repoInsideRoot, { recursive: true });
    await runGit(repoInsideRoot, ["init"]);
    await runGit(repoInsideRoot, ["config", "user.email", "cleanup-test@example.com"]);
    await runGit(repoInsideRoot, ["config", "user.name", "Cleanup Test"]);
    await writeFile(path.join(repoInsideRoot, "README.md"), "# fixture\n");
    await runGit(repoInsideRoot, ["add", "README.md"]);
    await runGit(repoInsideRoot, ["commit", "-m", "init"]);

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: repoInsideRoot,
      repoPath: repoInsideRoot
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Path not allowed.");
    expect(result.error).toContain("main repository checkout");
  });

  it("returns not_found when the worktree path is missing", async () => {
    const branchName = "life-harness/feature-step-missing";
    const missingPath = path.join(resolveWorktreeRoot(), branchName);

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: missingPath,
      branchName,
      repoPath: tempRepoPath!
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("not_found");
    expect(result.message).toContain("not found");
  });

  it("blocks cleanup when the worktree has uncommitted changes", async () => {
    const branchName = "life-harness/feature-step-blocked";
    const created = await createFeatureWorktree({
      repoPath: tempRepoPath!,
      branchHint: branchName
    });
    if (!created.ok) {
      throw new Error(created.error);
    }

    await writeFile(path.join(created.worktreePath, "dirty.txt"), "wip\n");

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.hadChanges).toBe(true);
    expect(result.gitStatus).toContain("dirty.txt");
    expect(await pathExists(created.worktreePath)).toBe(true);
  });

  it("removes the worktree with force after changes via git worktree remove", async () => {
    const branchName = "life-harness/feature-step-force-clean";
    const created = await createFeatureWorktree({
      repoPath: tempRepoPath!,
      branchHint: branchName
    });
    if (!created.ok) {
      throw new Error(created.error);
    }

    await writeFile(path.join(created.worktreePath, "dirty.txt"), "wip\n");

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!,
      force: true
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("cleaned");
    expect(await pathExists(created.worktreePath)).toBe(false);
  });

  it("matches branch names with slashes against the full nested worktree path", async () => {
    const branchName = "life-harness/feature-step-slash-test";
    const created = await createFeatureWorktree({
      repoPath: tempRepoPath!,
      branchHint: branchName
    });
    if (!created.ok) {
      throw new Error(created.error);
    }

    expect(created.worktreePath).toBe(path.join(resolveWorktreeRoot(), created.branchName));

    const wrongBranchAttempt = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: "life-harness/wrong-branch-name",
      repoPath: tempRepoPath!
    });
    expect(wrongBranchAttempt.ok).toBe(false);
    expect(wrongBranchAttempt.message).toBe("Path not allowed.");

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("cleaned");
  });
});
