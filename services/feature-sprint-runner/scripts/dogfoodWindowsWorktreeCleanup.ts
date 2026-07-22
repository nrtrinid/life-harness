import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { cleanupFeatureSprintWorktree } from "../src/worktreeCleanup";
import { createFeatureWorktree, resolveWorktreeRoot } from "../src/worktree";

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { shell: false, cwd, env: process.env });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args.join(" ")} => ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function removeTrackedTempDir(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const tmpRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(tmpRoot + path.sep) && resolved !== tmpRoot) {
    throw new Error(`Refusing to remove path outside os.tmpdir(): ${resolved}`);
  }
  const base = path.basename(resolved);
  if (
    !base.startsWith("windows-cleanup-dogfood-repo-") &&
    !base.startsWith("windows-cleanup-dogfood-root-") &&
    !base.startsWith("windows-cleanup-dogfood-outside-")
  ) {
    throw new Error(`Refusing to remove untracked temp path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const trackedTempDirs: string[] = [];
  const previousWorktreeRoot = process.env.FEATURE_SPRINT_WORKTREE_ROOT;
  let primaryError: unknown;

  try {
    const repo = await mkdtemp(path.join(os.tmpdir(), "windows-cleanup-dogfood-repo-"));
    trackedTempDirs.push(repo);
    await runGit(repo, ["init"]);
    await runGit(repo, ["config", "user.email", "dogfood@example.com"]);
    await runGit(repo, ["config", "user.name", "Dogfood"]);
    await writeFile(path.join(repo, "README.md"), "# dogfood\n");
    await runGit(repo, ["add", "README.md"]);
    await runGit(repo, ["commit", "-m", "init"]);

    const worktreeRoot = await mkdtemp(path.join(os.tmpdir(), "windows-cleanup-dogfood-root-"));
    trackedTempDirs.push(worktreeRoot);
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = worktreeRoot;

    const outside = await mkdtemp(path.join(os.tmpdir(), "windows-cleanup-dogfood-outside-"));
    trackedTempDirs.push(outside);
    await writeFile(path.join(outside, "keep.txt"), "outside\n");

    const created = await createFeatureWorktree({
      repoPath: repo,
      cardId: "card-windows-cleanup",
      stepId: "step-windows-cleanup",
      baseRef: "HEAD"
    });
    if (!created.ok) {
      throw new Error(created.error);
    }
    console.log("CREATE_OK", created.worktreePath.startsWith(resolveWorktreeRoot()));

    let nested = path.join(created.worktreePath, "node_modules");
    for (let i = 0; i < 14; i++) {
      nested = path.join(nested, `deep_${i}`);
      await mkdir(nested, { recursive: true });
    }
    await writeFile(path.join(nested, "pkg.json"), "{\"name\":\"deep\"}\n");
    await writeFile(path.join(created.worktreePath, "dirty.txt"), "dirty\n");

    try {
      await symlink(
        outside,
        path.join(created.worktreePath, "outside-link"),
        process.platform === "win32" ? "junction" : "dir"
      );
      console.log("LINK_FIXTURE_OK", true);
    } catch (error) {
      console.log(
        "LINK_FIXTURE_SKIPPED",
        error instanceof Error ? error.message : String(error)
      );
    }

    const blocked = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      repoPath: repo,
      branchName: created.branchName,
      force: false
    });
    console.log("DIRTY_BLOCKED", blocked.status, blocked.ok === false);
    if (blocked.status !== "blocked") {
      throw new Error(`Expected blocked, got ${blocked.status}`);
    }

    const cleaned = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      repoPath: repo,
      branchName: created.branchName,
      force: true
    });
    console.log(
      "FORCE_CLEANED",
      cleaned.status,
      cleaned.ok,
      "gitRegistered",
      cleaned.gitRegistered,
      "filesystemExists",
      cleaned.filesystemExists
    );
    if (cleaned.status !== "cleaned" || !cleaned.ok) {
      throw new Error(`Expected cleaned, got ${cleaned.status}: ${cleaned.error ?? cleaned.message}`);
    }
    if (await exists(created.worktreePath)) {
      throw new Error("Worktree path still exists after cleaned status.");
    }
    if (!(await exists(path.join(outside, "keep.txt")))) {
      throw new Error("Outside symlink/junction target was deleted.");
    }

    const again = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      repoPath: repo,
      branchName: created.branchName,
      force: true
    });
    console.log("IDEMPOTENT_CLEANED", again.status, again.ok);
    if (again.status !== "cleaned" || !again.ok) {
      throw new Error(`Expected idempotent cleaned, got ${again.status}`);
    }

    console.log("DOGFOOD_ASSERTIONS_OK");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    for (const dir of [...trackedTempDirs].reverse()) {
      try {
        await removeTrackedTempDir(dir);
        if (await exists(dir)) {
          cleanupErrors.push(`Temp dir still exists after remove: ${dir}`);
        } else {
          console.log("TEMP_REMOVED", path.basename(dir));
        }
      } catch (cleanupError) {
        cleanupErrors.push(
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        );
      }
    }

    if (previousWorktreeRoot === undefined) {
      delete process.env.FEATURE_SPRINT_WORKTREE_ROOT;
    } else {
      process.env.FEATURE_SPRINT_WORKTREE_ROOT = previousWorktreeRoot;
    }

    if (cleanupErrors.length > 0) {
      for (const message of cleanupErrors) {
        console.error("TEMP_CLEANUP_ERROR", message);
      }
      if (!primaryError) {
        throw new Error(`Temp cleanup failed: ${cleanupErrors.join("; ")}`);
      }
    }

    if (!primaryError) {
      for (const dir of trackedTempDirs) {
        if (await exists(dir)) {
          throw new Error(`Expected temp root to be gone: ${dir}`);
        }
      }
      console.log("DOGFOOD_DONE");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
