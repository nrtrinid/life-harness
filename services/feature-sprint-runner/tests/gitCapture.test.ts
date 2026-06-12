import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FEATURE_SPRINT_RUNNER_DIFF_TEXT_MAX } from "../../../src/core/featureSprintRunner";
import { captureDiffText, captureGitMetadata } from "../src/gitCapture";

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
  await runGit(dir, ["add", "README.md"]);
  await runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("gitCapture diffText", () => {
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

  it("omits diffText when only untracked files exist", async () => {
    repoPath = await createTempGitRepo();
    await mkdir(path.join(repoPath, ".life-harness"), { recursive: true });
    await writeFile(path.join(repoPath, ".life-harness", "mock.md"), "mock\n");
    const metadata = await captureGitMetadata(repoPath);
    expect(metadata.changedFiles.length).toBeGreaterThan(0);
    expect(metadata.diffText).toBeUndefined();
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
