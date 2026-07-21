import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  buildVerificationSpawn,
  parseVerificationCommand,
  runVerificationCommands
} from "../src/verification";

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
  const dir = await mkdtemp(path.join(tmpdir(), "verify-git-"));
  await runGit(dir, ["init"]);
  await runGit(dir, ["config", "user.email", "verify-test@example.com"]);
  await runGit(dir, ["config", "user.name", "Verify Test"]);
  await writeFile(path.join(dir, "README.md"), "# fixture\n");
  await runGit(dir, ["add", "README.md"]);
  await runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("parseVerificationCommand", () => {
  it("accepts allowlisted simple commands", () => {
    expect(parseVerificationCommand("npm run typecheck")).toEqual({
      command: "npm run typecheck",
      bin: "npm",
      args: ["run", "typecheck"]
    });
    expect(parseVerificationCommand("npm --version")).toEqual({
      command: "npm --version",
      bin: "npm",
      args: ["--version"]
    });
    expect(parseVerificationCommand("node .life-harness/verify-pass.js")).toMatchObject({
      command: "node .life-harness/verify-pass.js",
      bin: "node",
      args: [".life-harness/verify-pass.js"]
    });
  });

  it("accepts the narrow read-only git diff --check form", () => {
    expect(parseVerificationCommand("git diff --check")).toEqual({
      command: "git diff --check",
      bin: "git",
      args: ["diff", "--check"]
    });
  });

  it("rejects other git forms", () => {
    for (const command of ["git status", "git commit -m x", "git push", "git diff", "git diff --stat"]) {
      expect(parseVerificationCommand(command)).toBeNull();
    }
  });

  it("rejects shell metacharacters including single ampersand", () => {
    for (const command of [
      "npm test | head",
      "npm test && npm run lint",
      "npm test && echo hi",
      "npm test || true",
      "cmd1 & cmd2",
      "npm test; rm -rf .",
      "node -e \"console.log('ok')\"",
      "npm test > out.txt"
    ]) {
      expect(parseVerificationCommand(command)).toBeNull();
    }
  });

  it("rejects blocked and unknown commands", () => {
    for (const command of ["cd ..", "rm -rf .", "curl https://example.com", "bash script.sh"]) {
      expect(parseVerificationCommand(command)).toBeNull();
    }
  });

  it("rejects env assignments and empty commands", () => {
    expect(parseVerificationCommand("FOO=bar npm test")).toBeNull();
    expect(parseVerificationCommand("   ")).toBeNull();
  });
});

describe("buildVerificationSpawn", () => {
  it("uses cmd.exe shim for package-manager bins on Windows", () => {
    const parsed = parseVerificationCommand("npm --version");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "win32")).toEqual({
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "--version"]
    });
  });

  it("spawns package-manager bins directly on non-Windows", () => {
    const parsed = parseVerificationCommand("npm --version");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "linux")).toEqual({
      file: "npm",
      args: ["--version"]
    });
  });

  it("does not wrap native executables on Windows", () => {
    const parsed = parseVerificationCommand("node .life-harness/verify-pass.js");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "win32")).toEqual({
      file: "node",
      args: [".life-harness/verify-pass.js"]
    });
  });

  it("spawns git directly without cmd shim", () => {
    const parsed = parseVerificationCommand("git diff --check");
    expect(parsed).not.toBeNull();
    if (!parsed) {
      return;
    }

    expect(buildVerificationSpawn(parsed, "win32")).toEqual({
      file: "git",
      args: ["diff", "--check"]
    });
  });
});

describe("runVerificationCommands", () => {
  it("records policy rejections as rejected, not failed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "verify-reject-"));
    const results = await runVerificationCommands(dir, ["git status", "npm --version"], {
      timeoutMs: 60_000
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      command: "git status",
      status: "rejected",
      error: "Command rejected by verification parser."
    });
    expect(results[0]?.exitCode).toBeUndefined();
    expect(results[1]?.status).toBe("passed");
    expect(results[1]?.exitCode).toBe(0);
  });

  it("passes git diff --check with exit 0 and empty output", async () => {
    const repo = await createTempGitRepo();
    const results = await runVerificationCommands(repo, ["git diff --check"], {
      timeoutMs: 60_000
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      command: "git diff --check",
      status: "passed",
      exitCode: 0
    });
  });

  it("passes exit 0 even when stdout is present", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "verify-stdout-"));
    const results = await runVerificationCommands(dir, ["npm --version"], {
      timeoutMs: 60_000
    });

    expect(results[0]?.status).toBe("passed");
    expect(results[0]?.exitCode).toBe(0);
    expect((results[0]?.stdoutExcerpt ?? "").length).toBeGreaterThan(0);
  });

  it("fails on nonzero exit from an allowlisted node script", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "verify-fail-"));
    const script = path.join(dir, "fail.js");
    await writeFile(script, "process.exit(2);\n");
    const results = await runVerificationCommands(dir, ["node fail.js"], {
      timeoutMs: 60_000
    });

    expect(results[0]).toMatchObject({
      command: "node fail.js",
      status: "failed",
      exitCode: 2
    });
  });

  it("passes exit 0 with nonfatal stderr from an allowlisted node script", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "verify-stderr-"));
    const script = path.join(dir, "warn.js");
    await writeFile(script, "console.error('warn-only'); process.exit(0);\n");
    const results = await runVerificationCommands(dir, ["node warn.js"], {
      timeoutMs: 60_000
    });

    expect(results[0]?.status).toBe("passed");
    expect(results[0]?.exitCode).toBe(0);
    expect(results[0]?.stderrExcerpt).toContain("warn-only");
  });

  it("summarizes mixed rejected and passed statuses distinctly when counted by caller", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "verify-mix-"));
    const results = await runVerificationCommands(dir, ["rm -rf .", "npm --version"], {
      timeoutMs: 60_000
    });
    const rejected = results.filter((row) => row.status === "rejected").length;
    const passed = results.filter((row) => row.status === "passed").length;
    const failed = results.filter((row) => row.status === "failed").length;
    expect(rejected).toBe(1);
    expect(passed).toBe(1);
    expect(failed).toBe(0);
  });
});
