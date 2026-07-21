import { access, stat } from "node:fs/promises";
import path from "node:path";

import { captureGitStatus } from "./gitCapture";
import { resolveWorktreeRoot, validateGitRepo } from "./worktree";

export type PhaseSafetyCheckResult =
  | { ok: true }
  | { ok: false; error: string; reason: "worktree_invalid" | "readonly_mutation" };

function isUnderWorktreeRoot(resolvedPath: string, worktreeRoot: string): boolean {
  const root = path.resolve(worktreeRoot);
  const target = path.resolve(resolvedPath);
  if (target === root) {
    return false;
  }
  return target.startsWith(`${root}${path.sep}`);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Linked worktrees have a `.git` *file*; the main checkout has a `.git` *directory*.
 */
export async function isLinkedGitWorktree(worktreePath: string): Promise<boolean> {
  try {
    const gitMeta = await stat(path.join(worktreePath, ".git"));
    return gitMeta.isFile();
  } catch {
    return false;
  }
}

/**
 * Implementation workspace must be an approved linked worktree under FEATURE_SPRINT_WORKTREE_ROOT,
 * not the main repository checkout.
 */
export async function validateImplementationWorkspace(
  worktreePath: string,
  repoTopLevel?: string
): Promise<PhaseSafetyCheckResult> {
  const resolved = path.resolve(worktreePath.trim());
  if (!(await pathExists(resolved))) {
    return {
      ok: false,
      error: `Implementation worktree is missing or stale: ${resolved}`,
      reason: "worktree_invalid"
    };
  }

  const worktreeRoot = resolveWorktreeRoot();
  if (!isUnderWorktreeRoot(resolved, worktreeRoot)) {
    return {
      ok: false,
      error:
        `Implementation workspace must be under the configured worktree root (${worktreeRoot}). ` +
        "Running implementation against the root checkout is rejected.",
      reason: "worktree_invalid"
    };
  }

  if (repoTopLevel && resolved === path.resolve(repoTopLevel)) {
    return {
      ok: false,
      error: "Implementation must not run against the main repository checkout.",
      reason: "worktree_invalid"
    };
  }

  const validated = await validateGitRepo(resolved);
  if (!validated.ok) {
    return { ok: false, error: validated.error, reason: "worktree_invalid" };
  }

  if (!(await isLinkedGitWorktree(resolved))) {
    return {
      ok: false,
      error: "Implementation must run in a linked git worktree (not the main checkout).",
      reason: "worktree_invalid"
    };
  }

  return { ok: true };
}

export async function captureReadonlyBaseline(cwd: string): Promise<string> {
  try {
    return await captureGitStatus(cwd);
  } catch {
    return "";
  }
}

/**
 * Compare pre/post git status for scoping/review. Unexpected writes → needs human review.
 * Does not clean or revert changes.
 */
export async function detectReadonlyMutations(
  cwd: string,
  baselineStatus: string
): Promise<PhaseSafetyCheckResult> {
  const after = await captureReadonlyBaseline(cwd);
  const before = baselineStatus.trim();
  const next = after.trim();
  if (before === next) {
    return { ok: true };
  }

  return {
    ok: false,
    error:
      "Read-only phase detected unexpected repository changes. " +
      "Inspect the working tree manually; the runner did not revert anything.\n" +
      `Before:\n${before || "(clean)"}\nAfter:\n${next || "(clean)"}`,
    reason: "readonly_mutation"
  };
}
