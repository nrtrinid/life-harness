import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rmdir,
  rm,
  unlink
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 75;

export type RemoveValidatedDirectoryResult = {
  ok: boolean;
  method: string;
  error?: string;
  attempts: number;
};

/** Normalize an absolute path for Windows long-path APIs (`\\?\` / `\\?\UNC\`). */
export function toWindowsLongPath(absolutePath: string): string {
  const normalized = path.resolve(absolutePath);
  if (process.platform !== "win32") {
    return normalized;
  }
  if (normalized.startsWith("\\\\?\\")) {
    return normalized;
  }
  if (normalized.startsWith("\\\\")) {
    return `\\\\?\\UNC\\${normalized.slice(2)}`;
  }
  return `\\\\?\\${normalized}`;
}

function fsPath(target: string): string {
  return process.platform === "win32" ? toWindowsLongPath(target) : target;
}

function assertInsideValidatedRoot(current: string, validatedRoot: string): void {
  const resolvedCurrent = path.resolve(current);
  const resolvedRoot = path.resolve(validatedRoot);
  if (resolvedCurrent === resolvedRoot) {
    return;
  }
  if (!resolvedCurrent.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Refusing to delete path outside validated worktree root.");
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearReadonlyBit(target: string): Promise<void> {
  try {
    await chmod(fsPath(target), 0o666);
  } catch {
    // Best-effort on platforms that do not use the bit.
  }
}

async function pathStillExists(target: string): Promise<boolean> {
  try {
    await lstat(fsPath(target));
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively remove a directory without following symlinks or junctions.
 * Symlink/junction entries are unlinked in place (the link itself), never traversed.
 */
async function removeTreeNoFollow(current: string, validatedRoot: string): Promise<void> {
  assertInsideValidatedRoot(current, validatedRoot);

  let stat;
  try {
    stat = await lstat(fsPath(current));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    await unlink(fsPath(current));
    return;
  }

  if (!stat.isDirectory()) {
    await clearReadonlyBit(current);
    await unlink(fsPath(current));
    return;
  }

  const entries = await readdir(fsPath(current), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(current, entry.name);
    assertInsideValidatedRoot(child, validatedRoot);
    if (entry.isSymbolicLink()) {
      await unlink(fsPath(child));
      continue;
    }
    await removeTreeNoFollow(child, validatedRoot);
  }

  await clearReadonlyBit(current);
  await rmdir(fsPath(current));
}

function runRobocopyMirror(emptyDir: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "robocopy",
      [emptyDir, targetDir, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
      {
        shell: false,
        windowsHide: true,
        env: process.env
      }
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      // Robocopy uses bit flags; 0–7 indicate copy completed with or without differences.
      if (exitCode >= 0 && exitCode <= 7) {
        resolve();
        return;
      }
      reject(new Error(`robocopy mirror failed (exit ${exitCode}). ${stderr.trim()}`.trim()));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Windows fallback: mirror an empty directory onto the validated target (arg-array spawn),
 * then remove the emptied directory. Never uses shell string concatenation.
 */
async function windowsEmptyMirrorRemove(
  validatedRoot: string
): Promise<RemoveValidatedDirectoryResult> {
  const emptyDir = await mkdtemp(path.join(os.tmpdir(), "fsr-empty-"));
  try {
    await runRobocopyMirror(emptyDir, validatedRoot);
    if (await pathStillExists(validatedRoot)) {
      try {
        await rmdir(fsPath(validatedRoot));
      } catch {
        await rm(fsPath(validatedRoot), { recursive: true, force: true });
      }
    }
    if (await pathStillExists(validatedRoot)) {
      return {
        ok: false,
        method: "robocopy_mirror",
        error: "Path still exists after Windows empty-directory mirror.",
        attempts: 1
      };
    }
    return { ok: true, method: "robocopy_mirror", attempts: 1 };
  } catch (error) {
    return {
      ok: false,
      method: "robocopy_mirror",
      error: error instanceof Error ? error.message : String(error),
      attempts: 1
    };
  } finally {
    await rm(emptyDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Remove a previously validated Feature Sprint worktree directory.
 * Callers must enforce worktree-root containment before invoking.
 */
export async function removeValidatedWorktreeDirectory(
  validatedRoot: string,
  options?: { maxRetries?: number }
): Promise<RemoveValidatedDirectoryResult> {
  const resolvedRoot = path.resolve(validatedRoot);
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!(await pathStillExists(resolvedRoot))) {
    return { ok: true, method: "already_absent", attempts: 0 };
  }

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await removeTreeNoFollow(resolvedRoot, resolvedRoot);
      if (!(await pathStillExists(resolvedRoot))) {
        return { ok: true, method: "walk_nofollow", attempts: attempt };
      }
      lastError = "Path still exists after no-follow walk removal.";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxRetries) {
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  if (process.platform === "win32") {
    const fallback = await windowsEmptyMirrorRemove(resolvedRoot);
    if (fallback.ok) {
      return { ...fallback, attempts: maxRetries + fallback.attempts };
    }
    lastError = fallback.error ?? lastError;
    return {
      ok: false,
      method: fallback.method,
      error: lastError ?? "Windows directory removal failed.",
      attempts: maxRetries + fallback.attempts
    };
  }

  return {
    ok: false,
    method: "walk_nofollow",
    error: lastError ?? "Directory removal failed.",
    attempts: maxRetries
  };
}

/** Test helper: create a nested directory under a parent (no validation). */
export async function ensureDir(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
}
