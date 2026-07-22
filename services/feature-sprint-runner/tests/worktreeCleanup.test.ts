import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

  it("returns cleaned when registration and disk are both already absent", async () => {
    const branchName = "life-harness/feature-step-missing";
    const missingPath = path.join(resolveWorktreeRoot(), branchName);

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: missingPath,
      branchName,
      repoPath: tempRepoPath!
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("cleaned");
    expect(result.gitRegistered).toBe(false);
    expect(result.filesystemExists).toBe(false);
    expect(result.message).toContain("already removed");
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

  it("force-cleans a dirty worktree that contains a deep node_modules-like tree", async () => {
    const branchName = "life-harness/feature-step-deep-clean";
    const created = await createFeatureWorktree({
      repoPath: tempRepoPath!,
      branchHint: branchName
    });
    if (!created.ok) {
      throw new Error(created.error);
    }

    let nested = path.join(created.worktreePath, "node_modules");
    for (let i = 0; i < 10; i++) {
      nested = path.join(nested, `pkg_${i}`);
      await mkdir(nested, { recursive: true });
    }
    await writeFile(path.join(nested, "index.js"), "module.exports = 1;\n");
    await writeFile(path.join(created.worktreePath, "dirty.txt"), "wip\n");

    const blocked = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!
    });
    expect(blocked.status).toBe("blocked");

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!,
      force: true
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("cleaned");
    expect(result.gitRegistered).toBe(false);
    expect(result.filesystemExists).toBe(false);
    expect(await pathExists(created.worktreePath)).toBe(false);

    const again = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      branchName: created.branchName,
      repoPath: tempRepoPath!,
      force: true
    });
    expect(again.ok).toBe(true);
    expect(again.status).toBe("cleaned");
  });

  it("removes an orphan directory after Git registration is already gone", async () => {
    const branchName = "life-harness/feature-step-orphan";
    const orphanPath = path.join(resolveWorktreeRoot(), branchName);
    await mkdir(orphanPath, { recursive: true });
    await writeFile(path.join(orphanPath, "leftover.txt"), "orphan\n");

    const blockedWithoutForce = await cleanupFeatureSprintWorktree({
      worktreePath: orphanPath,
      branchName,
      repoPath: tempRepoPath!
    });
    expect(blockedWithoutForce.status).toBe("orphaned_on_disk");
    expect(blockedWithoutForce.ok).toBe(false);
    expect(blockedWithoutForce.message).toContain("Force clean");
    expect(await pathExists(orphanPath)).toBe(true);

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: orphanPath,
      branchName,
      repoPath: tempRepoPath!,
      force: true
    });

    expect(result.status).toBe("cleaned");
    expect(result.ok).toBe(true);
    expect(result.gitStage?.skipped).toBe(true);
    expect(result.filesystemStage?.ok).toBe(true);
    expect(await pathExists(orphanPath)).toBe(false);
  });

  it("does not delete an outside symlink target while cleaning an orphan tree", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "worktree-cleanup-outside-"));
    await writeFile(path.join(outside, "keep.txt"), "keep\n");

    const branchName = "life-harness/feature-step-link";
    const orphanPath = path.join(resolveWorktreeRoot(), branchName);
    await mkdir(orphanPath, { recursive: true });
    await symlink(outside, path.join(orphanPath, "outside-link"), process.platform === "win32" ? "junction" : "dir");

    const result = await cleanupFeatureSprintWorktree({
      worktreePath: orphanPath,
      branchName,
      repoPath: tempRepoPath!,
      force: true
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("cleaned");
    expect(await pathExists(path.join(outside, "keep.txt"))).toBe(true);
    await rm(outside, { recursive: true, force: true });
  });
});
