import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  createFeatureSprintRunnerRun,
  completeFeatureSprintRunnerRun
} from "../../../src/core/featureSprintRunnerHistory";
import { isImplementationProfile, summarizeVerificationResults } from "../../../src/core/featureSprintRunner";
import { buildFeatureSprintRunnerOutputView } from "../../../src/core/featureSprintRunnerOutputView";
import type { LifeHarnessData } from "../../../src/core/lifeHarnessData";
import { createFeatureWorktree, resolveWorktreeRoot } from "../src/worktree";
import { cleanupFeatureSprintWorktree } from "../src/worktreeCleanup";
import { runVerificationCommands } from "../src/verification";

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

/** Only remove directories this script created under os.tmpdir(). */
async function removeTrackedTempDir(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const tmpRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(tmpRoot + path.sep) && resolved !== tmpRoot) {
    throw new Error(`Refusing to remove path outside os.tmpdir(): ${resolved}`);
  }
  if (
    !path.basename(resolved).startsWith("cursor-cleanup-dogfood-repo-") &&
    !path.basename(resolved).startsWith("cursor-cleanup-dogfood-root-")
  ) {
    throw new Error(`Refusing to remove untracked temp path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

function emptyData(): LifeHarnessData {
  return {
    cards: [
      {
        id: "card-disposable",
        title: "Disposable",
        area: "build",
        state: "inbox",
        warmth: "hot",
        nextTinyAction: "x",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    logs: [],
    proofItems: [],
    dailyState: { date: "2026-07-21", mvdCompleted: false, salvageUsed: false },
    resumeModules: [],
    jobCandidates: [],
    jobSources: [],
    jobSourceRuns: [],
    chatSummaries: [],
    memoryItems: [],
    projects: [],
    agentSessions: [],
    featureSprintPlans: [],
    featureSprintRunnerRuns: []
  };
}

async function main(): Promise<void> {
  const trackedTempDirs: string[] = [];
  const previousWorktreeRoot = process.env.FEATURE_SPRINT_WORKTREE_ROOT;
  let primaryError: unknown;

  try {
    const repo = await mkdtemp(path.join(os.tmpdir(), "cursor-cleanup-dogfood-repo-"));
    trackedTempDirs.push(repo);
    await runGit(repo, ["init"]);
    await runGit(repo, ["config", "user.email", "dogfood@example.com"]);
    await runGit(repo, ["config", "user.name", "Dogfood"]);
    await writeFile(path.join(repo, "README.md"), "# dogfood\n");
    await runGit(repo, ["add", "README.md"]);
    await runGit(repo, ["commit", "-m", "init"]);

    const worktreeRoot = await mkdtemp(path.join(os.tmpdir(), "cursor-cleanup-dogfood-root-"));
    trackedTempDirs.push(worktreeRoot);
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = worktreeRoot;

    const created = await createFeatureWorktree({
      repoPath: repo,
      cardId: "card-disposable",
      stepId: "step-disposable",
      baseRef: "HEAD"
    });
    console.log(
      "CREATE_OK",
      Boolean(created.worktreePath),
      "underRoot",
      created.worktreePath.startsWith(resolveWorktreeRoot())
    );
    console.log("CURSOR_IMPL_ELIGIBLE", isImplementationProfile("cursor_implementation"));
    console.log("CURSOR_REVIEW_ELIGIBLE", isImplementationProfile("cursor_review"));

    await writeFile(path.join(created.worktreePath, "dirty.txt"), "x");
    const blocked = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      repoPath: repo,
      branchName: created.branchName,
      force: false
    });
    console.log("DIRTY_BLOCKED", blocked.status, blocked.ok === false);

    const cleaned = await cleanupFeatureSprintWorktree({
      worktreePath: created.worktreePath,
      repoPath: repo,
      branchName: created.branchName,
      force: true
    });
    console.log(
      "FORCE_CLEANED",
      cleaned.status,
      cleaned.ok === true,
      "gone",
      !(await exists(created.worktreePath))
    );

    const created2 = await createFeatureWorktree({
      repoPath: repo,
      cardId: "card-verify",
      stepId: "step-verify",
      baseRef: "HEAD"
    });
    const verify = await runVerificationCommands(created2.worktreePath, [
      "git diff --check",
      "npm --version"
    ]);
    console.log("VERIFY_SUMMARY", summarizeVerificationResults(verify));
    console.log(
      "VERIFY_STATUSES",
      verify.map((row) => `${row.status}:${row.command}`).join(" | ")
    );

    const runCreate = createFeatureSprintRunnerRun(emptyData(), {
      profile: "cursor_implementation",
      cardId: "card-disposable"
    });
    if (!runCreate.ok) {
      throw new Error("create run failed");
    }
    const runDone = completeFeatureSprintRunnerRun(runCreate.state, runCreate.runId, {
      ok: true,
      profile: "cursor_implementation",
      outputText: "ok",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      worktreePath: created2.worktreePath,
      verificationResults: verify
    });
    if (!runDone.ok) {
      throw new Error("complete run failed");
    }
    const view = buildFeatureSprintRunnerOutputView(runDone.state, runCreate.runId);
    console.log("VIEW_CAN_CLEAN", view?.canCleanWorktree === true);
    console.log("VIEW_VERIFY_SUMMARY", view?.verificationSummary);

    await cleanupFeatureSprintWorktree({
      worktreePath: created2.worktreePath,
      repoPath: repo,
      branchName: created2.branchName,
      force: true
    });
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
