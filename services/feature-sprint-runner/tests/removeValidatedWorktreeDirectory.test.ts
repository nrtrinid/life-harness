import { chmod, lstat, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  removeValidatedWorktreeDirectory,
  toWindowsLongPath
} from "../src/removeValidatedWorktreeDirectory";

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "fsr-remove-"));
}

describe("removeValidatedWorktreeDirectory", () => {
  const roots: string[] = [];

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await removeValidatedWorktreeDirectory(root).catch(() => undefined);
    }
  });

  it("removes a deep nested directory tree", async () => {
    const root = await makeTempRoot();
    roots.push(root);
    let nested = root;
    for (let i = 0; i < 12; i++) {
      nested = path.join(nested, `node_modules_layer_${i}`);
      await mkdir(nested, { recursive: true });
    }
    await writeFile(path.join(nested, "leaf.txt"), "x");

    const result = await removeValidatedWorktreeDirectory(root);
    expect(result.ok).toBe(true);
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clears a read-only file before removal", async () => {
    const root = await makeTempRoot();
    roots.push(root);
    const filePath = path.join(root, "readonly.txt");
    await writeFile(filePath, "locked");
    await chmod(filePath, 0o444);

    const result = await removeValidatedWorktreeDirectory(root);
    expect(result.ok).toBe(true);
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not follow a symlink outside the validated root", async () => {
    const outside = await makeTempRoot();
    roots.push(outside);
    await writeFile(path.join(outside, "keep.txt"), "safe");

    const root = await makeTempRoot();
    roots.push(root);
    const linkPath = path.join(root, "outside-link");
    await symlink(outside, linkPath, process.platform === "win32" ? "junction" : "dir");

    const result = await removeValidatedWorktreeDirectory(root);
    expect(result.ok).toBe(true);
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
    // Outside target must remain.
    await expect(lstat(path.join(outside, "keep.txt"))).resolves.toBeTruthy();
  });

  it("reports already_absent when the path is gone", async () => {
    const root = await makeTempRoot();
    await removeValidatedWorktreeDirectory(root);
    const result = await removeValidatedWorktreeDirectory(root);
    expect(result.ok).toBe(true);
    expect(result.method).toBe("already_absent");
  });

  it("exposes Windows long-path normalization", () => {
    if (process.platform !== "win32") {
      expect(toWindowsLongPath("C:\\tmp\\x")).toBe(path.resolve("C:\\tmp\\x"));
      return;
    }
    const long = toWindowsLongPath("C:\\tmp\\feature-worktree");
    expect(long.startsWith("\\\\?\\")).toBe(true);
  });
});
