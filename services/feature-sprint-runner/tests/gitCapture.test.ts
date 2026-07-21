import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX } from "../../../src/core/featureSprintRunner";
import {
  captureChangedFiles,
  captureDiffText,
  captureGitMetadata,
  subtractPreRunChangedFiles
} from "../src/gitCapture";

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
  const dir = await mkdtemp(path.join(os.tmpdir(), "feature-git-capture-"));
  await runGit(dir, ["init"]);
  await runGit(dir, ["config", "user.email", "capture-test@example.com"]);
  await runGit(dir, ["config", "user.name", "Capture Test"]);
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  await writeFile(path.join(dir, "keep.txt"), "keep\n");
  await runGit(dir, ["add", "README.md", "keep.txt"]);
  await runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("gitCapture changed files", () => {
  let repoPath: string | undefined;

  afterEach(async () => {
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true });
      repoPath = undefined;
    }
  });

  it("returns diffText for tracked file modifications", async () => {
    repoPath = await createTempGitRepo();
    await writeFile(path.join(repoPath, "README.md"), "# fixture\nupdated\n");
    const diffText = await captureDiffText(repoPath);
    expect(diffText).toBeTruthy();
    expect(diffText).toContain("README.md");
  });

  it("includes staged-only modifications vs HEAD", async () => {
    repoPath = await createTempGitRepo();
    await writeFile(path.join(repoPath, "README.md"), "# fixture\nstaged\n");
    await runGit(repoPath, ["add", "README.md"]);
    const changed = await captureChangedFiles(repoPath);
    expect(changed).toContain("README.md");
    const metadata = await captureGitMetadata(repoPath);
    expect(metadata.changedFiles).toContain("README.md");
    expect(metadata.diffText).toContain("staged");
  });

  it("includes renames vs HEAD", async () => {
    repoPath = await createTempGitRepo();
    await runGit(repoPath, ["mv", "keep.txt", "renamed.txt"]);
    const changed = await captureChangedFiles(repoPath);
    expect(changed).toContain("renamed.txt");
    // Old path may appear depending on git rename detection; at least new path is present.
    expect(changed.some((name) => name.includes("renamed.txt") || name.includes("keep.txt"))).toBe(
      true
    );
  });

  it("includes deletes vs HEAD", async () => {
    repoPath = await createTempGitRepo();
    await runGit(repoPath, ["rm", "keep.txt"]);
    const changed = await captureChangedFiles(repoPath);
    expect(changed).toContain("keep.txt");
  });

  it("includes untracked files", async () => {
    repoPath = await createTempGitRepo();
    await mkdir(path.join(repoPath, ".life-harness"), { recursive: true });
    await writeFile(path.join(repoPath, ".life-harness", "mock.md"), "mock\n");
    const metadata = await captureGitMetadata(repoPath);
    expect(metadata.changedFiles).toContain(".life-harness/mock.md");
    expect(metadata.diffText).toBeUndefined();
  });

  it("subtracts preexisting dirty paths so they are not attributed as new changes", async () => {
    repoPath = await createTempGitRepo();
    await writeFile(path.join(repoPath, "README.md"), "# fixture\npreexisting\n");
    const baseline = await captureChangedFiles(repoPath);
    expect(baseline).toContain("README.md");

    // No new agent changes — only the preexisting dirty path remains.
    const after = await captureChangedFiles(repoPath);
    const attributed = subtractPreRunChangedFiles(baseline, after);
    expect(attributed).toEqual([]);

    const metadata = await captureGitMetadata(repoPath, { preRunChangedFiles: baseline });
    expect(metadata.changedFiles).toEqual([]);
    expect(metadata.usedPreRunBaseline).toBe(true);
  });

  it("attributes newly added paths after a dirty baseline", async () => {
    repoPath = await createTempGitRepo();
    await writeFile(path.join(repoPath, "README.md"), "# fixture\npreexisting\n");
    const baseline = await captureChangedFiles(repoPath);
    await writeFile(path.join(repoPath, "agent-new.txt"), "from agent\n");
    const metadata = await captureGitMetadata(repoPath, { preRunChangedFiles: baseline });
    expect(metadata.changedFiles).toContain("agent-new.txt");
    expect(metadata.changedFiles).not.toContain("README.md");
  });

  it("returns undefined when diff capture fails without throwing", async () => {
    const diffText = await captureDiffText(path.join(os.tmpdir(), "missing-worktree-path"));
    expect(diffText).toBeUndefined();
  });

  it("caps diffText at the configured maximum", async () => {
    repoPath = await createTempGitRepo();
    const huge = `${"x".repeat(FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX + 500)}\n`;
    await writeFile(path.join(repoPath, "README.md"), huge);
    const diffText = await captureDiffText(repoPath);
    expect(diffText).toBeTruthy();
    expect(diffText!.length).toBeLessThanOrEqual(FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX + 80);
    expect(diffText).toContain("truncated");
  });
});
