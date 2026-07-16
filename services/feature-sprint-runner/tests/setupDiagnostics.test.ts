import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { redactSecrets } from "../src/redact";
import { buildSetupCheckReport, buildSetupDiagnostics } from "../src/setupDiagnostics";
import {
  checkRealCodexGate,
  checkRealCursorGate,
  collectSetupMissingEnv
} from "../src/providerGates";
import { buildRunnerResult } from "../src/resultEnvelope";
import { spawnAgentProcess } from "../src/spawnAgent";
import { validateImplementationWorkspace } from "../src/phaseSafety";
import { quoteWindowsCmdArg } from "../src/agentSpawn";

describe("providerGates", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("mock mode has no missing env", () => {
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    expect(collectSetupMissingEnv("mock")).toEqual([]);
  });

  it("cursor mode lists missing cursor env keys", () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "cursor";
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    delete process.env.CURSOR_API_KEY;
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION;

    const missing = collectSetupMissingEnv("cursor");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_ENABLE_CURSOR");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_TOKEN");
    expect(missing).toContain("CURSOR_API_KEY");
    expect(missing).toContain("FEATURE_SPRINT_RUNNER_ENABLE_IMPLEMENTATION");
  });

  it("codex gate passes when env is set", () => {
    process.env.FEATURE_SPRINT_RUNNER_ENABLE_CODEX = "1";
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "dev";
    expect(checkRealCodexGate()).toEqual({ ok: true, missingEnv: [] });
  });

  it("cursor gate lists missing keys", () => {
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    delete process.env.CURSOR_API_KEY;

    const gate = checkRealCursorGate();
    expect(gate.ok).toBe(false);
    expect(gate.missingEnv).toEqual([
      "FEATURE_SPRINT_RUNNER_ENABLE_CURSOR",
      "FEATURE_SPRINT_RUNNER_TOKEN",
      "CURSOR_API_KEY"
    ]);
  });
});

describe("buildSetupDiagnostics", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns mock recommended script in mock mode", async () => {
    delete process.env.FEATURE_SPRINT_RUNNER_MODE;
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    const setup = await buildSetupDiagnostics();
    expect(setup.recommendedScript).toBe("mock");
    expect(setup.missingEnv).toEqual([]);
    expect(setup.serverTokenConfigured).toBe(false);
  });

  it("reports token absent honestly when FEATURE_SPRINT_RUNNER_TOKEN is unset", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "mock";
    delete process.env.FEATURE_SPRINT_RUNNER_TOKEN;
    delete process.env.EXPO_PUBLIC_FEATURE_SPRINT_RUNNER_TOKEN;

    const report = await buildSetupCheckReport();
    expect(report.setup.serverTokenConfigured).toBe(false);
    const tokenItem = report.items.find((item) => item.id === "token");
    expect(tokenItem).toBeTruthy();
    expect(tokenItem!.detail.toLowerCase()).toMatch(/unset|not set|missing/);
    expect(JSON.stringify(report)).not.toContain("life-harness-dev");
    expect(report.setup.serverTokenConfigured).toBe(false);
  });
});

describe("redactSecrets", () => {
  it("redacts known env secret values without echoing them", () => {
    const env = {
      CURSOR_API_KEY: "sk-secret-cursor-key-value",
      FEATURE_SPRINT_RUNNER_TOKEN: "super-secret-token"
    };
    const text =
      "key=sk-secret-cursor-key-value token=super-secret-token Authorization: Bearer super-secret-token";
    const redacted = redactSecrets(text, env);
    expect(redacted).not.toContain("sk-secret-cursor-key-value");
    expect(redacted).not.toContain("super-secret-token");
    expect(redacted).toContain("[redacted:CURSOR_API_KEY]");
    expect(redacted).toContain("[redacted:bearer]");
  });
});

describe("buildSetupCheckReport", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("succeeds for mock mode without real provider flags", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "mock";
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.CURSOR_API_KEY;
    const report = await buildSetupCheckReport();
    expect(report.ok).toBe(true);
    expect(report.canRunMock).toBe(true);
    expect(report.mode).toBe("mock");
    expect(report.items.some((item) => item.id === "node" && item.status === "ok")).toBe(true);
  });

  it("fails closed for cursor mode when key and enable flag are missing", async () => {
    process.env.FEATURE_SPRINT_RUNNER_MODE = "cursor";
    delete process.env.FEATURE_SPRINT_RUNNER_ENABLE_CURSOR;
    delete process.env.CURSOR_API_KEY;
    process.env.FEATURE_SPRINT_RUNNER_TOKEN = "dev-token";
    process.env.FEATURE_SPRINT_CURSOR_BIN = path.join(os.tmpdir(), "missing-cursor-agent-bin");

    const report = await buildSetupCheckReport();
    expect(report.ok).toBe(false);
    expect(report.canRunRealCursor).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(report.items.some((item) => item.id === "enable_cursor" && item.status === "blocker")).toBe(
      true
    );
    expect(report.items.some((item) => item.id === "cursor_api_key" && item.status === "blocker")).toBe(
      true
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("dev-token");
  });
});

describe("buildRunnerResult envelope", () => {
  it("normalizes mock/cursor/codex fields consistently", () => {
    const mock = buildRunnerResult({
      ok: true,
      profile: "codex_scoping",
      runnerMode: "mock",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      outputText: "hello",
      terminationReason: "completed"
    });
    expect(mock.runId).toBeTruthy();
    expect(mock.provider).toBe("codex");
    expect(mock.runnerMode).toBe("mock");
    expect(mock.durationMs).toBe(1000);
    expect(mock.failureClass).toBe("none");
    expect(mock.timedOut).toBe(false);
    expect(mock.cancelled).toBe(false);

    const cursor = buildRunnerResult({
      ok: false,
      profile: "cursor_scoping",
      runnerMode: "cursor",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      error: "timed out",
      terminationReason: "timeout",
      timedOut: true,
      stdoutText: "partial out",
      stderrText: "partial err"
    });
    expect(cursor.provider).toBe("cursor");
    expect(cursor.timedOut).toBe(true);
    expect(cursor.stdoutText).toBe("partial out");
    expect(cursor.stderrText).toBe("partial err");
    expect(cursor.failureClass).toBe("runner");
  });
});

describe("spawnAgentProcess", () => {
  it("preserves exit code, stdout, and stderr from a fake executable", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "spawn-agent-"));
    const script = path.join(dir, "fake-agent.js");
    await writeFile(
      script,
      [
        "process.stdout.write('OUT:' + process.argv.slice(2).join(' '));",
        "process.stderr.write('ERR');",
        "process.exit(7);"
      ].join("\n"),
      "utf8"
    );

    const result = await spawnAgentProcess({
      bin: process.execPath,
      args: [script, "alpha"],
      cwd: dir,
      timeoutMs: 5_000,
      maxStdoutChars: 10_000,
      maxStderrChars: 10_000
    });

    expect(result.exitCode).toBe(7);
    expect(result.stdout).toContain("OUT:alpha");
    expect(result.stderr).toContain("ERR");
    expect(result.termination).toBe("completed");
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it("classifies timeout separately from cancellation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "spawn-timeout-"));
    const script = path.join(dir, "sleep.js");
    await writeFile(script, "setTimeout(() => {}, 30_000);", "utf8");

    const timed = await spawnAgentProcess({
      bin: process.execPath,
      args: [script],
      cwd: dir,
      timeoutMs: 200,
      maxStdoutChars: 1000,
      maxStderrChars: 1000,
      killGraceMs: 100
    });
    expect(timed.timedOut).toBe(true);
    expect(timed.cancelled).toBe(false);
    expect(timed.termination).toBe("timeout");

    const controller = new AbortController();
    const cancelPromise = spawnAgentProcess({
      bin: process.execPath,
      args: [script],
      cwd: dir,
      timeoutMs: 30_000,
      maxStdoutChars: 1000,
      maxStderrChars: 1000,
      signal: controller.signal,
      killGraceMs: 100
    });
    setTimeout(() => controller.abort(), 50);
    const cancelled = await cancelPromise;
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.timedOut).toBe(false);
    expect(cancelled.termination).toBe("cancelled");
  });

  it("feeds prompt via stdin when provided", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "spawn-stdin-"));
    const script = path.join(dir, "echo-stdin.js");
    await writeFile(
      script,
      [
        "let data = '';",
        "process.stdin.on('data', (c) => { data += c; });",
        "process.stdin.on('end', () => { process.stdout.write('GOT:' + data); process.exit(0); });"
      ].join("\n"),
      "utf8"
    );

    const result = await spawnAgentProcess({
      bin: process.execPath,
      args: [script],
      cwd: dir,
      timeoutMs: 5_000,
      maxStdoutChars: 10_000,
      maxStderrChars: 10_000,
      stdinText: "prompt-body"
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GOT:prompt-body");
  });
});

describe("validateImplementationWorkspace", () => {
  it("rejects paths outside the worktree root and missing paths", async () => {
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = await mkdtemp(
      path.join(os.tmpdir(), "fs-worktree-root-")
    );
    const missing = path.join(process.env.FEATURE_SPRINT_WORKTREE_ROOT, "nope");
    const missingResult = await validateImplementationWorkspace(missing);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) {
      expect(missingResult.reason).toBe("worktree_invalid");
    }

    const outside = await mkdtemp(path.join(os.tmpdir(), "outside-wt-"));
    const outsideResult = await validateImplementationWorkspace(outside);
    expect(outsideResult.ok).toBe(false);
  });
});

describe("windows quoting helper", () => {
  it("always quotes and escapes cmd metacharacters", () => {
    expect(quoteWindowsCmdArg("")).toBe('""');
    expect(quoteWindowsCmdArg("C:\\Users\\Nick Smith\\a")).toBe('"C:\\Users\\Nick Smith\\a"');
    expect(quoteWindowsCmdArg("model&whoami")).toBe('"model&whoami"');
    expect(quoteWindowsCmdArg("%TEMP%")).toBe('"^%TEMP^%"');
  });
});

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { shell: false, cwd, env: process.env });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git failed ${code}`));
    });
    child.on("error", reject);
  });
}

describe("validateImplementationWorkspace git fixture", () => {
  it("accepts an approved worktree under the configured root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fs-wt-ok-"));
    process.env.FEATURE_SPRINT_WORKTREE_ROOT = root;

    const repo = await mkdtemp(path.join(os.tmpdir(), "fs-repo-"));
    await runGit(repo, ["init"]);
    await runGit(repo, ["config", "user.email", "t@example.com"]);
    await runGit(repo, ["config", "user.name", "t"]);
    await writeFile(path.join(repo, "README.md"), "x\n");
    await runGit(repo, ["add", "README.md"]);
    await runGit(repo, ["commit", "-m", "init"]);

    const wt = path.join(root, "branch-a");
    await runGit(repo, ["worktree", "add", "-b", "branch-a", wt, "HEAD"]);

    const result = await validateImplementationWorkspace(wt, repo);
    expect(result.ok).toBe(true);
  });
});
